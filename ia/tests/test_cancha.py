"""
El puerto Python de la grilla tiene que dar EXACTAMENTE lo mismo que el JS.

No alcanza con leer los dos y decir "se parecen": este test corre el zonaDe()
real de src/offline/modelo.js con node sobre una grilla densa y lo compara
celda por celda. Si alguien toca los cortes de un lado y no del otro, esto
se rompe y nos enteramos ahí, no seis meses después mirando un heatmap raro.
"""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apoyo_js import correr_js, url_modelo  # noqa: E402
from futsal_ia.cancha import (  # noqa: E402
    CELDAS,
    acotar,
    es_recuperacion_alta,
    espejar,
    etiqueta_zona,
    metros_a_norm,
    norm_a_metros,
    zona_de,
)


# Puntos elegidos a mano: bordes exactos de celda, justo antes y justo después
# de cada corte, negativos, mayores a 100 y el 100/3 que es el que más se
# presta a que alguien lo redondee a 33 y rompa todo.
CASOS = [
    (0, 0), (0.001, 0.001), (24.999, 33.332), (25, 33.333), (25.001, 33.334),
    (49.999, 66.665), (50, 66.667), (50.001, 66.668), (74.999, 99.999),
    (75, 100), (99.999, 100), (100, 100), (-5, -5), (150, 150),
    (33.333, 33.333), (66.666, 66.666), (20, 10), (12.5, 50),
]
GRILLA = [(x / 2.0, y / 2.0) for x in range(0, 201, 7) for y in range(0, 201, 11)]
TODOS = CASOS + GRILLA


def _zonas_segun_js(puntos):
    return correr_js(f"""
import {{ zonaDe, espejar, acotar }} from '{url_modelo()}';
const pts = {json.dumps(puntos)};
const salida = pts.map(([x, y]) => {{
  const z = zonaDe(x, y);
  const e = espejar({{ x, y }}, true);
  return {{ etiqueta: z ? z.etiqueta : null, nombre: z ? z.nombre : null,
           metros: z ? z.metros : null, acotado: acotar(x),
           espejado: [e.x, e.y] }};
}});
process.stdout.write(JSON.stringify(salida));
""")


def test_zona_de_coincide_con_modelo_js():
    esperado = _zonas_segun_js(TODOS)
    for (x, y), esp in zip(TODOS, esperado):
        celda = zona_de(x, y)
        assert celda is not None
        assert celda.etiqueta == esp["etiqueta"], f"({x}, {y}): {celda.etiqueta} != {esp['etiqueta']}"
        assert celda.nombre == esp["nombre"]
        assert celda.metros == esp["metros"]


def test_acotar_y_espejar_coinciden_con_modelo_js():
    esperado = _zonas_segun_js(TODOS)
    for (x, y), esp in zip(TODOS, esperado):
        assert acotar(x) == pytest.approx(esp["acotado"])
        ex, ey = espejar(x, y, True)
        assert ex == pytest.approx(esp["espejado"][0])
        assert ey == pytest.approx(esp["espejado"][1])


def test_espejar_es_su_propio_inverso():
    for x, y in TODOS:
        una = espejar(x, y, True)
        vuelta = espejar(*una, True)
        assert vuelta == pytest.approx((acotar(x), acotar(y)))


def test_acotar_tolera_basura():
    assert acotar(None) == 0.0
    assert acotar("no soy un numero") == 0.0
    assert acotar(float("nan")) == 0.0
    assert acotar(-1) == 0.0
    assert acotar(1e9) == 100.0


def test_zona_de_devuelve_none_sin_coordenada():
    assert zona_de(None, 10) is None
    assert zona_de(10, None) is None
    assert etiqueta_zona(None, None) is None


def test_las_doce_celdas_estan_y_no_se_repiten():
    etiquetas = [c.etiqueta for c in CELDAS]
    assert len(etiquetas) == 12
    assert len(set(etiquetas)) == 12


def test_recuperacion_alta_es_mitad_rival():
    """Decisión del CT: alta = Z3 o Z4. Z2 no cuenta por más que esté avanzada."""
    assert es_recuperacion_alta(60, 50) is True   # Z3
    assert es_recuperacion_alta(90, 10) is True   # Z4
    assert es_recuperacion_alta(49, 50) is False  # Z2
    assert es_recuperacion_alta(10, 50) is False  # Z1
    # El borde exacto entre Z2 y Z3 cae del lado alto.
    assert es_recuperacion_alta(50, 50) is True
    assert es_recuperacion_alta(49.999, 50) is False


def test_metros_ida_y_vuelta():
    for x_m, y_m in [(0, 0), (40, 20), (20, 10), (6, 10), (33.3, 7.7)]:
        x, y = metros_a_norm(x_m, y_m)
        assert norm_a_metros(x, y) == pytest.approx((x_m, y_m))


def test_las_esquinas_caen_donde_corresponde():
    assert etiqueta_zona(*metros_a_norm(0, 0)) == "Z1-I"
    assert etiqueta_zona(*metros_a_norm(39.9, 19.9)) == "Z4-D"
    assert etiqueta_zona(*metros_a_norm(20, 10)) == "Z3-C"  # el centro cae en Z3 por el corte
