import { describe, it, expect } from 'vitest';
import { columnasQueEntran } from '../../utils/useAncho.js';

/* El caso que motivó esto: a 768px la grilla mostraba tres columnas, dos de
   300px y una tercera de 104px, porque una tarjeta pedía `span 3` y eso obliga
   a la grilla a tener tres columnas entren o no. */
describe('columnasQueEntran', () => {
  it('un teléfono da una sola columna', () => {
    expect(columnasQueEntran(328)).toBe(1);
  });

  it('una tablet en vertical da dos, no tres', () => {
    expect(columnasQueEntran(736)).toBe(2);
  });

  it('una notebook con la barra lateral abierta da tres', () => {
    // 1100px es lo que le queda al tablero en una pantalla de 1280 con la
    // barra lateral desplegada, medido en el navegador.
    expect(columnasQueEntran(1100)).toBe(3);
  });

  it('una pantalla ancha sin barra lateral da cuatro', () => {
    expect(columnasQueEntran(1248)).toBe(4);   // 4 × 300 + 3 × 16 = 1248 justo
  });

  it('nunca pasa de cuatro, por ancha que sea la pantalla', () => {
    expect(columnasQueEntran(4000)).toBe(4);
    expect(columnasQueEntran(99999)).toBe(4);
  });

  it('cuenta la separación entre columnas', () => {
    // Dos columnas de 300 necesitan 616px con 16 de separación, no 600.
    expect(columnasQueEntran(600)).toBe(1);
    expect(columnasQueEntran(616)).toBe(2);
  });

  it('nunca devuelve cero, por angosto que sea', () => {
    expect(columnasQueEntran(50)).toBe(1);
    expect(columnasQueEntran(1)).toBe(1);
  });

  it('sin medir todavía devuelve el valor por defecto, no cero', () => {
    // Con cero la grilla parpadearía a una columna antes de acomodarse.
    expect(columnasQueEntran(0)).toBe(3);
    expect(columnasQueEntran(undefined)).toBe(3);
    expect(columnasQueEntran(0, { porDefecto: 2 })).toBe(2);
  });

  it('se le puede cambiar el mínimo y el tope', () => {
    expect(columnasQueEntran(1000, { minimo: 200 })).toBe(4);
    expect(columnasQueEntran(1000, { minimo: 200, tope: 2 })).toBe(2);
  });
});
