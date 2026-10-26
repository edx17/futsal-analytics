import { describe, it, expect } from 'vitest';
import {
  valorPateador, valorArquero, chancesPatear, chancesAtajar, patearConCarta, atajarConCarta, cartasParaPenales, SIN_ELEGIR,
} from '../penalesCartas';
import { tandaNueva } from '../penales';

const campo = (tir, imp, ovr = 70) => ({ carta: { rol: 'ALA', ovr, atributos: [['TIR', tir], ['IMP', imp]] } });
const arq = (ata, sal, evi, ovr = 70) => ({ carta: { rol: 'ARQ', ovr, atributos: [['ATA', ata], ['SAL', sal], ['EVI', evi]] } });
/* Un azar que devuelve los valores en orden. */
const secuencia = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('penales con cartas: lo que vale cada carta', () => {
  it('pateador 0,6 TIR + 0,4 IMP; arquero promedio de ATA, SAL y EVI', () => {
    expect(valorPateador(campo(90, 60))).toBe(78);
    expect(valorArquero(arq(80, 70, 90))).toBe(80);
  });
  it('sin atributos, la media de la carta', () => {
    expect(valorPateador({ carta: { ovr: 66 } })).toBe(66);
    expect(valorArquero({ carta: { ovr: 71, atributos: [['ATA', 80]] } })).toBe(71);
  });
  it('separa pateadores y arqueros, del mejor al peor', () => {
    const r = cartasParaPenales([campo(60, 60), arq(70, 70, 70), campo(90, 90), arq(90, 90, 90)]);
    expect(r.pateadores.map(valorPateador)).toEqual([90, 60]);
    expect(r.arqueros.map(valorArquero)).toEqual([90, 70]);
  });
});

describe('penales con cartas: las chances', () => {
  it('mejor pateador: menos palo y menos atajadas', () => {
    const bueno = chancesPatear(90, 70);
    const malo = chancesPatear(55, 70);
    expect(bueno.palo).toBeLessThan(malo.palo);
    expect(bueno.mismo).toBeLessThan(malo.mismo);
    expect(bueno.vecino).toBeLessThan(malo.vecino);
  });
  it('mejor arquero propio: ataja más', () => {
    expect(chancesAtajar(90, 70).mismo).toBeGreaterThan(chancesAtajar(60, 70).mismo);
  });
  it('siempre dentro de los topes', () => {
    const c = chancesPatear(0, 200);
    expect(c.mismo).toBe(0.85);
    expect(c.palo).toBe(0.12);
  });
});

describe('penales con cartas: los tiros', () => {
  it('el arquero lee el tiro y ataja', () => {
    // lectura (0) → arquero = celda; no es esquina; ataja (0)
    expect(patearConCarta(4, 70, 70, secuencia(0, 0))).toMatchObject({ arquero: 4, gol: false, motivo: 'atajada' });
  });
  it('lejos del arquero es gol', () => {
    // no lee (0.99) → arquero al 8 (0.95); al 0 (esquina) sin palo (0.99)
    expect(patearConCarta(0, 70, 70, secuencia(0.99, 0.95, 0.99))).toMatchObject({ arquero: 8, gol: true });
  });
  it('sin elegir a tiempo puede irse afuera', () => {
    expect(patearConCarta(SIN_ELEGIR, 70, 70, secuencia(0.5, 0.1))).toMatchObject({ gol: false, motivo: 'afuera' });
  });
  it('atajando: adivinar el cuadrante ataja; sin elegir te quedás en el medio', () => {
    // celda 4 (0.5), no afuera (0.9), ataja (0)
    expect(atajarConCarta(SIN_ELEGIR, 70, 70, secuencia(0.5, 0.9, 0))).toMatchObject({ celda: 4, arquero: 4, gol: false, motivo: 'atajada' });
    // celda 8 (0.95), no afuera, lejos del 0 → gol
    expect(atajarConCarta(0, 70, 70, secuencia(0.95, 0.9, 0.9))).toMatchObject({ celda: 8, gol: true });
  });
  it('a la larga, mejores cartas ganan más tiros', () => {
    let a = 0; let b = 0;
    let s = 1;
    const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 4000; i++) {
      if (patearConCarta(i % 9, 90, 70, azar).gol) a++;
      if (patearConCarta(i % 9, 55, 70, azar).gol) b++;
    }
    expect(a).toBeGreaterThan(b);
  });
  it('la tanda usa el mismo turno que la de práctica', () => {
    expect(tandaNueva(0, 'rival').turno).toBe('rival');
  });
});

describe('penales con cartas: el equilibrio', () => {
  /* Cuántos de 10.000 tiros terminan en gol, con un azar fijo. */
  const conversion = (fn) => {
    let s = 7;
    const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    let goles = 0;
    for (let i = 0; i < 10000; i++) if (fn(i % 9, azar).gol) goles++;
    return goles / 10000;
  };
  it('con un crack contra Amateur se convierte mucho, pero no todo', () => {
    const c = conversion((celda, azar) => patearConCarta(celda, 87, 58, azar));
    expect(c).toBeGreaterThan(0.8);
    expect(c).toBeLessThan(0.95);
  });
  it('contra Primera A, un pateador común erra bastante más', () => {
    const c = conversion((celda, azar) => patearConCarta(celda, 70, 82, azar));
    expect(c).toBeGreaterThan(0.6);
    expect(c).toBeLessThan(0.8);
  });
});
