"""
En qué espacio comparar dos camisetas.

El pipeline compara colores de torso en BGR crudo. No es obvio que esté bien:
en BGR, la distancia entre dos colores mezcla de qué color es algo con cuánta
luz le pega, y en un gimnasio lo segundo varía muchísimo dentro del mismo
partido. Acá se prueba que cada espacio haga lo que dice hacer; cuál sirve para
un partido concreto se mide con las cajas etiquetadas, no se decide acá.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.color import DESCRIPCION, ESPACIOS, a_espacio  # noqa: E402

VERDE = np.array([60., 200., 60.])
GRIS = np.array([150., 150., 150.])


@pytest.mark.parametrize("espacio", ESPACIOS)
def test_la_forma_que_entra_es_la_que_sale(espacio):
    """
    Un color entra como (3,) y sale como (k,); muchos entran como (N,3) y salen
    como (N,k). Si no coincidieran, el clasificador compararía peras con
    manzanas sin que nada falle.
    """
    uno = a_espacio(VERDE, espacio)
    muchos = a_espacio(np.array([VERDE, GRIS]), espacio)
    assert uno.ndim == 1 and muchos.ndim == 2
    assert muchos.shape[0] == 2 and muchos.shape[1] == uno.shape[0]
    assert np.allclose(muchos[0], uno)


@pytest.mark.parametrize("espacio", ESPACIOS)
def test_cada_espacio_esta_explicado(espacio):
    """El nombre no dice nada; el que lo elige tiene que saber qué elige."""
    assert len(DESCRIPCION[espacio]) > 30


def test_un_espacio_inventado_se_rechaza():
    with pytest.raises(ValueError, match="desconocido"):
        a_espacio(VERDE, "hsv2")


def test_en_bgr_la_luz_cambia_el_color():
    """La situación que motivó todo: la misma camiseta, otra luz, otro punto."""
    assert np.linalg.norm(a_espacio(VERDE, "bgr") - a_espacio(VERDE * 0.5, "bgr")) > 100


def test_el_cromatico_ignora_la_luz():
    a = a_espacio(VERDE, "cromatico")
    for luz in (0.4, 0.7, 1.3):
        assert np.linalg.norm(a - a_espacio(VERDE * luz, "cromatico")) < 1e-6


def test_el_matiz_tambien_aguanta_la_luz():
    """Menos que el cromático, porque conserva un poco de brillo a propósito."""
    a = a_espacio(VERDE, "matiz")
    b = a_espacio(VERDE * 0.6, "matiz")
    en_bgr = np.linalg.norm(a_espacio(VERDE, "bgr") - a_espacio(VERDE * 0.6, "bgr"))
    assert np.linalg.norm(a - b) < en_bgr


def test_el_matiz_no_se_rompe_al_dar_la_vuelta():
    """
    El matiz es un ángulo: 359° y 1° son casi el mismo rojo. Tratado como
    número quedarían a 358 de distancia y el rojo estaría lejísimos de sí mismo.
    """
    rojo_a = a_espacio(np.array([10., 10., 200.]), "matiz")     # matiz ~0°
    rojo_b = a_espacio(np.array([30., 10., 200.]), "matiz")     # cruzando el 360°
    verde = a_espacio(VERDE, "matiz")
    assert np.linalg.norm(rojo_a - rojo_b) < np.linalg.norm(rojo_a - verde)


def test_en_un_gris_el_matiz_no_manda():
    """
    En un gris el matiz es ruido: dos grises casi iguales pueden tener matices
    opuestos. Por eso va escalado por la saturación.
    """
    g1 = a_espacio(np.array([150., 151., 149.]), "matiz")
    g2 = a_espacio(np.array([149., 150., 151.]), "matiz")
    assert np.linalg.norm(g1 - g2) < 30


def test_el_lab_separa_dos_camisetas_distintas():
    assert np.linalg.norm(a_espacio(VERDE, "lab") - a_espacio(GRIS, "lab")) > 20
