"""
El partido.json que arma herramientas/partido.html y cómo lo lee el CLI.

Lo que más importa acá es el lado del campo en cada período: si sale mal, no
falla nada — simplemente todos los mapas del segundo tiempo quedan espejados y
nadie se entera hasta que un CT mira un heatmap y dice "esto no es así".
"""

import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.config import combinar_config, invertida_de  # noqa: E402

HTML = Path(__file__).resolve().parents[1] / "herramientas" / "partido.html"


def test_los_equipos_cambian_de_lado_en_el_entretiempo():
    """
    Se pregunta una sola vez y el segundo tiempo se deduce. Preguntar los dos
    abre la puerta a que alguien conteste lo mismo para ambos.
    """
    assert invertida_de("PT", False) is False
    assert invertida_de("ST", False) is True
    assert invertida_de("PT", True) is True
    assert invertida_de("ST", True) is False


def test_el_saque_sale_del_periodo_que_corresponde():
    config = {"periodos": {"PT": {"saque": "1:30"}, "ST": {"saque": "28:45"}}}
    assert combinar_config(config, "PT", {})["saque"] == "1:30"
    assert combinar_config(config, "ST", {})["saque"] == "28:45"


def test_un_periodo_sin_saque_arranca_en_cero():
    assert combinar_config({"periodos": {"PT": {"saque": "1:30"}}}, "ST", {})["saque"] == "0"


def test_lo_escrito_en_la_consola_le_gana_al_archivo():
    """El archivo es la comodidad, no la autoridad."""
    config = {"video": "del_archivo.mp4", "club": "A", "periodos": {"PT": {"saque": "1:30"}}}
    cfg = combinar_config(config, "PT", {"video": "otro.mp4", "saque": "9:99"})
    assert cfg["video"] == "otro.mp4"
    assert cfg["saque"] == "9:99"
    assert cfg["club"] == "A"      # lo que no se pisó, se mantiene


def test_los_none_de_argparse_no_pisan_nada():
    """argparse deja None en lo que no se escribió: no puede borrar el archivo."""
    config = {"video": "del_archivo.mp4", "club": "A", "partido": "7"}
    cfg = combinar_config(config, "PT", {"video": None, "club": None, "partido": None})
    assert (cfg["video"], cfg["club"], cfg["partido"]) == ("del_archivo.mp4", "A", "7")


def test_sin_archivo_funciona_igual():
    cfg = combinar_config(None, "PT", {"video": "x.mp4", "club": "A", "partido": "7"})
    assert cfg["video"] == "x.mp4"
    assert cfg["saque"] == "0"
    assert cfg["invertida"] is False


# ── La herramienta y el CLI tienen que hablar el mismo idioma ──────────────

def test_el_html_existe_y_no_depende_de_un_cdn():
    texto = HTML.read_text(encoding="utf-8")
    assert "<script src" not in texto and "cdn" not in texto.lower()


def test_el_html_escribe_las_claves_que_el_cli_lee():
    texto = HTML.read_text(encoding="utf-8")
    bloque = texto[texto.index("function config(){"):texto.index("function refrescar()")]
    claves = set(re.findall(r"^\s*(\w+):", bloque, re.M))
    esperadas = {"video", "calibracion", "encuadre", "club", "partido",
                 "invertida_pt", "periodos", "prueba"}
    assert esperadas <= claves, f"al partido.json le faltan claves: {esperadas - claves}"


def test_el_html_genera_el_comando_que_el_cli_entiende():
    texto = HTML.read_text(encoding="utf-8")
    assert "--config partido.json" in texto
    assert "--periodo ${per}" in texto
    assert "--prueba" in texto


def test_un_partido_json_como_lo_baja_el_html(tmp_path):
    """De punta a punta: lo que baja la herramienta lo lee el CLI sin tocar nada."""
    archivo = tmp_path / "partido.json"
    archivo.write_text(json.dumps({
        "video": "C:\\futsal\\PT.mp4",
        "calibracion": "calibracion.json",
        "encuadre": "encuadre.json",
        "club": "club-123",
        "partido": "456",
        "invertida_pt": True,
        "periodos": {"PT": {"saque": "1:30"}, "ST": {"saque": "28:45"}},
        "prueba": {"desde": "5:00", "duracion": "2:00"},
    }), encoding="utf-8")

    config = json.loads(archivo.read_text(encoding="utf-8"))
    pt = combinar_config(config, "PT", {})
    st = combinar_config(config, "ST", {})

    assert pt["saque"] == "1:30" and pt["invertida"] is True
    assert st["saque"] == "28:45" and st["invertida"] is False
    assert pt["video"] == st["video"] == "C:\\futsal\\PT.mp4"
    assert pt["club"] == "club-123" and pt["partido"] == "456"


@pytest.mark.parametrize("periodo", ["PT", "ST"])
def test_nunca_faltan_las_claves_que_el_cli_espera(periodo):
    cfg = combinar_config({}, periodo, {})
    for clave in ("video", "calibracion", "encuadre", "lente", "club",
                  "partido", "saque", "invertida"):
        assert clave in cfg
