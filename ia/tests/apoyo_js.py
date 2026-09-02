"""
Correr el modelo.js real con node desde los tests.

Varios tests verifican que el puerto Python de la grilla y de las fábricas dé
EXACTAMENTE lo mismo que `src/offline/modelo.js`. Para eso hay que ejecutar el
JS de verdad, no leerlo y confiar.

Dos detalles que costaron un rato:

  · La ruta al módulo va como URL `file://`, no como ruta del sistema. En
    Windows, un `import` de 'C:/Users/...' hace que Node interprete 'C:' como
    un protocolo y falle con ERR_UNSUPPORTED_ESM_URL_SCHEME. `Path.as_uri()`
    da la forma correcta en todos los sistemas.

  · Si node no está instalado, saltear el test es lo correcto. Si node ESTÁ y
    el script falla, eso es un error de verdad y tiene que fallar ruidosamente.
    Antes las dos cosas caían en el mismo skip, y un bug real se disfrazó de
    "no pasa nada" durante varias corridas.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
MODELO_JS = RAIZ / "src" / "offline" / "modelo.js"


def url_modelo() -> str:
    """La ruta a modelo.js como URL file://, que es lo que acepta Node."""
    return MODELO_JS.as_uri()


def correr_js(script: str):
    """
    Ejecuta un módulo ES con node y devuelve el JSON que haya escrito.

    Saltea SOLO si node no está o si modelo.js no aparece. Cualquier otro
    fallo se reporta como fallo.
    """
    if shutil.which("node") is None:
        pytest.skip("node no está instalado: no se puede cruzar contra modelo.js")
    if not MODELO_JS.exists():
        pytest.skip(f"No se encontró {MODELO_JS}")

    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, cwd=RAIZ,
    )
    if res.returncode != 0:
        pytest.fail(
            "node falló al correr modelo.js. Esto NO es un entorno sin node: "
            f"node está instalado y devolvió {res.returncode}.\n"
            f"--- stderr ---\n{res.stderr[:1500]}"
        )
    if not res.stdout.strip():
        pytest.fail("node no escribió nada. ¿Falta el process.stdout.write en el script?")
    return json.loads(res.stdout)
