"""
Medir qué tan bien anda el análisis, contra lo que dice una persona.

Este módulo es la pieza que faltaba para poder mejorar algo con criterio.
Hasta acá veníamos mirando cuadros sueltos y opinando: "parece que falta uno",
"me parece que está mejor". Con eso no se puede decidir si subir un umbral
ayuda o arruina, ni si entrenar el detector valió la pena, porque no hay contra
qué comparar.

La idea es la más simple que funciona. Se eligen unos pocos instantes del
análisis, una persona mira cada uno y dice qué ve. De ahí salen tres números
que son los que importan:

  · Cuántos jugadores encontró de los que había          (recall)
  · Cuántos de los que marcó eran realmente jugadores    (precisión)
  · Cuántos tenían bien el equipo                        (acierto de equipo)

No hace falta anotar el partido entero: veinte instantes bien elegidos alcanzan
para saber en qué estamos. Y esas mismas correcciones sirven después como
material de entrenamiento del detector, así que el trabajo no se tira.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RevisionInstante:
    """Lo que una persona dijo sobre un instante del análisis."""

    t_ms: int
    jugadores_reales: int
    """Cuántas personas HAY en cancha en ese momento, contadas a ojo."""

    falsos: list = field(default_factory=list)
    """Track ids que la IA marcó y no son jugadores en cancha."""

    equipo_mal: list = field(default_factory=list)
    """Track ids a los que les asignó el equipo equivocado."""

    faltantes: int = 0
    """Jugadores que estaban y no marcó. Se cuentan, no se ubican."""


NO_PERSONA = "No es persona"
PELOTA = "Pelota"
ARBITRO = "Arbitro"
DESCONOCIDO = "Desconocido"

# Los diez que están en cancha: ocho de campo y dos arqueros. Tiene que ser
# igual a `overlay.JUGADORES`; hay un test que lo verifica.
JUGADORES = ("Propio", "Rival", "Arquero propio", "Arquero rival")


def es_jugador(rol: str) -> bool:
    """
    El árbitro NO es un jugador, y esto no es una sutileza de vocabulario.

    Antes solo quedaban afuera "No es persona" y la pelota, así que un árbitro
    bien marcado por una persona contaba dos veces mal: sumaba como jugador
    encontrado (inflando el recall) y como equipo equivocado (hundiendo el
    acierto de equipo). Y encima mandaba a mirar el lugar equivocado: el
    mensaje decía "revisá los grupos de color" cuando lo que hay que hacer con
    un árbitro es filtrarlo, no pintarlo de otro color.

    Aguas abajo, cada detección que sobrevive se convierte en una posición y
    entra en la posesión y en el mapa de calor. Un árbitro ahí adentro es un
    error, no un detalle.
    """
    return rol in JUGADORES


def desde_json(datos: dict) -> list[RevisionInstante]:
    """
    Lee un correcciones.json, en cualquiera de los dos formatos.

    El formato 1 solo guardaba conteos y listas de ids. El 2 guarda, por cada
    recuadro corregido, QUÉ era en realidad, y las cajas que la persona dibujó
    para lo que la IA no vio. Eso es lo que lo vuelve material de entrenamiento
    y no solo un contador de errores.

    Las métricas salen igual de los dos, así que las mediciones viejas se
    siguen pudiendo comparar contra las nuevas.
    """
    salida = []
    for r in datos.get("instantes", []):
        if "correcciones" in r or "agregados" in r:
            correcciones = r.get("correcciones", [])
            # Un recuadro corregido a "No es persona" es un falso positivo.
            # Corregido a otro rol, la detección estaba bien y el error fue de
            # equipo: son cosas distintas y se arreglan distinto.
            falsos = [c["track_ia"] for c in correcciones
                      if not es_jugador(c.get("rol", ""))]
            equipo_mal = [c["track_ia"] for c in correcciones
                          if es_jugador(c.get("rol", ""))]
            # Ni la pelota ni el árbitro son jugadores en cancha.
            faltantes = sum(1 for a in r.get("agregados", [])
                            if es_jugador(a.get("rol", "")))
        else:
            falsos = r.get("falsos", [])
            equipo_mal = r.get("equipo_mal", [])
            faltantes = int(r.get("faltantes", 0))
        salida.append(RevisionInstante(
            t_ms=int(r["t_ms"]),
            jugadores_reales=int(r["jugadores_reales"]),
            falsos=falsos, equipo_mal=equipo_mal, faltantes=faltantes,
        ))
    return salida


def cajas_etiquetadas(datos: dict, analisis: dict) -> list[dict]:
    """
    Todas las cajas confirmadas por una persona, listas para entrenar.

    Junta las que la IA marcó y nadie desmintió, con el rol corregido cuando lo
    hubo, más las que la persona dibujó a mano. Las marcadas como "No es
    persona" quedan afuera: enseñarle al detector que ahí hay alguien sería
    justamente el error que queremos sacarle.

    Todavía no hay un comando de entrenamiento —primero hay que medir si hace
    falta— pero el trabajo de revisar ya queda en la forma que ese paso pide.
    """
    por_t = {int(s["t_ms"]): s for s in analisis.get("snapshots", [])}
    salida = []
    for r in datos.get("instantes", []):
        snap = por_t.get(int(r["t_ms"]))
        if snap is None:
            continue
        corregido = {c["track_ia"]: c["rol"] for c in r.get("correcciones", [])}
        cajas = []
        for p in snap.get("posiciones", []):
            if not p.get("_bbox"):
                continue
            rol = corregido.get(p.get("_track_ia"), p.get("equipo", "Desconocido"))
            if rol == NO_PERSONA:
                continue
            cajas.append({"bbox": p["_bbox"], "rol": rol, "origen": "ia"})
        for a in r.get("agregados", []):
            cajas.append({"bbox": a["bbox"], "rol": a["rol"], "origen": "humano"})
        if cajas:
            salida.append({"t_ms": int(r["t_ms"]), "cajas": cajas})
    return salida


# El orden en que se muestran las etiquetas. Fijo, para que dos corridas se
# puedan comparar mirando y no haya que leer los encabezados cada vez.
ORDEN = ("Propio", "Rival", "Arquero propio", "Arquero rival",
         "Arbitro", "Desconocido", "Pelota", NO_PERSONA)


def _orden(etiquetas) -> list[str]:
    conocidas = [e for e in ORDEN if e in etiquetas]
    return conocidas + sorted(e for e in etiquetas if e not in ORDEN)


def matriz_confusion(analisis: dict, datos: dict) -> dict:
    """
    Qué dijo la IA contra qué era en realidad, celda por celda.

    Existe porque "le pega al equipo el 49% de las veces" no se puede accionar.
    Un 49% puede ser cualquiera de estas cosas, y cada una se arregla en un
    lugar distinto:

      · los dos equipos cambiados entre sí     -> una línea en equipos.json
      · los arqueros contados como de campo    -> falta asignar ese grupo
      · casi todo en Desconocido               -> el color no separa
      · un solo equipo mal                     -> un grupo asignado al revés

    Con la matriz, mirando dónde se juntan los números se ve cuál de las cuatro
    es. Sin la matriz, el mismo número manda a probar las cuatro.
    """
    por_t = {int(s["t_ms"]): s for s in analisis.get("snapshots", [])}
    conteo: dict[tuple[str, str], int] = {}
    no_vistas: dict[str, int] = {}

    for r in datos.get("instantes", []):
        snap = por_t.get(int(r["t_ms"]))
        if snap is None:
            continue
        corregido = {c["track_ia"]: c["rol"] for c in r.get("correcciones", [])}
        for pos in snap.get("posiciones", []):
            if not pos.get("_bbox"):
                continue
            dijo = pos.get("equipo") or DESCONOCIDO
            # Sin corrección, la persona lo dio por bueno: era lo que decía.
            era = corregido.get(pos.get("_track_ia"), dijo)
            conteo[(dijo, era)] = conteo.get((dijo, era), 0) + 1
        for a in r.get("agregados", []):
            rol = a.get("rol", DESCONOCIDO)
            no_vistas[rol] = no_vistas.get(rol, 0) + 1

    filas = _orden({d for d, _ in conteo})
    columnas = _orden({e for _, e in conteo})
    return {
        "filas": filas, "columnas": columnas,
        "conteo": {f"{d}|{e}": n for (d, e), n in conteo.items()},
        "no_vistas": no_vistas,
        "total": sum(conteo.values()),
        "diagnostico": _diagnostico_confusion(conteo),
    }


def _diagnostico_confusion(conteo: dict[tuple[str, str], int]) -> list[str]:
    """
    Los cuatro patrones que explican casi todos los errores de equipo, con el
    arreglo de cada uno. Se nombran solo cuando pesan de verdad.
    """
    total = sum(conteo.values())
    errados = sum(n for (d, e), n in conteo.items() if d != e)
    if not total or not errados:
        return []

    def peso(pares) -> int:
        return sum(conteo.get(par, 0) for par in pares)

    dichos = []
    cruzado = peso([("Propio", "Rival"), ("Rival", "Propio")])
    if cruzado >= 0.4 * errados:
        de_ida, de_vuelta = conteo.get(("Propio", "Rival"), 0), conteo.get(("Rival", "Propio"), 0)
        if min(de_ida, de_vuelta) >= 0.3 * cruzado:
            dichos.append(
                f"LOS EQUIPOS ESTÁN AL REVÉS ({cruzado} de {errados} errores "
                "son propio<->rival en los dos sentidos). Se arregla cambiando "
                "qué grupo de color es cuál, en el panel o en equipos.json. Es "
                "el arreglo más barato que hay: no hay que volver a analizar "
                "nada, solo reasignar y correr de nuevo.")
        else:
            dichos.append(
                f"Un equipo se está comiendo al otro ({de_ida} propio->rival, "
                f"{de_vuelta} rival->propio). Suele ser un grupo de color "
                "asignado al equipo equivocado, o dos grupos del mismo equipo "
                "con uno solo asignado.")

    arqueros = peso([(d, e) for (d, e) in conteo
                     if e.startswith("Arquero") and not d.startswith("Arquero")])
    if arqueros >= 0.2 * errados:
        dichos.append(
            f"{arqueros} de {errados} errores son arqueros contados como "
            "jugadores de campo. En futsal el arquero viste distinto a "
            "propósito: casi seguro tiene su propio grupo de color sin "
            "asignar, o quedó pegado al grupo de su equipo. Revisá los "
            "recortes de cada grupo en el panel.")

    desconocido = sum(n for (d, e), n in conteo.items()
                      if d == DESCONOCIDO and e != DESCONOCIDO)
    if desconocido >= 0.25 * errados:
        dichos.append(
            f"{desconocido} de {errados} errores son gente que la IA dejó en "
            "Desconocido. No es que se equivoque de equipo: no se anima. O el "
            "color no separa (iluminación, camisetas parecidas) o hay grupos "
            "sin asignar.")

    arbitros = sum(n for (d, e), n in conteo.items()
                   if e == ARBITRO and d != ARBITRO)
    if arbitros >= 0.15 * errados:
        dichos.append(
            f"{arbitros} árbitros están entrando como jugadores. Eso ensucia "
            "la posesión y el mapa de calor. Se saca con `cli excluir` si "
            "están siempre en la misma zona, o asignando su grupo de color.")
    return dichos


def evaluar(analisis: dict, revisiones: list[RevisionInstante]) -> dict:
    """
    Cruza el análisis con lo que dijo la persona y saca los números.

    `analisis` es el JSON que escribe el pipeline. De cada instante revisado se
    busca el snapshot correspondiente y se compara.
    """
    snaps = {int(s["t_ms"]): s for s in analisis.get("snapshots", [])}
    if not revisiones:
        return {"instantes": 0, "aviso": "No hay ningún instante revisado."}

    total_reales = total_detectados = total_falsos = 0
    total_equipo_mal = total_faltantes = 0
    sin_snapshot = []

    for r in revisiones:
        snap = snaps.get(int(r.t_ms))
        if snap is None:
            sin_snapshot.append(r.t_ms)
            continue
        detectados = len(snap.get("posiciones", []))
        total_detectados += detectados
        total_reales += r.jugadores_reales
        total_falsos += len(r.falsos)
        total_equipo_mal += len(r.equipo_mal)
        total_faltantes += r.faltantes

    revisados = len(revisiones) - len(sin_snapshot)
    if not revisados:
        return {"instantes": 0,
                "aviso": "Ninguno de los instantes revisados existe en el análisis."}

    aciertos = total_detectados - total_falsos
    # Recall: de los jugadores que HABÍA, cuántos encontró. Es el número que más
    # importa: un jugador que no se detectó no lo recupera nadie después,
    # mientras que un falso positivo se puede filtrar.
    recall = aciertos / total_reales if total_reales else 0.0
    precision = aciertos / total_detectados if total_detectados else 0.0
    equipo_ok = (aciertos - total_equipo_mal) / aciertos if aciertos else 0.0

    return {
        "instantes": revisados,
        "jugadores_reales": total_reales,
        "detectados": total_detectados,
        "falsos_positivos": total_falsos,
        "faltantes": total_faltantes,
        "equipo_equivocado": total_equipo_mal,
        "recall": round(recall, 3),
        "precision": round(precision, 3),
        "acierto_equipo": round(equipo_ok, 3),
        "instantes_sin_snapshot": sin_snapshot,
    }


def veredicto(m: dict) -> list[str]:
    """
    Traduce los números a qué conviene tocar. Sin esto, un recall de 0.72 no
    le dice nada a nadie.
    """
    if not m.get("instantes"):
        return [m.get("aviso", "Sin datos.")]

    dichos = []
    r, p, e = m["recall"], m["precision"], m["acierto_equipo"]

    if r >= 0.9:
        dichos.append(f"Encuentra al {r:.0%} de los jugadores. Está bien.")
    elif r >= 0.75:
        dichos.append(
            f"Encuentra al {r:.0%}: se le escapa uno de cada cuatro. Probá "
            "--mosaicos, que parte el cuadro para ver mejor a los del fondo, y "
            "bajar --conf.")
    else:
        dichos.append(
            f"Encuentra solo al {r:.0%}. Con eso no se puede sacar ninguna "
            "conclusión de equipo. Antes de tocar nada más, hay que subir esto: "
            "--mosaicos, --conf más bajo, y si no alcanza, entrenar el detector "
            "con material propio.")

    if p < 0.9:
        dichos.append(
            f"De lo que marca, el {1 - p:.0%} no son jugadores. Suele ser gente "
            "fuera de la cancha: revisá las zonas excluidas con `cli excluir`.")

    if e < 0.85:
        dichos.append(
            f"Le pega al equipo el {e:.0%} de las veces. Mirá la matriz de acá "
            "abajo antes de tocar nada: dice si los equipos están cambiados "
            "entre sí, si son los arqueros, o si el color no separa. Cada una "
            "se arregla en un lugar distinto.")

    if m["instantes"] < 10:
        dichos.append(
            f"Ojo: son solo {m['instantes']} instantes revisados. Los números "
            "van a moverse bastante hasta llegar a unos veinte.")
    return dichos


def comparar(antes: dict, despues: dict) -> dict:
    """
    Dos mediciones, para saber si un cambio mejoró o empeoró.

    Es todo el punto de medir. Sin esto, cada ajuste es una corazonada y se
    acumulan cambios que nadie sabe si suman.
    """
    salida = {}
    for clave in ("recall", "precision", "acierto_equipo"):
        a, d = antes.get(clave), despues.get(clave)
        if a is None or d is None:
            continue
        salida[clave] = {"antes": a, "despues": d, "delta": round(d - a, 3)}
    peor = [k for k, v in salida.items() if v["delta"] < -0.02]
    salida["veredicto"] = (
        "Empeoró en " + ", ".join(peor) if peor
        else "Mejoró o quedó igual en todo." if salida else "Nada que comparar.")
    return salida
