import { describe, test, expect } from 'vitest';
import {
  cargaDeSesion, serieDiaria, metricasDeCarga, cargaDelPlantel,
  zonaDe, DIAS_AGUDA, DIAS_CRONICA,
} from '../carga';

/* Un día, contado hacia atrás desde el 2026-03-31. */
const HOY = '2026-03-31';
const diaAtras = (n) => {
  const d = new Date(Date.UTC(2026, 2, 31) - n * 86400000);
  return d.toISOString().slice(0, 10);
};

const sesion = (jugador_id, hace, rpe, minutos_actividad) =>
  ({ jugador_id, fecha: diaAtras(hace), rpe, minutos_actividad });

/* 28 días seguidos de la misma carga: la base para que la crónica sea estable. */
const parejo = (jugador_id, rpe, min, dias = DIAS_CRONICA) =>
  Array.from({ length: dias }, (_, i) => sesion(jugador_id, i, rpe, min));

describe('la carga de una sesión', () => {
  test('es RPE por minutos', () => {
    expect(cargaDeSesion({ rpe: 6, minutos_actividad: 90 })).toBe(540);
  });

  test('sin RPE o sin minutos no hay carga, no un número raro', () => {
    expect(cargaDeSesion({ rpe: 0, minutos_actividad: 90 })).toBe(0);
    expect(cargaDeSesion({ rpe: 6, minutos_actividad: 0 })).toBe(0);
    expect(cargaDeSesion({})).toBe(0);
    expect(cargaDeSesion(null)).toBe(0);
  });
});

describe('la serie diaria', () => {
  test('devuelve un valor por día, aunque falten registros', () => {
    const s = serieDiaria([sesion(1, 0, 5, 60), sesion(1, 3, 5, 60)], 1, HOY, 7);
    expect(s).toHaveLength(7);
    expect(s[6]).toBe(300);   // hoy
    expect(s[3]).toBe(300);   // hace 3 días
    expect(s[5]).toBe(0);     // sin registro: cero, no salteado
  });

  test('suma dos sesiones del mismo día (doble turno)', () => {
    const s = serieDiaria([sesion(1, 0, 5, 60), sesion(1, 0, 4, 30)], 1, HOY, 7);
    expect(s[6]).toBe(300 + 120);
  });

  test('ignora a los demás jugadores', () => {
    const s = serieDiaria([sesion(1, 0, 5, 60), sesion(2, 0, 9, 90)], 1, HOY, 7);
    expect(s[6]).toBe(300);
  });

  test('no toma nada fuera de la ventana', () => {
    const s = serieDiaria([sesion(1, 40, 9, 120)], 1, HOY, 7);
    expect(s.every(v => v === 0)).toBe(true);
  });
});

describe('el ACWR', () => {
  test('con carga pareja da 1: la semana es igual a lo que venía tolerando', () => {
    const m = metricasDeCarga(parejo(1, 6, 60), 1, HOY);
    expect(m.suficiente).toBe(true);
    expect(m.acwr).toBeCloseTo(1, 6);
  });

  test('duplicar la última semana lo lleva cerca de 1,6', () => {
    // 21 días a 360 y los últimos 7 a 720.
    const filas = [
      ...Array.from({ length: 21 }, (_, i) => sesion(1, i + 7, 6, 60)),
      ...Array.from({ length: 7 }, (_, i) => sesion(1, i, 6, 120)),
    ];
    const m = metricasDeCarga(filas, 1, HOY);
    expect(m.acwr).toBeGreaterThan(1.5);
    expect(zonaDe(m.acwr).id).toBe('riesgo');
  });

  test('bajar la carga lo deja por debajo', () => {
    const filas = [
      ...Array.from({ length: 21 }, (_, i) => sesion(1, i + 7, 8, 90)),
      ...Array.from({ length: 7 }, (_, i) => sesion(1, i, 3, 40)),
    ];
    const m = metricasDeCarga(filas, 1, HOY);
    expect(zonaDe(m.acwr).id).toBe('baja');
  });

  test('sin historia suficiente NO inventa un número', () => {
    // Tres días cargados sobre 28: la crónica sería un promedio de aire.
    const m = metricasDeCarga([sesion(1, 0, 6, 60), sesion(1, 1, 6, 60), sesion(1, 2, 6, 60)], 1, HOY);
    expect(m.suficiente).toBe(false);
    expect(m.acwr).toBe(null);
    expect(m.aguda).toBeGreaterThan(0);   // la carga sí se informa
  });

  test('un jugador sin un solo registro no rompe nada', () => {
    const m = metricasDeCarga([], 99, HOY);
    expect(m).toMatchObject({ aguda: 0, cronica: 0, acwr: null, suficiente: false });
  });
});

describe('monotonía y strain', () => {
  test('entrenar exactamente igual todos los días no tiene desvío', () => {
    // Sin variación el desvío es 0: se informa null, no infinito.
    const m = metricasDeCarga(parejo(1, 6, 60), 1, HOY);
    expect(m.monotonia).toBe(null);
    expect(m.strain).toBe(null);
  });

  test('con picos y descansos la monotonía baja', () => {
    const conDescanso = [
      ...Array.from({ length: 21 }, (_, i) => sesion(1, i + 7, 6, 60)),
      sesion(1, 6, 8, 90), sesion(1, 5, 4, 45), sesion(1, 3, 9, 100), sesion(1, 1, 5, 50),
    ];
    const m = metricasDeCarga(conDescanso, 1, HOY);
    expect(m.monotonia).toBeGreaterThan(0);
    expect(m.strain).toBeCloseTo(m.aguda * m.monotonia, 6);
  });
});

describe('el plantel completo', () => {
  const jugadores = [{ id: 1, apellido: 'A' }, { id: 2, apellido: 'B' }, { id: 3, apellido: 'C' }];
  const filas = [
    ...parejo(1, 6, 60),
    ...Array.from({ length: 21 }, (_, i) => sesion(2, i + 7, 5, 50)),
    ...Array.from({ length: 7 }, (_, i) => sesion(2, i, 9, 110)),
    // el 3 casi no cargó datos
    sesion(3, 0, 6, 60),
  ];

  test('pone primero al de más riesgo', () => {
    const r = cargaDelPlantel(filas, jugadores, HOY);
    expect(r[0].jugador.id).toBe(2);
    expect(zonaDe(r[0].acwr).id).toBe('riesgo');
  });

  test('los que no tienen historia suficiente quedan al final', () => {
    const r = cargaDelPlantel(filas, jugadores, HOY);
    expect(r[r.length - 1].jugador.id).toBe(3);
    expect(r[r.length - 1].suficiente).toBe(false);
  });

  test('devuelve una fila por jugador, siempre', () => {
    expect(cargaDelPlantel(filas, jugadores, HOY)).toHaveLength(3);
    expect(cargaDelPlantel([], jugadores, HOY)).toHaveLength(3);
  });
});

describe('las ventanas son las que dicen ser', () => {
  test('7 días la aguda, 28 la crónica', () => {
    expect(DIAS_AGUDA).toBe(7);
    expect(DIAS_CRONICA).toBe(28);
    expect(metricasDeCarga(parejo(1, 6, 60), 1, HOY).serie).toHaveLength(28);
  });
});
