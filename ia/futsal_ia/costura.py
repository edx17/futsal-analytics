"""
Coser los pedazos de track que son la misma persona.

El problema, medido: dos minutos de partido con diez jugadores en cancha
dieron 166 tracks. O sea unas dieciséis identidades por jugador. Con eso no se
puede hacer nada de lo que importa —el mapa de calor de UN jugador, seguir a
UNO, ver qué hizo el equipo en los diez segundos previos a un gol— porque
ninguna identidad dura lo suficiente.

Por qué se rompen. El seguidor asocia por solapamiento de recuadros entre
cuadros consecutivos. En futsal, en 400 m², los jugadores se cruzan y se tapan
todo el tiempo; cada vez que uno desaparece unos cuadros, su track muere, y
cuando reaparece nace otro con número nuevo. Eso no se arregla afinando el
seguidor: es una limitación de asociar por imagen.

Lo que sí se puede hacer es mirar el resultado COMPLETO y coser. Un track que
termina en un punto y otro que empieza medio segundo después, dos metros más
allá, del mismo equipo, es la misma persona: ninguna otra explicación es
física. Trabajar sobre la cancha en metros —y no sobre la imagen— es lo que lo
hace posible, porque en metros la velocidad de una persona está acotada y la
perspectiva ya no distorsiona nada.

Esto NO resuelve saber QUIÉN es cada uno; eso sigue siendo manual y sigue
estando bien que lo sea. Resuelve que cada persona sea UNA sola a lo largo del
tiempo, que es lo que hace falta para heatmaps, para seguir a alguien y para
mirar hacia atrás desde un evento.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .cancha import ANCHO_CANCHA_M, LARGO_CANCHA_M

# Un jugador de futsal no pasa de unos 9 m/s en un pique corto. Se deja algo de
# aire porque el punto que se sigue son los pies proyectados, que tiemblan.
VEL_MAX_M_S = 11.0

# Más de esto sin ver a alguien y ya no se puede afirmar que sea el mismo: en
# dos segundos, en futsal, entra y sale medio equipo.
MAX_HUECO_MS = 2000

# Un salto de más de esto no lo explica ninguna caminata, por más tiempo que
# haya pasado. Corta los cosidos absurdos de punta a punta de la cancha.
MAX_SALTO_M = 12.0


def _metros(p) -> tuple[float, float]:
    return p["x"] / 100.0 * LARGO_CANCHA_M, p["y"] / 100.0 * ANCHO_CANCHA_M


def _distancia_m(a, b) -> float:
    (x1, y1), (x2, y2) = _metros(a), _metros(b)
    return math.hypot(x2 - x1, y2 - y1)


def _compatibles(equipo_a: str, equipo_b: str) -> bool:
    """
    Dos pedazos solo se cosen si no se contradicen en el equipo.

    'Desconocido' no contradice a nadie: pasa seguido que un pedazo corto, con
    el jugador tapado o de espaldas, no llegue a tener color confiable. Pero un
    propio y un rival nunca son la misma persona, y coserlos sería peor que
    dejar los dos pedazos sueltos.
    """
    if equipo_a == equipo_b:
        return True
    return "Desconocido" in (equipo_a, equipo_b)


@dataclass
class Costura:
    """Qué se unió con qué, para poder auditarlo."""

    track_final: int
    piezas: list[int]
    huecos_ms: list[int]


def coser_tracks(
    tracks: dict,
    *,
    max_hueco_ms: int = MAX_HUECO_MS,
    vel_max_m_s: float = VEL_MAX_M_S,
    max_salto_m: float = MAX_SALTO_M,
) -> tuple[dict, list[Costura]]:
    """
    Une los pedazos que son la misma persona y devuelve (tracks, costuras).

    El criterio para unir A con B, en este orden:

      1. B empieza DESPUÉS de que A termina. Si se pisan en el tiempo son dos
         personas distintas viéndose al mismo tiempo, no una.
      2. El hueco es menor a `max_hueco_ms`.
      3. La distancia entre el final de A y el arranque de B es menor a
         `max_salto_m`, y la velocidad que implica es humana.
      4. Los equipos no se contradicen.

    Se resuelve por costo creciente —primero los pares más obvios— y de forma
    voraz: cada final se usa una sola vez y cada arranque también. Un húngaro
    daría el óptimo global, pero acá las decisiones fáciles son abrumadora
    mayoría y las dudosas conviene NO tomarlas: un cosido equivocado mezcla dos
    jugadores para siempre, y eso es peor que dejar dos pedazos sueltos.
    """
    vivos = {k: t for k, t in tracks.items() if t.puntos}
    if len(vivos) < 2:
        return dict(tracks), []

    candidatos = []
    for a_id, a in vivos.items():
        fin_a = a.puntos[-1]
        for b_id, b in vivos.items():
            if a_id == b_id:
                continue
            ini_b = b.puntos[0]
            hueco = ini_b["t_ms"] - fin_a["t_ms"]
            if hueco <= 0 or hueco > max_hueco_ms:
                continue
            if not _compatibles(a.equipo, b.equipo):
                continue
            if a.periodo != b.periodo:
                continue
            d = _distancia_m(fin_a, ini_b)
            if d > max_salto_m:
                continue
            if d / (hueco / 1000.0) > vel_max_m_s:
                continue
            # El costo prioriza lo cercano en espacio y en tiempo. La distancia
            # pesa más: dos pedazos a medio metro son casi seguro la misma
            # persona aunque haya pasado un segundo entero.
            candidatos.append((d + hueco / 1000.0 * 0.5, a_id, b_id))

    candidatos.sort()
    sigue = {}      # a -> b
    usado_como_b = set()
    usado_como_a = set()
    for _, a_id, b_id in candidatos:
        if a_id in usado_como_a or b_id in usado_como_b:
            continue
        sigue[a_id] = b_id
        usado_como_a.add(a_id)
        usado_como_b.add(b_id)

    # Cadenas: cada track que no es continuación de nadie arranca una.
    resultado, costuras = {}, []
    for a_id in sorted(vivos):
        if a_id in usado_como_b:
            continue
        cadena = [a_id]
        while cadena[-1] in sigue:
            cadena.append(sigue[cadena[-1]])

        base = vivos[cadena[0]]
        if len(cadena) > 1:
            # El equipo de la cadena es el del pedazo más largo, no el del
            # primero: un pedazo de tres cuadros no debería definir el color de
            # alguien al que se vio treinta segundos.
            #
            # Se calcula ANTES de pegar nada. Si se midiera después, el primer
            # pedazo ya tendría encima los puntos de todos los demás y ganaría
            # siempre, sin importar cuán corto era en realidad.
            mejor = max(cadena, key=lambda k: len(vivos[k].puntos))
            equipo_cadena = vivos[mejor].equipo

            huecos = []
            for anterior, siguiente in zip(cadena, cadena[1:]):
                huecos.append(int(vivos[siguiente].puntos[0]["t_ms"]
                                  - vivos[anterior].puntos[-1]["t_ms"]))
                base.puntos.extend(vivos[siguiente].puntos)
            if equipo_cadena != "Desconocido":
                base.equipo = equipo_cadena
            costuras.append(Costura(track_final=cadena[0], piezas=list(cadena),
                                    huecos_ms=huecos))
        resultado[cadena[0]] = base

    # Los que no tenían puntos se conservan como estaban: no molestan y
    # borrarlos escondería que el seguidor los abrió.
    for k, t in tracks.items():
        if not t.puntos and k not in resultado:
            resultado[k] = t
    return resultado, costuras


def resumen_costura(antes: int, despues: int, costuras: list[Costura]) -> dict:
    piezas = [len(c.piezas) for c in costuras]
    return {
        "tracks_antes": antes,
        "tracks_despues": despues,
        "cadenas_cosidas": len(costuras),
        "piezas_por_cadena_max": max(piezas) if piezas else 0,
        "piezas_unidas": sum(piezas) - len(piezas) if piezas else 0,
    }
