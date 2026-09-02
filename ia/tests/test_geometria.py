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


def test_la_misma_celda_cambia_de_calidad_entre_tiempos():
    """
    Z1-Z4 se cuentan desde el arco PROPIO y los equipos cambian de lado en el
    entretiempo. Con un arco cerca de la cámara y el otro lejos, Z4 del primer
    tiempo y Z4 del segundo son extremos físicos distintos, con calidades de
    dato distintas. Si el informe no toma el flag, miente en uno de los dos.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    derecho = h.reporte_precision(3.0, invertida=False)
    espejado = h.reporte_precision(3.0, invertida=True)

    assert derecho["peor_celda"] == "Z4-D"
    assert espejado["peor_celda"] == "Z1-I"     # la de siempre, vista al revés
    assert derecho["celdas"]["Z4-D"]["error_m"] == pytest.approx(
        espejado["celdas"]["Z1-I"]["error_m"]
    )
    assert derecho["invertida"] is False and espejado["invertida"] is True


def test_el_informe_por_periodo_expone_la_asimetria():
    """
    Sumar Z4 del PT con Z4 del ST mezcla un dato de centímetros con uno de
    medio metro. El informe existe para que eso se vea antes de sacar
    conclusiones, no después.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner()))
    rep = h.reporte_por_periodo(3.0, invertida_pt=False)

    assert rep["PT"]["invertida"] is False
    assert rep["ST"]["invertida"] is True
    assert rep["asimetria_maxima"] > 3.0, "la asimetría del corner tiene que saltar"
    z4d = rep["comparacion"]["Z4-D"]
    assert z4d["error_pt_m"] > z4d["error_st_m"]
    assert z4d["veces_peor"] == pytest.approx(z4d["error_pt_m"] / z4d["error_st_m"], abs=0.1)


# ── Esquinas en orden cambiado ─────────────────────────────────────────────
#
# Es EL error del operador, y el más peligroso: dos esquinas intercambiadas
# dan un cuadrilátero en forma de moño, la homografía se resuelve igual sin
# fallar, y devuelve posiciones absurdas sin avisar. Los casos de acá salen de
# una calibración real de la cancha de VF que llegó con este problema.

def test_detecta_dos_esquinas_intercambiadas_y_dice_cuales():
    from futsal_ia.geometria import revisar_esquinas

    marcas = _marcas_sinteticas(_camara_corner())
    marcas["esq_prop_izq"], marcas["esq_prop_der"] = (
        marcas["esq_prop_der"], marcas["esq_prop_izq"])

    aviso = revisar_esquinas(marcas)
    assert aviso is not None
    assert "esq_prop_izq" in aviso and "esq_prop_der" in aviso
    with pytest.raises(ErrorCalibracion, match="esq_prop_izq"):
        calibrar(marcas)


def test_las_esquinas_bien_marcadas_no_disparan_el_aviso():
    from futsal_ia.geometria import revisar_esquinas

    assert revisar_esquinas(_marcas_sinteticas(_camara_corner())) is None


def test_sin_las_cuatro_esquinas_no_se_puede_revisar_el_orden():
    """Con la esquina cercana tapada por una baranda hay que poder calibrar igual."""
    from futsal_ia.geometria import revisar_esquinas

    marcas = _marcas_sinteticas(_camara_corner())
    del marcas["esq_prop_izq"]
    assert revisar_esquinas(marcas) is None
    assert calibrar(marcas).error_rms_px < 1.0


def test_la_tolerancia_va_en_pixeles_y_no_en_metros():
    """
    Con la cámara en un corner un metro vale decenas de veces menos en el
    rincón lejano que en el cercano. Un umbral en metros rechaza calibraciones
    buenas por culpa de la perspectiva y no de quien marcó: un click perfecto
    en el fondo "falla" por medio metro sin que nadie se haya equivocado.
    """
    h = calibrar(_marcas_sinteticas(_camara_corner(), ruido_px=4.0))
    assert h.error_rms_px < 12.0

    escalas = [h.escala_local(x, y)["px_por_m_peor"]
               for x, y in [(1, 1), (39, 19), (20, 10)]]
    assert max(escalas) / min(escalas) > 4, "el setup del test ya no es asimétrico"

    # El mismo error de click, medido en metros, da números muy distintos
    # según dónde caiga. En píxeles, no.
    en_px = list(h.error_por_punto_px.values())
    assert max(en_px) / max(min(en_px), 0.01) < max(escalas) / min(escalas)


def test_un_click_muy_desviado_se_rechaza_igual():
    marcas = _marcas_sinteticas(_camara_corner())
    marcas["penal_riv"] = (marcas["penal_riv"][0] + 120, marcas["penal_riv"][1] + 90)
    with pytest.raises(ErrorCalibracion, match="penal_riv"):
        calibrar(marcas)


def test_los_dos_errores_viajan_en_el_json():
    h = calibrar(_marcas_sinteticas(_camara_corner(), ruido_px=3.0))
    d = h.a_dict()
    assert "error_rms_px" in d and "error_por_punto_px" in d
    h2 = Homografia.de_dict(d)
    assert h2.error_rms_px == pytest.approx(h.error_rms_px)


# ── Calibración y encuadre que no se corresponden ──────────────────────────

def test_una_calibracion_de_otro_tamaño_se_rechaza_antes_de_analizar():
    """
    El error más caro de todos: si las resoluciones no coinciden, las
    coordenadas no significan lo mismo y TODO cae fuera de la cancha, pero
    nada falla. El análisis corre entero y devuelve cero, después de horas.
    """
    from futsal_ia.pipeline import ErrorIncompatible, revisar_compatibilidad
    from futsal_ia.preproceso import Encuadre

    h = calibrar(_marcas_sinteticas(_camara_corner()), resolucion=(1615, 741))
    bueno = Encuadre(resolucion_origen=(1920, 1080), recorte=(100, 200, 1615, 741))
    # Un recorte válido para este cuadro, pero de otro tamaño que el calibrado.
    malo = Encuadre(resolucion_origen=(1920, 1080), recorte=(0, 0, 1900, 900))

    revisar_compatibilidad(h, bueno)        # no levanta nada
    revisar_compatibilidad(h, None)         # sin encuadre no hay nada que comparar

    with pytest.raises(ErrorIncompatible, match="1615x741") as e:
        revisar_compatibilidad(h, malo)
    assert "1900x900" in str(e.value)
    assert "calibrar" in str(e.value)


def test_sin_resolucion_guardada_no_se_puede_comparar():
    """Las calibraciones viejas no la traen: no se rompe, solo no verifica."""
    from futsal_ia.pipeline import revisar_compatibilidad
    from futsal_ia.preproceso import Encuadre

    h = calibrar(_marcas_sinteticas(_camara_corner()))
    revisar_compatibilidad(h, Encuadre(resolucion_origen=(1920, 1080)))
