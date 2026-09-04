"""
Si el seguimiento sostiene la identidad de un jugador o la pierde.

Es lo único del pipeline que nunca se había medido, y de lo que dependen el
mapa de calor, el tiempo por jugador y leer qué hizo el equipo antes de un gol.
El resumen decía "23 recorridos, 47 s de promedio", que no distingue entre
veintitrés personas y tres personas partidas en pedazos.

Nada de esto necesita verdad anotada: se apoya en que en futsal hay diez
jugadores en cancha y nunca más.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.cancha import metros_a_norm  # noqa: E402
from futsal_ia.diagnostico_seguimiento import diagnosticar, veredicto  # noqa: E402


def _analisis(marcos):
    """marcos: lista de (t_ms, [(track, x_m, y_m, equipo)])."""
    return {"snapshots": [
        {"t_ms": t, "posiciones": [
            {"_track_ia": tid, "equipo": eq,
             "x": metros_a_norm(x, y)[0], "y": metros_a_norm(x, y)[1]}
            for tid, x, y, eq in gente]}
        for t, gente in marcos]}


def _perfecto(segundos=60, jugadores=10):
    """Cada jugador con un id estable de punta a punta."""
    marcos = []
    for k in range(segundos * 5):                     # cada 200 ms
        gente = [(i, 2.0 + i * 3.5, 5.0 + (k % 20) * 0.4,
                  "Propio" if i < 5 else "Rival") for i in range(jugadores)]
        marcos.append((k * 200, gente))
    return _analisis(marcos)


def _partido_en_pedazos(segundos=60, jugadores=10, cada_s=3):
    """El mismo partido, pero cada jugador cambia de id cada pocos segundos."""
    marcos = []
    for k in range(segundos * 5):
        tramo = (k * 200) // (cada_s * 1000)
        gente = [(1000 * tramo + i, 2.0 + i * 3.5, 5.0 + (k % 20) * 0.4,
                  "Propio" if i < 5 else "Rival") for i in range(jugadores)]
        marcos.append((k * 200, gente))
    return _analisis(marcos)


def test_un_seguimiento_perfecto_da_un_pedazo_por_jugador():
    d = diagnosticar(_perfecto())
    assert d["tracks"] == 10
    assert d["fragmentos_por_jugador"] == 1.0
    assert d["gente_en_cancha_mediana"] == 10
    assert "Está bien" in " ".join(veredicto(d))


def test_un_seguimiento_roto_se_nota_sin_etiquetar_nada():
    """
    Veinte tramos por jugador. Sin ninguna verdad anotada se puede afirmar que
    está roto: en la cancha hay diez, no doscientos.
    """
    d = diagnosticar(_partido_en_pedazos())
    assert d["tracks"] == 200
    assert d["fragmentos_por_jugador"] == 20.0
    dicho = " ".join(veredicto(d))
    assert "no es una persona" in dicho


def test_los_cortes_se_distinguen_de_una_persona_nueva():
    """
    Un track que muere y otro que nace dos metros más allá, un segundo después,
    es el mismo jugador con un número nuevo. Distinguirlo importa: un corte lo
    arregla la costura, una persona nueva no es un problema.
    """
    d = diagnosticar(_partido_en_pedazos(segundos=30))
    assert d["relevos"] >= d["tracks"] * 0.5
    assert "murió otro" in " ".join(veredicto(d))


def test_alguien_de_mas_en_la_cancha_se_denuncia():
    """En futsal son diez. Doce significa que entró alguien que no juega."""
    d = diagnosticar(_perfecto(segundos=10, jugadores=12))
    assert d["gente_en_cancha_max"] == 12
    assert "zonas excluidas" in " ".join(veredicto(d))


def test_se_cuentan_los_cruces_donde_el_color_no_puede_ayudar():
    """
    Dos del mismo equipo pegados es donde la identidad se juega a cara o cruz:
    visten igual, así que no hay nada que los distinga. Entre equipos distintos
    el color todavía tiene algo que decir, y por eso no se cuentan.
    """
    juntos = _analisis([(k * 200, [
        (1, 10.0, 10.0, "Propio"), (2, 10.4, 10.0, "Propio"),     # pegados
        (3, 30.0, 10.0, "Rival"), (4, 30.4, 10.0, "Propio"),      # pegados, distinto equipo
    ]) for k in range(100)])
    d = diagnosticar(juntos)
    assert d["cruces_mismo_equipo"] == 100          # solo el primer par
    assert "moneda al aire" in " ".join(veredicto(d))


def test_un_recorrido_que_cambia_de_equipo_es_sospechoso():
    """O el color es inestable, o ese recorrido se llevó puesto a otro jugador."""
    marcos = []
    for k in range(100):
        equipo = "Propio" if k < 50 else "Rival"
        marcos.append((k * 200, [(1, 10.0, 10.0, equipo)]))
    d = diagnosticar(_analisis(marcos))
    assert d["tracks_con_equipo_inestable"] == 1
    assert "cambian de equipo" in " ".join(veredicto(d))


def test_el_ruido_de_deteccion_se_separa_del_problema_de_seguimiento():
    """
    Recorridos de menos de un segundo no son un seguidor que pierde: son
    detecciones sueltas. Se arregla en otro lado, y conviene decirlo.
    """
    marcos = [(k * 200, [(k, 10.0, 10.0, "Propio")]) for k in range(100)]
    d = diagnosticar(_analisis(marcos))
    assert d["tracks_de_menos_de_1s"] == 100
    assert "ruido de detección" in " ".join(veredicto(d))


def test_un_analisis_vacio_no_rompe():
    assert "aviso" in diagnosticar({"snapshots": []})
    assert veredicto(diagnosticar({})) == ["El análisis no tiene snapshots con posiciones."]
