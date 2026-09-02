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
    "Propio": (136, 255, 0),          # BGR: el verde de la app
    "Rival": (68, 68, 239),
    "Arquero propio": (255, 200, 0),
    "Arquero rival": (200, 0, 255),
    "Arbitro": (160, 160, 160),
    "Desconocido": (21, 204, 250),
}


def _dibujar_cancha(cv2, lienzo, ancho, alto, margen=20, invertida=False):
    """
    Dibuja la cancha y devuelve la función que lleva de 0-100 (la convención de
    la app) a píxel del radar.

    Cuando el equipo propio ataca hacia la izquierda, se espeja al dibujar para
    que el radar quede orientado como la cámara y se pueda comparar de un
    vistazo con la imagen de arriba. Los datos guardados no se tocan.
    """
    esc_x = (ancho - 2 * margen) / LARGO_CANCHA_M
    esc_y = (alto - 2 * margen) / ANCHO_CANCHA_M

    def a_px(x, y):
        x_m, y_m = norm_a_metros(x, y)
        if invertida:
            x_m, y_m = LARGO_CANCHA_M - x_m, ANCHO_CANCHA_M - y_m
        return (int(margen + x_m * esc_x), int(margen + y_m * esc_y))

    cv2.rectangle(lienzo, a_px(0, 0), a_px(100, 100), (90, 90, 90), 2)
    cv2.line(lienzo, a_px(50, 0), a_px(50, 100), (90, 90, 90), 1)
    cv2.circle(lienzo, a_px(50, 50), int(3 * esc_x), (90, 90, 90), 1)
    # La grilla de lectura del club: Z1-Z4 x I/C/D.
    for x in (25, 75):
        cv2.line(lienzo, a_px(x, 0), a_px(x, 100), (55, 55, 55), 1)
    for y in (100 / 3, 200 / 3):
        cv2.line(lienzo, a_px(0, y), a_px(100, y), (55, 55, 55), 1)
    for zi, etiqueta in enumerate(("Z1", "Z2", "Z3", "Z4")):
        # Las etiquetas van en coordenadas de la app, así que acompañan al
        # espejado: Z1 siempre queda del lado del arco propio.
        cv2.putText(lienzo, etiqueta, a_px((zi + 0.5) * 25, 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (70, 70, 70), 1)
    return a_px


def snapshot_para(tiempos, t_periodo: float, tolerancia_ms: float = 400):
    """
    Cuál de los snapshots corresponde a este instante, o ninguno.

    Se saca aparte para poder probarlo sin video. Acá vivía el peor bug del
    proyecto: el overlay comparaba el tiempo del VIDEO contra snapshots
    guardados en tiempo del PERÍODO. Con el análisis corriendo desde el minuto
    5, todos los snapshots quedaban lejísimos y el más cercano era siempre el
    primero: el radar mostraba la misma foto durante los dos minutos enteros y
    parecía que el seguimiento no funcionaba.

    La tolerancia es igual de importante. Sin ella, un instante sin datos
    —antes del saque, o después del tramo analizado— igual dibuja el snapshot
    más cercano, y una foto vieja presentada como si fuera de ahora es peor que
    no dibujar nada.
    """
    import numpy as np

    if len(tiempos) == 0:
        return None
    k = int(np.abs(np.asarray(tiempos, dtype=float) - t_periodo).argmin())
    return k if abs(tiempos[k] - t_periodo) <= tolerancia_ms else None


def exportar(ruta_video, resultado, destino, *, invertida: bool = False,
             enderezador=None, encuadre=None, fps_salida: int = 10,
             desde_ms: float = 0, t_saque_ms: float = 0,
             max_segundos: float | None = 120):
    """
    Escribe el video de auditoría: el partido con los recuadros encima y el
    radar 2D abajo.

    Los tres parámetros de tiempo no son opcionales de verdad. El análisis
    puede haber corrido sobre un tramo del video (`desde_ms`) y guarda los
    tiempos relativos al saque (`t_saque_ms`). Si el overlay no usa los mismos,
    busca el snapshot más cercano a un instante que no existe en los datos y se
    queda pegado al primero: el radar no se mueve en todo el video. Pasó.
    """
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(str(ruta_video))
    if not cap.isOpened():
        raise FileNotFoundError(f"No se pudo abrir el video: {ruta_video}")

    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30.0
    primer_cuadro = int(round(desde_ms / 1000.0 * fps_video)) if desde_ms else 0
    if primer_cuadro:
        cap.set(cv2.CAP_PROP_POS_FRAMES, primer_cuadro)

    # El tamaño sale del frame YA encuadrado: es lo que vio el análisis, y es
    # sobre eso que valen las coordenadas de los recuadros.
    ok, muestra = cap.read()
    if not ok:
        cap.release()
        raise ValueError("No pude leer el primer cuadro del tramo pedido.")
    if enderezador is not None:
        muestra = enderezador(muestra)
    if encuadre is not None:
        muestra = encuadre.aplicar(muestra)
    alto, ancho = muestra.shape[:2]
    cap.set(cv2.CAP_PROP_POS_FRAMES, primer_cuadro)

    alto_radar = int(alto * 0.34)
    destino = Path(destino)
    salida = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"),
                             fps_salida, (ancho, alto + alto_radar))
    paso = max(1, int(round(fps_video / fps_salida)))

    snaps = sorted(resultado.snapshots, key=lambda s: s["t_ms"])
    tiempos = np.array([s["t_ms"] for s in snaps], dtype=float) if snaps else np.array([])
    # Más allá de esto, el snapshot más cercano ya no representa lo que se ve.
    # Vale más no dibujar nada que dibujar una foto vieja como si fuera de ahora.
    TOLERANCIA_MS = 400

    try:
        leidos = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            ms_video = (primer_cuadro + leidos) / fps_video * 1000.0
            leidos += 1
            if max_segundos is not None and ms_video - desde_ms > max_segundos * 1000:
                break
            if (leidos - 1) % paso:
                continue

            if enderezador is not None:
                frame = enderezador(frame)
            if encuadre is not None:
                frame = encuadre.aplicar(frame)
            if len(tiempos) == 0:
                continue

            # El MISMO reloj con el que se guardaron los snapshots.
            t_periodo = ms_video - t_saque_ms
            k = snapshot_para(tiempos, t_periodo, TOLERANCIA_MS)
            snap = snaps[k] if k is not None else None

            radar = np.zeros((alto_radar, ancho, 3), dtype=np.uint8)
            a_px = _dibujar_cancha(cv2, radar, ancho, alto_radar, invertida=invertida)
            jugadores = 0

            for p in (snap["posiciones"] if snap else []):
                equipo = p.get("equipo", "Desconocido")
                color = COLOR_EQUIPO.get(equipo, COLOR_EQUIPO["Desconocido"])
                if equipo in ("Propio", "Rival"):
                    jugadores += 1

                # El recuadro sobre la imagen. Sin esto no se puede auditar
                # nada: el radar solo muestra puntos, y un punto mal ubicado se
                # ve igual que uno bien ubicado.
                caja = p.get("_bbox")
                if caja:
                    x1, y1, x2, y2 = (int(v) for v in caja)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, str(p.get("_track_ia", "")), (x1, max(14, y1 - 5)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

                centro = a_px(p["x"], p["y"])
                cv2.circle(radar, centro, 8, color, -1)
                cv2.putText(radar, str(p.get("_track_ia", "")),
                            (centro[0] - 6, centro[1] - 11),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

            etiqueta = (f"{t_periodo / 1000:7.1f}s del periodo  |  "
                        f"{jugadores} jugadores"
                        + ("" if snap else "  |  SIN DATOS EN ESTE INSTANTE"))
            cv2.putText(frame, etiqueta, (16, 34), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (255, 255, 255), 2)
            salida.write(np.vstack([frame, radar]))
    finally:
        cap.release()
        salida.release()
    return destino
