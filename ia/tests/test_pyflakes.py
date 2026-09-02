"""
Nombres indefinidos: el error que ningún otro test agarra.

Vino de un caso real. El panel llamaba a revisar_compatibilidad() sin haberla
importado, y el análisis reventaba con NameError recién al llegar a esa línea:
en un hilo, dos horas después de arrancar, con la barra girando. Ningún test
lo tocaba, porque esa función solo corre con un video y una GPU de por medio.

pyflakes lo encuentra sin ejecutar nada.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]


def _pyflakes(*rutas):
    if shutil.which("pyflakes") is None:
        try:
            import pyflakes  # noqa: F401  # solo para saber si está
        except ImportError:
            pytest.skip("pyflakes no está instalado (pip install pyflakes)")
    res = subprocess.run(
        [sys.executable, "-m", "pyflakes", *[str(r) for r in rutas]],
        capture_output=True, text=True, cwd=RAIZ,
    )
    return [l for l in res.stdout.splitlines() if l.strip()]


def test_sin_nombres_indefinidos():
    """El caso que motivó este archivo. No se negocia."""
    graves = [l for l in _pyflakes(RAIZ / "futsal_ia", RAIZ / "tests")
              if "undefined name" in l]
    assert not graves, "Nombres usados sin definir:\n" + "\n".join(graves)


def test_sin_imports_muertos_ni_redefiniciones():
    """
    Más blando que el anterior, pero un import que sobra suele ser el rastro de
    una edición a medias, que es exactamente de donde salió el bug de arriba.
    """
    sucio = _pyflakes(RAIZ / "futsal_ia")
    assert not sucio, "pyflakes tiene algo que decir:\n" + "\n".join(sucio)
