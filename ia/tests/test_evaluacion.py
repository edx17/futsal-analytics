"""
Medir contra lo que dice una persona.

Es la pieza que faltaba para poder mejorar con criterio. Hasta acá veníamos
mirando cuadros sueltos y opinando; con eso no se puede decidir si subir un
umbral ayuda o arruina.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.evaluacion import (  # noqa: E402
    RevisionInstante,
    comparar,
    evaluar,
    veredicto,
)


def _analisis(instantes):
    """instantes: {t_ms: cuántas posiciones tenía el snapshot}"""
    return {"snapshots": [{"t_ms": t, "posiciones": [{"_track_ia": i} for i in range(n)]}
                          for t, n in instantes.items()]}


def test_todo_perfecto():
    a = _analisis({0: 10, 1000: 10})
    r = [RevisionInstante(0, 10), RevisionInstante(1000, 10)]
    m = evaluar(a, r)
    assert m["recall"] == 1.0 and m["precision"] == 1.0 and m["acierto_equipo"] == 1.0


def test_le_faltan_jugadores():
    """Diez en cancha, encontró siete."""
    m = evaluar(_analisis({0: 7}), [RevisionInstante(0, 10)])
    assert m["recall"] == 0.7
    assert m["precision"] == 1.0, "lo que marcó estaba bien; el problema es lo que no vio"


def test_marca_gente_que_no_juega():
    """Doce recuadros para diez jugadores: dos son de afuera."""
    m = evaluar(_analisis({0: 12}), [RevisionInstante(0, 10, falsos=[5, 7])])
    assert m["precision"] == round(10 / 12, 3)
    assert m["recall"] == 1.0


def test_falla_el_equipo():
    m = evaluar(_analisis({0: 10}), [RevisionInstante(0, 10, equipo_mal=[1, 2, 3])])
    assert m["acierto_equipo"] == 0.7
    assert m["recall"] == 1.0, "estaban todos detectados, el error es de color"


def test_varios_instantes_se_suman():
    a = _analisis({0: 8, 1000: 10, 2000: 6})
    r = [RevisionInstante(0, 10), RevisionInstante(1000, 10), RevisionInstante(2000, 10)]
    m = evaluar(a, r)
    assert m["jugadores_reales"] == 30 and m["detectados"] == 24
    assert m["recall"] == 0.8
    assert m["instantes"] == 3


def test_un_instante_que_no_existe_en_el_analisis():
    m = evaluar(_analisis({0: 10}), [RevisionInstante(0, 10), RevisionInstante(9999, 10)])
    assert m["instantes"] == 1
    assert m["instantes_sin_snapshot"] == [9999]


def test_sin_revisiones_no_inventa_numeros():
    m = evaluar(_analisis({0: 10}), [])
    assert m["instantes"] == 0 and "aviso" in m
    assert "recall" not in m, "un recall inventado es peor que no tener ninguno"


def test_el_veredicto_manda_a_lo_que_hay_que_tocar():
    flojo = evaluar(_analisis({0: 5}), [RevisionInstante(0, 10)])
    dichos = " ".join(veredicto(flojo))
    assert "mosaicos" in dichos and "entrenar" in dichos

    sucio = evaluar(_analisis({0: 14}), [RevisionInstante(0, 10, falsos=[1, 2, 3, 4])])
    assert "excluir" in " ".join(veredicto(sucio))

    colores = evaluar(_analisis({0: 10}), [RevisionInstante(0, 10, equipo_mal=[1, 2, 3])])
    assert "grupos de color" in " ".join(veredicto(colores))


def test_avisa_cuando_son_pocos_instantes():
    m = evaluar(_analisis({0: 10}), [RevisionInstante(0, 10)])
    assert "instantes revisados" in " ".join(veredicto(m))


def test_comparar_dos_mediciones():
    """El punto de medir: saber si un cambio sumó o restó."""
    antes = {"recall": 0.70, "precision": 0.95, "acierto_equipo": 0.90}
    despues = {"recall": 0.86, "precision": 0.93, "acierto_equipo": 0.91}
    c = comparar(antes, despues)
    assert c["recall"]["delta"] == 0.16
    assert "Mejoró" in c["veredicto"]


def test_comparar_detecta_que_algo_empeoro():
    antes = {"recall": 0.86, "precision": 0.95, "acierto_equipo": 0.90}
    despues = {"recall": 0.88, "precision": 0.71, "acierto_equipo": 0.90}
    c = comparar(antes, despues)
    assert "Empeoró" in c["veredicto"] and "precision" in c["veredicto"]


def test_un_cambio_minimo_no_cuenta_como_empeorar():
    """El ruido de medir veinte instantes mueve los números un punto."""
    c = comparar({"recall": 0.86}, {"recall": 0.85})
    assert "Mejoró o quedó igual" in c["veredicto"]


# ── Formato 2: qué era en realidad, no solo que estaba mal ─────────────────

def _correcciones_v2():
    return {
        "periodo": "PT", "formato": 2,
        "instantes": [{
            "t_ms": 0,
            "jugadores_reales": 10,
            "correcciones": [
                {"track_ia": 3, "rol": "No es persona"},
                {"track_ia": 5, "rol": "Rival"},
                {"track_ia": 8, "rol": "Arquero propio"},
            ],
            "agregados": [
                {"bbox": [10, 20, 40, 90], "rol": "Propio"},
                {"bbox": [50, 60, 58, 68], "rol": "Pelota"},
            ],
        }],
    }


def test_lee_el_formato_nuevo():
    from futsal_ia.evaluacion import desde_json

    r = desde_json(_correcciones_v2())[0]
    assert r.jugadores_reales == 10
    assert r.falsos == [3], "solo 'No es persona' es un falso positivo"
    assert sorted(r.equipo_mal) == [5, 8], "los otros son errores de equipo, no de detección"
    assert r.faltantes == 1, "la pelota no cuenta como jugador faltante"


def test_sigue_leyendo_el_formato_viejo():
    """Las mediciones hechas antes se tienen que poder comparar con las nuevas."""
    from futsal_ia.evaluacion import desde_json

    r = desde_json({"instantes": [{"t_ms": 0, "jugadores_reales": 10,
                                   "falsos": [1], "equipo_mal": [2, 3],
                                   "faltantes": 2}]})[0]
    assert r.falsos == [1] and r.equipo_mal == [2, 3] and r.faltantes == 2


def test_las_metricas_salen_igual_de_los_dos_formatos():
    from futsal_ia.evaluacion import desde_json

    analisis = _analisis({0: 12})
    v2 = evaluar(analisis, desde_json(_correcciones_v2()))
    v1 = evaluar(analisis, desde_json({"instantes": [{
        "t_ms": 0, "jugadores_reales": 10, "falsos": [3],
        "equipo_mal": [5, 8], "faltantes": 1}]}))
    assert v2["recall"] == v1["recall"]
    assert v2["precision"] == v1["precision"]
    assert v2["acierto_equipo"] == v1["acierto_equipo"]


def test_las_cajas_confirmadas_sirven_para_entrenar():
    """
    Lo que la IA marcó y nadie desmintió, con el rol corregido, más lo que la
    persona dibujó. Es lo que un entrenamiento pide como entrada.
    """
    from futsal_ia.evaluacion import cajas_etiquetadas

    analisis = {"snapshots": [{"t_ms": 0, "posiciones": [
        {"_track_ia": 3, "equipo": "Propio", "_bbox": [1, 1, 5, 9]},
        {"_track_ia": 5, "equipo": "Propio", "_bbox": [10, 1, 14, 9]},
        {"_track_ia": 9, "equipo": "Propio", "_bbox": [20, 1, 24, 9]},
    ]}]}
    cajas = cajas_etiquetadas(_correcciones_v2(), analisis)[0]["cajas"]
    roles = [c["rol"] for c in cajas]

    assert "No es persona" not in roles, (
        "enseñarle que ahí hay alguien sería justamente el error que se le quiere sacar")
    assert roles.count("Rival") == 1, "el track 5 se corrigió a Rival"
    assert roles.count("Propio") == 2, "el track 9 sin corregir, más el agregado a mano"
    assert "Pelota" in roles, "la pelota se guarda para la Fase 2"
    assert sum(1 for c in cajas if c["origen"] == "humano") == 2


def test_sin_snapshot_no_inventa_cajas():
    from futsal_ia.evaluacion import cajas_etiquetadas

    assert cajas_etiquetadas(_correcciones_v2(), {"snapshots": []}) == []
