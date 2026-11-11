import { describe, it, expect } from 'vitest';
import { opcionesParaLugar, ponerCarta, lugarLibre, mejorEquipo, equipoCompleto, venceEn, textoResultado } from '../duelos';

const c = (id, rol, ovr, jugador = id) => ({ catalogo_id: id, carta: { id: jugador, rol, ovr } });
const coleccion = [c('a1', 'ARQ', 80), c('a2', 'ARQ', 70), c('p1', 'PIV', 85), c('l1', 'ALA', 82), c('l2', 'ALA', 78),
  c('c1', 'CIE', 75), c('c2', 'CIE', 90, 'c1')];

describe('duelo: el armado', () => {
  it('el arco sólo con arqueros; el campo, primero los de su puesto', () => {
    expect(opcionesParaLugar(coleccion, [], 0).map((x) => x.catalogo_id)).toEqual(['a1', 'a2']);
    const piv = opcionesParaLugar(coleccion, [], 4, '1-2-1');   // 1-2-1: el último es el pivot
    expect(piv[0].catalogo_id).toBe('p1');
    expect(piv.some((x) => x.carta.rol === 'ARQ')).toBe(false);
  });
  it('no repite jugador: si lo ponés en otro lugar, sale del anterior', () => {
    let eq = ponerCarta([], 1, coleccion[5]);
    eq = ponerCarta(eq, 2, coleccion[6]);   // c2 es el mismo jugador que c1
    expect(eq[1]).toBeNull();
    expect(eq[2].catalogo_id).toBe('c2');
    expect(opcionesParaLugar(coleccion, eq, 3).some((x) => x.carta.id === 'c1')).toBe(false);
  });
  it('arma el mejor equipo y avisa cuándo está completo', () => {
    const eq = mejorEquipo(coleccion, '1-2-1');
    expect(equipoCompleto(eq)).toBe(true);
    expect(eq[0].catalogo_id).toBe('a1');
    expect(new Set(eq.map((x) => x.carta.id)).size).toBe(5);
    expect(lugarLibre(eq)).toBeNull();
    expect(lugarLibre([eq[0]])).toBe(1);
  });
});

describe('duelo: textos', () => {
  it('cuánto falta para que venza', () => {
    const ahora = Date.parse('2026-11-12T10:00:00Z');
    expect(venceEn('2026-11-12T15:30:00Z', ahora)).toBe('vence en 5 h');
    expect(venceEn('2026-11-12T10:20:00Z', ahora)).toBe('vence en 20 min');
    expect(venceEn('2026-11-12T09:00:00Z', ahora)).toBe('vencido');
  });
  it('el resultado desde mi lado, con penales', () => {
    expect(textoResultado({ estado: 'jugado', soy: 'rival', resultado: { gane: true, mis_goles: 3, sus_goles: 3, penales: { r: 3, v: 4 } } }))
      .toBe('GANASTE 3-3 (pen. 4-3)');
    expect(textoResultado({ estado: 'rechazado', soy: 'retador' })).toBe('Lo rechazó');
  });
});
