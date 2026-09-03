"""
Que el JavaScript de las herramientas al menos PARSEE.

Vino de un caso real y caro. En revision.html escribí dos strings pegados sin
el `+` del medio, al estilo de Python:

    aviso("mal", "una parte "
                 "y la otra");

En Python eso concatena; en JavaScript es un error de sintaxis. Y un error de
sintaxis no rompe una línea: rompe el ARCHIVO ENTERO. Ningún handler se
registra, ningún mensaje se muestra, y la página queda en negro sin decir nada.
Costó tres rondas de diagnóstico a ciegas, porque el síntoma —pantalla vacía—
es idéntico al de un video que no carga o un JSON mal elegido.

node lo detecta en milisegundos sin abrir un navegador.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

HERRAMIENTAS = Path(__file__).resolve().parents[1] / "herramientas"
PAGINAS = sorted(HERRAMIENTAS.glob("*.html"))


def _script_de(html: Path) -> str:
    texto = html.read_text(encoding="utf-8")
    if "<script>" not in texto:
        return ""
    return texto[texto.rindex("<script>") + len("<script>"):texto.rindex("</script>")]


def test_hay_paginas_que_revisar():
    assert PAGINAS, "no se encontró ninguna herramienta HTML"


@pytest.mark.parametrize("html", PAGINAS, ids=lambda p: p.name)
def test_el_javascript_parsea(html, tmp_path):
    if shutil.which("node") is None:
        pytest.skip("node no está instalado")
    js = _script_de(html)
    if not js.strip():
        pytest.skip(f"{html.name} no tiene script propio")

    archivo = tmp_path / (html.stem + ".js")
    archivo.write_text(js, encoding="utf-8")
    res = subprocess.run([shutil.which("node"), "--check", str(archivo)],
                         capture_output=True, text=True)
    assert res.returncode == 0, (
        f"{html.name} tiene JavaScript que no parsea. El archivo entero queda "
        f"muerto y la página no muestra nada:\n{res.stderr}")


@pytest.mark.parametrize("html", PAGINAS, ids=lambda p: p.name)
def test_sin_strings_pegados_al_estilo_python(html):
    """
    El error exacto que motivó este archivo, buscado de frente: un string que
    termina y otro que empieza en la línea siguiente sin un `+` entre medio.
    `node --check` ya lo agarra, pero este mensaje dice qué línea mirar.
    """
    js = _script_de(html)
    lineas = js.splitlines()
    for i, linea in enumerate(lineas[:-1]):
        actual, siguiente = linea.rstrip(), lineas[i + 1].strip()
        if (actual.endswith('"') and siguiente.startswith('"')
                and not actual.endswith((',"', '+"'))
                and not actual.rstrip('"').rstrip().endswith(('+', ','))):
            pytest.fail(
                f"{html.name}:{i + 1} parece concatenación al estilo Python. "
                f"En JavaScript hace falta un '+':\n  {actual}\n  {siguiente}")


def test_este_test_agarra_el_bug_original(tmp_path):
    """El guardián también se prueba: sin esto no sabríamos si sirve."""
    if shutil.which("node") is None:
        pytest.skip("node no está instalado")
    roto = tmp_path / "roto.js"
    roto.write_text('f("una parte "\n  "y la otra");\n', encoding="utf-8")
    res = subprocess.run([shutil.which("node"), "--check", str(roto)],
                         capture_output=True, text=True)
    assert res.returncode != 0, "node tendría que rechazar los strings pegados"
