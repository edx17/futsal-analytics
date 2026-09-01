"""
Video de auditoría: el partido con los recuadros encima y el radar 2D al lado.

Es el entregable más importante de la Fase 1, aunque no sea un número.

Motivo: las métricas de un pipeline de visión mienten con cara de seriedad. Un
resumen que dice "1.847 detecciones, 23 tracks" no distingue entre un análisis
bueno y uno que estuvo diez minutos siguiendo al técnico rival. Treinta
segundos mirando este video y sabés en qué estado está. Ningún test unitario
reemplaza eso.

Qué mirar cuando lo veas:
  · ¿Hay recuadros sobre gente de la tribuna? -> falla el filtro de cancha.
  · ¿Los puntos del radar se corresponden con dónde están parados? -> falla la
    calibración.
  · ¿Los colores de equipo bailan? -> falla el clasificador, o la cámara tenía
    la exposición en automático.
  · ¿Los números saltan todo el tiempo? -> el seguidor pierde identidades; es
    esperable en futsal, lo que importa es cuánto.
"""

from __future__ import annotations

from pathlib import Path

from .cancha import ANCHO_CANCHA_M, LARGO_CANCHA_M, norm_a_metros

COLOR_EQUIPO = {
    "Propio": (136, 255, 0),      # BGR: el verde de la app
    "Rival": (68, 68, 239),
    "Desconocido": (21, 204, 250),
}


def _dibujar_cancha(cv2, lienzo, ancho, alto, margen=20):
    esc_x = (ancho - 2 * margen) / LARGO_CANCHA_M
    esc_y = (alto - 2 * margen) / ANCHO_CANCHA_M
    a_px = lambda x_m, y_m: (int(margen + x_m * esc_x), int(margen + y_m * esc_y))  # noqa: E731

    cv2.rectangle(lienzo, a_px(0, 0), a_px(LARGO_CANCHA_M, ANCHO_CANCHA_M), (90, 90, 90), 2)
    cv2.line(lienzo, a_px(20, 0), a_px(20, ANCHO_CANCHA_M), (90, 90, 90), 1)
    cv2.circle(lienzo, a_px(20, 10), int(3 * esc_x), (90, 90, 90), 1)
    # La grilla de lectura del club: Z1-Z4 x I/C/D.
    for x_m in (10, 30):
        cv2.line(lienzo, a_px(x_m, 0), a_px(x_m, ANCHO_CANCHA_M), (55, 55, 55), 1)
    for y_m in (ANCHO_CANCHA_M / 3, 2 * ANCHO_CANCHA_M / 3):
        cv2.line(lienzo, a_px(0, y_m), a_px(LARGO_CANCHA_M, y_m), (55, 55, 55), 1)
    for x_m, etiqueta in ((5, "Z1"), (15, "Z2"), (25, "Z3"), (35, "Z4")):
        cv2.putText(lienzo, etiqueta, a_px(x_m, 1.6), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (70, 70, 70), 1)
    return a_px


def exportar(ruta_video, resultado, destino, *, invertida: bool = False,
             enderezador=None, fps_salida: int = 10, max_segundos: float | None = 120):
    """
    Escribe el video de auditoría. Por defecto solo los primeros dos minutos:
    para revisar alcanza y sobra, y el partido entero tarda una eternidad.
    Pasar `max_segundos=None` para exportarlo completo.
    """
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(str(ruta_video))
    if not cap.isOpened():
        raise FileNotFoundError(f"No se pudo abrir el video: {ruta_video}")

    ancho = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    alto = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30.0
    alto_radar = int(alto * 0.32)

    destino = Path(destino)
    salida = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"),
                             fps_salida, (ancho, alto + alto_radar))
    paso = max(1, int(round(fps_video / fps_salida)))

    # Los snapshots vienen espaciados: para cada frame se usa el más cercano.
    snaps = sorted(resultado.snapshots, key=lambda s: s["t_ms"])
    tiempos = np.array([s["t_ms"] for s in snaps]) if snaps else np.array([])

    try:
        indice = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t_ms = indice / fps_video * 1000.0
            if max_segundos is not None and t_ms > max_segundos * 1000:
                break
            if indice % paso:
                indice += 1
                continue
            indice += 1
            if enderezador is not None:
                frame = enderezador(frame)

            if len(tiempos) == 0:
                continue
            snap = snaps[int(np.abs(tiempos - t_ms).argmin())]

            radar = np.zeros((alto_radar, ancho, 3), dtype=np.uint8)
            a_px = _dibujar_cancha(cv2, radar, ancho, alto_radar)

            for p in snap["posiciones"]:
                color = COLOR_EQUIPO.get(p["equipo"], COLOR_EQUIPO["Desconocido"])
                x_m, y_m = norm_a_metros(p["x"], p["y"])
                if invertida:
                    x_m, y_m = LARGO_CANCHA_M - x_m, ANCHO_CANCHA_M - y_m
                centro = a_px(x_m, y_m)
                cv2.circle(radar, centro, 7, color, -1)
                cv2.putText(radar, str(p.get("_track_ia", "")),
                            (centro[0] - 5, centro[1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)

            cv2.putText(frame, f"{t_ms / 1000:6.1f}s  |  {len(snap['posiciones'])} en cancha",
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            salida.write(np.vstack([frame, radar]))
    finally:
        cap.release()
        salida.release()
    return destino
