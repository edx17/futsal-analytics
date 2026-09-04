"""
En qué espacio comparar dos camisetas.

El pipeline compara colores de torso en BGR crudo, que es lo que devuelve la
cámara. Es la opción por defecto y no es obvio que sea la buena: en BGR, la
distancia entre dos colores mezcla dos cosas distintas —de qué color es y
cuánta luz le está pegando— y en un gimnasio la segunda varía muchísimo dentro
del mismo partido.

Acá están las alternativas razonables. Cuál sirve NO se decide leyendo esto: se
mide con las cajas que una persona ya etiquetó, en `asignacion.validar`. Puede
perfectamente ganar el BGR crudo; lo que no se puede es elegir de memoria.

Todas toman colores BGR (uno o muchos) y devuelven vectores comparables con
distancia euclídea, en escalas parecidas para que un k-means no se desbalancee.
"""

from __future__ import annotations

import numpy as np

ESPACIOS = ("bgr", "cromatico", "matiz", "lab")

DESCRIPCION = {
    "bgr": "el color como sale de la cámara (lo que se usa hoy)",
    "cromatico": "el color dividido por su brillo: la misma camiseta en sombra "
                 "y con luz da lo mismo",
    "matiz": "matiz y saturación, con el matiz como vector para que el rojo no "
             "quede lejos de sí mismo al dar la vuelta",
    "lab": "Lab sin la luminosidad: el espacio pensado para que la distancia se "
           "parezca a la diferencia que ve un ojo",
}


def _matriz(color) -> np.ndarray:
    a = np.asarray(color, dtype=np.float64)
    return a.reshape(1, -1) if a.ndim == 1 else a


def a_espacio(color, espacio: str = "bgr") -> np.ndarray:
    """
    Lleva uno o muchos colores BGR al espacio pedido.

    Devuelve siempre la misma forma que entró: un color entra como (3,) y sale
    como (k,); muchos entran como (N,3) y salen como (N,k). Que no coincidan es
    la clase de detalle que hace que el clasificador compare peras con manzanas
    sin que nada falle.
    """
    if espacio not in ESPACIOS:
        raise ValueError(f"Espacio de color desconocido: {espacio}. "
                         f"Hay: {', '.join(ESPACIOS)}")
    uno = np.asarray(color).ndim == 1
    datos = _matriz(color)

    if espacio == "bgr":
        salida = datos
    elif espacio == "cromatico":
        # Cada canal sobre la suma: se va la intensidad y queda la proporción.
        # Se descarta el tercer canal porque los tres suman 1 y el tercero no
        # agrega nada: dejarlo le daría peso de más a esta dimensión.
        suma = datos.sum(axis=1, keepdims=True)
        salida = datos[:, :2] / np.maximum(suma, 1e-6) * 441.0
    elif espacio == "matiz":
        salida = _matiz_saturacion(datos)
    else:
        salida = _lab_ab(datos)
    return salida[0] if uno else salida


def _matiz_saturacion(bgr: np.ndarray) -> np.ndarray:
    """
    Matiz y saturación, con el matiz como (cos, sen) multiplicado por saturación.

    El matiz es un ángulo: 359° y 1° son casi el mismo color pero están a 358
    de distancia si se lo trata como un número. Como vector no pasa. Y se lo
    escala por la saturación porque en un gris el matiz es ruido: sin escalar,
    dos grises con matices al azar quedarían lejísimos.
    """
    b, g, r = bgr[:, 0], bgr[:, 1], bgr[:, 2]
    maximo = bgr.max(axis=1)
    minimo = bgr.min(axis=1)
    delta = maximo - minimo
    sat = np.where(maximo > 0, delta / np.maximum(maximo, 1e-6), 0.0)

    h = np.zeros_like(maximo)
    seguro = delta > 1e-6
    idx = seguro & (maximo == r)
    h[idx] = ((g[idx] - b[idx]) / delta[idx]) % 6
    idx = seguro & (maximo == g)
    h[idx] = (b[idx] - r[idx]) / delta[idx] + 2
    idx = seguro & (maximo == b)
    h[idx] = (r[idx] - g[idx]) / delta[idx] + 4
    ang = h * (np.pi / 3)
    return np.stack([sat * np.cos(ang) * 255.0,
                     sat * np.sin(ang) * 255.0,
                     maximo * 0.35], axis=1)


def _lab_ab(bgr: np.ndarray) -> np.ndarray:
    """
    Los dos ejes de color de Lab, sin la luminosidad.

    Lab fue diseñado para que distancias iguales se vean como diferencias
    iguales. Sacarle la L deja justamente el color, que es lo que distingue una
    camiseta de otra sin importar dónde esté parado el jugador.
    """
    import cv2

    px = np.clip(bgr, 0, 255).astype(np.uint8).reshape(-1, 1, 3)
    lab = cv2.cvtColor(px, cv2.COLOR_BGR2Lab).reshape(-1, 3).astype(np.float64)
    return lab[:, 1:]
