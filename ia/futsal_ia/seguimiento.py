"""
Seguimiento: mantener el mismo número sobre el mismo jugador entre frames.

Se usa ByteTrack a través de `supervision` (MIT). ByteTrack asocia por
solapamiento de recuadros y velocidad, sin mirar la apariencia, lo que en
futsal es una ventaja: diez tipos con la misma camiseta hacen que cualquier
método por apariencia se confunda más de lo que ayuda.

Lo que hay que tener claro y no se arregla afinando parámetros: en futsal los
IDs SE CAMBIAN. Cinco contra cinco en 400 m², con la cámara en un corner y
cuerpos tapándose todo el tiempo, un track se corta y se reanuda con número
nuevo. Un track sobrevive del orden de decenas de segundos, no los 20 minutos
del período.

Por eso el diccionario de métricas dice lo que dice: la identidad de jugador
NO se resuelve con video, y el tiempo por jugador sale de cruzar los cambios
cargados a mano con la pelota en juego. Este módulo entrega tramos anónimos,
que es exactamente lo que hace falta para heatmaps, ocupación y, más adelante,
posesión y pases.
"""

from __future__ import annotations

from dataclasses import dataclass

from .deteccion import Deteccion


@dataclass
class DeteccionSeguida:
    track_ia: int
    deteccion: Deteccion


class SeguidorByteTrack:
    def __init__(self, fps: int = 10, max_frames_sin_ver: int = 30,
                 umbral_alto: float = 0.5, umbral_asociacion: float = 0.8):
        import numpy as np
        import supervision as sv

        self.np = np
        self.sv = sv
        self.seguidor = sv.ByteTrack(
            track_activation_threshold=umbral_alto,
            lost_track_buffer=max_frames_sin_ver,
            minimum_matching_threshold=umbral_asociacion,
            frame_rate=fps,
        )

    def actualizar(self, detecciones: list[Deteccion]) -> list[DeteccionSeguida]:
        if not detecciones:
            # Aun sin detecciones hay que avisarle al seguidor: es lo que hace
            # envejecer los tracks perdidos en vez de dejarlos vivos para
            # siempre esperando a alguien que ya no está.
            self.seguidor.update_with_detections(self.sv.Detections.empty())
            return []

        det = self.sv.Detections(
            xyxy=self.np.array([d.bbox for d in detecciones], dtype=float),
            confidence=self.np.array([d.confianza for d in detecciones], dtype=float),
            class_id=self.np.zeros(len(detecciones), dtype=int),
        )
        seguidas = self.seguidor.update_with_detections(det)
        salida = []
        for bbox, conf, tid in zip(seguidas.xyxy, seguidas.confidence, seguidas.tracker_id):
            if tid is None:
                continue
            salida.append(DeteccionSeguida(
                track_ia=int(tid),
                deteccion=Deteccion(bbox=tuple(float(v) for v in bbox), confianza=float(conf)),
            ))
        return salida

    def reiniciar(self) -> None:
        """
        Entre el primer y el segundo tiempo hay que reiniciar: los equipos
        cambian de lado y no tiene ningún sentido continuar un track a través
        del entretiempo.
        """
        self.seguidor.reset()
