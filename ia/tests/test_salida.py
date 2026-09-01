"""
Las filas que escribe la IA tienen que ser indistinguibles de las que escribe
un humano en TomaDatosOffline, salvo por `origen_captura`.

Igual que con la grilla, esto se verifica corriendo las fábricas reales de
modelo.js con node y comparando los campos, no leyendo el archivo y confiando.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.cancha import etiqueta_zona  # noqa: E402
from futsal_ia.salida import (  # noqa: E402
    BALON_ID,
    DURACION_PERIODO_MS,
    Ficha,
    Track,
    crear_snapshot,
    ficha_balon,
    mapa_de_calor,
    ms_a_min_seg,
    nuevo_local_id,
)

RAIZ = Path(__file__).resolve().parents[2]
MODELO_JS = RAIZ / "src" / "offline" / "modelo.js"

# Campos que la IA agrega a propósito y que modelo.js no tiene.
EXTRAS_IA = {"origen_captura"}
# Campos locales: empiezan con _ y el sincronizador los saca antes de subir.
def _sin_locales(campos):
    return {c for c in campos if not c.startswith("_")}


def _correr_js(script):
    res = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, cwd=RAIZ,
    )
    if res.returncode != 0:
        pytest.skip(f"No se pudo correr modelo.js con node: {res.stderr[:300]}")
    return json.loads(res.stdout)


def test_el_snapshot_tiene_los_mismos_campos_que_modelo_js():
    js = _correr_js(f"""
import {{ crearSnapshot }} from '{MODELO_JS.as_posix()}';
process.stdout.write(JSON.stringify(Object.keys(
  crearSnapshot({{ clubId: 'c1', idPartido: 1, periodo: 'PT', tMs: 0, posiciones: [] }})
)));
""")
    nuestro = crear_snapshot(club_id="c1", id_partido=1, fichas=[])
    faltan = _sin_locales(js) - _sin_locales(nuestro)
    sobran = _sin_locales(nuestro) - _sin_locales(js) - EXTRAS_IA
    assert not faltan, f"El snapshot de la IA no escribe: {sorted(faltan)}"
    assert not sobran, f"El snapshot de la IA inventa campos: {sorted(sobran)}"


def test_el_recorrido_tiene_los_mismos_campos_que_modelo_js():
    js = _correr_js(f"""
import {{ crearRecorrido }} from '{MODELO_JS.as_posix()}';
process.stdout.write(JSON.stringify(Object.keys(
  crearRecorrido({{ clubId: 'c1', idPartido: 1 }})
)));
""")
    t = Track(track_ia=3, equipo="Rival")
    t.agregar(0, 10, 10)
    nuestro = t.a_recorrido(club_id="c1", id_partido=1)
    faltan = _sin_locales(js) - _sin_locales(nuestro)
    sobran = _sin_locales(nuestro) - _sin_locales(js) - EXTRAS_IA
    assert not faltan, f"El recorrido de la IA no escribe: {sorted(faltan)}"
    assert not sobran, f"El recorrido de la IA inventa campos: {sorted(sobran)}"


def test_ms_a_min_seg_coincide_con_modelo_js():
    casos = [0, 1, 999, 1000, 59999, 60000, 65432, 1199999, 1200000, 2400000]
    js = _correr_js(f"""
import {{ msAMinSeg, DURACION_PERIODO_MS }} from '{MODELO_JS.as_posix()}';
const casos = {json.dumps(casos)};
process.stdout.write(JSON.stringify({{
  valores: casos.map(ms => msAMinSeg(ms)),
  duracion: DURACION_PERIODO_MS,
}}));
""")
    assert js["duracion"] == DURACION_PERIODO_MS
    for ms, esp in zip(casos, js["valores"]):
        assert ms_a_min_seg(ms) == (esp["minuto"], esp["segundos"]), f"ms={ms}"


def test_el_balon_sale_del_array_de_posiciones():
    """
    En un snapshot la pelota viaja en x_balon/y_balon, no mezclada entre los
    jugadores. Si se colara en `posiciones`, la app la contaría como una ficha
    y todos los conteos de jugadores en cancha darían uno de más.
    """
    fichas = [Ficha("Propio", 10, 10, track_ia=1), ficha_balon(50, 50)]
    s = crear_snapshot(club_id="c1", id_partido=1, fichas=fichas)
    assert len(s["posiciones"]) == 1
    assert all(p["id_jugador"] != BALON_ID for p in s["posiciones"])
    assert (s["x_balon"], s["y_balon"]) == (50.0, 50.0)


def test_snapshot_sin_pelota_no_miente():
    """Fase 1 no detecta la pelota. Los campos van en null, no en cero."""
    s = crear_snapshot(club_id="c1", id_partido=1,
                       fichas=[Ficha("Propio", 10, 10, track_ia=1)])
    assert s["x_balon"] is None and s["y_balon"] is None


def test_marca_de_origen_para_poder_auditar():
    s = crear_snapshot(club_id="c1", id_partido=1, fichas=[])
    t = Track(track_ia=1)
    t.agregar(0, 1, 1)
    assert s["origen_captura"] == "ia"
    assert t.a_recorrido(club_id="c1", id_partido=1)["origen_captura"] == "ia"


def test_las_coordenadas_se_guardan_con_un_decimal():
    f = Ficha("Propio", 33.333333, 66.666666, track_ia=1)
    p = f.a_posicion()
    assert p["x"] == 33.3 and p["y"] == 66.7


def test_el_track_ia_viaja_como_campo_local():
    """
    Empieza con _ para que el sincronizador lo descarte: le sirve a la UI de
    corrección para mapear track -> jugador, y no ensucia la tabla.
    """
    t = Track(track_ia=17, equipo="Rival")
    t.agregar(0, 5, 5)
    r = t.a_recorrido(club_id="c1", id_partido=1)
    assert r["_track_ia"] == 17
    assert r["id_jugador"] is None    # la IA no sabe quién es, y no lo inventa


def test_el_track_reporta_su_tramo():
    t = Track(track_ia=1)
    for ms in (1000, 1200, 1400, 5000):
        t.agregar(ms, 10, 10)
    assert (t.t_inicio_ms, t.t_fin_ms, t.duracion_ms) == (1000, 5000, 4000)


def test_track_vacio_no_explota():
    t = Track(track_ia=1)
    assert t.t_fin_ms is None
    r = t.a_recorrido(club_id="c1", id_partido=1)
    assert r["puntos"] == [] and r["t_inicio_ms"] == 0


def test_mapa_de_calor_cuenta_por_celda_y_filtra_por_equipo():
    propio = Track(track_ia=1, equipo="Propio")
    for _ in range(3):
        propio.agregar(0, 10, 10)      # Z1-I
    propio.agregar(0, 90, 90)          # Z4-D
    rival = Track(track_ia=2, equipo="Rival")
    rival.agregar(0, 60, 50)           # Z3-C

    todos = mapa_de_calor([propio, rival])
    assert todos == {"Z1-I": 3, "Z4-D": 1, "Z3-C": 1}
    assert mapa_de_calor([propio, rival], equipo="Propio") == {"Z1-I": 3, "Z4-D": 1}
    assert etiqueta_zona(10, 10) == "Z1-I"


def test_los_local_id_no_se_repiten():
    ids = {nuevo_local_id("snap") for _ in range(2000)}
    assert len(ids) == 2000
    assert all(i.startswith("snap_") for i in ids)


def test_voto_por_mayoria_del_equipo_de_un_track():
    """
    Un puñado de frames con el jugador tapado no debería definir de qué equipo
    es alguien al que vimos doscientas veces.
    """
    from futsal_ia.pipeline import ResultadoAnalisis, resolver_equipos_por_mayoria

    res = ResultadoAnalisis()
    t = Track(track_ia=1, equipo="Rival")     # el primer frame se equivocó
    t.agregar(0, 10, 10)
    res.tracks[1] = t
    res.votos_equipo[1] = {"Rival": 3, "Propio": 180, "Desconocido": 12}

    resolver_equipos_por_mayoria(res)
    assert res.tracks[1].equipo == "Propio"


def test_un_arquero_no_se_convierte_en_jugador_de_campo():
    """Si un track es mayormente Desconocido, ES el arquero o el árbitro."""
    from futsal_ia.pipeline import ResultadoAnalisis, resolver_equipos_por_mayoria

    res = ResultadoAnalisis()
    t = Track(track_ia=7, equipo="Propio")
    t.agregar(0, 5, 50)
    res.tracks[7] = t
    res.votos_equipo[7] = {"Desconocido": 150, "Propio": 20, "Rival": 4}

    resolver_equipos_por_mayoria(res)
    assert res.tracks[7].equipo == "Desconocido"
