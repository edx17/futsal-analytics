"""
El encuadre tiene que ser reproducible al píxel. Si un día el recorte sale tres
píxeles más arriba, la homografía sigue calculando sin fallar y todas las
posiciones salen corridas para siempre. Estos tests son el seguro contra eso.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.preproceso import (  # noqa: E402
    Encuadre,
    ErrorEncuadre,
    recorte_desde_esquinas,
)

RES = (2712, 1220)
ESQUINAS = [(400, 350), (1500, 250), (1450, 450), (700, 700)]


def test_encuadre_identidad_no_toca_nada():
    e = Encuadre(resolucion_origen=RES)
    assert e.es_identidad
    assert e.resolucion_salida == RES
    assert e.punto_a_encuadre(123, 456) == pytest.approx((123, 456))


def test_ida_y_vuelta_de_un_punto():
    e = Encuadre(resolucion_origen=RES, rotacion_grados=-4.0, recorte=(360, 200, 1224, 514))
    for u, v in [(400, 350), (1500, 250), (1356, 610), (0, 0), (2711, 1219)]:
        x, y = e.punto_a_encuadre(u, v)
        assert e.punto_desde_encuadre(x, y) == pytest.approx((u, v), abs=1e-6)


def test_el_centro_no_se_mueve_al_girar():
    """El giro es alrededor del centro: es el único punto que queda quieto."""
    e = Encuadre(resolucion_origen=RES, rotacion_grados=7.5)
    cx, cy = RES[0] / 2, RES[1] / 2
    assert e.punto_a_encuadre(cx, cy) == pytest.approx((cx, cy))


def test_el_giro_va_en_el_sentido_esperado():
    """
    Positivo = antihorario, igual que OpenCV. Un punto a la derecha del centro
    tiene que SUBIR en pantalla, o sea que su `y` baja.
    """
    e = Encuadre(resolucion_origen=RES, rotacion_grados=10.0)
    cx, cy = RES[0] / 2, RES[1] / 2
    _, y = e.punto_a_encuadre(cx + 400, cy)
    assert y < cy


def test_el_recorte_se_valida_contra_el_frame():
    with pytest.raises(ErrorEncuadre, match="se sale del frame"):
        Encuadre(resolucion_origen=RES, recorte=(2000, 0, 1000, 500))
    with pytest.raises(ErrorEncuadre, match="se sale del frame"):
        Encuadre(resolucion_origen=RES, recorte=(-10, 0, 100, 100))
    with pytest.raises(ErrorEncuadre, match="no positivo"):
        Encuadre(resolucion_origen=RES, recorte=(0, 0, 0, 100))


def test_resolucion_de_origen_invalida():
    with pytest.raises(ErrorEncuadre, match="inválida"):
        Encuadre(resolucion_origen=(0, 1220))


def test_el_recorte_automatico_deja_margen_a_las_esquinas():
    """
    El margen no es decorativo: los jugadores salen de la cancha y si el
    recorte pasa raspando la línea el seguidor los pierde y los vuelve a
    encontrar con número nuevo cada vez.
    """
    margen = 60
    e = recorte_desde_esquinas(ESQUINAS, RES, rotacion_grados=-4.0, margen_px=margen)
    for u, v in ESQUINAS:
        x, y = e.punto_a_encuadre(u, v)
        ancho, alto = e.resolucion_salida
        assert margen - 1 <= x <= ancho - margen + 1
        assert margen - 1 <= y <= alto - margen + 1


def test_el_recorte_automatico_achica_de_verdad():
    e = recorte_desde_esquinas(ESQUINAS, RES, margen_px=60)
    assert e.resolucion_salida[0] < RES[0]
    assert e.resolucion_salida[1] < RES[1]


def test_el_recorte_automatico_no_se_sale_del_frame():
    """Esquinas pegadas al borde, con un margen que se pasaría de largo."""
    e = recorte_desde_esquinas([(5, 5), (2700, 10), (2705, 1210), (10, 1215)],
                               RES, margen_px=200)
    x, y, w, h = e.recorte
    assert x >= 0 and y >= 0 and x + w <= RES[0] and y + h <= RES[1]


def test_el_recorte_automatico_necesita_esquinas():
    with pytest.raises(ErrorEncuadre, match="al menos 3"):
        recorte_desde_esquinas([(0, 0), (10, 10)], RES)


def test_dentro_del_recorte():
    e = recorte_desde_esquinas(ESQUINAS, RES, margen_px=20)
    assert e.dentro_del_recorte(*ESQUINAS[0]) is True
    assert e.dentro_del_recorte(2700, 1200) is False    # tribuna del fondo
    assert e.dentro_del_recorte(0, 0) is False


def test_sobrevive_al_json():
    """Se guarda junto a la calibración y se reusa por meses: no puede degradarse."""
    e = recorte_desde_esquinas(ESQUINAS, RES, rotacion_grados=-3.5, margen_px=45)
    e2 = Encuadre.de_dict(e.a_dict())
    assert e2 == e
    assert e2.punto_a_encuadre(800, 400) == pytest.approx(e.punto_a_encuadre(800, 400))


def test_de_dict_de_nada_es_nada():
    assert Encuadre.de_dict(None) is None
    assert Encuadre.de_dict({}) is None


def test_el_comando_ffmpeg_invierte_el_signo_del_giro():
    """
    ffmpeg gira al revés que OpenCV. Es exactamente la clase de detalle que
    hace que un recorte hecho a mano no coincida con el del pipeline, así que
    queda clavado en un test.
    """
    e = Encuadre(resolucion_origen=RES, rotacion_grados=10.0, recorte=(100, 50, 800, 400))
    cmd = e.comando_ffmpeg("a.mp4", "b.mp4")
    assert "rotate=-0.17453" in cmd
    assert "crop=800:400:100:50" in cmd


def test_el_comando_ffmpeg_de_la_identidad_solo_copia():
    cmd = Encuadre(resolucion_origen=RES).comando_ffmpeg("a.mp4", "b.mp4")
    assert "-c copy" in cmd and "-vf" not in cmd
