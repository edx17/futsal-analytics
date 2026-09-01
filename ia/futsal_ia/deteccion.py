"""
Detección de personas.

Esta es la parte fácil, y conviene decirlo: los detectores de objetos ya vienen
entrenados con "persona" entre sus clases y andan muy bien sin que hagamos
nada. No hay que entrenar nada para encontrar jugadores.

Lo que NO sale de acá:
  · quién es cada uno  -> no se resuelve (ver el diccionario de métricas);
  · de qué equipo es   -> equipos.py, por color;
  · dónde está parado  -> geometria.py, por homografía;
  · la pelota          -> Fase 2, y es harina de otro costal: objeto chico,
                          rapidísimo y tapado la mitad del tiempo. El detector
                          genérico no sirve, hay que entrenar uno.

Sobre la licencia: el modelo por defecto es RF-DETR (Apache 2.0). Ultralytics
YOLO anda igual de bien pero es AGPL-3.0, que obliga a abrir el código del
servicio o a pagar licencia comercial. Está disponible acá para comparar,
detrás de un aviso explícito.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

CLASE_PERSONA_COCO = 0


@dataclass
class Deteccion:
    bbox: tuple[float, float, float, float]   # x1, y1, x2, y2 en píxeles
    confianza: float

    @property
    def pies(self) -> tuple[float, float]:
        """Medio del borde inferior: el punto apoyado en el plano de la cancha."""
        x1, y1, x2, y2 = self.bbox
        return (x1 + x2) / 2.0, y2

    @property
    def alto(self) -> float:
        return self.bbox[3] - self.bbox[1]

    @property
    def ancho(self) -> float:
        return self.bbox[2] - self.bbox[0]


class Detector(Protocol):
    def detectar(self, frame) -> list[Deteccion]: ...


class DetectorRFDETR:
    """RF-DETR (Apache 2.0). El que se usa por defecto."""

    def __init__(self, conf_minima: float = 0.35, tamano: str = "base"):
        from rfdetr import RFDETRBase, RFDETRLarge

        self.conf_minima = conf_minima
        self.modelo = (RFDETRLarge if tamano == "large" else RFDETRBase)()

    def detectar(self, frame) -> list[Deteccion]:
        det = self.modelo.predict(frame, threshold=self.conf_minima)
        salida = []
        for bbox, clase, conf in zip(det.xyxy, det.class_id, det.confidence):
            if int(clase) != CLASE_PERSONA_COCO:
                continue
            salida.append(Deteccion(bbox=tuple(float(v) for v in bbox), confianza=float(conf)))
        return salida


class DetectorYOLO:
    """
    Ultralytics YOLO. OJO CON LA LICENCIA: AGPL-3.0.

    Si esto se comercializa como servicio, usarlo obliga a abrir todo el código
    del servicio o a pagar licencia comercial. Sirve para comparar precisión
    contra RF-DETR; no para producción sin resolver antes ese tema.
    """

    def __init__(self, conf_minima: float = 0.35, pesos: str = "yolo11m.pt"):
        import warnings

        from ultralytics import YOLO

        warnings.warn(
            "Ultralytics YOLO es AGPL-3.0. Si este módulo se comercializa, hay "
            "que abrir el código del servicio o pagar licencia comercial. "
            "Para producción, usar DetectorRFDETR.",
            stacklevel=2,
        )
        self.conf_minima = conf_minima
        self.modelo = YOLO(pesos)

    def detectar(self, frame) -> list[Deteccion]:
        res = self.modelo.predict(frame, conf=self.conf_minima, classes=[CLASE_PERSONA_COCO],
                                  verbose=False)[0]
        return [
            Deteccion(bbox=tuple(float(v) for v in caja.xyxy[0]), confianza=float(caja.conf[0]))
            for caja in res.boxes
        ]


def crear_detector(nombre: str = "rfdetr", conf_minima: float = 0.35) -> Detector:
    if nombre == "rfdetr":
        return DetectorRFDETR(conf_minima=conf_minima)
    if nombre == "yolo":
        return DetectorYOLO(conf_minima=conf_minima)
    raise ValueError(f"Detector desconocido: {nombre!r}. Opciones: 'rfdetr', 'yolo'.")
