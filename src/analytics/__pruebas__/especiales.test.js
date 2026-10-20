import { describe, it, expect } from 'vitest';
import {
  rankear, rankingPresencia, ganadores, topSerie, partidosPrimeraRueda, ruedaCerrada, periodoRueda, torneoDePeriodo,
  partidosDelMes, TIPOS_ESPECIALES,
} from '../especiales';

const f = (apellido, datos) => ({ id: apellido, apellido, nombre: '', rol: 'ALA', pj: 1, goles: 0, asistencias: 0, rec: 0, mvp: 0, nota: 6, ...datos });

describe('especiales: rankings con empates', () => {
  const filas = [f('A', { goles: 5 }), f('B', { goles: 7 }), f('C', { goles: 5 }), f('D', { goles: 0 }), f('E', { goles: 3 })];

  it('ranking de competición: los empatados comparten puesto y el siguiente salta', () => {
    const r = rankear(filas, (x) => x.goles);
    expect(r.map((x) => [x.apellido, x.puesto, x.valor])).toEqual([['B', 1, 7], ['A', 2, 5], ['C', 2, 5], ['E', 4, 3]]);
    expect(r.find((x) => x.apellido === 'A').empate).toBe(true);
    expect(r.find((x) => x.apellido === 'B').empate).toBe(false);
  });

  it('con cero no se entra', () => {
    expect(rankear(filas, (x) => x.goles).some((x) => x.apellido === 'D')).toBe(false);
    expect(rankear([f('Z', {})], (x) => x.goles)).toEqual([]);
  });

  it('empate en el primer puesto: la carta es para todos', () => {
    const r = rankear([f('A', { asistencias: 4 }), f('B', { asistencias: 4 }), f('C', { asistencias: 1 })], (x) => x.asistencias);
    expect(ganadores(r).map((x) => x.apellido)).toEqual(['A', 'B']);
  });

  it('serie: del 1 al 10, con los empatados en el décimo adentro', () => {
    const muchos = Array.from({ length: 13 }, (_, i) => f(`J${String(i).padStart(2, '0')}`, { rec: i < 9 ? 20 - i : 5 }));
    const top = topSerie(rankear(muchos, (x) => x.rec));
    expect(top.length).toBe(13); // 9 distintos + 4 empatados en el 10.º
    expect(top.filter((x) => x.puesto === 10).length).toBe(4);
    expect(Math.max(...top.map((x) => x.puesto))).toBe(10);
  });
});

describe('especiales: presencia', () => {
  it('más partidos; entre iguales, mejor nota; si empatan en todo, compartida', () => {
    const r = rankingPresencia([
      f('A', { pj: 5, nota: 7.1 }), f('B', { pj: 6, nota: 6.2 }), f('C', { pj: 6, nota: 7.4 }), f('D', { pj: 6, nota: 7.4 }),
    ]);
    expect(r.map((x) => [x.apellido, x.puesto])).toEqual([['C', 1], ['D', 1], ['B', 3], ['A', 4]]);
    expect(ganadores(r).length).toBe(2);
  });
  it('sin nota va después de los que tienen', () => {
    const r = rankingPresencia([f('A', { pj: 3, nota: null }), f('B', { pj: 3, nota: 5 })]);
    expect(r[0].apellido).toBe('B');
  });
});

describe('especiales: períodos', () => {
  const torneo = { id: 't1', nombre: 'Torneo', fechas_primera_rueda: 3 };
  const partidos = [
    { id: 1, torneo_id: 't1', jornada: 'Fecha 1', fecha: '2026-03-01' },
    { id: 2, torneo_id: 't1', jornada: 'Fecha 3', fecha: '2026-03-15' },
    { id: 3, torneo_id: 't1', jornada: 'Fecha 4', fecha: '2026-04-01' },
    { id: 4, torneo_id: 'otro', jornada: 'Fecha 1', fecha: '2026-03-02' },
  ];
  it('primera rueda: las fechas hasta el corte, sólo de ese torneo', () => {
    expect(partidosPrimeraRueda(partidos, torneo).map((p) => p.id)).toEqual([1, 2]);
    expect(partidosPrimeraRueda(partidos, { ...torneo, fechas_primera_rueda: null })).toEqual([]);
  });
  it('la rueda se cierra cuando hay un partido con datos de la segunda', () => {
    expect(ruedaCerrada(partidos, torneo, new Set(['1', '2']))).toBe(false);
    expect(ruedaCerrada(partidos, torneo, new Set(['1', '2', '3']))).toBe(true);
  });
  it('el período de la rueda lleva el torneo, sin barras (la clave de la carta las usa)', () => {
    expect(periodoRueda('t1')).toBe('R1:t1');
    expect(periodoRueda('t1')).not.toContain('|');
    expect(torneoDePeriodo('R1:t1')).toBe('t1');
    expect(torneoDePeriodo('2026-03')).toBeNull();
  });
  it('mes', () => {
    expect(partidosDelMes(partidos, '2026-03').map((p) => p.id)).toEqual([1, 2, 4]);
  });
  it('los tipos nuevos no chocan con los de siempre', () => {
    ['POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY', 'BASE'].forEach((t) => expect(TIPOS_ESPECIALES).not.toContain(t));
  });
});
