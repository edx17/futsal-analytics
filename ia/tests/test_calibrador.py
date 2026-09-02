"""
El calibrador es un HTML suelto que se abre con doble click, así que no puede
importar la lista de puntos desde Python. La tiene copiada.

Este test existe para que las dos copias no se desincronicen: si alguien
agrega un punto de referencia en cancha.py y se olvida del HTML, el operador
marca quince cosas y la calibración usa catorce, sin que nadie se entere.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.cancha import PUNTOS_IMPRESCINDIBLES, PUNTOS_REFERENCIA  # noqa: E402

HTML = Path(__file__).resolve().parents[1] / "herramientas" / "calibrador.html"


def _puntos_del_html():
    texto = HTML.read_text(encoding="utf-8")
    bloque = texto[texto.index("const PUNTOS = ["):texto.index("const ESQUINAS")]
    return re.findall(r'\["([a-z_]+)",\s*"([^"]+)",\s*(true|false)\]', bloque)


def test_el_html_existe():
    assert HTML.exists(), "falta ia/herramientas/calibrador.html"


def test_los_mismos_puntos_y_en_el_mismo_orden():
    del_html = [p[0] for p in _puntos_del_html()]
    de_python = [p.id for p in PUNTOS_REFERENCIA]
    assert del_html == de_python


def test_las_esquinas_estan_marcadas_como_obligatorias_en_los_dos_lados():
    obligatorios_html = {p[0] for p in _puntos_del_html() if p[2] == "true"}
    assert obligatorios_html == set(PUNTOS_IMPRESCINDIBLES)


def test_el_html_no_pide_una_libreria_de_afuera():
    """
    Se abre con doble click, sin servidor y sin internet. Un <script src> a un
    CDN lo rompe justo cuando estás en el gimnasio sin señal.
    """
    texto = HTML.read_text(encoding="utf-8")
    assert "<script src" not in texto
    assert "cdn" not in texto.lower()
