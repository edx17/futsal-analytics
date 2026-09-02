"""
Seguimiento sobre la CANCHA, en metros, en vez de sobre la imagen.

Por qué existe. El seguidor por imagen asocia comparando cuánto se solapan los
recuadros entre cuadro y cuadro. Medido sobre esta cámara: a 10 cuadros por
segundo, un jugador corriendo se desplaza 1,2 veces el ancho de su propio
cuerpo, así que el solapamiento entre su recuadro de un cuadro y el del
siguiente es CERO. La asociación falla y el track muere. Cada vez que alguien
acelera. De ahí salían 166 identidades para diez jugadores.

Se puede compensar subiendo la cadencia —a 30 fps el salto baja a 0,4 anchos y
el solapamiento vuelve— pero eso triplica el cómputo y no ataca el fondo del
asunto: el solapamiento de recuadros es una medida pobre cuando la perspectiva
hace que un jugador cercano ocupe 45 píxeles por metro y uno lejano 4.

Sobre la cancha, en metros, nada de eso pasa:

  · Un jugador de futsal no supera unos 9 m/s, esté cerca o lejos de la cámara.
    Es una cota física, igual en toda la cancha.
  · Se puede PREDECIR dónde va a estar: si venía a 5 m/s hacia el arco, en 100
    ms está medio metro más adelante. El solapamiento de recuadros no sabe nada
    de velocidad; asume que las cosas están quietas.
  · Cuando dos jugadores se cruzan, sus predicciones siguen de largo cada una
    por su lado. Es justamente el caso en que la imagen no puede distinguirlos
    y la física sí.

Esto necesita la homografía, así que solo se puede hacer con la cámara
calibrada. Es la ventaja de haber hecho ese trabajo.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# Cota física de un jugador de futsal en un pique. Se deja aire porque el punto
# que se sigue son los pies proyectados, que tiemblan con el recuadro.
VEL_MAX_M_S = 10.0

# Cuánto se le cree a la velocidad estimada. Alto reacciona rápido pero se
# vuelve nervioso con el temblor del recuadro; bajo es estable pero llega tarde
# a los cambios de dirección, que en futsal son constantes.
SUAVIZADO_VEL = 0.5


@dataclass
class TrackVivo:
    id: int
    x: float                      # metros sobre la cancha
    y: float
    vx: float = 0.0               # m/s
    vy: float = 0.0
    t_ms: float = 0.0
    sin_ver: int = 0
    visto: int = 1

    def predecir(self, t_ms: float) -> tuple[float, float]:
        dt = max(0.0, (t_ms - self.t_ms) / 1000.0)
        return self.x + self.vx * dt, self.y + self.vy * dt

    def actualizar(self, x: float, y: float, t_ms: float) -> None:
        dt = (t_ms - self.t_ms) / 1000.0
        if dt > 0:
            vx, vy = (x - self.x) / dt, (y - self.y) / dt
            rapidez = math.hypot(vx, vy)
            if rapidez > VEL_MAX_M_S:      # ruido del recuadro, no un jugador
                k = VEL_MAX_M_S / rapidez
                vx, vy = vx * k, vy * k
            self.vx += SUAVIZADO_VEL * (vx - self.vx)
            self.vy += SUAVIZADO_VEL * (vy - self.vy)
        self.x, self.y, self.t_ms = x, y, t_ms
        self.sin_ver = 0
        self.visto += 1


@dataclass
class SeguidorCancha:
    """
    Asocia detecciones a tracks por distancia en metros a la posición predicha.

    `max_sin_ver_ms` es cuánto sobrevive un track sin que lo vean. En futsal los
    jugadores se tapan entre ellos constantemente; matar el track al primer
    cuadro perdido es lo que fabrica identidades nuevas.
    """

    max_sin_ver_ms: float = 1500
    vel_max_m_s: float = VEL_MAX_M_S
    # Aire fijo además de lo que explica la velocidad: cubre el temblor del
    # recuadro y el error de la homografía, que en el rincón lejano es de casi
    # un metro.
    holgura_m: float = 1.2

    vivos: dict = field(default_factory=dict)
    _siguiente: int = 1

    def actualizar(self, posiciones: list[tuple[float, float]], t_ms: float) -> list[int]:
        """
        Recibe posiciones en METROS y devuelve un id por cada una, en el mismo
        orden. Un id nuevo significa que no se pudo explicar como continuación
        de nadie.
        """
        for t in self.vivos.values():
            t.sin_ver += 1
        self._olvidar(t_ms)

        pares = []
        for i, (x, y) in enumerate(posiciones):
            for tid, t in self.vivos.items():
                px, py = t.predecir(t_ms)
                d = math.hypot(x - px, y - py)
                dt = max(1e-3, (t_ms - t.t_ms) / 1000.0)
                if d <= self.vel_max_m_s * dt + self.holgura_m:
                    pares.append((d, i, tid))

        # Voraz por distancia creciente. Con diez objetos y predicciones que ya
        # separan a los que se cruzan, la asignación óptima y esta coinciden
        # casi siempre, y las dudosas conviene no forzarlas: un intercambio de
        # identidades es más caro que un track nuevo.
        pares.sort()
        asignado_det, asignado_track = {}, set()
        for d, i, tid in pares:
            if i in asignado_det or tid in asignado_track:
                continue
            asignado_det[i] = tid
            asignado_track.add(tid)

        salida = []
        for i, (x, y) in enumerate(posiciones):
            tid = asignado_det.get(i)
            if tid is None:
                tid = self._siguiente
                self._siguiente += 1
                self.vivos[tid] = TrackVivo(id=tid, x=x, y=y, t_ms=t_ms)
            else:
                self.vivos[tid].actualizar(x, y, t_ms)
            salida.append(tid)
        return salida

    def _olvidar(self, t_ms: float) -> None:
        muertos = [tid for tid, t in self.vivos.items()
                   if t_ms - t.t_ms > self.max_sin_ver_ms]
        for tid in muertos:
            del self.vivos[tid]

    def reiniciar(self) -> None:
        """Entre períodos: los equipos cambian de lado y no hay continuidad."""
        self.vivos.clear()
