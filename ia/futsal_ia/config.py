"""
Los parámetros del diccionario de métricas, en un solo lugar.

`docs/analisis-video/00-diccionario-metricas.md` promete que todos los umbrales
viven en un archivo versionado y que cada análisis guarda con qué versión se
calculó. Este es ese archivo. Cambiar un número de acá cambia los números
históricos, así que la versión se sube cuando se toca algo.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

VERSION_DICCIONARIO = "0.2"


@dataclass(frozen=True)
class Parametros:
    # ── Métricas (diccionario v0.2) ────────────────────────────────────────
    control_min_ms: int = 1000
    """Cuánto retiene un equipo para que cuente como posesión y no rebote."""

    rebote_max_ms: int = 400
    """Contacto más corto que esto es despeje o rebote, no posesión."""

    pase_dist_min_m: float = 2.0

    presion_radio_m: float = 1.0
    """Decisión del CT: 2 m no es presión en futsal."""

    bloqueo_radio_m: float = 1.5

    zona_recuperacion_alta: tuple[str, ...] = ("Z3", "Z4")

    # ── Fase 1: detección y seguimiento ────────────────────────────────────
    conf_minima_persona: float = 0.35
    margen_cancha_m: float = 0.5
    """
    Cuánto se tolera fuera de la línea antes de descartar una detección.

    Medido sobre un partido real: con 1,5 m entraban diez suplentes parados
    contra la baranda. Con 0,5 m sigue entrando el que ejecuta un saque de
    banda, que es a quien hay que dejar pasar. Los que quedan se sacan con las
    zonas excluidas de la calibración, no bajando más esto.
    """

    fps_analisis: int = 10
    """
    Frames por segundo que se procesan. NO son los del video.

    Para posiciones, 10 fps alcanzan y sobran: un jugador de futsal se mueve
    menos de 80 cm entre frames a esa cadencia, y entre medio se interpola.
    Procesar los 60 fps del archivo cuesta seis veces más y no agrega nada.
    La pelota es otra historia y va a necesitar la cadencia completa, pero eso
    es Fase 2.
    """

    snapshot_cada_ms: int = 200
    """Cada cuánto se guarda una foto del tablero completo."""

    max_frames_sin_ver: int = 30
    """Frames que un track sobrevive tapado antes de darse por perdido."""

    # ── Calibración ────────────────────────────────────────────────────────
    error_rms_maximo_m: float = 0.30
    error_deteccion_px: float = 3.0
    """Error típico del borde inferior del recuadro. Alimenta el informe de precisión."""

    def a_dict(self) -> dict:
        d = asdict(self)
        d["version_diccionario"] = VERSION_DICCIONARIO
        return d


PARAMETROS = Parametros()


# ── Configuración de un partido ────────────────────────────────────────────

def invertida_de(periodo: str, invertida_pt: bool) -> bool:
    """
    Si el equipo propio ataca hacia la izquierda en este período.

    No se pregunta dos veces: los equipos cambian de lado en el entretiempo,
    así que alcanza con saber el primero. Preguntar los dos abre la puerta a
    que alguien conteste lo mismo para ambos y todos los mapas del segundo
    tiempo salgan espejados sin que nada falle.
    """
    return bool(invertida_pt) if periodo == "PT" else not bool(invertida_pt)


def combinar_config(config: dict | None, periodo: str, explicitos: dict) -> dict:
    """
    Junta el partido.json con lo que se escribió en la línea de comandos.

    Lo explícito gana siempre: el archivo es la comodidad, no la autoridad.
    """
    config = config or {}
    salida = {
        "video": config.get("video"),
        "calibracion": config.get("calibracion"),
        "encuadre": config.get("encuadre"),
        "lente": config.get("lente"),
        "club": config.get("club"),
        "partido": config.get("partido"),
        "saque": (config.get("periodos", {}).get(periodo) or {}).get("saque", "0"),
        "invertida": invertida_de(periodo, config.get("invertida_pt", False)),
    }
    salida.update({k: v for k, v in explicitos.items() if v is not None})
    return salida
