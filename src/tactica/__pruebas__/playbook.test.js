import { describe, it, expect } from 'vitest';
import { normalizarJugada, movimientos, tieneDibujo } from '../playbook';

const el = (id, x, y, extra = {}) => ({ id, type: 'home', x, y, ...extra });

describe('normalizarJugada', () => {
  it('toma los fotogramas del creador actual', () => {
    const j = normalizarJugada({ cancha: { tamaño: '28x20', material: 'parquet' },
      frames: [{ id: 'a', elements: [el('p1', 10, 10)], arrows: [] }, { elements: [el('p1', 50, 10)], arrows: [], duracion: 700 }] });
    expect(j.frames).toHaveLength(2);
    expect(j.frames[1].id).toBe('f1');
    expect(j.frames[1].duracion).toBe(700);
    expect(j.pitchCfg.variant).toBe('28x20');
    expect(j.pitchCfg.material).toBe('parquet');
  });

  it('convierte una jugada vieja de un solo dibujo (elementos/lineas)', () => {
    const j = normalizarJugada({ elementos: [{ id: 'v', tipo: 'pelota', x: 5, y: 6 }], lineas: [] });
    expect(j.frames).toHaveLength(1);
    expect(j.frames[0].elements[0].type).toBe('ball');
    expect(j.pitchCfg.variant).toBe('40x20');
  });

  it('no se rompe sin datos', () => {
    expect(normalizarJugada(null).frames).toHaveLength(1);
    expect(tieneDibujo(null)).toBe(false);
    expect(tieneDibujo({ frames: [{ elements: [el('p', 1, 1)], arrows: [] }] })).toBe(true);
  });
});

describe('movimientos', () => {
  const f0 = { elements: [el('a', 100, 100), el('b', 200, 200), el('c', 300, 300), { id: 'z', type: 'zone-rect', x: 0, y: 0, w: 10, h: 10 }] };
  const f1 = { elements: [el('a', 180, 100, { bow: { x: 0, y: -20 } }), el('b', 203, 202), el('nuevo', 50, 50), { id: 'z', type: 'zone-rect', x: 90, y: 0, w: 10, h: 10 }] };

  it('cuenta sólo las fichas que se desplazan de verdad', () => {
    const m = movimientos(f0, f1);
    expect(m.map((x) => x.el.id)).toEqual(['a']);           // b es un retoque; c no está; las zonas no corren
    expect(m[0].desde).toMatchObject({ x: 100, y: 100 });
    expect(m[0].bow).toEqual({ x: 0, y: -20 });             // la curva del recorrido se conserva
  });

  it('el primer paso no tiene movimientos', () => {
    expect(movimientos(null, f0)).toEqual([]);
  });
});
