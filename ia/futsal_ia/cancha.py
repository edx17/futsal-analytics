"""
Geometría de la cancha de futsal y la grilla de lectura del club.

Este módulo es el puerto Python de `src/offline/modelo.js`. La convención de
coordenadas es la MISMA y no se negocia:

    x = 0   -> nuestro arco        y = 0   -> banda izquierda mirando al arco rival
    x = 100 -> arco rival          y = 100 -> banda derecha

Siempre 0-100 y siempre absolutas respecto del arco propio. Si algo de acá se
desincroniza de modelo.js, los mapas de la IA salen espejados respecto de los
de TomaDatos y nadie se da cuenta hasta que es tarde. Los tests comparan
celda por celda contra el comportamiento de la versión JS.
"""

from __future__ import annotations

from dataclasses import dataclass

# Medidas reglamentarias de futsal (FIFA): 40 x 20 m.
LARGO_CANCHA_M = 40.0
ANCHO_CANCHA_M = 20.0

# La grilla de lectura del club: cuatro zonas de 10 m desde el arco propio
# por tres carriles a lo ancho. Doce celdas. "Pérdida no forzada en Z2-C".
ZONAS = ("Z1", "Z2", "Z3", "Z4")
CARRILES = ("I", "C", "D")
NOMBRE_CARRIL = {"I": "Izquierdo", "C": "Centro", "D": "Derecho"}

# Recuperación alta = mitad del campo rival. Decisión del CT (2026-09-01).
ZONA_RECUPERACION_ALTA = ("Z3", "Z4")


def acotar(v) -> float:
    """Clampea a 0-100. Igual que `acotar` en modelo.js: None y NaN caen a 0."""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return max(0.0, min(100.0, v))


def espejar(x, y, invertida: bool):
    """
    Espeja un punto cuando la cancha se ve invertida. Es su propio inverso.
    Puerto exacto de `espejar()` en modelo.js.
    """
    if invertida:
        return 100.0 - acotar(x), 100.0 - acotar(y)
    return acotar(x), acotar(y)


@dataclass(frozen=True)
class Celda:
    zona: str
    carril: str
    etiqueta: str
    nombre: str
    metros: str


def zona_de(x, y) -> Celda | None:
    """
    Puerto de `zonaDe(x, y)` de modelo.js. Mismos cortes, mismo clamp.

    Ojo con el carril: se divide por 100/3, no por 33. Con 33 el punto y=99.5
    caería fuera de rango y el clamp lo taparía sin que nadie lo note.
    """
    if x is None or y is None:
        return None
    zi = max(0, min(3, int(acotar(x) // 25)))
    ci = max(0, min(2, int(acotar(y) // (100.0 / 3.0))))
    zona, carril = ZONAS[zi], CARRILES[ci]
    return Celda(
        zona=zona,
        carril=carril,
        etiqueta=f"{zona}-{carril}",
        nombre=f"{zona} {NOMBRE_CARRIL[carril]}",
        metros=f"{zi * 10}-{(zi + 1) * 10}m",
    )


def etiqueta_zona(x, y) -> str | None:
    celda = zona_de(x, y)
    return celda.etiqueta if celda else None


def es_recuperacion_alta(x, y) -> bool:
    celda = zona_de(x, y)
    return bool(celda and celda.zona in ZONA_RECUPERACION_ALTA)


CELDAS = tuple(
    Celda(
        zona=zona,
        carril=carril,
        etiqueta=f"{zona}-{carril}",
        nombre=f"{zona} {NOMBRE_CARRIL[carril]}",
        metros=f"{zi * 10}-{(zi + 1) * 10}m",
    )
    for zi, zona in enumerate(ZONAS)
    for carril in CARRILES
)


# ── Conversión metros <-> 0-100 ────────────────────────────────────────────

def metros_a_norm(x_m: float, y_m: float) -> tuple[float, float]:
    """Metros crudos (origen en una esquina, 40x20) a la convención 0-100."""
    return (x_m / LARGO_CANCHA_M) * 100.0, (y_m / ANCHO_CANCHA_M) * 100.0


def norm_a_metros(x: float, y: float) -> tuple[float, float]:
    return (x / 100.0) * LARGO_CANCHA_M, (y / 100.0) * ANCHO_CANCHA_M


# ── Puntos de referencia para calibrar ─────────────────────────────────────
#
# Coordenadas en METROS sobre el plano de la cancha, origen en la esquina que
# queda a la izquierda de nuestro arco. Son los puntos que el operador clickea
# una vez por posición de cámara.
#
# Con cámara en un corner conviene marcar MUCHOS más que cuatro: la homografía
# por mínimos cuadrados reparte el error, y el rincón lejano —que es el peor
# lugar de la imagen— mejora sensiblemente si tiene marcas cerca.

@dataclass(frozen=True)
class PuntoReferencia:
    id: str
    etiqueta: str          # lo que se le muestra al operador
    x_m: float
    y_m: float
    imprescindible: bool   # si falta alguno de estos, no se puede calibrar


PUNTOS_REFERENCIA: tuple[PuntoReferencia, ...] = (
    # Las cuatro esquinas: el mínimo indispensable.
    PuntoReferencia("esq_prop_izq", "Esquina de nuestro arco, banda izquierda", 0.0, 0.0, True),
    PuntoReferencia("esq_prop_der", "Esquina de nuestro arco, banda derecha", 0.0, 20.0, True),
    PuntoReferencia("esq_riv_der", "Esquina del arco rival, banda derecha", 40.0, 20.0, True),
    PuntoReferencia("esq_riv_izq", "Esquina del arco rival, banda izquierda", 40.0, 0.0, True),

    # Mitad de cancha: parten el error a la mitad en el eje largo.
    PuntoReferencia("medio_izq", "Línea de mitad de cancha, banda izquierda", 20.0, 0.0, False),
    PuntoReferencia("medio_der", "Línea de mitad de cancha, banda derecha", 20.0, 20.0, False),
    PuntoReferencia("centro", "Punto central (centro del círculo)", 20.0, 10.0, False),

    # Postes: 3 m de ancho de arco, centrado en la línea de gol.
    PuntoReferencia("poste_prop_izq", "Poste izquierdo de nuestro arco", 0.0, 8.5, False),
    PuntoReferencia("poste_prop_der", "Poste derecho de nuestro arco", 0.0, 11.5, False),
    PuntoReferencia("poste_riv_izq", "Poste izquierdo del arco rival", 40.0, 8.5, False),
    PuntoReferencia("poste_riv_der", "Poste derecho del arco rival", 40.0, 11.5, False),

    # Marcas de penal (6 m) y de doble penal (10 m).
    PuntoReferencia("penal_prop", "Punto de penal nuestro (6 m)", 6.0, 10.0, False),
    PuntoReferencia("penal_riv", "Punto de penal rival (6 m)", 34.0, 10.0, False),
    PuntoReferencia("doble_penal_prop", "Marca de 10 m propia", 10.0, 10.0, False),
    PuntoReferencia("doble_penal_riv", "Marca de 10 m rival", 30.0, 10.0, False),
)

PUNTOS_POR_ID = {p.id: p for p in PUNTOS_REFERENCIA}
PUNTOS_IMPRESCINDIBLES = tuple(p.id for p in PUNTOS_REFERENCIA if p.imprescindible)

# El arco no se detecta con un modelo: se deduce de la calibración. Una vez que
# sabés dónde está el plano de la cancha, sabés dónde están los arcos, las
# marcas, la zona de cambios y las doce celdas. Todo geometría, cero IA.
ANCHO_ARCO_M = 3.0
ALTO_ARCO_M = 2.0
ARCO_PROPIO = ((0.0, 8.5), (0.0, 11.5))
ARCO_RIVAL = ((40.0, 8.5), (40.0, 11.5))

# Zona de sustituciones: 5 m a cada lado de la línea de mitad, del lado de los
# bancos. Sirve para detectar cruces de cambio si algún día se suma la segunda
# cámara; por ahora queda documentada nomás.
ZONA_CAMBIOS_PROPIA = ((15.0, 0.0), (20.0, 0.0))
ZONA_CAMBIOS_RIVAL = ((20.0, 0.0), (25.0, 0.0))
