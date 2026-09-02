"""
A qué equipo pertenece cada detección.

Esto NO lo hace una red neuronal. El detector devuelve "acá hay una persona" y
nada más; de ahí en adelante es color. El procedimiento es:

  1. Recortar el torso del recuadro (la franja central vertical), no el
     recuadro entero: arriba está la cabeza y abajo el short y las piernas,
     que en futsal suelen ser de otro color que la camiseta.
  2. Sacar los píxeles del piso que se cuelan por los costados.
  3. Resumir el torso en un color representativo, con la MEDIANA y no el
     promedio: el promedio entre una camiseta roja y un piso azul da violeta,
     un color que no existe en la escena. La mediana se queda con el que más
     manda.
  4. Juntar todos los colores del partido y partirlos en grupos con k-means.

Por qué k-means sobre todo el partido y no cuadro por cuadro: en un cuadro
suelto puede haber 4 de un equipo y 6 del otro, y el clustering se tuerce.
Sobre miles de detecciones los grupos son estables.

El operador dice UNA VEZ cuál grupo es el propio. Es el único dato de identidad
que la IA necesita de un humano en la Fase 1.

Limitaciones reales, sin vueltas:
  · Camisetas de colores parecidos entre los dos equipos: esto no funciona.
    Se arregla en la cancha eligiendo el juego de camisetas, no acá.
  · Exposición automática de la cámara: si el brillo cambia durante el
    partido, los colores se mueven y los grupos se mezclan. Por eso el
    protocolo de filmación exige exposición y balance de blancos fijos.
  · Arqueros y árbitros: caen como grupos aparte porque visten distinto. Es
    una consecuencia buscada, no un problema.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

PROPIO = "Propio"
RIVAL = "Rival"
ARQUERO_PROPIO = "Arquero propio"
ARQUERO_RIVAL = "Arquero rival"
ARBITRO = "Arbitro"
DESCONOCIDO = "Desconocido"

# Lo que el operador puede elegir para cada grupo de color. Los arqueros y el
# árbitro no son "ruido a descartar": marcarlos bien es lo que evita que el
# arquero rival cuente como jugador propio y que el árbitro aparezca como uno
# más en el conteo de gente en cancha.
ROLES = (PROPIO, RIVAL, ARQUERO_PROPIO, ARQUERO_RIVAL, ARBITRO, DESCONOCIDO)


def color_de_torso(recorte: np.ndarray, frac_alto=(0.15, 0.55), frac_ancho=(0.25, 0.75)) -> np.ndarray | None:
    """
    Color representativo del torso de un recorte HxWx3.

    Las fracciones recortan la franja del pecho: del 15% al 55% de la altura
    (debajo de la cabeza, arriba del short) y el 50% central del ancho (lejos
    del piso que se ve a los costados del cuerpo).
    """
    if recorte is None or recorte.size == 0 or recorte.ndim != 3:
        return None
    alto, ancho = recorte.shape[:2]
    if alto < 4 or ancho < 4:
        return None
    y0, y1 = int(alto * frac_alto[0]), max(int(alto * frac_alto[1]), int(alto * frac_alto[0]) + 1)
    x0, x1 = int(ancho * frac_ancho[0]), max(int(ancho * frac_ancho[1]), int(ancho * frac_ancho[0]) + 1)
    torso = recorte[y0:y1, x0:x1].reshape(-1, 3)
    if torso.size == 0:
        return None
    return np.median(torso.astype(np.float64), axis=0)


def _kmeans(datos: np.ndarray, k: int, iteraciones: int = 60, semilla: int = 0):
    """
    k-means con inicialización k-means++ y numpy pelado.

    Sin sklearn a propósito: es la única cuenta que hace falta y no justifica
    arrastrar la dependencia a un worker que ya carga PyTorch.
    """
    rng = np.random.default_rng(semilla)
    n = len(datos)
    if n == 0:
        raise ValueError("No hay colores para agrupar.")
    k = min(k, n)

    # k-means++: el primer centro al azar, los siguientes lejos de los ya elegidos.
    centros = [datos[rng.integers(n)]]
    for _ in range(1, k):
        d2 = np.min(((datos[:, None, :] - np.array(centros)[None, :, :]) ** 2).sum(axis=2), axis=1)
        total = d2.sum()
        if total <= 0:
            centros.append(datos[rng.integers(n)])
            continue
        centros.append(datos[rng.choice(n, p=d2 / total)])
    centros = np.array(centros, dtype=np.float64)

    etiquetas = np.zeros(n, dtype=int)
    for _ in range(iteraciones):
        dist = ((datos[:, None, :] - centros[None, :, :]) ** 2).sum(axis=2)
        nuevas = dist.argmin(axis=1)
        if np.array_equal(nuevas, etiquetas) and _ > 0:
            break
        etiquetas = nuevas
        for j in range(k):
            miembros = datos[etiquetas == j]
            if len(miembros):
                centros[j] = miembros.mean(axis=0)
    return centros, etiquetas


@dataclass
class ClasificadorEquipos:
    """Aprende los colores del partido una vez y después clasifica al vuelo."""

    centros: np.ndarray
    equipo_por_grupo: dict[int, str]
    separacion: float
    """Distancia entre los dos grupos principales, en unidades de color."""

    # Debajo de esto los dos equipos visten demasiado parecido y la asignación
    # es una moneda al aire. Vale más avisar que devolver basura con confianza.
    SEPARACION_MINIMA = 40.0

    @property
    def confiable(self) -> bool:
        return self.separacion >= self.SEPARACION_MINIMA

    def clasificar(self, color: np.ndarray | None) -> str:
        if color is None:
            return DESCONOCIDO
        d = ((self.centros - np.asarray(color, dtype=np.float64)) ** 2).sum(axis=1)
        return self.equipo_por_grupo.get(int(d.argmin()), DESCONOCIDO)

    def grupo_de(self, color) -> int:
        d = ((self.centros - np.asarray(color, dtype=np.float64)) ** 2).sum(axis=1)
        return int(d.argmin())

    def a_dict(self) -> dict:
        return {
            "centros": self.centros.tolist(),
            "equipo_por_grupo": {str(k): v for k, v in self.equipo_por_grupo.items()},
            "separacion": self.separacion,
            "confiable": self.confiable,
        }

    @staticmethod
    def de_dict(d: dict) -> "ClasificadorEquipos":
        return ClasificadorEquipos(
            centros=np.array(d["centros"], dtype=np.float64),
            equipo_por_grupo={int(k): v for k, v in d["equipo_por_grupo"].items()},
            separacion=float(d["separacion"]),
        )

    def asignar(self, grupo: int, equipo: str) -> "ClasificadorEquipos":
        """
        El operador dice qué es cada grupo. Un click por partido.

        Es el único dato de identidad que la Fase 1 le pide a un humano, y sin
        él la asignación de equipos es una moneda al aire: el pipeline toma el
        grupo más poblado y lo llama propio, que no significa nada.
        """
        if grupo not in range(len(self.centros)):
            raise ValueError(f"No existe el grupo {grupo}.")
        nuevo = dict(self.equipo_por_grupo)
        # PROPIO y RIVAL son únicos: si este grupo se los queda, el que los
        # tenía los suelta. Dos grupos marcados como propios harían que el
        # conteo de jugadores en cancha diera el doble.
        if equipo in (PROPIO, RIVAL):
            for g, eq in nuevo.items():
                if eq == equipo:
                    nuevo[g] = DESCONOCIDO
        nuevo[grupo] = equipo
        return ClasificadorEquipos(centros=self.centros, equipo_por_grupo=nuevo,
                                   separacion=self.separacion)


def entrenar_clasificador(
    colores: list[np.ndarray],
    grupos: int = 4,
    semilla: int = 0,
) -> ClasificadorEquipos:
    """
    Agrupa los colores de todo el partido.

    `grupos` = 4 por defecto: los dos equipos de campo más los arqueros y el
    árbitro, que visten distinto y merecen su propio grupo en vez de ensuciar
    los de campo. Los dos grupos MÁS POBLADOS son los equipos: son diez
    jugadores de campo contra dos arqueros y un árbitro, así que la mayoría
    manda y no hace falta ninguna heurística más fina.

    Devuelve el clasificador con los dos grupos mayores marcados como equipos
    y el resto como Desconocido. Cuál de los dos es el propio lo decide el
    operador después, con `asignar_propio`.
    """
    validos = [c for c in colores if c is not None]
    if len(validos) < grupos:
        raise ValueError(
            f"Hacen falta al menos {grupos} colores para agrupar y llegaron {len(validos)}."
        )
    datos = np.array(validos, dtype=np.float64)
    centros, etiquetas = _kmeans(datos, grupos, semilla=semilla)

    poblacion = np.bincount(etiquetas, minlength=len(centros))
    mayores = list(np.argsort(poblacion)[::-1][:2])
    a, b = int(mayores[0]), int(mayores[1])
    separacion = float(np.sqrt(((centros[a] - centros[b]) ** 2).sum()))

    # Provisorio: el grupo más poblado queda como 'Propio' hasta que el
    # operador diga lo contrario. Nunca se publica un dato dependiendo de esto.
    equipo_por_grupo = {i: DESCONOCIDO for i in range(len(centros))}
    equipo_por_grupo[a] = PROPIO
    equipo_por_grupo[b] = RIVAL
    return ClasificadorEquipos(centros=centros, equipo_por_grupo=equipo_por_grupo,
                               separacion=separacion)


def asignar_propio(clas: ClasificadorEquipos, color_propio: np.ndarray) -> ClasificadorEquipos:
    """
    El operador clickea un jugador propio y esto da vuelta los grupos si hace
    falta. Un click por partido: es el único dato de identidad que la Fase 1
    le pide a un humano.
    """
    d = ((clas.centros - np.asarray(color_propio, dtype=np.float64)) ** 2).sum(axis=1)
    elegido = int(d.argmin())
    if clas.equipo_por_grupo.get(elegido) == PROPIO:
        return clas
    nuevo = dict(clas.equipo_por_grupo)
    for g, eq in clas.equipo_por_grupo.items():
        if eq == PROPIO:
            nuevo[g] = RIVAL
    nuevo[elegido] = PROPIO
    return ClasificadorEquipos(centros=clas.centros, equipo_por_grupo=nuevo,
                               separacion=clas.separacion)
