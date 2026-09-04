"""
Decidir qué grupo de color es cada equipo, con evidencia en vez de a ojo.

El paso de "quién es quién" pide mirar siete recortes en el panel y elegir un
rol para cada uno. Es un click por grupo y suena trivial, pero es el punto del
pipeline donde un error cuesta más: si un grupo queda sin asignar, TODAS sus
detecciones salen como Desconocido, y si queda con el rol equivocado, salen
mal con cara de estar bien. Aguas abajo eso no se nota: la posesión, los pases
y el mapa de calor se calculan igual, con los equipos cambiados.

En el primer partido real pasó exactamente eso: de 164 detecciones revisadas,
66 cayeron en grupos sin asignar y la IA nunca dijo "Rival" ni una vez, con 43
rivales en cancha. El acierto de equipo dio 50%, y el mensaje automático
mandaba a mirar la iluminación. La iluminación estaba bien.

Lo que hay acá es la alternativa: en vez de adivinar mirando siete recortes,
usar las doscientas cajas que una persona ya etiquetó en la revisión. Por cada
una se saca el color del torso —con la MISMA función que usó el análisis—, se
busca a qué grupo pertenece, y se vota. Un grupo con 58 rivales y 3 árbitros es
el grupo del rival, y no hace falta que nadie lo mire.

De paso, la votación dice algo que el ojo no puede: cuán PURO es cada grupo. Un
grupo mitad propio y mitad rival no es un grupo mal asignado, es un color que
no separa, y eso no se arregla asignando: se arregla con más grupos, con otra
iluminación, o entrenando.

No hace falta volver a analizar el video: los cuadros de la revisión ya están
en disco, recortados igual que los que vio el pipeline.
"""

from __future__ import annotations

from pathlib import Path

from .equipos import (DESCONOCIDO, ROLES, ClasificadorEquipos,
                      color_de_torso)

# Debajo de esto la votación no significa nada: con tres muestras, dos votos
# de un lado son el 67% y no dicen nada.
MUESTRAS_MINIMAS = 5

# Debajo de esto el grupo está mezclado. Asignarlo igual sería elegir a cuál de
# los dos equipos perjudicar.
PUREZA_MINIMA = 0.65

SIN_COLOR = "sin color legible"


def muestras_de_revision(indice: dict, correcciones: dict) -> list[dict]:
    """
    Todas las cajas que una persona dio por buenas, con su rol verdadero.

    Dos fuentes, las dos válidas: los recuadros que la IA marcó y nadie
    desmintió o que alguien corrigió, y los que una persona dibujó a mano
    porque la IA no los vio. Los segundos son los más valiosos: son justamente
    los jugadores que hoy no entran en ninguna cuenta.

    Quedan afuera los "Desconocido" (nadie dijo qué eran), la pelota y lo que
    no es una persona: ninguno tiene un torso del que sacar un color de equipo.
    """
    por_t = {int(i["t_ms"]): i for i in indice.get("instantes", [])}
    salida = []
    for r in correcciones.get("instantes", []):
        inst = por_t.get(int(r["t_ms"]))
        if inst is None:
            continue
        if r.get("verdad") is not None:
            # Formato 3: la verdad ya viene como cajas etiquetadas.
            cajas = [(v["bbox"], v.get("rol", "Desconocido")) for v in r["verdad"]]
        else:
            corregido = {c["track_ia"]: c["rol"] for c in r.get("correcciones", [])}
            cajas = []
            for p in inst.get("posiciones", []):
                if not p.get("_bbox"):
                    continue
                rol = corregido.get(p.get("_track_ia"), p.get("equipo", "Desconocido"))
                cajas.append((p["_bbox"], rol))
            for a in r.get("agregados", []):
                cajas.append((a["bbox"], a.get("rol", "Desconocido")))
        for bbox, rol in cajas:
            # ROLES son los cinco que tienen camiseta: los dos equipos, los dos
            # arqueros y el árbitro. "Desconocido" también está en ROLES y es
            # el que hay que sacar: es la ausencia de respuesta.
            if rol not in ROLES or rol == "Desconocido":
                continue
            salida.append({"t_ms": int(r["t_ms"]), "imagen": inst["imagen"],
                           "bbox": bbox, "rol": rol})
    return salida


def colorear(muestras: list[dict], carpeta) -> tuple[list[dict], int]:
    """
    Le pone a cada muestra el color de su torso, leyéndolo del JPG.

    Es la misma `color_de_torso` que usa el análisis, sobre el mismo recorte:
    los cuadros de la revisión salen ya encuadrados. Lo único distinto es el
    JPEG de por medio, que corre los colores un poco; a la escala a la que
    trabaja el agrupamiento —camisetas de colores distintos— no alcanza para
    cambiar de grupo, y si alcanzara se vería como grupos impuros en el
    informe.
    """
    import cv2

    carpeta = Path(carpeta)
    cache: dict[str, object] = {}
    con_color, sin_color = [], 0
    for m in muestras:
        img = cache.get(m["imagen"])
        if img is None:
            img = cv2.imread(str(carpeta / m["imagen"]))
            if img is None:
                sin_color += 1
                continue
            cache[m["imagen"]] = img
        x1, y1, x2, y2 = (int(round(v)) for v in m["bbox"])
        alto, ancho = img.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(ancho, x2), min(alto, y2)
        color = color_de_torso(img[y1:y2, x1:x2]) if x2 > x1 and y2 > y1 else None
        if color is None:
            sin_color += 1
            continue
        con_color.append({**m, "color": color})
    return con_color, sin_color


def votar(clas: ClasificadorEquipos, muestras: list[dict]) -> dict:
    """
    Por cada grupo de color, qué resultó ser en la cancha.

    La propuesta es la mayoría, pero solo cuando la mayoría manda de verdad:
    con pocas muestras, o con un grupo partido entre dos equipos, se devuelve
    sin propuesta y con el motivo. Un grupo mal asignado es peor que un grupo
    sin asignar, porque el sin asignar por lo menos se nota.
    """
    grupos: dict[int, dict[str, int]] = {}
    for m in muestras:
        g = clas.grupo_de(m["color"])
        grupos.setdefault(g, {})
        grupos[g][m["rol"]] = grupos[g].get(m["rol"], 0) + 1

    salida = []
    for g in range(len(clas.centros)):
        votos = grupos.get(g, {})
        total = sum(votos.values())
        fila = {"grupo": g, "muestras": total, "votos": votos,
                "propuesta": None, "pureza": 0.0, "motivo": "",
                "actual": clas.equipo_por_grupo.get(g, "Desconocido")}
        if not total:
            fila["motivo"] = "ninguna muestra cayó en este grupo"
        else:
            rol, n = max(votos.items(), key=lambda x: x[1])
            fila["pureza"] = n / total
            if total < MUESTRAS_MINIMAS:
                fila["motivo"] = f"solo {total} muestras, no alcanza para decidir"
            elif fila["pureza"] < PUREZA_MINIMA:
                fila["motivo"] = "grupo mezclado: el color no separa acá"
            else:
                fila["propuesta"] = rol
        salida.append(fila)
    return {"grupos": salida, "muestras": len(muestras)}


def aplicar(clas: ClasificadorEquipos, votacion: dict) -> ClasificadorEquipos:
    """
    Deja el clasificador con lo que dijo la votación.

    La regla es: se toca un grupo solo donde hay EVIDENCIA, y en los dos
    sentidos.

      · Con mayoría clara -> ese rol.
      · Mezclado -> Desconocido, aunque tuviera un rol puesto a mano. Acá sí
        hay evidencia, y dice que el color no separa: cualquier rol que se le
        ponga se lo está poniendo también a jugadores del otro equipo. Un
        Desconocido se nota en la próxima medición; un rol inventado no se
        nota nunca.
      · Sin muestras, o con muy pocas -> no se toca. No hay evidencia de nada,
        y lo que haya puesto una persona mirando los recortes vale más que una
        votación de tres votos.
    """
    nuevo = clas
    for fila in votacion["grupos"]:
        if fila["propuesta"]:
            nuevo = nuevo.asignar(fila["grupo"], fila["propuesta"])
        elif "mezclado" in fila["motivo"]:
            nuevo = nuevo.asignar(fila["grupo"], DESCONOCIDO)
    return nuevo


def avisos(votacion: dict) -> list[str]:
    """
    Lo que hay que saber antes de dar por bueno el resultado.

    El aviso que más importa es el de un rol sin ningún grupo: es el error que
    tuvo el primer partido real y no se ve por ningún lado hasta que alguien
    mide, porque el análisis corre igual y devuelve números con cara de
    seriedad.
    """
    asignados = {f["propuesta"] for f in votacion["grupos"] if f["propuesta"]}
    dichos = []

    for rol in ("Propio", "Rival"):
        if rol not in asignados:
            dichos.append(
                f"NINGÚN grupo de color quedó como {rol}. Todas esas camisetas "
                "van a salir como Desconocido, y sin equipo no hay posesión ni "
                "pases ni nada. Si el equipo está en cancha, o hay pocos grupos "
                "para tantos colores, o falta revisar más instantes.")
    for rol in ("Arquero propio", "Arquero rival"):
        if rol not in asignados:
            dichos.append(
                f"Sin grupo para {rol}. En futsal el arquero es uno de los "
                "cinco en cancha: si sale como Desconocido, falta un jugador "
                "en cada cuenta.")

    mezclados = [f for f in votacion["grupos"] if "mezclado" in f["motivo"]]
    if mezclados:
        cual = ", ".join(str(f["grupo"]) for f in mezclados)
        dichos.append(
            f"Grupo(s) {cual} mezclados: adentro hay jugadores de más de un "
            "equipo. Eso no se arregla asignando —habría que elegir a cuál "
            "perjudicar—. Se arregla con más grupos de color (`--grupos` al "
            "detectar equipos), o son dos equipos que visten parecido y ahí "
            "hace falta entrenar.")

    flacos = [f for f in votacion["grupos"]
              if f["muestras"] and not f["propuesta"] and "no alcanza" in f["motivo"]]
    if flacos:
        dichos.append(
            f"{len(flacos)} grupo(s) con muy pocas muestras quedaron sin tocar. "
            "Revisá más instantes si te importa ese color.")
    return dichos


# ── Medir si el color alcanza ──────────────────────────────────────────────

def _por_instante(muestras: list[dict], pliegues: int) -> list[list[int]]:
    """
    Reparte los instantes, no las muestras.

    Importa mucho y es fácil de hacer mal. Dos jugadores del mismo cuadro no
    son dos ejemplos independientes: es la misma luz, el mismo cuadro, a veces
    el mismo jugador. Si un instante quedara partido entre entrenamiento y
    prueba, el número saldría alto porque el modelo ya vio ese momento, y no
    diría nada sobre el resto del partido.
    """
    instantes = sorted({m.get("t_ms", 0) for m in muestras})
    grupos = [instantes[i::pliegues] for i in range(pliegues)]
    return [[i for i, m in enumerate(muestras) if m.get("t_ms", 0) in set(g)]
            for g in grupos if g]


def validar(muestras: list[dict], espacio: str = "bgr", por_rol: int = 2,
            grupos_kmeans: int = 7, pliegues: int = 5) -> dict:
    """
    Cuánto se le puede sacar al color, en ese espacio, con cada método.

    Devuelve dos números que responden preguntas distintas:

      · `agrupado` es el techo del método de hoy: agrupar a ciegas y ponerle a
        cada grupo el rol que más aparece. Le damos la asignación PERFECTA, que
        es mejor de lo que puede hacer una persona mirando recortes. Si este
        número es bajo, ningún click lo arregla.
      · `supervisado` es lo que se saca usando las etiquetas para armar los
        grupos. Si este también es bajo, el color no alcanza y punto: hay que
        ir por otro lado (más resolución sobre el jugador, o entrenar el
        detector para que distinga equipos por algo más que la camiseta).
    """
    import numpy as np

    from .color import a_espacio
    from .equipos import _kmeans, entrenar_supervisado

    partes = _por_instante(muestras, pliegues)
    if len(partes) < 2:
        return {"espacio": espacio, "muestras": len(muestras),
                "aviso": "hacen falta al menos dos instantes distintos"}

    acierto_sup = acierto_km = total = 0
    por_rol_ok: dict[str, list[int]] = {}

    for prueba in partes:
        idx_prueba = set(prueba)
        entrena = [m for i, m in enumerate(muestras) if i not in idx_prueba]
        evalua = [muestras[i] for i in prueba]
        if not entrena or not evalua:
            continue

        clas = entrenar_supervisado(entrena, espacio=espacio, por_rol=por_rol)
        for m in evalua:
            ok = clas.clasificar(m["color"]) == m["rol"]
            acierto_sup += ok
            r = por_rol_ok.setdefault(m["rol"], [0, 0])
            r[0] += ok
            r[1] += 1

        # El techo del método de hoy, con la asignación regalada.
        datos = a_espacio(np.array([m["color"] for m in entrena], dtype=np.float64),
                          espacio)
        k = min(grupos_kmeans, len(datos))
        centros, etiquetas = _kmeans(datos, k)
        mayoria: dict[int, str] = {}
        for g in range(len(centros)):
            votos: dict[str, int] = {}
            for m, e in zip(entrena, etiquetas):
                if e == g:
                    votos[m["rol"]] = votos.get(m["rol"], 0) + 1
            if votos:
                mayoria[g] = max(votos.items(), key=lambda x: x[1])[0]
        for m in evalua:
            v = a_espacio(np.asarray(m["color"], dtype=np.float64), espacio)
            g = int(((centros - v) ** 2).sum(axis=1).argmin())
            acierto_km += mayoria.get(g) == m["rol"]
        total += len(evalua)

    if not total:
        return {"espacio": espacio, "muestras": len(muestras),
                "aviso": "no se pudo armar ninguna partición"}
    return {
        "espacio": espacio,
        "muestras": total,
        "supervisado": acierto_sup / total,
        "agrupado": acierto_km / total,
        "por_rol": {r: {"acierto": ok / n, "muestras": n}
                    for r, (ok, n) in sorted(por_rol_ok.items())},
    }
