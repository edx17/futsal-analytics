"""
El comando `video` existe por una razón concreta: analizar un período tarda
horas. Descubrir recién ahí que la calibración se hizo sobre una captura de
pantalla del reproductor y no sobre un frame del video es tirar una tarde.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia import cli  # noqa: E402
from futsal_ia.preproceso import Encuadre  # noqa: E402


@pytest.fixture
def encuadre_json(tmp_path):
    def crear(resolucion, recorte=None):
        ruta = tmp_path / "encuadre.json"
        Encuadre(resolucion_origen=resolucion, recorte=recorte).guardar(ruta)
        return str(ruta)
    return crear


def _falsear(monkeypatch, ancho, alto, fps=30.0, cuadros=36000):
    monkeypatch.setattr(cli, "_leer_datos_video", lambda _: (ancho, alto, fps, cuadros))


def test_encuadre_que_corresponde_al_video(monkeypatch, capsys, encuadre_json):
    _falsear(monkeypatch, 2704, 1520)
    ruta = encuadre_json((2704, 1520), (100, 50, 2000, 1200))
    assert cli.main(["video", "--video", "x.mp4", "--encuadre", ruta]) == 0
    assert "OK: el encuadre corresponde" in capsys.readouterr().out


def test_encuadre_de_otra_resolucion_se_rechaza(monkeypatch, capsys, encuadre_json):
    _falsear(monkeypatch, 2704, 1520)
    ruta = encuadre_json((3840, 2160))
    assert cli.main(["video", "--video", "x.mp4", "--encuadre", ruta]) == 1
    salida = capsys.readouterr().out
    assert "NO COINCIDEN" in salida
    assert "ffmpeg" in salida


def test_las_dimensiones_impares_delatan_una_captura_de_pantalla(monkeypatch, capsys,
                                                                 encuadre_json):
    """
    El caso real: se calibró sobre una captura de la ventana del reproductor.
    2559 es impar y ningún video H.264 tiene dimensiones impares, así que el
    diagnóstico se puede dar con certeza en vez de sugerirlo.
    """
    _falsear(monkeypatch, 2704, 1520)
    ruta = encuadre_json((2559, 1394))
    assert cli.main(["video", "--video", "x.mp4", "--encuadre", ruta]) == 1
    salida = capsys.readouterr().out
    assert "captura de pantalla" in salida
    assert "volvé a marcar" in salida


def test_avisa_si_el_propio_video_tiene_dimensiones_impares(monkeypatch, capsys):
    _falsear(monkeypatch, 2559, 1394)
    assert cli.main(["video", "--video", "x.mp4"]) == 0
    assert "dimensiones son impares" in capsys.readouterr().out


def test_sin_encuadre_solo_informa(monkeypatch, capsys):
    _falsear(monkeypatch, 1920, 1080, fps=50.0, cuadros=60000)
    assert cli.main(["video", "--video", "x.mp4"]) == 0
    salida = capsys.readouterr().out
    assert "1920x1080" in salida and "50.00" in salida
    assert "20.0 min" in salida


def test_video_ilegible_no_explota(monkeypatch, capsys):
    monkeypatch.setattr(cli, "_leer_datos_video", lambda _: None)
    assert cli.main(["video", "--video", "roto.mp4"]) == 1
