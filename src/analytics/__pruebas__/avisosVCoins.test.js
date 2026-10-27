import { describe, it, expect } from 'vitest';
import { textoAreas, cartelVCoins, conFactor, aplicaA } from '../avisosVCoins';
import { erroresMultiplicador } from '../usuarios';

const ahora = new Date('2026-10-30T12:00:00Z');
const actual = { nombre: 'FINDE', factor: 2, desde: '2026-10-30T00:00:00Z', hasta: '2026-11-01T00:00:00Z', aplica: ['penales', 'misiones'] };
const proximo = { nombre: 'HALLOWEEN', factor: 3, desde: '2026-10-31T00:00:00Z', hasta: '2026-11-01T00:00:00Z', aplica: null };

describe('v-coins: dónde aplica', () => {
  it('nombra los juegos, o "todos"', () => {
    expect(textoAreas(['misiones', 'penales'])).toBe('MISIONES Y PENALES');
    expect(textoAreas(['sobres', 'vdraft', 'penales'])).toBe('SOBRES, V-DRAFT Y PENALES');
    expect(textoAreas(null)).toBe('TODOS LOS JUEGOS');
  });
  it('los eventos viejos (sin aplica) valen para todo', () => {
    expect(aplicaA({ factor: 2 }, 'vdraft')).toBe(true);
    expect(aplicaA(actual, 'vdraft')).toBe(false);
  });
});

describe('v-coins: el cartel', () => {
  it('en curso manda; si no, el próximo; si no, nada', () => {
    expect(cartelVCoins({ actual, proximo }, ahora)).toMatchObject({ tipo: 'curso', titulo: 'x2 V-COINS · FINDE', donde: 'MISIONES Y PENALES' });
    expect(cartelVCoins({ actual: null, proximo }, ahora)).toMatchObject({ tipo: 'proximo', titulo: 'x3 V-COINS · HALLOWEEN', donde: 'TODOS LOS JUEGOS' });
    expect(cartelVCoins({}, ahora)).toBeNull();
    expect(cartelVCoins({ actual: { ...actual, hasta: '2026-10-30T11:00:00Z' } }, ahora)).toBeNull();
  });
  it('x1,5 con coma', () => {
    expect(cartelVCoins({ actual: { ...actual, factor: 1.5 } }, ahora).titulo).toBe('x1,5 V-COINS · FINDE');
  });
  it('el premio con el evento, sólo donde aplica', () => {
    expect(conFactor(25, { actual }, 'penales')).toBe(50);
    expect(conFactor(25, { actual }, 'vdraft')).toBe(25);
    expect(conFactor(25, null, 'penales')).toBe(25);
  });
});

describe('v-coins: el formulario', () => {
  it('pide al menos un juego', () => {
    const m = { nombre: 'X', factor: 2, desde: '2026-10-30T00:00', hasta: '2026-10-31T00:00' };
    expect(erroresMultiplicador({ ...m, aplica: [] })).toContain('Elegí al menos un juego.');
    expect(erroresMultiplicador({ ...m, aplica: ['sobres'] })).toEqual([]);
  });
});
