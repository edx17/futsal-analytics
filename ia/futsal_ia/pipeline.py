"""
Orquestación de la Fase 1: video -> posiciones sobre la cancha.

El orden importa y cada paso depende del anterior:

    1. leer el frame
    2. enderezar la lente          (si no, la homografía miente en los bordes)
    3. detectar personas
    4. seguirlas entre frames
    5. proyectar los PIES al plano de la cancha
    6. tirar lo que cae fuera      (tribuna, bancos, mesa de control)
    7. clasificar por color        (dos pasadas: una junta colores, otra asigna)
    8. escribir snapshots y recorridos

Son dos pasadas sobre el video porque el clasificador de equipos necesita ver
el partido entero antes de decidir los grupos. La primera pasada es barata
—muestrea unos cientos de frames sueltos— y la segunda es la que trabaja.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .cancha import metros_a_norm
from .config import PARAMETROS, VERSION_DICCIONARIO, Parametros
from .equipos import (
    ClasificadorEquipos,
    asignar_propio,
    color_de_torso,
    entrenar_clasificador,
)
from .geometria import Homografia
from .salida import Ficha, Track, crear_snapshot


@dataclass
class Progreso:
    frames_leidos: int = 0
    frames_analizados: int = 0
    detecciones: int = 0
    descartadas_fuera_de_cancha: int = 0
    descartadas_sin_equipo: int = 0


@dataclass
class ResultadoAnalisis:
    snapshots: list[dict] = field(default_factory=list)
    tracks: dict[int, Track] = field(default_factory=dict)
    clasificador: ClasificadorEquipos | None = None
    votos_equipo: dict[int, dict[str, int]] = field(default_factory=dict)
    progreso: Progreso = field(default_factory=Progreso)
    reporte_precision: dict | None = None
    avisos: list[str] = field(default_factory=list)

    def recorridos(self, *, club_id, id_partido, duracion_minima_ms: int = 2000) -> list[dict]:
        """
        Los tracks que duraron menos de dos segundos casi siempre son basura:
        un reflejo en el piso, alguien de la tribuna que asomó, dos jugadores
        que se cruzaron y el seguidor abrió un track de más. Ensucian el mapa
        de ocupación y no aportan nada.
        """
        return [
            t.a_recorrido(club_id=club_id, id_partido=id_partido)
            for t in self.tracks.values()
            if t.duracion_ms >= duracion_minima_ms
        ]

    def resumen(self) -> dict:
        largos = [t.duracion_ms for t in self.tracks.values()]
        return {
            "version_diccionario": VERSION_DICCIONARIO,
            "frames_analizados": self.progreso.frames_analizados,
            "snapshots": len(self.snapshots),
            "tracks": len(self.tracks),
            "duracion_media_track_s": round(float(np.mean(largos)) / 1000, 1) if largos else 0.0,
            "duracion_max_track_s": round(max(largos) / 1000, 1) if largos else 0.0,
            "detecciones": self.progreso.detecciones,
            "descartadas_fuera_de_cancha": self.progreso.descartadas_fuera_de_cancha,
            "descartadas_sin_equipo": self.progreso.descartadas_sin_equipo,
            "equipos_confiables": bool(self.clasificador and self.clasificador.confiable),
            "reporte_precision": self.reporte_precision,
            "avisos": self.avisos,
        }


def _abrir(ruta):
    import cv2

    cap = cv2.VideoCapture(str(ruta))
    if not cap.isOpened():
        raise FileNotFoundError(f"No se pudo abrir el video: {ruta}")
    return cap, cv2


def _recorte(frame, bbox):
    x1, y1, x2, y2 = (int(round(v)) for v in bbox)
    alto, ancho = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(ancho, x2), min(alto, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def muestrear_colores(ruta_video, detector, homografia: Homografia, *,
                      enderezador=None, muestras: int = 300,
                      params: Parametros = PARAMETROS) -> list[np.ndarray]:
    """
    Primera pasada: junta colores de torso repartidos por todo el partido.

    Se muestrea a lo largo del archivo entero y no de los primeros minutos: si
    la luz del gimnasio cambia o entra sol por una ventana, hay que verlo.
    """
    cap, cv2 = _abrir(ruta_video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    saltos = np.linspace(0, max(total - 1, 0), num=min(muestras, total), dtype=int)
    colores = []
    try:
        for pos in saltos:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(pos))
            ok, frame = cap.read()
            if not ok:
                continue
            if enderezador is not None:
                frame = enderezador(frame)
            for det in detector.detectar(frame):
                x_m, y_m = homografia.a_cancha(*det.pies)
                if not homografia.dentro_de_cancha(x_m, y_m, params.margen_cancha_m):
                    continue
                color = color_de_torso(_recorte(frame, det.bbox))
                if color is not None:
                    colores.append(color)
    finally:
        cap.release()
    return colores


def analizar(
    ruta_video,
    homografia: Homografia,
    clasificador: ClasificadorEquipos,
    *,
    club_id,
    id_partido,
    periodo: str = "PT",
    invertida: bool = False,
    detector=None,
    seguidor=None,
    enderezador=None,
    t_inicio_ms: int = 0,
    params: Parametros = PARAMETROS,
    al_avanzar=None,
) -> ResultadoAnalisis:
    """
    Segunda pasada: la que produce los datos.

    `invertida` es el lado en que ataca el equipo propio en este período. Es el
    mismo flag que usa la app: si sale mal, todos los mapas quedan espejados.
    `t_inicio_ms` es el instante del video donde arranca el período, o sea el
    saque inicial, no el principio del archivo.
    """
    from .deteccion import crear_detector
    from .seguimiento import SeguidorByteTrack

    detector = detector or crear_detector("rfdetr", conf_minima=params.conf_minima_persona)
    seguidor = seguidor or SeguidorByteTrack(fps=params.fps_analisis,
                                             max_frames_sin_ver=params.max_frames_sin_ver)

    cap, cv2 = _abrir(ruta_video)
    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30.0
    paso = max(1, int(round(fps_video / params.fps_analisis)))

    res = ResultadoAnalisis(clasificador=clasificador)
    res.reporte_precision = homografia.reporte_precision(params.error_deteccion_px)
    if not clasificador.confiable:
        res.avisos.append(
            f"Los dos equipos visten demasiado parecido (separación de color "
            f"{clasificador.separacion:.0f}, mínimo {clasificador.SEPARACION_MINIMA:.0f}). "
            "La asignación de equipo no es confiable en este partido."
        )
    peor = res.reporte_precision.get("peor_celda")
    if peor and (res.reporte_precision["celdas"][peor]["error_m"] or 0) > 0.75:
        res.avisos.append(
            f"La celda {peor} tiene una incertidumbre de "
            f"{res.reporte_precision['celdas'][peor]['error_m']:.2f} m. Es el rincón "
            "lejano visto desde el corner: leer con cuidado los datos de esa zona."
        )

    ultimo_snapshot_ms = None
    indice = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            res.progreso.frames_leidos += 1
            if indice % paso:
                indice += 1
                continue
            indice += 1

            t_ms = t_inicio_ms + (res.progreso.frames_leidos - 1) / fps_video * 1000.0
            if t_ms < 0:
                continue
            if enderezador is not None:
                frame = enderezador(frame)

            detecciones = detector.detectar(frame)
            res.progreso.detecciones += len(detecciones)
            fichas: list[Ficha] = []

            for seguida in seguidor.actualizar(detecciones):
                det = seguida.deteccion
                x_m, y_m = homografia.a_cancha(*det.pies)
                if not homografia.dentro_de_cancha(x_m, y_m, params.margen_cancha_m):
                    res.progreso.descartadas_fuera_de_cancha += 1
                    continue

                equipo = clasificador.clasificar(color_de_torso(_recorte(frame, det.bbox)))
                if equipo == "Desconocido":
                    # Arqueros y árbitros caen acá. No se tiran: se cuentan,
                    # para saber cuánto se está descartando.
                    res.progreso.descartadas_sin_equipo += 1

                x, y = homografia.pies_a_norm(det.bbox, invertida) or (None, None)
                if x is None:
                    continue

                track = res.tracks.get(seguida.track_ia)
                if track is None:
                    track = Track(track_ia=seguida.track_ia, equipo=equipo, periodo=periodo)
                    res.tracks[seguida.track_ia] = track
                votos = res.votos_equipo.setdefault(seguida.track_ia, {})
                votos[equipo] = votos.get(equipo, 0) + 1
                track.agregar(t_ms, x, y)
                fichas.append(Ficha(equipo=equipo, x=x, y=y, track_ia=seguida.track_ia,
                                    confianza=det.confianza))

            if ultimo_snapshot_ms is None or t_ms - ultimo_snapshot_ms >= params.snapshot_cada_ms:
                res.snapshots.append(crear_snapshot(
                    club_id=club_id, id_partido=id_partido, periodo=periodo,
                    t_ms=t_ms, fichas=fichas,
                ))
                ultimo_snapshot_ms = t_ms

            res.progreso.frames_analizados += 1
            if al_avanzar and res.progreso.frames_analizados % 100 == 0:
                al_avanzar(res.progreso)
    finally:
        cap.release()

    resolver_equipos_por_mayoria(res)
    return res


def resolver_equipos_por_mayoria(res: ResultadoAnalisis) -> None:
    """
    Cada track se queda con el equipo que más veces se le asignó, no con el del
    primer frame.

    Importa más de lo que parece: en un cuadro suelto el jugador puede estar
    tapado, de espaldas o con el torso a contraluz, y el color sale cualquier
    cosa. Dejar que ese cuadro defina de qué equipo es alguien al que vimos
    doscientas veces es tirar a la basura toda la evidencia buena. Con el voto
    por mayoría, un puñado de frames malos no mueve el resultado.

    Los votos a 'Desconocido' (arqueros, árbitros) no se descartan: si un track
    es mayormente desconocido, ES un arquero o un árbitro, y marcarlo como
    jugador de campo sería peor que dejarlo afuera.
    """
    for track_ia, votos in res.votos_equipo.items():
        track = res.tracks.get(track_ia)
        if track and votos:
            track.equipo = max(votos, key=votos.get)


def guardar(res: ResultadoAnalisis, destino, *, club_id, id_partido) -> Path:
    """
    Deja un JSON con todo lo que produjo el análisis, listo para que la UI de
    corrección lo revise ANTES de que nada toque la base.

    Que no escriba directo en Supabase es a propósito: un análisis sin revisar
    no debería poder ensuciar la tabla de eventos del club.
    """
    destino = Path(destino)
    destino.write_text(json.dumps({
        "resumen": res.resumen(),
        "clasificador_equipos": res.clasificador.a_dict() if res.clasificador else None,
        "snapshots": res.snapshots,
        "recorridos": res.recorridos(club_id=club_id, id_partido=id_partido),
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    return destino
