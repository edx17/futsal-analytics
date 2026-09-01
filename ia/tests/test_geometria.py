"""
Homografía probada contra una cámara sintética que imita el setup real:
GoPro en un corner, bien alta, mirando al centro de la cancha.

Como conocemos la cámara "de verdad", sabemos la respuesta correcta y podemos
medir cuánto se equivoca la calibración. Es la única forma de testear esto sin
un partido filmado.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.cancha import PUNTOS_REFERENCIA, etiqueta_zona  # noqa: E402
from futsal_ia.geometria import ErrorCalibracion, Homografia, calibrar  # noqa: E402

ANCHO_PX, ALTO_PX = 3840, 2160


def _camara_corner(pos=(-5.0, -5.0, 12.0), mira=(20.0, 10.0, 0.0), f=1200.0):
    """
    Cámara pinhole en un corner, alta, apuntando al centro. Devuelve la matriz
    que lleva de metros de cancha (plano z=0) a píxel.

    f=1200 sobre 3840 px son unos 116 grados de campo horizontal, que es lo que
    hace falta para que la cancha entera entre desde un corner. Ojo con esto:
    el modo Linear de una GoPro ronda los 90-95 grados y NO alcanza. Ver
    test_toda_la_cancha_entra_en_cuadro.
    """
    C = np.array(pos, float)
    objetivo = np.array(mira, float)
    adelante = objetivo - C
    adelante /= np.linalg.norm(adelante)
    derecha = np.cross(adelante, np.array([0.0, 0.0, 1.0]))
    derecha /= np.linalg.norm(derecha)
    abajo = np.cross(adelante, derecha)
    R = np.vstack([derecha, abajo, adelante])
    K = np.array([[f, 0, ANCHO_PX / 2], [0, f, ALTO_PX / 2], [0, 0, 1]])
    P = K @ np.hstack([R, (-R @ C).reshape(3, 1)])
    return P[:, [0, 1, 3]]   # el plano z=0 colapsa la tercera columna


def _proyectar(M, x_m, y_m):
    p = M @ np.array([x_m, y_m, 1.0])
    return p[0] / p[2], p[1] / p[2]


def _marcas_sinteticas(M, ruido_px=0.0, semilla=7):
    rng = np.random.default_rng(semilla)
    marcas = {}
    for p in PUNTOS_REFERENCIA:
        u, v = _proyectar(M, p.x_m, p.y_m)
        if ruido_px:
            u += rng.normal(0, ruido_px)
            v += rng.normal(0, ruido_px)
        marcas[p.id] = (u, v)
    return marcas


def test_toda_la_cancha_entra_en_cuadro():
    """Si esto falla, el setup de cámara del test no representa nada real."""
    M = _camara_corner()
    for p in PUNTOS_REFERENCIA:
        u, v = _proyectar(M, p.x_m, p.y_m)
        assert -50 < u < ANCHO_PX + 50, f"{p.id} se sale por el costado"
        assert -50 < v < ALTO_PX + 50, f"{p.id} se sale por arriba o abajo"


def test_calibracion_sin_ruido_es_exacta():
    M = _camara_corner()
    h = calibrar(_marcas_sinteticas(M), resolucion=(ANCHO_PX, ALTO_PX))
    assert h.error_rms_m < 1e-6
    for p in PUNTOS_REFERENCIA:
        u, v = _proyectar(M, p.x_m, p.y_m)
        assert h.a_cancha(u, v) == pytest.approx((p.x_m, p.y_m), abs=1e-6)


def test_calibracion_con_clicks_humanos_aguanta():
    """
    3 px de error por click es lo que mete una persona marcando en pantalla.
    Con eso la calibración tiene que seguir dando error de centímetros.
    """
    M = _camara_corner()
    h = calibrar(_marcas_sinteticas(M, ruido_px=3.0), resolucion=(ANCHO_PX, ALTO_PX))
    assert h.error_rms_m < 0.30


def test_mas_puntos_calibran_mejor_que_cuatro_esquinas():
    """
    Es la razón por la que la UI tiene que pedir más de cuatro clicks. Se mide
    el error real contra la cámara conocida, en toda la cancha, no el residuo
    de la propia calibración (que con 4 puntos da siempre cero y engaña).
    """
    M = _camara_corner()
    todas = _marcas_sinteticas(M, ruido_px=3.0, semilla=3)
    solo_esquinas = {k: v for k, v in todas.items() if k.startswith("esq_")}

    h4 = calibrar(solo_esquinas)
    h15 = calibrar(todas)

    grilla = [(x, y) for x in np.linspace(1, 39, 12) for y in np.linspace(1, 19, 8)]

    def error_medio(h):
        errs = []
        for x_m, y_m in grilla:
            u, v = _proyectar(M, x_m, y_m)
            errs.append(np.linalg.norm(np.array(h.a_cancha(u, v)) - np.array([x_m, y_m])))
        return float(np.mean(errs))

    assert error_medio(h15) < error_medio(h4)


def test_ida_y_vuelta_imagen_cancha():
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    for x_m, y_m in [(0, 0), (40, 20), (20, 10), (6, 10), (34, 10)]:
        u, v = h.a_imagen(x_m, y_m)
        assert h.a_cancha(u, v) == pytest.approx((x_m, y_m), abs=1e-6)


def test_pies_del_recuadro_y_no_el_centro():
    """
    El punto que se proyecta es el medio del borde INFERIOR del recuadro. Un
    recuadro más alto sobre el mismo par de pies tiene que dar la misma
    posición en cancha; si diera distinta, estaríamos proyectando el centro
    del cuerpo y metiendo un error que crece con el tamaño del jugador.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    u, v = h.a_imagen(25.0, 12.0)
    bajo = h.pies_a_norm((u - 30, v - 120, u + 30, v), invertida=False)
    alto = h.pies_a_norm((u - 40, v - 260, u + 40, v), invertida=False)
    assert bajo == pytest.approx(alto)
    assert etiqueta_zona(*bajo) == "Z3-C"


def test_espejado_al_cambiar_de_lado():
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    u, v = h.a_imagen(5.0, 4.0)
    derecho = h.pies_a_norm((u - 20, v - 100, u + 20, v), invertida=False)
    espejado = h.pies_a_norm((u - 20, v - 100, u + 20, v), invertida=True)
    assert espejado[0] == pytest.approx(100 - derecho[0])
    assert espejado[1] == pytest.approx(100 - derecho[1])
    assert etiqueta_zona(*derecho) == "Z1-I"
    assert etiqueta_zona(*espejado) == "Z4-D"


def test_el_filtro_de_cancha_saca_la_tribuna():
    """
    Con la cámara en un corner el detector encuentra gente en la tribuna, en
    los bancos y en la mesa de control. Todo eso cae fuera del rectángulo.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    assert h.dentro_de_cancha(20, 10) is True
    assert h.dentro_de_cancha(0, 0) is True
    assert h.dentro_de_cancha(-1.0, 5) is True      # pisando la línea, entra
    assert h.dentro_de_cancha(-6.0, 5) is False     # banco de suplentes
    assert h.dentro_de_cancha(20, 26.0) is False    # tribuna
    assert h.dentro_de_cancha(48.0, 10) is False    # atrás del arco
    assert h.dentro_de_cancha(float("nan"), 10) is False
    assert h.dentro_de_cancha(None, None) is False


def test_la_precision_cae_en_el_rincon_lejano():
    """
    El costo real de poner la cámara en un corner, en números. No es un bug: es
    la consecuencia geométrica, y el informe tiene que exponerla para que nadie
    lea un heatmap de Z4-D como si fuera del mismo material que uno de Z1-I.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    rep = h.reporte_precision(error_deteccion_px=3.0)

    assert rep["celdas"]["Z4-D"]["error_m"] > rep["celdas"]["Z1-I"]["error_m"]
    assert rep["peor_celda"] == "Z4-D"
    assert rep["mejor_celda"] == "Z1-I"
    assert all(c["px_por_m"] > 0 for c in rep["celdas"].values())


def test_calibracion_rechaza_puntos_alineados():
    marcas = {
        "esq_prop_izq": (100.0, 100.0),
        "esq_prop_der": (200.0, 200.0),
        "esq_riv_der": (300.0, 300.0),
        "esq_riv_izq": (400.0, 400.0),
    }
    with pytest.raises(ErrorCalibracion):
        calibrar(marcas)


def test_calibracion_rechaza_pocos_puntos():
    marcas = _marcas_sinteticas(_camara_corner())
    with pytest.raises(ErrorCalibracion, match="al menos 4"):
        calibrar({k: marcas[k] for k in list(marcas)[:3]})


def test_calibracion_rechaza_un_punto_mal_clickeado():
    """
    Marcar la esquina equivocada es el error más común del operador. Tiene que
    fallar ruidosamente y decir CUÁL punto está mal, no calibrar torcido.
    """
    marcas = _marcas_sinteticas(_camara_corner())
    marcas["penal_riv"] = (marcas["penal_riv"][0] + 400, marcas["penal_riv"][1] + 250)
    with pytest.raises(ErrorCalibracion, match="penal_riv"):
        calibrar(marcas)


def test_calibracion_rechaza_ids_inventados():
    marcas = _marcas_sinteticas(_camara_corner())
    marcas["el_banderin_del_corner"] = (10.0, 10.0)
    with pytest.raises(ErrorCalibracion, match="desconocidos"):
        calibrar(marcas)


def test_serializacion_ida_y_vuelta():
    """La calibración se guarda una vez y se reusa: tiene que sobrevivir al JSON."""
    h = calibrar(_marcas_sinteticas(_camara_corner()), resolucion=(ANCHO_PX, ALTO_PX))
    h2 = Homografia.de_dict(h.a_dict())
    assert h2.a_cancha(1500.0, 1200.0) == pytest.approx(h.a_cancha(1500.0, 1200.0))
    assert h2.resolucion == (ANCHO_PX, ALTO_PX)


def test_lo_que_esta_sobre_el_horizonte_queda_afuera():
    """
    La tribuna alta y el techo proyectan lejísimos o a NaN. En cualquier caso
    el filtro tiene que descartarlos, nunca devolver una coordenada plausible.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    for v in range(0, 400, 20):
        x_m, y_m = h.a_cancha(float(ANCHO_PX / 2), float(v))
        assert h.dentro_de_cancha(x_m, y_m) is False
