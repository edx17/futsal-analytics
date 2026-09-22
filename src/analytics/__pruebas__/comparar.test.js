import { describe, test, expect } from 'vitest';
import { METRICAS, conPorcentajes, valorDe, ganador, reparto, resumen } from '../comparar';

const m = (k) => METRICAS.find(x => x.k === k);

const fila = (extra = {}) => conPorcentajes({
  minutos: 400, jugados: 10, ratingProm: 7.2, goles: 8, asistencias: 4,
  xg: 6.4, remates: 30, rec: 25, perd: 12, faltasCom: 9, amarillas: 2,
  duelOfeGan: 15, duelOfeTot: 30, duelDefGan: 20, duelDefTot: 25, ...extra,
});

describe('normalizar por 40 minutos', () => {
  test('una métrica de volumen se divide por los minutos jugados', () => {
    // 8 goles en 400 minutos = 0,8 goles por partido de 40
    expect(valorDe(fila(), m('goles'), true)).toBeCloseTo(0.8, 5);
  });

  test('sin normalizar devuelve el total tal cual', () => {
    expect(valorDe(fila(), m('goles'), false)).toBe(8);
  });

  test('un promedio NO se vuelve a dividir', () => {
    expect(valorDe(fila(), m('ratingProm'), true)).toBe(7.2);
    expect(valorDe(fila(), m('duelDefPct'), true)).toBe(80);
  });

  test('sin minutos no hay "por 40": devuelve null, no cero', () => {
    // Un 0 haría creer que el jugador rindió cero, cuando en realidad no jugó.
    expect(valorDe(fila({ minutos: 0, goles: 0 }), m('goles'), true)).toBe(null);
  });
});

describe('quién gana cada métrica', () => {
  test('en goles gana el que tiene más', () => {
    expect(ganador(8, 5, m('goles'))).toBe('a');
    expect(ganador(5, 8, m('goles'))).toBe('b');
  });

  test('en pérdidas y faltas gana el que tiene MENOS', () => {
    expect(ganador(12, 20, m('perd'))).toBe('a');
    expect(ganador(9, 3, m('faltasCom'))).toBe('b');
  });

  test('empate y dato faltante no los gana nadie', () => {
    expect(ganador(7, 7, m('goles'))).toBe(null);
    expect(ganador(null, 3, m('goles'))).toBe(null);
  });
});

describe('el reparto de la barra', () => {
  test('se divide proporcional al total', () => {
    expect(reparto(30, 10)).toEqual([75, 25]);
  });

  test('con los dos en cero la barra queda vacía, no partida al medio', () => {
    expect(reparto(0, 0)).toEqual([0, 0]);
  });

  test('un valor negativo no se come la barra del otro', () => {
    expect(reparto(-5, 10)).toEqual([0, 100]);
  });
});

describe('los porcentajes de duelo', () => {
  test('salen de ganados sobre disputados', () => {
    expect(conPorcentajes(fila()).duelOfePct).toBe(50);
  });

  test('sin duelos disputados da null y no una división por cero', () => {
    expect(conPorcentajes(fila({ duelOfeGan: 0, duelOfeTot: 0 })).duelOfePct).toBe(null);
  });
});

describe('el resumen', () => {
  test('cuenta cuántas gana cada uno y siempre suma el total', () => {
    const r = resumen(fila(), fila({ goles: 2, rec: 5, perd: 30 }), false);
    expect(r.a + r.b + r.empates).toBe(METRICAS.length);
    expect(r.a).toBeGreaterThan(r.b);
  });

  test('un jugador contra sí mismo empata en todo', () => {
    const r = resumen(fila(), fila(), false);
    expect(r).toEqual({ a: 0, b: 0, empates: METRICAS.length });
  });
});
