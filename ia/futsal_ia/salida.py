"""
Construcción de las filas que van a la base.

La IA no inventa un formato: llena el MISMO que llena un humano cargando en
TomaDatosOffline. Este módulo es el puerto de las fábricas de
`src/offline/modelo.js` (crearSnapshot, crearRecorrido), con dos diferencias:

  · `origen_captura` vale 'ia' en vez de 'offline', para poder filtrar,
    comparar y auditar por origen;
  · los tracks traen `_track_ia`, el número que les puso el seguidor. Los
    campos que empiezan con `_` son locales y el sincronizador los descarta,
    que es exactamente lo que queremos: sirven para que la UI de corrección
    mapee track -> jugador, y no ensucian la tabla.

Consecuencia de escribir en este formato: todo lo que ya calcula
`src/analytics/` funciona sobre esto sin tocar una línea.
"""

from __future__ import annotations

import random
import string
import time
from dataclasses import dataclass, field

from .cancha import etiqueta_zona

BALON_ID = "balon"
DURACION_PERIODO_MS = 20 * 60 * 1000     # futsal: 20' por período
PERIODOS = ("PT", "ST")
ORIGEN_CAPTURA = "ia"


def nuevo_local_id(prefijo: str = "ev") -> str:
    """Puerto de `nuevoLocalId` de modelo.js: prefijo + tiempo en base36 + azar."""
    ahora = int(time.time() * 1000)
    base36 = ""
    n = ahora
    digitos = string.digits + string.ascii_lowercase
    while n:
        n, r = divmod(n, 36)
        base36 = digitos[r] + base36
    cola = "".join(random.choices(string.ascii_lowercase + string.digits, k=7))
    return f"{prefijo}_{base36 or '0'}_{cola}"


def parse_tiempo(texto) -> int:
    """
    Acepta "1:23:45", "5:30", "90" o 90 y devuelve milisegundos.

    Escribir los tiempos como los lee una persona evita el error de poner
    90000 donde iban 90 segundos, que después aparece como un desfasaje de
    minuto y medio en todo el partido y cuesta un día encontrar.
    """
    if isinstance(texto, (int, float)):
        return int(float(texto) * 1000)
    partes = str(texto).strip().split(":")
    if len(partes) > 3 or not all(p.strip() for p in partes):
        raise ValueError(f"No entiendo el tiempo {texto!r}. Usá 'mm:ss', 'hh:mm:ss' o segundos.")
    try:
        valores = [float(p) for p in partes]
    except ValueError as exc:
        raise ValueError(f"No entiendo el tiempo {texto!r}.") from exc
    if any(v < 0 for v in valores):
        raise ValueError(f"El tiempo {texto!r} es negativo.")
    segundos = 0.0
    for v in valores:
        segundos = segundos * 60 + v
    return int(round(segundos * 1000))


def ms_a_min_seg(ms: float) -> tuple[int, int]:
    ms = max(0.0, float(ms))
    return int(ms // 60000), int((ms % 60000) // 1000)


def _redondear(v):
    """
    Un decimal, igual que `fotoActual()` en TomaDatosOffline.

    No es cosmético: en 0-100 sobre una cancha de 40 m, un decimal son 4 cm.
    Guardar quince decimales de un número que tiene medio metro de
    incertidumbre real es mentirle al que lee la tabla, y multiplica por tres
    el peso de la columna JSON.
    """
    return None if v is None else round(float(v), 1)


@dataclass
class Ficha:
    """Un objeto sobre el tablero en un instante: jugador, rival o la pelota."""

    equipo: str                      # 'Propio' | 'Rival' | 'Arbitro'
    x: float                         # 0-100, convención de modelo.js
    y: float
    track_ia: int | None = None
    id_jugador: int | str | None = None
    dorsal: int | None = None
    confianza: float | None = None
    bbox: tuple | None = None
    """
    El recuadro en la imagen ANALIZADA (después del encuadre).

    Viaja como campo local para que el video de auditoría pueda dibujarlo. Sin
    esto el overlay solo muestra puntos en un radar, y un punto mal ubicado se
    ve exactamente igual que uno bien ubicado: no se puede auditar nada.
    """

    def a_posicion(self) -> dict:
        """La forma exacta que espera `posiciones` en snapshots y en video.js."""
        return {
            "id_jugador": self.id_jugador,
            "equipo": self.equipo,
            "dorsal": self.dorsal,
            "x": _redondear(self.x),
            "y": _redondear(self.y),
            "_track_ia": self.track_ia,
            "_bbox": list(self.bbox) if self.bbox else None,
        }


def ficha_balon(x: float, y: float, confianza: float | None = None) -> Ficha:
    """La pelota es una ficha más del tablero, con id 'balon'. Fase 2."""
    return Ficha(equipo="Neutral", x=x, y=y, id_jugador=BALON_ID, confianza=confianza)


def crear_snapshot(
    *,
    club_id,
    id_partido,
    periodo: str = "PT",
    t_ms: float = 0,
    fichas: list[Ficha] | None = None,
    contexto_juego: str = "5v5",
    etiqueta_tactica: str | None = None,
    nota: str | None = None,
) -> dict:
    """Puerto de `crearSnapshot()`. Va a la tabla `snapshots_posicionales`."""
    fichas = fichas or []
    minuto, segundos = ms_a_min_seg(t_ms)
    balon = next((f for f in fichas if f.id_jugador == BALON_ID), None)
    return {
        "local_id": nuevo_local_id("snap"),
        "club_id": club_id,
        "id_partido": id_partido,
        "id_evento": None,
        "periodo": periodo,
        "t_ms": int(t_ms),
        "minuto": minuto,
        "segundos": segundos,
        "posiciones": [f.a_posicion() for f in fichas if f.id_jugador != BALON_ID],
        "x_balon": _redondear(balon.x) if balon else None,
        "y_balon": _redondear(balon.y) if balon else None,
        "defensores_linea": None,
        "atacantes_linea": None,
        "balance_linea": None,
        "contexto_juego": contexto_juego,
        "etiqueta_tactica": etiqueta_tactica,
        "nota": nota,
        "origen_captura": ORIGEN_CAPTURA,
        "_estado": "local",
    }


@dataclass
class Track:
    """
    Un objeto seguido a lo largo del tiempo. Es la unidad natural que produce
    el seguidor y la que después el operador convierte en un jugador.
    """

    track_ia: int
    equipo: str = "Desconocido"
    puntos: list[dict] = field(default_factory=list)   # [{t_ms, x, y}]
    periodo: str = "PT"
    id_jugador: int | None = None
    dorsal_rival: int | None = None

    def agregar(self, t_ms: float, x: float, y: float) -> None:
        self.puntos.append({"t_ms": int(t_ms), "x": _redondear(x), "y": _redondear(y)})

    @property
    def t_inicio_ms(self) -> int:
        return self.puntos[0]["t_ms"] if self.puntos else 0

    @property
    def t_fin_ms(self) -> int | None:
        return self.puntos[-1]["t_ms"] if self.puntos else None

    @property
    def duracion_ms(self) -> int:
        return (self.t_fin_ms or 0) - self.t_inicio_ms

    def a_recorrido(self, *, club_id, id_partido) -> dict:
        """Puerto de `crearRecorrido()`. Va a la tabla `recorridos_jugador`."""
        return {
            "local_id": nuevo_local_id("rec"),
            "club_id": club_id,
            "id_partido": id_partido,
            "id_jugador": int(self.id_jugador) if self.id_jugador is not None else None,
            "equipo": self.equipo,
            "dorsal_rival": self.dorsal_rival,
            "stint_local_id": None,
            "periodo": self.periodo,
            "t_inicio_ms": self.t_inicio_ms,
            "t_fin_ms": self.t_fin_ms,
            "puntos": list(self.puntos),
            "tipo": "seguimiento",
            "origen_captura": ORIGEN_CAPTURA,
            "_track_ia": self.track_ia,
            "_estado": "local",
        }


def mapa_de_calor(tracks: list[Track], equipo: str | None = None) -> dict[str, int]:
    """
    Ocupación por celda de la grilla Z1-Z4 x I/C/D.

    Es el mapa de OCUPACIÓN (densidad de presencia), no el de acciones. El de
    acciones ya sale de la tabla `eventos` y lo dibuja la app; este solo lo
    puede dar el seguimiento y es información nueva.

    Ojo: cuenta puntos de track, o sea tiempo. Todavía no filtra por pelota en
    juego —eso llega con la Fase 3— así que los minutos parados en un saque
    contaminan el mapa. Está anotado como deuda, no como algo terminado.
    """
    conteo: dict[str, int] = {}
    for t in tracks:
        if equipo and t.equipo != equipo:
            continue
        for p in t.puntos:
            etiqueta = etiqueta_zona(p["x"], p["y"])
            if etiqueta:
                conteo[etiqueta] = conteo.get(etiqueta, 0) + 1
    return conteo
