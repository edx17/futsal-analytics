import { describe, it, expect } from 'vitest';
import {
  diaDeLaSemana, resultadoDe, resumenPorDia, resumenPorGrupo, extremos,
  DIAS, GRUPOS,
} from '../diasSemana.js';

const p = (fecha, gf, gc) => ({ fecha, goles_propios: gf, goles_rival: gc });

describe('diaDeLaSemana', () => {
  it('lee el día correcto', () => {
    // 2026-09-21 fue lunes.
    expect(diaDeLaSemana('2026-09-21')).toBe(1);
    expect(diaDeLaSemana('2026-09-22')).toBe(2);
    expect(diaDeLaSemana('2026-09-26')).toBe(6);
    expect(diaDeLaSemana('2026-09-27')).toBe(0);
  });

  it('NO se corre un día por el huso horario', () => {
    // Este es el bug que arruinaría el bloque entero: new Date('2026-09-21')
    // parsea a medianoche UTC y getDay() lo lee en hora local, así que en
    // Argentina (UTC−3) devolvería domingo en vez de lunes.
    expect(diaDeLaSemana('2026-09-21')).toBe(1);
    expect(new Date('2026-09-21').getUTCDay()).toBe(1);   // referencia
  });

  it('aguanta la marca de tiempo completa que a veces manda la base', () => {
    expect(diaDeLaSemana('2026-09-21T00:00:00+00:00')).toBe(1);
    expect(diaDeLaSemana('2026-09-21T23:59:59Z')).toBe(1);
  });

  it('entiende el formato con barras', () => {
    expect(diaDeLaSemana('21/09/2026')).toBe(1);
    expect(diaDeLaSemana('27/09/2026')).toBe(0);
  });

  it('devuelve null si la fecha falta o no se entiende', () => {
    expect(diaDeLaSemana(null)).toBe(null);
    expect(diaDeLaSemana('')).toBe(null);
    expect(diaDeLaSemana('el sábado')).toBe(null);
    expect(diaDeLaSemana('2026-09')).toBe(null);
  });

  it('devuelve null para una fecha que no existe', () => {
    expect(diaDeLaSemana('2026-02-31')).toBe(null);
    expect(diaDeLaSemana('2026-13-01')).toBe(null);
  });
});

describe('los nombres en plural', () => {
  it('de lunes a viernes no llevan s: "los martes", no "los martess"', () => {
    const plural = Object.fromEntries(DIAS.map((d) => [d.corto, d.plural]));
    expect(plural).toEqual({
      LUN: 'lunes', MAR: 'martes', 'MIÉ': 'miércoles', JUE: 'jueves',
      VIE: 'viernes', 'SÁB': 'sábados', DOM: 'domingos',
    });
  });

  it('ninguno termina en doble s', () => {
    DIAS.forEach((d) => expect(d.plural.endsWith('ss')).toBe(false));
  });
});

describe('resultadoDe', () => {
  it('distingue las tres', () => {
    expect(resultadoDe(p('2026-09-21', 3, 1))).toBe('V');
    expect(resultadoDe(p('2026-09-21', 2, 2))).toBe('E');
    expect(resultadoDe(p('2026-09-21', 0, 1))).toBe('D');
  });

  it('un partido sin goles cargados es 0 a 0, o sea empate', () => {
    expect(resultadoDe({ fecha: '2026-09-21' })).toBe('E');
  });
});

describe('resumenPorDia', () => {
  const partidos = [
    p('2026-09-21', 3, 1),   // lunes   V
    p('2026-09-28', 0, 2),   // lunes   D
    p('2026-09-26', 2, 2),   // sábado  E
    p('2026-10-03', 5, 0),   // sábado  V
    p('2026-10-10', 1, 0),   // sábado  V
  ];

  it('devuelve siempre los siete días, de lunes a domingo', () => {
    const { filas } = resumenPorDia(partidos);
    expect(filas).toHaveLength(7);
    expect(filas.map((f) => f.corto)).toEqual(['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']);
  });

  it('cuenta bien jugados, ganados, empatados y perdidos', () => {
    const { filas } = resumenPorDia(partidos);
    const lun = filas.find((f) => f.n === 1);
    const sab = filas.find((f) => f.n === 6);
    expect(lun).toMatchObject({ pj: 2, pg: 1, pe: 0, pp: 1 });
    expect(sab).toMatchObject({ pj: 3, pg: 2, pe: 1, pp: 0 });
  });

  it('suma los goles a favor y en contra', () => {
    const { filas } = resumenPorDia(partidos);
    const sab = filas.find((f) => f.n === 6);
    expect(sab).toMatchObject({ gf: 8, gc: 2, dg: 6 });
  });

  it('el día sin partidos viene en cero, no desaparece', () => {
    // Que nunca hayamos jugado un miércoles es información.
    const { filas } = resumenPorDia(partidos);
    const mie = filas.find((f) => f.n === 3);
    expect(mie).toMatchObject({ pj: 0, pg: 0, pts: 0 });
    expect(mie.efectividad).toBe(null);
  });

  it('calcula los puntos y la efectividad sobre lo que había en juego', () => {
    const { filas } = resumenPorDia(partidos);
    const sab = filas.find((f) => f.n === 6);
    expect(sab.pts).toBe(7);                       // 2 × 3 + 1
    expect(sab.efectividad).toBeCloseTo(77.78, 1); // 7 de 9
  });

  it('los partidos con fecha ilegible se cuentan aparte, no se reparten', () => {
    const { filas, sinFecha } = resumenPorDia([...partidos, p(null, 1, 0), p('cuando sea', 2, 0)]);
    expect(sinFecha).toBe(2);
    expect(filas.reduce((a, f) => a + f.pj, 0)).toBe(5);
  });

  it('no se cae con la lista vacía', () => {
    const { filas, sinFecha } = resumenPorDia([]);
    expect(filas).toHaveLength(7);
    expect(filas.every((f) => f.pj === 0)).toBe(true);
    expect(sinFecha).toBe(0);
    expect(resumenPorDia().filas).toHaveLength(7);
  });

  it('los totales de los siete días cierran con los partidos que entraron', () => {
    const { filas } = resumenPorDia(partidos);
    expect(filas.reduce((a, f) => a + f.pj, 0)).toBe(partidos.length);
    expect(filas.reduce((a, f) => a + f.pg + f.pe + f.pp, 0)).toBe(partidos.length);
  });
});

describe('resumenPorGrupo', () => {
  const partidos = [
    p('2026-09-22', 1, 0),   // martes   V  → semana
    p('2026-09-24', 0, 3),   // jueves   D  → semana
    p('2026-09-25', 2, 1),   // viernes  V  → finde
    p('2026-09-26', 1, 1),   // sábado   E  → finde
    p('2026-09-27', 4, 0),   // domingo  V  → finde
  ];

  it('el viernes cuenta como fin de semana, no como día de semana', () => {
    // Es la definición del club, no la del calendario.
    const [semana, finde] = resumenPorGrupo(partidos);
    expect(semana.pj).toBe(2);
    expect(finde.pj).toBe(3);
    expect(GRUPOS[1].dias).toContain(5);
  });

  it('acumula bien cada grupo', () => {
    const [semana, finde] = resumenPorGrupo(partidos);
    expect(semana).toMatchObject({ pj: 2, pg: 1, pe: 0, pp: 1, gf: 1, gc: 3 });
    expect(finde).toMatchObject({ pj: 3, pg: 2, pe: 1, pp: 0, gf: 7, gc: 2 });
  });

  it('los dos grupos suman todos los partidos: ningún día queda afuera', () => {
    const cubiertos = GRUPOS.flatMap((g) => g.dias).sort();
    expect(cubiertos).toEqual(DIAS.map((d) => d.n).sort());
    const [a, b] = resumenPorGrupo(partidos);
    expect(a.pj + b.pj).toBe(partidos.length);
  });

  it('un grupo sin partidos no rompe', () => {
    const [semana, finde] = resumenPorGrupo([p('2026-09-26', 1, 0)]);
    expect(semana).toMatchObject({ pj: 0, pts: 0 });
    expect(semana.efectividad).toBe(null);
    expect(finde.pj).toBe(1);
  });
});

describe('extremos', () => {
  const armar = (porDia) => resumenPorDia(porDia).filas;

  it('encuentra el mejor y el peor día', () => {
    const partidos = [
      ...Array.from({ length: 3 }, () => p('2026-09-26', 3, 0)),   // sábados, todo ganado
      ...Array.from({ length: 3 }, () => p('2026-09-22', 0, 2)),   // martes, todo perdido
    ];
    const { mejor, peor } = extremos(armar(partidos));
    expect(mejor.nombre).toBe('Sábado');
    expect(peor.nombre).toBe('Martes');
  });

  it('ignora los días con pocos partidos: un día con uno solo no es un hallazgo', () => {
    const partidos = [
      p('2026-09-25', 9, 0),                                        // un viernes suelto, goleada
      ...Array.from({ length: 3 }, () => p('2026-09-26', 3, 0)),    // tres sábados ganados
      ...Array.from({ length: 3 }, () => p('2026-09-22', 0, 1)),    // tres martes perdidos
    ];
    const { mejor } = extremos(armar(partidos));
    expect(mejor.nombre).toBe('Sábado');   // no el viernes del 9 a 0
  });

  it('se puede bajar el mínimo a mano', () => {
    const partidos = [p('2026-09-25', 9, 0), p('2026-09-22', 0, 1)];
    const { mejor } = extremos(armar(partidos), 1);
    expect(mejor.nombre).toBe('Viernes');
  });

  it('sin suficientes días comparables no inventa un ganador', () => {
    expect(extremos(armar([p('2026-09-26', 1, 0)]))).toMatchObject({ mejor: null, peor: null });
    expect(extremos([])).toMatchObject({ mejor: null, peor: null });
  });
});
