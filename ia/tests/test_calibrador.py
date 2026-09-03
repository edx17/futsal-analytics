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


VERIFICADOR = Path(__file__).resolve().parents[1] / "herramientas" / "verificador.html"


def test_el_verificador_existe():
    assert VERIFICADOR.exists()


def test_el_verificador_usa_las_mismas_coordenadas_de_cancha():
    """
    El verificador dibuja la cancha desde sus propias constantes en metros. Si
    se desincronizan de cancha.py, dibuja una cancha que no es la que se
    calibró y el chequeo visual pasa a mentir.
    """
    from futsal_ia.cancha import PUNTOS_POR_ID

    texto = VERIFICADOR.read_text(encoding="utf-8")
    bloque = texto[texto.index("const PUNTOS_M = {"):texto.index("};", texto.index("const PUNTOS_M"))]
    encontrados = {pid: (x, y)
                   for pid, x, y in re.findall(r"(\w+):\[([\d.]+),([\d.]+)\]", bloque)}
    assert set(encontrados) == set(PUNTOS_POR_ID)
    for pid, (x, y) in encontrados.items():
        ref = PUNTOS_POR_ID[pid]
        assert float(x) == ref.x_m and float(y) == ref.y_m, f"{pid} no coincide con cancha.py"


def test_el_verificador_tampoco_depende_de_un_cdn():
    texto = VERIFICADOR.read_text(encoding="utf-8")
    assert "<script src" not in texto and "cdn" not in texto.lower()


REVISION = Path(__file__).resolve().parents[1] / "herramientas" / "revision.html"


def test_el_revisor_existe_y_no_depende_de_un_cdn():
    texto = REVISION.read_text(encoding="utf-8")
    assert "<script src" not in texto and "cdn" not in texto.lower()


def test_el_revisor_guarda_las_claves_que_lee_el_evaluador():
    """
    Si la herramienta escribe una cosa y el evaluador espera otra, las
    correcciones no sirven para nada y nadie se entera hasta el final.
    """
    texto = REVISION.read_text(encoding="utf-8")
    for clave in ("t_ms", "jugadores_reales", "correcciones", "agregados",
                  "track_ia", "bbox", "rol"):
        assert clave in texto, f"revision.html no escribe {clave}"


def test_lo_que_escribe_el_revisor_lo_lee_el_evaluador():
    """Ida y vuelta con una carga igual a la que arma la herramienta."""
    from futsal_ia.evaluacion import desde_json

    r = desde_json({
        "periodo": "PT", "formato": 2,
        "instantes": [{
            "t_ms": 295000, "jugadores_reales": 10,
            "correcciones": [{"track_ia": 4, "rol": "No es persona"},
                             {"track_ia": 7, "rol": "Arquero rival"}],
            "agregados": [{"bbox": [1.0, 2.0, 3.0, 4.0], "rol": "Rival"}],
        }],
    })[0]
    assert r.t_ms == 295000 and r.jugadores_reales == 10
    assert r.falsos == [4] and r.equipo_mal == [7] and r.faltantes == 1


def test_los_roles_del_revisor_son_los_que_conoce_el_sistema():
    """
    Un rol que la herramienta ofrece y el resto no entiende se guarda igual y
    después no significa nada.
    """
    import re

    from futsal_ia.equipos import ROLES as ROLES_PY

    texto = REVISION.read_text(encoding="utf-8")
    bloque = texto[texto.index("const ROLES = ["):texto.index("];", texto.index("const ROLES"))]
    del_html = set(re.findall(r'id:"([^"]+)"', bloque))
    # "Pelota" y "No es persona" son propios del revisor: no son equipos, son
    # material para la Fase 2 y descarte de falsos positivos.
    propios_del_revisor = {"Pelota", "No es persona"}
    assert del_html - propios_del_revisor <= set(ROLES_PY)
