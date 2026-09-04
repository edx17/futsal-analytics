"""
Qué tan bien sostiene el seguimiento la identidad de un jugador.

Es lo único de todo el pipeline que nunca se midió, y es de lo que dependen el
mapa de calor, el tiempo por jugador y cualquier lectura de "qué hizo el equipo
antes del gol". Hasta acá el resumen decía "23 recorridos, 47 s de promedio", y
eso no dice si esos recorridos son personas o pedazos de personas.

Lo que hay acá NO necesita que nadie etiquete nada. Sale del análisis que ya
está en disco, y aprovecha algo que en futsal se sabe de antemano: en la cancha
hay diez jugadores, nunca más. Si el análisis devuelve ciento veinte recorridos
para un tiempo, cada jugador viene partido en pedazos, y no hace falta ninguna
verdad anotada para afirmarlo.

Sobre todo: separa las dos formas de fallar, que se arreglan en lugares
distintos y desde afuera se ven iguales.

  · El track SE CORTA. Deja de ver al jugador y arranca uno nuevo. Ensucia los
    conteos y obliga a re-identificar, pero no inventa datos falsos.
  · El track SE CAMBIA de persona. Sigue vivo, pero ahora está siguiendo a
    otro. Esto es peor: el mapa de calor de un jugador queda con los metros de
    otro, y no se nota mirando.

El primero se detecta contando. El segundo, sin verdad anotada, no se puede
medir directo; lo que sí se puede es contar los momentos donde es POSIBLE —dos
jugadores del mismo equipo a menos de un metro— que es donde se produce.
"""

from __future__ import annotations

import math

from .cancha import norm_a_metros

# Dos jugadores más cerca que esto, en metros, son un solo bulto para el
# detector y una moneda al aire para la asociación.
CERCA_M = 1.5

# Un track que nace cerca de donde murió otro, poco después, es casi seguro el
# mismo jugador: es un corte, no una persona nueva.
RELEVO_M = 3.0
RELEVO_MS = 2000.0


def _posiciones(analisis: dict) -> list[tuple[float, list[dict]]]:
    salida = []
    for s in analisis.get("snapshots", []):
        gente = []
        for p in s.get("posiciones", []):
            if p.get("x") is None or p.get("y") is None:
                continue
            x_m, y_m = norm_a_metros(float(p["x"]), float(p["y"]))
            gente.append({"track": p.get("_track_ia"), "x": x_m, "y": y_m,
                          "equipo": p.get("equipo", "Desconocido")})
        salida.append((float(s["t_ms"]), gente))
    salida.sort(key=lambda x: x[0])
    return salida


def diagnosticar(analisis: dict, max_en_cancha: int = 10) -> dict:
    """Todo lo que se puede saber del seguimiento sin etiquetar nada."""
    marcos = _posiciones(analisis)
    if not marcos:
        return {"aviso": "El análisis no tiene snapshots con posiciones."}

    vida: dict[int, dict] = {}
    a_la_vez, cruces, detecciones = [], 0, 0
    for t_ms, gente in marcos:
        a_la_vez.append(len(gente))
        detecciones += len(gente)
        for g in gente:
            tid = g["track"]
            if tid is None:
                continue
            v = vida.get(tid)
            if v is None:
                vida[tid] = {"desde": t_ms, "hasta": t_ms, "vistas": 1,
                             "x0": g["x"], "y0": g["y"],
                             "x1": g["x"], "y1": g["y"],
                             "equipos": {g["equipo"]: 1}}
            else:
                v["hasta"] = t_ms
                v["vistas"] += 1
                v["x1"], v["y1"] = g["x"], g["y"]
                v["equipos"][g["equipo"]] = v["equipos"].get(g["equipo"], 0) + 1
        # Momentos donde una confusión de identidad es posible: dos del MISMO
        # equipo pegados. Entre equipos distintos el color todavía puede
        # salvarlo; dentro del mismo equipo no hay nada que los distinga.
        for i in range(len(gente)):
            for j in range(i + 1, len(gente)):
                if gente[i]["equipo"] != gente[j]["equipo"]:
                    continue
                if math.hypot(gente[i]["x"] - gente[j]["x"],
                              gente[i]["y"] - gente[j]["y"]) < CERCA_M:
                    cruces += 1

    duraciones = sorted((v["hasta"] - v["desde"]) / 1000.0 for v in vida.values())
    n = len(duraciones)
    minutos = (marcos[-1][0] - marcos[0][0]) / 60000.0 or 1e-9
    mediana_en_cancha = sorted(a_la_vez)[len(a_la_vez) // 2] if a_la_vez else 0

    # Cortes: un track muere y aparece otro cerca, poco después. Es el mismo
    # jugador con un número nuevo.
    muertes = sorted(((v["hasta"], v["x1"], v["y1"], tid) for tid, v in vida.items()))
    nacimientos = sorted(((v["desde"], v["x0"], v["y0"], tid) for tid, v in vida.items()))
    relevos = 0
    for t_n, x_n, y_n, tid_n in nacimientos:
        for t_m, x_m, y_m, tid_m in muertes:
            if tid_m == tid_n or not (0 <= t_n - t_m <= RELEVO_MS):
                continue
            if math.hypot(x_n - x_m, y_n - y_m) <= RELEVO_M:
                relevos += 1
                break

    # Un track cuyo equipo baila es sospechoso: o el clasificador es inestable,
    # o el track se cambió de persona.
    inestables = sum(1 for v in vida.values()
                     if len(v["equipos"]) > 1
                     and max(v["equipos"].values()) < 0.8 * sum(v["equipos"].values()))

    return {
        "tracks": n,
        "minutos": round(minutos, 1),
        "detecciones": detecciones,
        "gente_en_cancha_mediana": mediana_en_cancha,
        "gente_en_cancha_max": max(a_la_vez) if a_la_vez else 0,
        "max_esperado": max_en_cancha,
        "fragmentos_por_jugador": round(n / max(mediana_en_cancha, 1), 1),
        "duracion_mediana_s": round(duraciones[n // 2], 1) if n else 0.0,
        "duracion_p90_s": round(duraciones[int(n * 0.9)], 1) if n else 0.0,
        "tracks_de_menos_de_1s": sum(1 for d in duraciones if d < 1.0),
        "relevos": relevos,
        "cruces_mismo_equipo": cruces,
        "cruces_por_minuto": round(cruces / minutos, 1),
        "tracks_con_equipo_inestable": inestables,
    }


def veredicto(d: dict, params=None) -> list[str]:
    """Qué significan esos números y qué se hace con cada uno."""
    if d.get("aviso"):
        return [d["aviso"]]

    dichos = []
    frag = d["fragmentos_por_jugador"]
    if frag <= 3:
        dichos.append(
            f"{frag} pedazos por jugador. Está bien: con eso, ponerle nombre a "
            "cada recorrido a mano es cuestión de minutos.")
    elif frag <= 10:
        dichos.append(
            f"{frag} pedazos por jugador. Se puede trabajar, pero identificar a "
            "mano ya son unos cientos de clicks por tiempo.")
    else:
        dichos.append(
            f"{frag} pedazos por jugador. A esta altura un 'recorrido' no es "
            "una persona: es un tramo suelto. Ni el mapa de calor ni el tiempo "
            "por jugador significan nada todavía.")

    if d["tracks_de_menos_de_1s"] > d["tracks"] * 0.4:
        dichos.append(
            f"{d['tracks_de_menos_de_1s']} de {d['tracks']} recorridos duran "
            "menos de un segundo. Eso no es seguimiento, es ruido de detección: "
            "conviene atacar la detección antes que el seguidor.")

    if d["tracks"] and d["relevos"] > d["tracks"] * 0.5:
        dichos.append(
            f"{d['relevos']} de {d['tracks']} recorridos arrancan justo donde "
            "murió otro, segundos antes. O sea que el jugador seguía ahí y el "
            "seguidor lo perdió: es un corte recuperable, no una persona nueva. "
            "Es el caso que la costura tiene que resolver.")

    if d["gente_en_cancha_max"] > d["max_esperado"]:
        dichos.append(
            f"En algún momento hubo {d['gente_en_cancha_max']} personas dentro "
            f"de la cancha, y en futsal son {d['max_esperado']} como máximo. "
            "Está entrando gente que no juega: revisá las zonas excluidas.")

    if d["cruces_por_minuto"] > 20:
        dichos.append(
            f"{d['cruces_por_minuto']} cruces por minuto entre jugadores del "
            "MISMO equipo a menos de metro y medio. Ahí el color no ayuda —"
            "visten igual— y la asociación es una moneda al aire. Es el techo "
            "de lo que se puede sostener sin re-identificar por otra cosa.")

    if d["tracks_con_equipo_inestable"]:
        dichos.append(
            f"{d['tracks_con_equipo_inestable']} recorridos cambian de equipo "
            "a la mitad. O el clasificador de color es inestable, o ese "
            "recorrido se llevó puesto a un jugador del otro equipo.")
    return dichos
