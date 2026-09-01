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
    margen_cancha_m: float = 1.5
    """Cuánto se tolera fuera de la línea antes de descartar una detección."""

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
