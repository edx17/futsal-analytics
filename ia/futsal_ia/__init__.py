"""
Fase 1 del análisis de video de futsal: de un MP4 a posiciones sobre la cancha.

Lo que hace: detecta personas, las sigue, decide de qué equipo son por color,
las proyecta al plano de la cancha y escribe snapshots y recorridos en el
mismo formato que llena un humano en TomaDatosOffline.

Lo que NO hace, a propósito: no detecta la pelota (Fase 2), no cuenta pases ni
posesión (Fase 2), no reconoce jugadores ni cambios (queda manual, por
decisión registrada en docs/analisis-video/00-diccionario-metricas.md).
"""

from .config import PARAMETROS, VERSION_DICCIONARIO, Parametros

__all__ = ["PARAMETROS", "Parametros", "VERSION_DICCIONARIO", "__version__"]
__version__ = "0.1.0"
