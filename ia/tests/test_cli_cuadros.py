"""
`cuadros`: sacar del video los veinte cuadros que hay que revisar.

Existe para no depender del navegador. El revisor cargaba el video del partido
y Chrome no decodifica H.265, así que la página quedaba en negro con un
análisis perfectamente bueno detrás.

Lo que se prueba acá es el comando, no la exportación (eso está en
test_revision.py): que encuentre solo el video del que salió el análisis, y que
cuando algo falta lo diga en una línea en vez de tirar un traceback.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia import cli  # noqa: E402

cv2 = pytest.importorskip("cv2")


def _video(destino: Path) -> Path:
    w = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"),
                        30.0, (160, 120))
    assert w.isOpened()
    for k in range(120):
        w.write(np.full((120, 160, 3), k, dtype=np.uint8))
    w.release()
    return destino


def _analisis(tmp_path, video) -> Path:
    ruta = tmp_path / "analisis_PT.json"
    ruta.write_text(json.dumps({
        "meta": {"periodo": "PT", "t_saque_ms": 0, "encuadre": None,
                 "video": str(video) if video else None},
        "snapshots": [{"t_ms": t, "posiciones": [
            {"_track_ia": 1, "_bbox": [5, 5, 30, 60], "equipo": "Propio"}]}
            for t in (0, 1000, 2000)],
    }), encoding="utf-8")
    return ruta


def test_saca_los_cuadros_del_video_que_dice_el_analisis(tmp_path, capsys):
    """Que no haya que volver a tipear la ruta del video: ya está guardada."""
    video = _video(tmp_path / "PT.mp4")
    salida = tmp_path / "cuadros"
    assert cli.main(["cuadros", "--analisis", str(_analisis(tmp_path, video)),
                     "--salida", str(salida)]) == 0
    assert len(list(salida.glob("cuadro_PT_*.jpg"))) == 3
    assert (salida / "indice.json").exists()
    assert "3 cuadros" in capsys.readouterr().out


def test_sin_video_en_el_analisis_pide_el_video(tmp_path, capsys):
    assert cli.main(["cuadros", "--analisis", str(_analisis(tmp_path, None))]) == 1
    assert "--video" in capsys.readouterr().err


def test_un_video_que_no_esta_se_dice_en_una_linea(tmp_path, capsys):
    ruta = _analisis(tmp_path, tmp_path / "no_esta.mp4")
    assert cli.main(["cuadros", "--analisis", str(ruta)]) == 1
    err = capsys.readouterr().err
    assert "no existe el video" in err.lower()
    assert "Traceback" not in err


def test_el_video_a_mano_le_gana_al_del_analisis(tmp_path):
    otro = _video(tmp_path / "otro.mp4")
    ruta = _analisis(tmp_path, tmp_path / "no_esta.mp4")
    salida = tmp_path / "cuadros"
    assert cli.main(["cuadros", "--analisis", str(ruta), "--video", str(otro),
                     "--salida", str(salida)]) == 0
    d = json.loads((salida / "indice.json").read_text(encoding="utf-8"))
    assert d["video"] == str(otro)


def test_cuantos_limita_la_revision(tmp_path):
    video = _video(tmp_path / "PT.mp4")
    salida = tmp_path / "cuadros"
    assert cli.main(["cuadros", "--analisis", str(_analisis(tmp_path, video)),
                     "--salida", str(salida), "--cuantos", "2"]) == 0
    assert len(list(salida.glob("cuadro_*.jpg"))) == 2
