"""
El video de auditoría.

Acá vivía el peor bug del proyecto, y el más engañoso: el overlay comparaba el
tiempo del VIDEO contra snapshots guardados en tiempo del PERÍODO. Con el
análisis corriendo desde el minuto 5, el snapshot más cercano era siempre el
primero, el radar mostraba la misma foto durante los dos minutos enteros, y
parecía que el seguimiento estaba roto. No lo estaba.
"""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.overlay import snapshot_para  # noqa: E402
from futsal_ia.salida import parse_tiempo  # noqa: E402

# Un análisis desde el minuto 5, con el saque en 0:05: los snapshots guardan
# tiempo de período, o sea del video menos cinco segundos.
DESDE = parse_tiempo("5:00")
SAQUE = parse_tiempo("0:05")
SNAPS = [DESDE - SAQUE + i * 200 for i in range(600)]     # 2 min cada 200 ms


def _elegido(ms_video):
    return snapshot_para(SNAPS, ms_video - SAQUE)


def test_el_radar_avanza_con_el_video():
    """La regresión. Antes devolvía siempre el índice 0."""
    elegidos = [_elegido(DESDE + s * 1000) for s in (0, 10, 30, 60, 110)]
    assert elegidos == [0, 50, 150, 300, 550]
    assert len(set(elegidos)) == len(elegidos)


def test_el_snapshot_elegido_es_el_mas_cercano():
    assert _elegido(DESDE + 1000) == 5           # 1000 ms / 200 ms
    assert _elegido(DESDE + 1090) == 5           # redondea al de 1000
    assert _elegido(DESDE + 1120) == 6           # ya está más cerca del de 1200


def test_sin_datos_no_se_dibuja_nada():
    """
    Una foto vieja presentada como si fuera de ahora es peor que no dibujar
    nada: no se distingue de un seguimiento que dejó de funcionar.
    """
    assert _elegido(DESDE - 60_000) is None      # un minuto antes del tramo
    assert _elegido(DESDE + 600_000) is None     # ocho minutos después
    assert snapshot_para([], 1234) is None


def test_la_tolerancia_es_del_tamaño_de_un_hueco_razonable():
    """A 200 ms entre snapshots, medio segundo de hueco ya es sospechoso."""
    assert snapshot_para([1000], 1300, tolerancia_ms=400) == 0
    assert snapshot_para([1000], 1500, tolerancia_ms=400) is None


def test_el_bug_original_reproducido():
    """
    Comparando contra el tiempo del video en vez del período, todos los
    instantes caen en el mismo snapshot. Así se veía: el radar congelado.
    """
    mal = [snapshot_para(SNAPS, s * 1000, tolerancia_ms=10**9)
           for s in (0, 10, 30, 60, 110)]
    assert len(set(mal)) == 1 and mal[0] == 0

    bien = [_elegido(DESDE + s * 1000) for s in (0, 10, 30, 60, 110)]
    assert len(set(bien)) == 5
