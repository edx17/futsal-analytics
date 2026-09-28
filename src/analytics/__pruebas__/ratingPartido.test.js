import { describe, it, expect } from 'vitest';
import { prepararRatingsPartido } from '../ratingPartido.js';

/* Un partido inventado: arquero 1, jugadores 2 a 6 y el 7 que entra por el 6. */
const Q1 = [1, 2, 3, 4, 5];
const Q2 = [1, 2, 3, 4, 7];
let id = 0;
const ev = (periodo, minuto, equipo, accion, extra = {}) => ({
  id: ++id, periodo, minuto, segundos: 0, equipo, accion, zona_x: 80, zona_y: 50, quinteto_activo: Q1, ...extra,
});

const partido = [
  ev('PT', 1, 'Propio', 'Recuperación', { id_jugador: 2, zona_x: 40 }),
  ev('PT', 2, 'Propio', 'Remate - Gol', { id_jugador: 3, id_asistencia: 2, zona_x: 92 }),
  ev('PT', 2, 'Propio', 'Asistencia', { id_jugador: 2, zona_x: 92 }),
  ev('PT', 5, 'Rival', 'Remate - Atajado', { zona_x: 15 }),
  ev('PT', 8, 'Propio', 'Cambio', { id_jugador: 5, quinteto_activo: Q2 }),
  ev('PT', 9, 'Rival', 'Remate - Gol', { zona_x: 10, quinteto_activo: Q2 }),
  ev('ST', 3, 'Propio', 'Remate - Gol', { id_jugador: 3, zona_x: 90, quinteto_activo: Q2 }),
  ev('ST', 6, 'Propio', 'Duelo DEF Ganado', { id_jugador: 4, zona_x: 30, quinteto_activo: Q2 }),
];

describe('prepararRatingsPartido', () => {
  const R = prepararRatingsPartido(partido);

  it('saca el resultado de los eventos', () => {
    expect(R.golesFavor).toBe(2);
    expect(R.golesContra).toBe(1);
  });

  it('el que asiste suma una asistencia, no un gol', () => {
    const d = R.detalle({ id: 2, posicion: 'Ala' });
    expect(d.desglose.conteo.goles).toBe(0);
    expect(d.desglose.conteo.asistencias).toBe(1);
  });

  it('el goleador suma sus goles', () => {
    expect(R.detalle({ id: 3, posicion: 'Pivot' }).desglose.conteo.goles).toBe(2);
  });

  it('el +/- sale de los quintetos', () => {
    expect(R.detalle({ id: 5 }).plusMinus).toBe(1);  // estuvo en el 1-0, no en el 1-1 ni en el 2-1
    expect(R.detalle({ id: 7 }).plusMinus).toBe(0);  // entró: 1-1 y 2-1
    expect(R.detalle({ id: 2 }).plusMinus).toBe(1);  // los tres goles
  });

  it('da lo mismo con el +/- calculado afuera', () => {
    const conPm = prepararRatingsPartido(partido, { plusMinus: { 2: 1, 3: 1 } });
    expect(conPm.rating({ id: 2, posicion: 'Ala' })).toBe(R.rating({ id: 2, posicion: 'Ala' }));
  });

  it('no depende del orden en que llegan los eventos', () => {
    const R2 = prepararRatingsPartido([...partido].reverse());
    [1, 2, 3, 4, 5, 7].forEach((j) => expect(R2.rating({ id: j })).toBe(R.rating({ id: j })));
  });
});

describe('prepararRatingsPartido: arquero', () => {
  const remateRival = (accion, q) => ev('PT', 10, 'Rival', accion, { zona_x: 8, quinteto_activo: q });
  const arquero = { id: 1, posicion: 'Arquero' };
  const suplente = { id: 9, posicion: 'Arquero' };

  it('sólo carga los remates que recibió estando en cancha', () => {
    const Qsup = [9, 2, 3, 4, 5];
    const evs = [remateRival('Remate - Gol', Qsup), remateRival('Remate - Gol', Qsup), remateRival('Remate - Atajado', Q1)];
    const R = prepararRatingsPartido(evs);
    expect(R.rating(arquero)).toBeGreaterThan(R.rating(suplente));
  });
});

describe('prepararRatingsPartido: goleada en contra', () => {
  it('tiene techo aunque el jugador haya hecho cosas', () => {
    const evs = [
      ...Array.from({ length: 6 }, (_, i) => ev('PT', i + 1, 'Rival', 'Remate - Gol', { zona_x: 10 })),
      ...Array.from({ length: 3 }, (_, i) => ev('ST', i + 1, 'Propio', 'Remate - Gol', { id_jugador: 3, zona_x: 70 })),
    ];
    expect(prepararRatingsPartido(evs).rating({ id: 3 })).toBeLessThanOrEqual(7.5);
  });
});
