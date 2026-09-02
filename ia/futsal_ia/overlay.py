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

# Los diez que están en cancha: ocho de campo y dos arqueros.
JUGADORES = ("Propio", "Rival", "Arquero propio", "Arquero rival")

COLOR_EQUIPO = {
    "Propio": (136, 255, 0),          # BGR: el verde de la app
    "Rival": (68, 68, 239),
    "Arquero propio": (255, 200, 0),
    "Arquero rival": (200, 0, 255),
    "Arbitro": (160, 160, 160),
    "Desconocido": (21, 204, 250),
}


def _dibujar_radar(cv2, np, frame, snap, *, invertida, ancho_rel=0.30, margen=18):
    """
    El minimapa, chico y arriba de la imagen, como en un juego.

    Va superpuesto y no en una franja aparte por dos razones: la cancha
    conserva su proporción real de 2 a 1 —estirada a lo ancho de la pantalla,
    las distancias mienten al ojo— y se puede comparar de un vistazo con los
    jugadores de la imagen sin mover la vista a otro lado.
    """
    alto_img, ancho_img = frame.shape[:2]
    ancho = int(ancho_img * ancho_rel)
    alto = ancho // 2                    # 40 x 20 m: siempre 2 a 1
    x0 = ancho_img - ancho - margen
    y0 = alto_img - alto - margen

    capa = frame.copy()
    cv2.rectangle(capa, (x0, y0), (x0 + ancho, y0 + alto), (12, 12, 12), -1)
    cv2.addWeighted(capa, 0.78, frame, 0.22, 0, frame)

    pad = max(4, ancho // 40)
    esc_x = (ancho - 2 * pad) / 100.0
    esc_y = (alto - 2 * pad) / 100.0

    def a_px(x, y):
        if invertida:
            x, y = 100 - x, 100 - y
        return (int(x0 + pad + x * esc_x), int(y0 + pad + y * esc_y))

    gris = (95, 95, 95)
    cv2.rectangle(frame, a_px(0, 0), a_px(100, 100), gris, 1)
    cv2.line(frame, a_px(50, 0), a_px(50, 100), gris, 1)
    cv2.circle(frame, a_px(50, 50), int(7.5 * esc_x), gris, 1)
    for x in (25, 75):
        cv2.line(frame, a_px(x, 0), a_px(x, 100), (48, 48, 48), 1)
    for y in (100 / 3, 200 / 3):
        cv2.line(frame, a_px(0, y), a_px(100, y), (48, 48, 48), 1)
    # Los arcos, para no confundir de qué lado se ataca.
    for x, lado in ((0, 1), (100, -1)):
        cv2.line(frame, a_px(x, 42.5), a_px(x, 57.5), (200, 200, 200), 2)

    radio = max(3, ancho // 55)
    for p in (snap["posiciones"] if snap else []):
        color = COLOR_EQUIPO.get(p.get("equipo", "Desconocido"),
                                 COLOR_EQUIPO["Desconocido"])
        centro = a_px(p["x"], p["y"])
        cv2.circle(frame, centro, radio + 1, (0, 0, 0), -1)
        cv2.circle(frame, centro, radio, color, -1)
    return frame


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

    destino = Path(destino)
    salida = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"),
                             fps_salida, (ancho, alto))
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

            jugadores = 0
            for p in (snap["posiciones"] if snap else []):
                equipo = p.get("equipo", "Desconocido")
                color = COLOR_EQUIPO.get(equipo, COLOR_EQUIPO["Desconocido"])
                # Los arqueros son jugadores en cancha: en futsal son dos de
                # los diez. Contar solo a los de campo daba ocho como máximo y
                # hacía parecer que faltaba gente cuando no faltaba.
                if equipo in JUGADORES:
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

            _dibujar_radar(cv2, np, frame, snap, invertida=invertida)

            etiqueta = (f"{t_periodo / 1000:7.1f}s  |  {jugadores} jugadores"
                        + ("" if snap else "  |  SIN DATOS EN ESTE INSTANTE"))
            cv2.putText(frame, etiqueta, (16, 34), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (0, 0, 0), 4)
            cv2.putText(frame, etiqueta, (16, 34), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (255, 255, 255), 2)
            salida.write(frame)
    finally:
        cap.release()
        salida.release()
    return destino
