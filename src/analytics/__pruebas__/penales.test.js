import { describe, it, expect } from 'vitest';
import { DIFICULTAD, patear, atajar, turno, ganador, marcadorDeTiros } from '../penales';

const fijo = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const t = (equipo, gol) => ({ equipo, gol });

describe('penales: un tiro', () => {
  const d = DIFICULTAD[0];
  it('patear: si el arquero va al mismo cuadrante, ataja', () => {
    expect(patear(4, d, fijo(4 / 9 + 0.01))).toMatchObject({ arquero: 4, gol: false, motivo: 'atajada' });
  });
  it('patear: al lado llega sólo con la chance de alcance; lejos, gol', () => {
    expect(patear(4, d, fijo(3 / 9 + 0.01, 0.99))).toMatchObject({ arquero: 3, gol: true });
    expect(patear(4, d, fijo(3 / 9 + 0.01, 0.05))).toMatchObject({ arquero: 3, gol: false });
    expect(patear(0, d, fijo(8 / 9 + 0.01, 0.99))).toMatchObject({ arquero: 8, gol: true });
  });
  it('patear: un ángulo puede ir al palo', () => {
    expect(patear(0, d, fijo(0.5, 0.01))).toMatchObject({ gol: false, motivo: 'palo' });
  });
  it('atajar: misma columna con la chance de atajar; otra, gol', () => {
    expect(atajar(0, d, fijo(0.01, 0.5, 0.1))).toMatchObject({ celda: 0, gol: false, motivo: 'atajada' });
    expect(atajar(2, d, fijo(0.01, 0.5, 0.1))).toMatchObject({ celda: 0, gol: true });
  });
  it('la dificultad sube con la ronda', () => {
    expect(DIFICULTAD[3].alcance).toBeGreaterThan(DIFICULTAD[0].alcance);
    expect(DIFICULTAD[3].ataja).toBeLessThan(DIFICULTAD[0].ataja);
  });
});

describe('penales: la tanda', () => {
  it('alternan empezando por el que arranca', () => {
    expect(turno({ primero: 'rival', tiros: [] })).toBe('rival');
    expect(turno({ primero: 'rival', tiros: [t('rival', true)] })).toBe('propio');
    expect(turno({ primero: 'rival', tiros: [t('rival', true), t('propio', false)] })).toBe('rival');
  });
  it('se corta cuando uno ya no puede alcanzar al otro', () => {
    // 3-0 después de 3 tiros cada uno: al rival le quedan 2, no llega.
    const tiros = [t('propio', true), t('rival', false), t('propio', true), t('rival', false), t('propio', true), t('rival', false)];
    expect(ganador(tiros)).toBe('propio');
    expect(ganador(tiros.slice(0, 4))).toBeNull();
  });
  it('5 y 5 empatados: muerte súbita, se define después de cada par', () => {
    const cinco = Array.from({ length: 5 }, () => [t('propio', true), t('rival', true)]).flat();
    expect(ganador(cinco)).toBeNull();
    expect(ganador([...cinco, t('propio', true)])).toBeNull();
    expect(ganador([...cinco, t('propio', true), t('rival', false)])).toBe('propio');
  });
  it('los puntitos: 5 por lado, más los de la muerte súbita', () => {
    expect(marcadorDeTiros([t('propio', true), t('rival', false)], 'propio')).toEqual([true, null, null, null, null]);
    const largo = Array.from({ length: 6 }, () => [t('propio', true), t('rival', true)]).flat();
    expect(marcadorDeTiros(largo, 'rival')).toHaveLength(6);
  });
});
