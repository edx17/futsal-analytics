"""
Orquestación de la Fase 1: video -> posiciones sobre la cancha.

El orden importa y cada paso depende del anterior:

    1. leer el frame
    2. enderezar la lente          (sobre el frame COMPLETO: la distorsión es
                                    una propiedad del sensor entero, y recortar
                                    antes corre el centro óptico y arruina la
                                    corrección)
    3. girar y recortar            (el encuadre, siempre el mismo)
    4. detectar personas
    5. seguirlas entre frames
    6. proyectar los PIES al plano de la cancha
    7. tirar lo que cae fuera      (tribuna, bancos, mesa de control)
    8. clasificar por color        (dos pasadas: una junta colores, otra asigna)
    9. escribir snapshots y recorridos

La calibración se hace sobre el frame YA enderezado y encuadrado, así que el
encuadre viaja junto a la calibración y se aplica idéntico en cada análisis.

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
from .preproceso import Encuadre
from .salida import Ficha, Track, crear_snapshot


class ErrorIncompatible(Exception):
    """La calibración y el encuadre no hablan del mismo cuadro."""


class SinColores(Exception):
    """
    La pasada 1 no juntó ningún color de camiseta.

    Existe como excepción propia porque el mensaje tiene que decir POR QUÉ, y
    hay tres motivos posibles que se arreglan de forma distinta: el detector no
    encuentra gente, la encuentra pero la homografía la manda fuera de la
    cancha, o los recortes salen demasiado chicos. Sin los contadores, los tres
    se ven igual: cero.
    """


@dataclass
class ConteoMuestreo:
    frames: int = 0
    personas: int = 0
    fuera_de_cancha: int = 0
    sin_color: int = 0
    colores: int = 0

    def diagnostico(self) -> str:
        if self.frames == 0:
            return ("No se pudo leer ningún cuadro del video. El archivo está pero "
                    "no se decodifica: probá reproducirlo, y si está en OneDrive o "
                    "Drive movelo a una carpeta local.")
        if self.personas == 0:
            return (f"El detector no encontró una sola persona en {self.frames} cuadros. "
                    "Casi seguro el recorte del encuadre está mal y estás analizando "
                    "un pedazo de la tribuna o del piso vacío. Abrí el verificador y "
                    "mirá qué queda dentro del recorte.")
        if self.fuera_de_cancha >= self.personas:
            return (f"Se detectaron {self.personas} personas en {self.frames} cuadros, "
                    f"pero TODAS cayeron fuera de la cancha según la homografía.\n\n"
                    "Eso significa que la calibración y el video no se corresponden. "
                    "Lo más común: el calibracion.json es de un frame distinto al que "
                    "estás analizando, o se regeneró el encuadre y no la calibración.\n\n"
                    "Corré el diagnóstico para verlo:\n"
                    "  python -m futsal_ia.cli diagnostico --video ... --calibracion ... "
                    "--encuadre ... --salida diagnostico.png")
        return (f"Se detectaron {self.personas} personas y "
                f"{self.fuera_de_cancha} cayeron fuera de la cancha, pero ningún "
                f"recorte dio un color usable ({self.sin_color} descartados). "
                "Los jugadores se ven demasiado chicos en el cuadro.")


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
        raise FileNotFoundError(diagnostico_video(ruta))
    return cap, cv2


def diagnostico_video(ruta) -> str:
    """
    Por qué no se pudo abrir, en lugar de un "no se pudo abrir" a secas.

    El caso que más cuesta descubrir solo: un archivo dentro de OneDrive o
    Drive con sincronización a pedido. Figura en el explorador con su nombre y
    su tamaño, pero en el disco no hay nada: es un marcador. OpenCV lo abre,
    lee cero bytes y falla como si el video estuviera roto.
    """
    from pathlib import Path

    p = Path(ruta)
    if not p.exists():
        padre = p.parent
        pista = ""
        if padre.exists():
            vecinos = sorted(x.name for x in padre.glob("*.mp4"))[:5]
            if vecinos:
                pista = "\nEn esa carpeta hay: " + ", ".join(vecinos)
        else:
            pista = f"\nLa carpeta {padre} tampoco existe."
        return (f"No existe el archivo: {p}\n"
                "Si la ruta tiene espacios, ponela entre comillas." + pista)

    tam = p.stat().st_size
    if tam == 0:
        return f"El archivo {p} está vacío (0 bytes)."
    if tam < 100_000:
        return (f"El archivo {p} pesa solo {tam / 1024:.0f} KB. Si está dentro de "
                "OneDrive o Google Drive, puede ser un marcador de sincronización "
                "a pedido y no el video: figura con su nombre pero en el disco no "
                "hay nada. Abrilo una vez desde el explorador para que se baje, o "
                "mejor, movelo a una carpeta local fuera de la nube.")
    return (f"No pude leer el video {p} ({tam / 1e6:.0f} MB). El archivo está, así "
            "que o el formato no es compatible o está incompleto. Probá "
            "reproducirlo; si la carpeta sincroniza con la nube, movelo a una "
            "carpeta local.")


def revisar_compatibilidad(homografia, encuadre) -> None:
    """
    Que la calibración y el encuadre hablen del mismo tamaño de cuadro.

    La homografía guarda sobre qué resolución se calibró. Si el encuadre
    produce otra, las coordenadas no significan lo mismo y TODO cae fuera de la
    cancha — pero nada falla: el análisis corre entero y devuelve cero. Es el
    error más caro de todos, porque se paga en horas de procesamiento antes de
    que aparezca.

    El caso típico: se rehace el encuadre y se olvida regenerar la calibración,
    o al revés.
    """
    esperada = getattr(homografia, "resolucion", None)
    if not esperada:
        return
    real = tuple(encuadre.resolucion_salida) if encuadre else None
    if real is None or tuple(esperada) == real:
        return
    raise ErrorIncompatible(
        f"La calibración se hizo sobre un cuadro de {esperada[0]}x{esperada[1]} "
        f"y el encuadre produce {real[0]}x{real[1]}.\n\n"
        "Las coordenadas no significan lo mismo, así que todas las detecciones "
        "caerían fuera de la cancha y el análisis devolvería cero después de "
        "horas.\n\n"
        "Pasa cuando se rehace el encuadre y no se regenera la calibración, o al "
        "revés. Volvé a calibrar:\n"
        "  python -m futsal_ia.cli calibrar --marcas marcas.json "
        "--encuadre encuadre.json --salida calibracion.json"
    )


def tiempo_de_periodo(ms_video: float, t_saque_ms: float) -> float:
    """
    De instante del video a instante del PERÍODO.

    Se RESTA el saque, no se suma. Sumando, un saque en el segundo 30 estampaba
    todo 30 s tarde y el cruce con los cambios que carga TomaDatos —de donde
    sale el tiempo neto por jugador— quedaba corrido en todo el partido, sin
    que nada fallara.

    Devuelve negativo para lo que pasó antes del saque, que es lo que permite
    descartar el calentamiento y la formación.
    """
    return ms_video - t_saque_ms


def _preparar(frame, enderezador, encuadre):
    """
    Enderezar y después encuadrar, siempre en ese orden.

    Al revés no funciona: la corrección de lente depende de dónde está el
    centro óptico del sensor, y recortar lo corre. Corregir sobre un frame ya
    recortado deja una imagen que parece derecha y no lo está.
    """
    if enderezador is not None:
        frame = enderezador(frame)
    if encuadre is not None:
        frame = encuadre.aplicar(frame)
    return frame


def _recorte(frame, bbox):
    x1, y1, x2, y2 = (int(round(v)) for v in bbox)
    alto, ancho = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(ancho, x2), min(alto, y2)
    if x2 <= x1 or y2 <= y1:
        return None
    return frame[y1:y2, x1:x2]


def muestrear_colores(ruta_video, detector, homografia: Homografia, *,
                      enderezador=None, encuadre: Encuadre | None = None,
                      muestras: int = 300,
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
    conteo = ConteoMuestreo()
    try:
        for pos in saltos:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(pos))
            ok, frame = cap.read()
            if not ok:
                continue
            conteo.frames += 1
            frame = _preparar(frame, enderezador, encuadre)
            for det in detector.detectar(frame):
                conteo.personas += 1
                x_m, y_m = homografia.a_cancha(*det.pies)
                if not homografia.dentro_de_cancha(x_m, y_m, params.margen_cancha_m):
                    conteo.fuera_de_cancha += 1
                    continue
                color = color_de_torso(_recorte(frame, det.bbox))
                if color is None:
                    conteo.sin_color += 1
                    continue
                colores.append(color)
        conteo.colores = len(colores)
    finally:
        cap.release()

    if len(colores) < 4:
        raise SinColores(conteo.diagnostico())
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
    encuadre: Encuadre | None = None,
    t_saque_ms: int = 0,
    desde_ms: int = 0,
    duracion_ms: int | None = None,
    params: Parametros = PARAMETROS,
    al_avanzar=None,
) -> ResultadoAnalisis:
    """
    Segunda pasada: la que produce los datos.

    `invertida` es el lado en que ataca el equipo propio en este período. Es el
    mismo flag que usa la app: si sale mal, todos los mapas quedan espejados.

    `t_saque_ms` es el instante DEL VIDEO donde arranca el período. Los tiempos
    que se guardan son relativos al saque, no al principio del archivo: si el
    saque está en el segundo 30, un evento del video en 0:45 se guarda como
    0:15 del período. Es lo que después permite cruzar con los cambios que
    carga TomaDatos, que también cuentan desde el saque.

    `desde_ms` y `duracion_ms` recortan qué tramo del video se analiza, sin
    tener que cortar un archivo aparte. Para probar, dos minutos alcanzan.
    """
    from .deteccion import crear_detector
    from .seguimiento import SeguidorByteTrack

    detector = detector or crear_detector("rfdetr", conf_minima=params.conf_minima_persona)
    seguidor = seguidor or SeguidorByteTrack(fps=params.fps_analisis,
                                             max_frames_sin_ver=params.max_frames_sin_ver)

    cap, cv2 = _abrir(ruta_video)
    fps_video = cap.get(cv2.CAP_PROP_FPS) or 30.0
    paso = max(1, int(round(fps_video / params.fps_analisis)))
    primer_cuadro = int(round(desde_ms / 1000.0 * fps_video)) if desde_ms else 0
    if primer_cuadro:
        cap.set(cv2.CAP_PROP_POS_FRAMES, primer_cuadro)

    revisar_compatibilidad(homografia, encuadre)

    res = ResultadoAnalisis(clasificador=clasificador)
    res.reporte_precision = homografia.reporte_precision(
        params.error_deteccion_px, invertida=invertida
    )
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

            ms_video = (primer_cuadro + res.progreso.frames_leidos - 1) / fps_video * 1000.0
            if duracion_ms is not None and ms_video - desde_ms > duracion_ms:
                break
            # Los tiempos se guardan relativos al SAQUE, no al principio del
            # archivo. Restar y no sumar: sumando, un saque en el segundo 30
            # estampaba todo 30 s tarde y el cruce con los cambios cargados a
            # mano quedaba corrido en todo el partido.
            t_ms = tiempo_de_periodo(ms_video, t_saque_ms)
            if t_ms < 0:
                continue
            frame = _preparar(frame, enderezador, encuadre)

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
