"""
Coser los pedazos de track que son la misma persona.

Medido sobre un partido real: dos minutos con diez jugadores en cancha dieron
166 tracks, unas dieciséis identidades por jugador. Con eso no se puede hacer
el mapa de calor de UN jugador, ni seguir a UNO, ni mirar los diez segundos
previos a un gol.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.costura import coser_tracks, resumen_costura  # noqa: E402
from futsal_ia.salida import Track  # noqa: E402


def _track(tid, equipo, puntos, periodo="PT"):
    t = Track(track_ia=tid, equipo=equipo, periodo=periodo)
    for t_ms, x, y in puntos:
        t.agregar(t_ms, x, y)
    return t


def test_dos_pedazos_seguidos_del_mismo_jugador_se_unen():
    """
    El caso típico: alguien se tapa detrás de otro un par de cuadros, el track
    muere y renace medio metro más allá con número nuevo.
    """
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50), (100, 51, 50), (200, 52, 50)]),
        2: _track(2, "Propio", [(600, 54, 50), (700, 55, 50)]),
    }
    salida, costuras = coser_tracks(tracks)
    assert len(salida) == 1
    assert len(salida[1].puntos) == 5
    assert costuras[0].piezas == [1, 2]
    assert costuras[0].huecos_ms == [400]


def test_no_une_dos_personas_que_se_ven_al_mismo_tiempo():
    """Si los tramos se pisan en el tiempo, son dos personas distintas."""
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50), (500, 51, 50)]),
        2: _track(2, "Propio", [(200, 52, 51), (700, 53, 51)]),
    }
    salida, costuras = coser_tracks(tracks)
    assert len(salida) == 2 and not costuras


def test_no_une_a_traves_de_media_cancha():
    """
    Nadie recorre veinte metros en medio segundo. Un cosido así mezcla dos
    jugadores para siempre, y eso es peor que dejar los dos pedazos sueltos.
    """
    tracks = {
        1: _track(1, "Propio", [(0, 10, 50)]),
        2: _track(2, "Propio", [(500, 90, 50)]),
    }
    salida, _ = coser_tracks(tracks)
    assert len(salida) == 2


def test_no_une_un_propio_con_un_rival():
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50)]),
        2: _track(2, "Rival", [(300, 51, 50)]),
    }
    salida, _ = coser_tracks(tracks)
    assert len(salida) == 2


def test_desconocido_no_contradice_a_nadie():
    """
    Un pedazo corto, con el jugador tapado o de espaldas, no llega a tener
    color confiable. No debería impedir el cosido.
    """
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50), (100, 50, 50), (200, 50, 50)]),
        2: _track(2, "Desconocido", [(400, 51, 50)]),
    }
    salida, _ = coser_tracks(tracks)
    assert len(salida) == 1
    assert salida[1].equipo == "Propio", "el pedazo largo define el color"


def test_el_pedazo_mas_largo_define_el_equipo():
    """Tres cuadros no pueden definir el color de alguien visto treinta segundos."""
    largo = [(i * 100, 50, 50) for i in range(40)]
    tracks = {
        1: _track(1, "Desconocido", [(0, 50, 50)]),
        2: _track(2, "Rival", [(p[0] + 300, p[1], p[2]) for p in largo]),
    }
    salida, _ = coser_tracks(tracks)
    assert len(salida) == 1 and salida[1].equipo == "Rival"


def test_no_une_a_traves_del_entretiempo():
    tracks = {
        1: _track(1, "Propio", [(1_190_000, 50, 50)], periodo="PT"),
        2: _track(2, "Propio", [(100, 51, 50)], periodo="ST"),
    }
    salida, _ = coser_tracks(tracks)
    assert len(salida) == 2


def test_una_cadena_de_varios_pedazos():
    """Un jugador que se pierde y reaparece cinco veces vuelve a ser uno solo."""
    tracks = {}
    for i in range(5):
        tracks[i] = _track(i, "Propio",
                           [(i * 1000, 50 + i, 50), (i * 1000 + 200, 50 + i, 50)])
    salida, costuras = coser_tracks(tracks)
    assert len(salida) == 1
    assert len(salida[0].puntos) == 10
    assert costuras[0].piezas == [0, 1, 2, 3, 4]


def test_cada_pedazo_se_usa_una_sola_vez():
    """
    Dos tracks que terminan cerca del mismo arranque: solo uno se lo puede
    quedar, o se duplicarían los puntos.
    """
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50)]),
        2: _track(2, "Propio", [(0, 51, 50)]),
        3: _track(3, "Propio", [(300, 50.5, 50)]),
    }
    salida, costuras = coser_tracks(tracks)
    assert len(salida) == 2
    total = sum(len(t.puntos) for t in salida.values())
    assert total == 3, "ningún punto puede aparecer dos veces"


def test_los_puntos_quedan_en_orden():
    tracks = {
        1: _track(1, "Propio", [(0, 50, 50), (100, 50, 50)]),
        2: _track(2, "Propio", [(400, 51, 50), (500, 51, 50)]),
    }
    salida, _ = coser_tracks(tracks)
    tiempos = [p["t_ms"] for p in salida[1].puntos]
    assert tiempos == sorted(tiempos)


def test_sin_nada_que_coser_no_rompe():
    assert coser_tracks({}) == ({}, [])
    uno = {1: _track(1, "Propio", [(0, 50, 50)])}
    salida, costuras = coser_tracks(uno)
    assert len(salida) == 1 and not costuras


def test_los_tracks_vacios_se_conservan():
    """Borrarlos escondería que el seguidor los llegó a abrir."""
    tracks = {1: Track(track_ia=1, equipo="Propio"),
              2: _track(2, "Propio", [(0, 50, 50)])}
    salida, _ = coser_tracks(tracks)
    assert set(salida) == {1, 2}


def test_el_resumen_cuenta_lo_que_se_unio():
    tracks = {i: _track(i, "Propio", [(i * 500, 50, 50)]) for i in range(4)}
    antes = len(tracks)
    salida, costuras = coser_tracks(tracks)
    r = resumen_costura(antes, len(salida), costuras)
    assert r["tracks_antes"] == 4
    assert r["tracks_despues"] == 1
    assert r["piezas_unidas"] == 3


def test_un_partido_fragmentado_se_recompone():
    """
    Simula lo que pasó de verdad: diez jugadores caminando, cada uno partido en
    pedazos de un segundo con huecos de 300 ms. Sesenta tracks que tienen que
    volver a ser diez.
    """
    tracks, tid = {}, 0
    for jugador in range(10):
        x = 10 + jugador * 8
        for pedazo in range(6):
            t0 = pedazo * 1300
            tracks[tid] = _track(tid, "Propio" if jugador < 5 else "Rival",
                                 [(t0, x + pedazo * 0.4, 40 + jugador),
                                  (t0 + 1000, x + pedazo * 0.4 + 0.3, 40 + jugador)])
            tid += 1

    assert len(tracks) == 60
    salida, costuras = coser_tracks(tracks)
    assert len(salida) == 10, f"quedaron {len(salida)} en vez de 10"
    for t in salida.values():
        assert len(t.puntos) == 12
        assert t.duracion_ms == pytest.approx(7500, abs=200)
