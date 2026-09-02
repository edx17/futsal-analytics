"""
Un archivo que falta se reporta en una línea, no con un traceback.

El caso real y repetido: el navegador baja marcas.json y encuadre.json a la
carpeta de Descargas, no a la del proyecto. Un traceback de Python ahí es
ruido que esconde la única información útil, que es dónde está el archivo.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia import cli  # noqa: E402


def test_marcas_que_faltan_no_tiran_traceback(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    codigo = cli.main(["calibrar", "--marcas", "marcas.json", "--salida", "cal.json"])
    assert codigo == 1
    err = capsys.readouterr().err
    assert "No encuentro el marcas.json" in err
    assert "Traceback" not in err


def test_encuentra_el_archivo_en_descargas(tmp_path, capsys, monkeypatch):
    """El navegador lo bajó ahí. Decírselo ahorra el viaje de ida y vuelta."""
    casa = tmp_path / "casa"
    (casa / "Downloads").mkdir(parents=True)
    (casa / "Downloads" / "marcas.json").write_text("{}", encoding="utf-8")
    proyecto = tmp_path / "proyecto"
    proyecto.mkdir()
    monkeypatch.chdir(proyecto)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: casa))

    assert cli.main(["calibrar", "--marcas", "marcas.json", "--salida", "cal.json"]) == 1
    err = capsys.readouterr().err
    assert "Downloads" in err and "Está acá" in err


def test_json_roto_se_reporta_como_json_roto(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "marcas.json").write_text("{esto no es json", encoding="utf-8")
    assert cli.main(["calibrar", "--marcas", "marcas.json", "--salida", "cal.json"]) == 1
    assert "no es un JSON válido" in capsys.readouterr().err


def test_encuadre_que_falta_en_el_comando_video(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(cli, "_leer_datos_video", lambda _: (1920, 1080, 59.94, 180480))
    assert cli.main(["video", "--video", "x.mp4", "--encuadre", "encuadre.json"]) == 1
    err = capsys.readouterr().err
    assert "No encuentro el encuadre.json" in err
    assert "Traceback" not in err


def test_calibracion_que_falta_en_el_comando_precision(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert cli.main(["precision", "--calibracion", "calibracion.json"]) == 1
    assert "No encuentro el calibracion.json" in capsys.readouterr().err


def test_lista_los_json_que_si_estan_en_la_carpeta(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: tmp_path / "sin_descargas"))
    (tmp_path / "marcas_1.json").write_text("{}", encoding="utf-8")
    (tmp_path / "encuadre_1.json").write_text("{}", encoding="utf-8")
    assert cli.main(["calibrar", "--marcas", "marcas.json", "--salida", "cal.json"]) == 1
    err = capsys.readouterr().err
    assert "marcas_1.json" in err and "encuadre_1.json" in err


def test_una_calibracion_mala_tampoco_tira_traceback(tmp_path, capsys, monkeypatch):
    """Las esquinas cruzadas ya se detectaban; ahora salen como mensaje, no como excepción."""
    monkeypatch.chdir(tmp_path)
    marcas = {
        "esq_prop_izq": [100, 100], "esq_prop_der": [900, 120],
        "esq_riv_der": [120, 700], "esq_riv_izq": [880, 690],
    }
    (tmp_path / "m.json").write_text(json.dumps(marcas), encoding="utf-8")
    assert cli.main(["calibrar", "--marcas", "m.json", "--salida", "cal.json"]) == 1
    err = capsys.readouterr().err
    assert "Traceback" not in err
    assert "moño" in err or "intercambiadas" in err
