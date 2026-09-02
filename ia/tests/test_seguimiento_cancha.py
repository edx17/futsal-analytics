"""
Seguimiento sobre la cancha, en metros.

El seguidor por imagen asocia por solapamiento de recuadros. Medido sobre esta
cámara: a 10 fps un jugador corriendo se corre 1,2 veces el ancho de su cuerpo,
así que el solapamiento es CERO y el track muere. De ahí salían 166 identidades
para diez jugadores.

En metros la velocidad está acotada, se puede predecir, y dos jugadores que se
cruzan siguen de largo cada uno por su lado.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.seguimiento_cancha import SeguidorCancha  # noqa: E402


def test_un_jugador_quieto_conserva_su_id():
    s = SeguidorCancha()
    ids = [s.actualizar([(10.0, 10.0)], t)[0] for t in range(0, 1000, 100)]
    assert len(set(ids)) == 1


def test_un_jugador_corriendo_conserva_su_id():
    """
    Nueve metros por segundo, el tope de un futbolista. A 10 fps son 90 cm por
    cuadro: el caso exacto en que el solapamiento de recuadros da cero.
    """
    s = SeguidorCancha()
    ids = []
    for k in range(20):
        t = k * 100
        ids.append(s.actualizar([(2.0 + 0.9 * k, 10.0)], t)[0])
    assert len(set(ids)) == 1, f"se rompió en {len(set(ids))} pedazos"


def test_diez_jugadores_a_la_vez_no_se_mezclan():
    s = SeguidorCancha()
    primeros = None
    for k in range(30):
        t = k * 100
        pos = [(5 + i * 3 + 0.3 * k, 4 + (i % 5) * 3) for i in range(10)]
        ids = s.actualizar(pos, t)
        if primeros is None:
            primeros = ids
        assert ids == primeros, f"cambiaron identidades en el cuadro {k}"
    assert len(set(primeros)) == 10


def test_dos_que_se_cruzan_siguen_cada_uno_por_su_lado():
    """
    El caso que la imagen no puede resolver y la física sí: uno va hacia la
    derecha y el otro hacia la izquierda, se juntan y se separan. Cada
    predicción sigue de largo por su trayectoria.
    """
    s = SeguidorCancha()
    ids_a, ids_b = [], []
    for k in range(21):
        t = k * 100
        # A cruza de x=5 a x=25, B de x=25 a x=5. Se tocan en el medio.
        a = (5.0 + k, 10.0)
        b = (25.0 - k, 10.0)
        ids = s.actualizar([a, b], t)
        ids_a.append(ids[0])
        ids_b.append(ids[1])

    assert len(set(ids_a)) == 1, "A cambió de identidad al cruzarse"
    assert len(set(ids_b)) == 1, "B cambió de identidad al cruzarse"
    assert ids_a[0] != ids_b[0]


def test_sobrevive_a_quedar_tapado_unos_cuadros():
    """En 400 m² los jugadores se tapan constantemente."""
    s = SeguidorCancha()
    primero = s.actualizar([(10.0, 10.0)], 0)[0]
    for k in range(1, 6):                       # medio segundo sin verlo
        s.actualizar([], k * 100)
    vuelve = s.actualizar([(12.5, 10.0)], 600)[0]
    assert vuelve == primero


def test_a_los_dos_segundos_ya_no_se_le_cree():
    s = SeguidorCancha(max_sin_ver_ms=1500)
    primero = s.actualizar([(10.0, 10.0)], 0)[0]
    despues = s.actualizar([(10.0, 10.0)], 3000)[0]
    assert despues != primero


def test_nadie_se_teletransporta():
    """Una aparición a veinte metros es otra persona, no la misma."""
    s = SeguidorCancha()
    primero = s.actualizar([(5.0, 5.0)], 0)[0]
    lejos = s.actualizar([(35.0, 15.0)], 100)[0]
    assert lejos != primero


def test_la_velocidad_estimada_se_acerca_a_la_real():
    s = SeguidorCancha()
    for k in range(12):
        s.actualizar([(1.0 + 0.5 * k, 10.0)], k * 100)     # 5 m/s
    t = next(iter(s.vivos.values()))
    assert t.vx == pytest.approx(5.0, abs=0.6)
    assert t.vy == pytest.approx(0.0, abs=0.3)


def test_la_velocidad_no_explota_con_una_deteccion_saltada():
    """
    Un recuadro que salta un metro por el temblor no puede dejar al track
    creyendo que va a 60 km/h: la siguiente predicción caería en otra provincia.
    """
    s = SeguidorCancha()
    s.actualizar([(10.0, 10.0)], 0)
    s.actualizar([(10.1, 10.0)], 100)
    s.actualizar([(14.0, 10.0)], 130)          # salto absurdo en 30 ms
    t = next(iter(s.vivos.values()))
    assert abs(t.vx) <= 10.0


def test_un_jugador_nuevo_recibe_id_nuevo():
    s = SeguidorCancha()
    ids1 = s.actualizar([(10.0, 10.0)], 0)
    ids2 = s.actualizar([(10.0, 10.0), (30.0, 5.0)], 100)
    assert ids2[0] == ids1[0]
    assert ids2[1] != ids1[0]


def test_reiniciar_entre_periodos():
    s = SeguidorCancha()
    antes = s.actualizar([(10.0, 10.0)], 0)[0]
    s.reiniciar()
    despues = s.actualizar([(10.0, 10.0)], 100)[0]
    assert despues != antes


def test_sin_detecciones_no_rompe():
    s = SeguidorCancha()
    assert s.actualizar([], 0) == []
    assert s.actualizar([], 5000) == []


def test_cuantas_identidades_para_diez_jugadores_dos_minutos():
    """
    La medida que importa. Diez jugadores moviéndose de verdad durante dos
    minutos a 10 fps, con oclusiones: el seguidor por imagen daba 166
    identidades. Sobre la cancha tienen que ser diez, o muy cerca.
    """
    import math as m
    import random

    rng = random.Random(7)
    s = SeguidorCancha()
    vistos = set()
    for k in range(1200):                       # 2 min a 10 fps
        t = k * 100
        pos = []
        for i in range(10):
            fase = k / 22.0 + i
            x = 20 + 14 * m.sin(fase) + 0.6 * m.sin(fase * 3.7)
            y = 10 + 7 * m.cos(fase * 0.8 + i)
            if rng.random() < 0.12:             # tapado este cuadro
                continue
            pos.append((x, y))
        vistos.update(s.actualizar(pos, t))

    assert len(vistos) <= 25, f"salieron {len(vistos)} identidades para diez jugadores"
