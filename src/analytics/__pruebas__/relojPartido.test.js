import { describe, it, expect } from 'vitest';
import { ordenarEventos, relojDelPartido, calcularMinutosPorJugador, analizarPartido } from '../engine';

const ev = (id, periodo, minuto, segundos, extra = {}) => ({ id, periodo, minuto, segundos, equipo: 'Propio', accion: 'Pase', ...extra });

describe('reloj del partido', () => {
  it('ordena por período antes que por minuto', () => {
    const evs = [ev(3, 'ST', 2, 0), ev(1, 'PT', 25, 0), ev(2, 'PT', 3, 0)];
    expect(ordenarEventos(evs).map((e) => e.id)).toEqual([2, 1, 3]);
  });

  it('ST con reloj propio: le suma lo que duró el PT, aunque pase de 20', () => {
    const evs = [ev(1, 'PT', 0, 0), ev(2, 'PT', 29, 36), ev(3, 'ST', 0, 0), ev(4, 'ST', 25, 0)];
    const r = relojDelPartido(evs);
    expect(r(evs[2])).toBeCloseTo(29.6, 1);
    expect(r(evs[3])).toBeCloseTo(54.6, 1);
  });

  it('ST en minutos corridos (20 a 40): no suma nada', () => {
    const evs = [ev(1, 'PT', 0, 0), ev(2, 'PT', 19, 0), ev(3, 'Segundo Tiempo', 21, 0), ev(4, 'Segundo Tiempo', 39, 0)];
    const r = relojDelPartido(evs);
    expect(r(evs[2])).toBe(21);
  });

  it('ST corto con reloj propio sigue funcionando como antes (+20)', () => {
    const evs = [ev(1, 'PT', 0, 0), ev(2, 'PT', 18, 0), ev(3, 'ST', 5, 0)];
    expect(relojDelPartido(evs)(evs[2])).toBe(25);
  });
});

describe('minutos por jugador', () => {
  const Q1 = [1, 2, 3, 4, 10];
  const Q2 = [1, 2, 3, 4, 20];

  it('salen del quinteto de cada evento: un arquero por tiempo juega lo mismo', () => {
    const evs = [
      ev(1, 'PT', 0, 0, { quinteto_activo: Q1 }), ev(2, 'PT', 15, 0, { quinteto_activo: Q1 }), ev(3, 'PT', 30, 0, { quinteto_activo: Q1 }),
      ev(4, 'ST', 0, 0, { quinteto_activo: Q2 }), ev(5, 'ST', 15, 0, { quinteto_activo: Q2 }), ev(6, 'ST', 30, 0, { quinteto_activo: Q2 }),
    ];
    const m = calcularMinutosPorJugador(evs);
    expect(m['10']).toBe(30);
    expect(m['20']).toBe(30);
    expect(m['1']).toBe(60);
  });

  it('el entretiempo no suma minutos', () => {
    const evs = [ev(1, 'PT', 0, 0, { quinteto_activo: Q1 }), ev(2, 'PT', 20, 0, { quinteto_activo: Q1 }), ev(3, 'ST', 0, 0, { quinteto_activo: Q1 }), ev(4, 'ST', 20, 0, { quinteto_activo: Q1 })];
    expect(calcularMinutosPorJugador(evs)['1']).toBe(40);
  });

  it('sin quintetos, usa los cambios en el orden real', () => {
    const evs = [
      ev(1, 'PT', 0, 0, { id_jugador: 10 }), ev(2, 'PT', 25, 0, { id_jugador: 10 }),
      ev(3, 'ST', 0, 0, { accion: 'Cambio', id_jugador: 10, id_receptor: 20 }), ev(4, 'ST', 25, 0, { id_jugador: 20 }),
    ];
    const m = calcularMinutosPorJugador(evs);
    expect(m['10']).toBe(25);
    expect(m['20']).toBe(25);
  });

  it('los minutos por quinteto no se pisan entre PT y ST', () => {
    const evs = [
      ev(1, 'PT', 0, 0, { quinteto_activo: Q1 }), ev(2, 'PT', 28, 0, { quinteto_activo: Q1 }),
      ev(3, 'ST', 0, 0, { quinteto_activo: Q2 }), ev(4, 'ST', 28, 0, { quinteto_activo: Q2 }),
    ];
    const q = analizarPartido(evs, 'Propio').quintetos;
    const lista = Array.isArray(q) ? q : Object.values(q);
    const de = (ids) => lista.find((x) => [...x.ids].map(String).sort().join() === ids.map(String).sort().join());
    expect(de(Q1).minutos).toBeCloseTo(28, 0);
    expect(de(Q2).minutos).toBeGreaterThanOrEqual(28);
  });
});
