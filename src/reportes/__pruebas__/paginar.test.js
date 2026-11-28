import { describe, it, expect } from 'vitest';
import { paginar } from '../paginar';

const s = (id, alto, filas = null) => ({ id, alto, filas });
const ids = (hojas) => hojas.map((h) => h.map((x) => x.id));

describe('paginar: hojas A4 armadas por la app', () => {
  it('hoja 1 = portada + devolución + staff (achicadas si hace falta) y el resto desde la hoja 2', () => {
    const h = paginar([s('portada', 300), s('devolucion', 600), s('staff', 100), s('numeros', 200)], { alto: 900, separacion: 0 });
    expect(ids(h)).toEqual([['portada', 'devolucion', 'staff'], ['numeros']]);
    expect(h[0][0].escala).toBe(1);
    expect(h[0][1].escala).toBeCloseTo(600 / 700, 3);
  });

  it('la tabla variable muestra todas las filas que entran en lo que queda (entre el mínimo y el total)', () => {
    const tabla = s('mejores', 100 + 10 * 40, { total: 10, min: 5, alturas: Array(10).fill(40) });
    const h = paginar([s('numeros', 600), tabla], { alto: 1000 });
    expect(ids(h)).toEqual([['numeros', 'mejores']]);
    expect(h[0][1].filas).toBe(7);   // quedan 400: 100 + 7 filas × 40 = 380
  });

  it('lo que casi entra se achica en vez de dejar el hueco; lo que no, pasa a la siguiente', () => {
    const casi = paginar([s('a', 600), s('b', 450)], { alto: 1000 });
    expect(ids(casi)).toEqual([['a', 'b']]);
    expect(casi[0][1].escala).toBeCloseTo(400 / 450, 3);
    const lejos = paginar([s('a', 800), s('b', 450)], { alto: 1000 });
    expect(ids(lejos)).toEqual([['a'], ['b']]);
  });

  it('una sección más alta que una hoja se achica; si ni así entra, se deja al navegador (null)', () => {
    expect(paginar([s('a', 1200)], { alto: 1000 })[0][0].escala).toBeCloseTo(1000 / 1200, 3);
    expect(paginar([s('a', 5000)], { alto: 1000 })).toBeNull();
  });
});

describe('paginar: la última hoja casi vacía', () => {
  it('se junta con la anterior achicando las dos (si no baja de 0.8)', () => {
    const h = paginar([s('a', 880), s('b', 240)], { alto: 1000 });
    expect(ids(h)).toEqual([['a', 'b']]);
    expect(h[0][0].escala).toBeCloseTo(1000 / 1120, 3);
    expect(ids(paginar([s('a', 950), s('b', 320)], { alto: 1000 }))).toEqual([['a'], ['b']]);   // haría falta 0.79: no se junta
  });
  it('la hoja 1 con la devolución no se toca', () => {
    const h = paginar([s('portada', 200), s('devolucion', 700), s('staff', 80), s('fisico', 200)], { alto: 1000 });
    expect(ids(h)).toEqual([['portada', 'devolucion', 'staff'], ['fisico']]);
  });
});
