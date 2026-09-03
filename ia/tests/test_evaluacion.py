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
    assert "matriz" in " ".join(veredicto(colores))


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


# ── La matriz de confusión ─────────────────────────────────────────────────
# "Le pega al equipo el 49% de las veces" no se puede accionar: manda a probar
# cuatro arreglos distintos. La matriz dice cuál de los cuatro es.

from futsal_ia.evaluacion import (  # noqa: E402
    JUGADORES,
    desde_json,
    es_jugador,
    matriz_confusion,
)


def _caso(pares, agregados=()):
    """pares: (lo que dijo la IA, lo que era). Uno por recuadro."""
    posiciones, correcciones = [], []
    for i, (dijo, era) in enumerate(pares, start=1):
        posiciones.append({"_track_ia": i, "_bbox": [0, 0, 1, 1], "equipo": dijo})
        if dijo != era:
            correcciones.append({"track_ia": i, "rol": era})
    analisis = {"snapshots": [{"t_ms": 0, "posiciones": posiciones}]}
    datos = {"instantes": [{"t_ms": 0, "jugadores_reales": len(pares),
                            "correcciones": correcciones,
                            "agregados": [{"bbox": [0, 0, 1, 1], "rol": r}
                                          for r in agregados]}]}
    return analisis, datos


def test_lo_que_nadie_corrigio_cuenta_como_acierto():
    """
    La persona solo toca lo que está mal. Si un recuadro llega hasta el final
    sin corrección, es porque lo dio por bueno: eso es la diagonal.
    """
    mc = matriz_confusion(*_caso([("Propio", "Propio")] * 3))
    assert mc["conteo"]["Propio|Propio"] == 3
    assert mc["total"] == 3
    assert mc["diagnostico"] == []


def test_los_equipos_al_reves_se_dicen_con_todas_las_letras():
    """
    Es el caso más barato de arreglar —reasignar dos grupos de color— y el que
    más fácil se confunde con "el detector anda mal".
    """
    mc = matriz_confusion(*_caso([("Propio", "Rival")] * 8 +
                                 [("Rival", "Propio")] * 7))
    assert any("AL REVÉS" in d for d in mc["diagnostico"])


def test_un_solo_equipo_mal_no_es_lo_mismo_que_al_reves():
    """
    Si el error va en un solo sentido, cambiar los dos grupos no arregla nada:
    lo que hay es un grupo asignado mal, o un equipo partido en dos.
    """
    mc = matriz_confusion(*_caso([("Propio", "Rival")] * 10 +
                                 [("Propio", "Propio")] * 5))
    dicho = " ".join(mc["diagnostico"])
    assert "AL REVÉS" not in dicho
    assert "comiendo" in dicho


def test_los_arqueros_confundidos_se_detectan():
    mc = matriz_confusion(*_caso([("Propio", "Arquero propio")] * 4 +
                                 [("Rival", "Arquero rival")] * 3 +
                                 [("Propio", "Propio")] * 10))
    assert any("arqueros" in d for d in mc["diagnostico"])


def test_lo_que_quedo_en_desconocido_se_nombra_aparte():
    """No es que se equivoque de equipo: no se anima. Se arregla en otro lado."""
    mc = matriz_confusion(*_caso([("Desconocido", "Propio")] * 6 +
                                 [("Propio", "Propio")] * 10))
    assert any("Desconocido" in d and "no se anima" in d for d in mc["diagnostico"])


def test_las_cajas_dibujadas_a_mano_se_cuentan_aparte():
    """No son un error de equipo: son gente que no vio. Otra columna, otro arreglo."""
    mc = matriz_confusion(*_caso([("Propio", "Propio")], agregados=("Rival", "Rival")))
    assert mc["no_vistas"] == {"Rival": 2}


def test_las_columnas_van_siempre_en_el_mismo_orden():
    """Para poder comparar dos corridas de un vistazo."""
    mc = matriz_confusion(*_caso([("Rival", "Desconocido"), ("Propio", "Rival")]))
    assert mc["filas"] == ["Propio", "Rival"]
    assert mc["columnas"] == ["Rival", "Desconocido"]


# ── El árbitro no es un jugador ────────────────────────────────────────────

def test_el_arbitro_no_cuenta_como_jugador():
    assert es_jugador("Propio") and es_jugador("Arquero rival")
    assert not es_jugador("Arbitro")
    assert not es_jugador("Pelota")
    assert not es_jugador("No es persona")
    assert not es_jugador("Desconocido")


def test_un_arbitro_bien_marcado_es_un_falso_positivo_no_un_error_de_equipo():
    """
    La regresión. Antes un árbitro sumaba dos veces mal: contaba como jugador
    encontrado (inflando el recall) y como equipo equivocado (hundiendo el
    acierto de equipo). Encima mandaba a mirar los grupos de color, cuando lo
    que hay que hacer con un árbitro es filtrarlo.
    """
    revisiones = desde_json({"instantes": [{
        "t_ms": 0, "jugadores_reales": 10,
        "correcciones": [{"track_ia": 1, "rol": "Arbitro"},
                         {"track_ia": 2, "rol": "Rival"}],
        "agregados": [{"bbox": [0, 0, 1, 1], "rol": "Arbitro"},
                      {"bbox": [0, 0, 1, 1], "rol": "Propio"}],
    }]})
    r = revisiones[0]
    assert r.falsos == [1]              # el árbitro no es un jugador en cancha
    assert r.equipo_mal == [2]          # el error de equipo es solo el otro
    assert r.faltantes == 1             # el árbitro dibujado tampoco suma


def test_la_lista_de_jugadores_no_se_desincroniza_del_overlay():
    """Dos copias de la misma verdad: si una cambia, la otra tiene que cambiar."""
    from futsal_ia.overlay import JUGADORES as DEL_OVERLAY
    assert JUGADORES == DEL_OVERLAY


# ── Medir por geometría (formato 3) ────────────────────────────────────────
# Los formatos 1 y 2 guardaban "el track 3 estaba mal". Al volver a analizar
# con otros parámetros el track 3 es otra persona, así que los diez minutos de
# revisión servían para medir UNA corrida: la que se tenía enfrente. Con eso, el
# ciclo de medir -> cambiar -> volver a medir no existe.

import pytest  # noqa: E402

from futsal_ia.evaluacion import _iou, medir, verdad_de  # noqa: E402


def _con_verdad(detecciones, verdad, contados=None):
    """detecciones: (bbox, equipo). verdad: (bbox, rol)."""
    analisis = {"snapshots": [{"t_ms": 0, "posiciones": [
        {"_track_ia": i, "_bbox": b, "equipo": eq}
        for i, (b, eq) in enumerate(detecciones, 1)]}]}
    datos = {"formato": 3, "instantes": [{
        "t_ms": 0,
        "jugadores_reales": contados if contados is not None else
                            sum(1 for _, r in verdad if r in JUGADORES),
        "verdad": [{"bbox": b, "rol": r} for b, r in verdad],
    }]}
    return analisis, datos


def test_el_solapamiento_se_calcula_bien():
    assert _iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    assert _iou([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0
    assert _iou([0, 0, 10, 10], [5, 0, 15, 10]) == pytest.approx(1 / 3)


def test_la_misma_verdad_mide_dos_corridas_distintas():
    """
    La regresión que motivó todo esto. Dos análisis del mismo momento, con los
    tracks numerados distinto —como pasa siempre al re-analizar— y la misma
    revisión. Los números tienen que reflejar cada corrida, no la vieja.
    """
    verdad = [([0, 0, 10, 20], "Propio"), ([30, 0, 40, 20], "Rival")]
    mal, datos = _con_verdad([([0, 0, 10, 20], "Propio"),
                              ([30, 0, 40, 20], "Desconocido")], verdad)
    bien, _ = _con_verdad([([30, 0, 40, 20], "Rival"),      # otro orden,
                           ([0, 0, 10, 20], "Propio")], verdad)  # otros ids

    assert medir(mal, datos)["acierto_equipo"] == 0.5
    assert medir(bien, datos)["acierto_equipo"] == 1.0
    assert medir(bien, datos)["recall"] == 1.0


def test_un_jugador_que_no_se_detecto_baja_el_recall():
    verdad = [([0, 0, 10, 20], "Propio"), ([30, 0, 40, 20], "Rival")]
    analisis, datos = _con_verdad([([0, 0, 10, 20], "Propio")], verdad)
    m = medir(analisis, datos)
    assert m["recall"] == 0.5 and m["faltantes"] == 1
    assert m["precision"] == 1.0        # lo que marcó, lo marcó bien


def test_un_arbitro_detectado_no_cuenta_como_jugador_encontrado():
    """
    El recuadro está bien puesto —ahí hay una persona— pero no es un jugador.
    Aguas abajo entra en la posesión y en el mapa de calor, así que es un
    falso positivo, no un acierto.
    """
    verdad = [([0, 0, 10, 20], "Propio"), ([30, 0, 40, 20], "Arbitro")]
    analisis, datos = _con_verdad([([0, 0, 10, 20], "Propio"),
                                   ([30, 0, 40, 20], "Propio")], verdad)
    m = medir(analisis, datos)
    assert m["jugadores_reales"] == 1
    assert m["recall"] == 1.0
    assert m["precision"] == 0.5 and m["falsos_positivos"] == 1


def test_un_recuadro_donde_nadie_etiqueto_nada_se_avisa():
    """
    Puede ser basura, o puede ser un jugador que esta corrida encontró y la
    revisión no llegó a marcar. Son cosas opuestas y no se distinguen, así que
    se cuenta del lado pesimista y se avisa.
    """
    verdad = [([0, 0, 10, 20], "Propio")]
    analisis, datos = _con_verdad([([0, 0, 10, 20], "Propio"),
                                   ([90, 90, 99, 110], "Rival")], verdad)
    m = medir(analisis, datos)
    assert m["falsos_positivos"] == 1
    assert m["detecciones_sin_etiqueta"] == 1


def test_un_recuadro_corrido_no_cuenta_como_el_mismo_jugador():
    verdad = [([0, 0, 10, 20], "Propio")]
    analisis, datos = _con_verdad([([200, 200, 210, 220], "Propio")], verdad)
    m = medir(analisis, datos)
    assert m["recall"] == 0.0 and m["falsos_positivos"] == 1


def test_si_alguien_conto_mas_de_los_que_dibujo_se_avisa():
    """A un jugador que nadie marcó no se lo puede encontrar: el recall miente."""
    verdad = [([0, 0, 10, 20], "Propio")]
    analisis, datos = _con_verdad([([0, 0, 10, 20], "Propio")], verdad, contados=10)
    assert medir(analisis, datos)["descuadre_conteo"] == 9


def test_las_correcciones_viejas_se_siguen_leyendo_pero_avisan():
    """
    Que sigan sirviendo es importante: son diez minutos de trabajo humano. Que
    avisen también, porque miden una sola corrida y eso no se ve en el número.
    """
    analisis = {"snapshots": [{"t_ms": 0, "posiciones": [
        {"_track_ia": 1, "_bbox": [0, 0, 1, 1], "equipo": "Propio"}]}]}
    viejo = {"formato": 2, "instantes": [{
        "t_ms": 0, "jugadores_reales": 1,
        "correcciones": [{"track_ia": 1, "rol": "Rival"}], "agregados": []}]}
    m = medir(analisis, viejo)
    assert m["instantes"] == 1
    assert not m.get("geometrica")
    assert "NO otra" in m["aviso_formato"]
    assert verdad_de(viejo) == {}


def test_la_matriz_tambien_se_arma_por_geometria():
    verdad = [([0, 0, 10, 20], "Rival"), ([30, 0, 40, 20], "Rival")]
    analisis, datos = _con_verdad([([0, 0, 10, 20], "Propio"),
                                   ([30, 0, 40, 20], "Propio")], verdad)
    mc = matriz_confusion(analisis, datos)
    assert mc["geometrica"] and mc["conteo"]["Propio|Rival"] == 2


# ── Migrar correcciones viejas ─────────────────────────────────────────────
# Diez minutos de trabajo humano por partido no se tiran porque el formato haya
# cambiado. Lo que le falta al formato viejo está en el análisis que se revisó.

from futsal_ia.evaluacion import NoEsElMismoAnalisis, a_formato_3  # noqa: E402

_ANALISIS_REVISADO = {"snapshots": [{"t_ms": 0, "posiciones": [
    {"_track_ia": 1, "_bbox": [0, 0, 10, 20], "equipo": "Propio"},
    {"_track_ia": 2, "_bbox": [30, 0, 40, 20], "equipo": "Propio"},
]}]}
_VIEJAS = {"formato": 2, "instantes": [{
    "t_ms": 0, "jugadores_reales": 3,
    "correcciones": [{"track_ia": 2, "rol": "Rival"}],
    "agregados": [{"bbox": [60, 0, 70, 20], "rol": "Arquero rival"}],
}]}


def test_la_revision_vieja_se_recupera_entera():
    d = a_formato_3(_ANALISIS_REVISADO, _VIEJAS)
    verdad = d["instantes"][0]["verdad"]
    assert len(verdad) == 3
    assert verdad[0] == {"bbox": [0, 0, 10, 20], "rol": "Propio"}   # sin corregir
    assert verdad[1] == {"bbox": [30, 0, 40, 20], "rol": "Rival"}   # corregido
    assert verdad[2] == {"bbox": [60, 0, 70, 20], "rol": "Arquero rival"}  # a mano


def test_lo_migrado_mide_igual_que_lo_original():
    """Si la conversión cambiara los números, no sería una conversión."""
    antes = medir(_ANALISIS_REVISADO, _VIEJAS)
    despues = medir(_ANALISIS_REVISADO, a_formato_3(_ANALISIS_REVISADO, _VIEJAS))
    for k in ("jugadores_reales", "detectados", "recall", "acierto_equipo"):
        assert antes[k] == despues[k], k


def test_migrar_con_el_analisis_equivocado_se_niega():
    """
    Con otra corrida, cada número de track apunta a otra persona y saldría una
    verdad inventada. Eso es peor que no tener ninguna: se ve igual de bien.
    """
    otro = {"snapshots": [{"t_ms": 0, "posiciones": [
        {"_track_ia": 77, "_bbox": [0, 0, 10, 20], "equipo": "Propio"}]}]}
    with pytest.raises(NoEsElMismoAnalisis, match="otra corrida"):
        a_formato_3(otro, _VIEJAS)


def test_migrar_algo_que_ya_esta_migrado_no_hace_nada():
    ya = {"formato": 3, "instantes": [{"t_ms": 0, "jugadores_reales": 1,
                                       "verdad": [{"bbox": [0, 0, 1, 1], "rol": "Propio"}]}]}
    assert a_formato_3(_ANALISIS_REVISADO, ya) is ya


def test_un_analisis_de_otro_partido_se_niega():
    with pytest.raises(NoEsElMismoAnalisis, match="Ninguno"):
        a_formato_3({"snapshots": [{"t_ms": 999999, "posiciones": []}]}, _VIEJAS)


def test_el_indice_de_la_revision_sirve_igual_que_el_analisis():
    """
    Y es la fuente correcta: es el registro de lo que la persona miró, no una
    corrida que puede o no ser la misma.
    """
    indice = {"periodo": "PT", "instantes": [
        {"t_ms": 0, "imagen": "c.jpg", "posiciones":
         _ANALISIS_REVISADO["snapshots"][0]["posiciones"]}]}
    assert (a_formato_3(indice, _VIEJAS)["instantes"][0]["verdad"]
            == a_formato_3(_ANALISIS_REVISADO, _VIEJAS)["instantes"][0]["verdad"])
