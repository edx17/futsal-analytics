"""
Cuando el video no abre, el mensaje tiene que decir POR QUÉ. El caso más
difícil de descubrir solo es un archivo dentro de OneDrive con sincronización
a pedido: figura con su nombre y su tamaño en el explorador, pero en el disco
no hay nada y OpenCV falla como si el video estuviera roto.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.pipeline import diagnostico_video  # noqa: E402


def test_archivo_que_no_existe(tmp_path):
    msg = diagnostico_video(tmp_path / "no_esta.mp4")
    assert "No existe el archivo" in msg
    assert "comillas" in msg


def test_nombra_los_videos_que_si_estan_al_lado(tmp_path):
    """Casi siempre es un nombre mal tipeado, y verlo al lado lo resuelve solo."""
    (tmp_path / "periodo_PT.mp4").write_bytes(b"x" * 200_000)
    (tmp_path / "periodo_ST.mp4").write_bytes(b"x" * 200_000)
    msg = diagnostico_video(tmp_path / "period_PT.mp4")
    assert "periodo_PT.mp4" in msg and "periodo_ST.mp4" in msg


def test_carpeta_inexistente(tmp_path):
    msg = diagnostico_video(tmp_path / "ni_idea" / "x.mp4")
    assert "tampoco existe" in msg


def test_archivo_vacio(tmp_path):
    f = tmp_path / "vacio.mp4"
    f.write_bytes(b"")
    assert "está vacío" in diagnostico_video(f)


def test_marcador_de_onedrive(tmp_path):
    """Pesa unos pocos KB pero dice ser un video de un partido."""
    f = tmp_path / "periodo_PT.mp4"
    f.write_bytes(b"x" * 4096)
    msg = diagnostico_video(f)
    assert "OneDrive" in msg and "marcador" in msg


def test_archivo_grande_pero_ilegible(tmp_path):
    f = tmp_path / "roto.mp4"
    f.write_bytes(b"x" * 5_000_000)
    msg = diagnostico_video(f)
    assert "El archivo está" in msg
    assert "5 MB" in msg
