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
            f"Le pega al equipo el {e:.0%} de las veces. Revisá los grupos de "
            "color: puede haber un grupo mezclado marcado como Desconocido, o "
            "un equipo partido en dos grupos y solo uno asignado.")

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
