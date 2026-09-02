"""
Los tiempos se escriben como los lee una persona. Poner 90000 donde iban 90
segundos aparece después como un desfasaje de minuto y medio en todo el
partido, y cuesta un día encontrarlo.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.salida import parse_tiempo  # noqa: E402


@pytest.mark.parametrize("texto,ms", [
    ("0", 0), ("90", 90_000), ("1:30", 90_000), ("0:05", 5_000),
    ("20:00", 1_200_000), ("1:00:00", 3_600_000), ("1:23:45", 5_025_000),
    ("2:00", 120_000), ("0:00:30", 30_000), ("1.5", 1_500), ("0:01.5", 1_500),
])
def test_formatos_que_una_persona_escribe(texto, ms):
    assert parse_tiempo(texto) == ms


def test_tambien_acepta_numeros():
    assert parse_tiempo(90) == 90_000
    assert parse_tiempo(1.5) == 1_500


@pytest.mark.parametrize("basura", ["", "ni idea", "1:2:3:4", "-30", "1:-30", "::", "1::2"])
def test_rechaza_lo_que_no_entiende(basura):
    with pytest.raises(ValueError):
        parse_tiempo(basura)


def test_veinte_minutos_es_un_periodo_de_futsal():
    from futsal_ia.salida import DURACION_PERIODO_MS
    assert parse_tiempo("20:00") == DURACION_PERIODO_MS


# ── El signo del saque ─────────────────────────────────────────────────────

def test_los_tiempos_son_relativos_al_saque_no_al_archivo():
    """
    Regresión. Estaba SUMANDO el saque en vez de restarlo: con el saque en el
    segundo 30, un evento del video en 0:45 se guardaba como 1:15 del período
    en vez de 0:15. Nada fallaba, nada avisaba, y el cruce con los cambios
    cargados a mano quedaba corrido en todo el partido.
    """
    from futsal_ia.pipeline import tiempo_de_periodo

    saque = parse_tiempo("0:30")
    assert tiempo_de_periodo(parse_tiempo("0:45"), saque) == parse_tiempo("0:15")
    assert tiempo_de_periodo(parse_tiempo("20:30"), saque) == parse_tiempo("20:00")
    assert tiempo_de_periodo(saque, saque) == 0


def test_lo_anterior_al_saque_queda_negativo_y_se_descarta():
    """El calentamiento y la formación no son parte del período."""
    from futsal_ia.pipeline import tiempo_de_periodo

    assert tiempo_de_periodo(parse_tiempo("0:10"), parse_tiempo("0:30")) < 0


def test_sin_saque_el_tiempo_del_video_es_el_del_periodo():
    from futsal_ia.pipeline import tiempo_de_periodo

    assert tiempo_de_periodo(parse_tiempo("5:00"), 0) == parse_tiempo("5:00")
