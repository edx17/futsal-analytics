/* Paradas típicas de futsal y armado inicial del tablero.
   Vive fuera del componente para que el hot-reload no se rompa y para poder
   reutilizarlo desde los reportes sin arrastrar React.

   Coordenadas absolutas (x=0 arco propio, x=100 arco rival), atacando a la
   derecha. Son un punto de partida: después se corrigen arrastrando. */

import { BALON_ID } from './modelo';

export const FORMACIONES = {
  '1-2-2': [{ x: 8, y: 50 }, { x: 32, y: 25 }, { x: 32, y: 75 }, { x: 62, y: 30 }, { x: 62, y: 70 }],
  '1-3-1': [{ x: 8, y: 50 }, { x: 38, y: 20 }, { x: 42, y: 50 }, { x: 38, y: 80 }, { x: 72, y: 50 }],
  '1-4-0': [{ x: 8, y: 50 }, { x: 40, y: 15 }, { x: 45, y: 40 }, { x: 45, y: 60 }, { x: 40, y: 85 }],
  '0-5 (P-J)': [{ x: 30, y: 50 }, { x: 45, y: 18 }, { x: 55, y: 40 }, { x: 55, y: 62 }, { x: 45, y: 82 }],
};

export const FORMACION_POR_DEFECTO = '1-2-2';

/* Del rival no tenemos nombres, sólo cuántos son y qué número les ponemos.
   Su formación va reflejada: el arquero rival contra el arco rival. */
export const fichasRival = (dorsales = [1, 2, 3, 4, 5], formacion = FORMACION_POR_DEFECTO) => {
  const base = FORMACIONES[formacion] || FORMACIONES[FORMACION_POR_DEFECTO];
  return dorsales.slice(0, base.length).map((d, i) => ({
    id_jugador: `r${i + 1}`,
    equipo: 'Rival',
    dorsal: d,
    x: 100 - base[i].x,
    y: 100 - base[i].y,
  }));
};

export const fichasPropias = (jugadores = [], formacion = FORMACION_POR_DEFECTO) => {
  const base = FORMACIONES[formacion] || FORMACIONES[FORMACION_POR_DEFECTO];
  return jugadores.slice(0, base.length).map((j, i) => ({
    id_jugador: String(j.id),
    equipo: 'Propio',
    dorsal: j.dorsal ?? '',
    apellido: j.apellido || j.nombre || '',
    nombre: [j.dorsal, j.apellido || j.nombre].filter(Boolean).join(' · '),
    x: base[i].x,
    y: base[i].y,
  }));
};

export const fichaBalon = (x = 50, y = 50) => ({
  id_jugador: BALON_ID,
  equipo: 'Balon',
  dorsal: null,
  nombre: 'Pelota',
  x, y,
});

/* El tablero completo: nuestros cinco, los cinco de ellos y la pelota. */
export const tableroInicial = (jugadores = [], formacion = FORMACION_POR_DEFECTO) => ([
  ...fichasPropias(jugadores, formacion),
  ...fichasRival(undefined, formacion),
  fichaBalon(),
]);
