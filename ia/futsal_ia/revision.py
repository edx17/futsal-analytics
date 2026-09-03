"""
Preparar la revisión: sacar del video los cuadros que hay que mirar.

Por qué existe. El visor cargaba el video entero y lo hacía saltar de instante
en instante. Eso ataba la revisión a que el navegador supiera reproducir ese
archivo, y Chrome no reproduce varios códecs que OpenCV sí lee —H.265 el más
común—, así que el análisis funcionaba pero la revisión mostraba una pantalla
negra con `readyState 4` y `videoWidth 0`. Además obligaba al navegador a
buscar veinte veces dentro de un archivo de cincuenta minutos.

Para revisar no hace falta el video: hacen falta veinte cuadros. Se sacan acá,
en Python, con el mismo OpenCV que ya hizo el análisis, ya recortados al mismo
encuadre. El visor pasa a cargar imágenes, que cualquier navegador muestra.

De paso desaparece del navegador toda la aritmética de tiempos: qué cuadro
corresponde a qué instante se resuelve una vez, acá, donde ya está probado.
"""

from __future__ import annotations

import json
from pathlib import Path

CUANTOS = 20
CARPETA = "revision_cuadros"

# Cuánto puede caer un cuadro lejos del instante pedido antes de que valga la
# pena decirlo. Los snapshots van cada 200 ms más o menos; medio segundo de
# desfase ya es otra jugada, y los recuadros no coincidirían con la imagen.
DESFASE_AVISO_MS = 250.0

# Al buscar se cae en el keyframe anterior y se avanza decodificando. Se pide
# un poco antes del objetivo a propósito, porque algunos contenedores caen
# unos cuadros DESPUÉS de lo pedido y desde ahí ya no se puede volver.
MARGEN_CUADROS = 12
MAX_AVANCE = 120


def elegir_instantes(analisis: dict, cuantos: int = CUANTOS) -> list[dict]:
    """
    Los snapshots que se van a revisar, repartidos a lo largo del análisis.

    Parejo y no seguidos: veinte instantes espaciados muestran situaciones
    distintas, mientras que veinte seguidos son prácticamente la misma escena
    veinte veces y no dicen nada nuevo.
    """
    con_gente = [s for s in analisis.get("snapshots", []) if s.get("posiciones")]
    con_gente.sort(key=lambda s: s["t_ms"])
    if not con_gente:
        return []
    if len(con_gente) <= cuantos:
        return con_gente
    paso = len(con_gente) / cuantos
    return [con_gente[int(i * paso)] for i in range(cuantos)]


def _leer_en(cap, cv2, ms_objetivo: float, fps: float):
    """
    Un cuadro lo más cerca posible de `ms_objetivo`, y a cuánto quedó.

    Buscar por número de cuadro cae en el keyframe anterior y decodifica hasta
    el pedido, pero no todos los contenedores lo clavan. Se pide un poco antes
    y se avanza leyendo hasta pasar el objetivo: leer hacia adelante siempre
    funciona, buscar hacia atrás no.
    """
    objetivo = max(0, int(round(ms_objetivo / 1000.0 * fps)))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, objetivo - MARGEN_CUADROS))

    mejor, mejor_ms, mejor_dist = None, None, float("inf")
    for _ in range(MAX_AVANCE):
        # POS_MSEC es la posición del cuadro que se va a leer; se pregunta
        # antes del read() para que corresponda al frame que devuelve.
        ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        ok, frame = cap.read()
        if not ok:
            break
        if not ms:                       # algunos backends no lo informan
            ms = cap.get(cv2.CAP_PROP_POS_FRAMES) / fps * 1000.0
        dist = abs(ms - ms_objetivo)
        if dist < mejor_dist:
            mejor, mejor_ms, mejor_dist = frame, ms, dist
        if ms >= ms_objetivo:
            break
    if mejor is None:
        return None, None
    return mejor, mejor_ms - ms_objetivo


def exportar_cuadros(ruta_video, analisis: dict, destino, *,
                     cuantos: int = CUANTOS, calidad: int = 88,
                     al_avanzar=None) -> dict:
    """
    Escribe un JPG por instante a revisar y devuelve el índice.

    Los cuadros salen YA RECORTADOS al encuadre del análisis, así que las
    coordenadas de los recuadros valen tal cual sobre la imagen y el visor no
    tiene que recortar ni escalar nada.
    """
    import cv2

    from .pipeline import diagnostico_video
    from .preproceso import Encuadre

    meta = analisis.get("meta") or {}
    if meta.get("t_saque_ms") is None:
        raise ValueError(
            "Este análisis no guarda con qué se corrió (es de una versión "
            "anterior). Volvé a analizar y usá el archivo nuevo.")

    instantes = elegir_instantes(analisis, cuantos)
    if not instantes:
        raise ValueError(
            "El análisis no tiene ningún instante con gente para revisar.")

    encuadre = Encuadre.de_dict(meta.get("encuadre"))
    t_saque_ms = float(meta["t_saque_ms"])

    cap = cv2.VideoCapture(str(ruta_video))
    if not cap.isOpened():
        raise FileNotFoundError(diagnostico_video(ruta_video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    # Si quedaron cuadros de una corrida anterior con más instantes, los que
    # sobran mostrarían una revisión que ya no existe.
    for viejo in destino.glob("cuadro_*.jpg"):
        viejo.unlink()

    periodo = meta.get("periodo", "PT")
    salida, desfasados = [], 0
    try:
        for k, snap in enumerate(instantes):
            # El snapshot guarda tiempo de PERÍODO; el video corre en su propio
            # reloj. Se suma el saque para volver al tiempo del archivo.
            ms_video = float(snap["t_ms"]) + t_saque_ms
            frame, desfase = _leer_en(cap, cv2, ms_video, fps)
            if frame is None:
                continue
            if encuadre is not None:
                frame = encuadre.aplicar(frame)
            nombre = f"cuadro_{periodo}_{k:03d}.jpg"
            cv2.imwrite(str(destino / nombre), frame,
                        [int(cv2.IMWRITE_JPEG_QUALITY), calidad])
            alto, ancho = frame.shape[:2]
            if abs(desfase) > DESFASE_AVISO_MS:
                desfasados += 1
            salida.append({
                "t_ms": int(snap["t_ms"]),
                "imagen": nombre,
                "ancho": ancho, "alto": alto,
                "desfase_ms": round(desfase, 1),
                "posiciones": snap.get("posiciones", []),
            })
            if al_avanzar is not None:
                al_avanzar(len(salida), len(instantes))
    finally:
        cap.release()

    if not salida:
        raise ValueError(
            "No se pudo leer ningún cuadro del video en los instantes del "
            "análisis. ¿Es el mismo archivo con el que se analizó?")

    avisos = []
    if desfasados:
        avisos.append(
            f"{desfasados} de {len(salida)} cuadros quedaron a más de "
            f"{DESFASE_AVISO_MS:.0f} ms del instante pedido: en esos, los "
            f"recuadros pueden no coincidir con la imagen.")

    indice = {"periodo": periodo, "video": str(ruta_video),
              "instantes": salida, "avisos": avisos}
    (destino / "indice.json").write_text(
        json.dumps(indice, indent=2, ensure_ascii=False), encoding="utf-8")
    return indice
