import { describe, it, expect } from 'vitest';
import { compararConCatalogo, resumenAlta, jugadoresSinCarta, cartaBaseManual, atributosSugeridos } from '../altaCartas';

const fila = (clave, tipo = 'BASE') => ({ clave, tipo, rareza: 'oro', carta: {} });

describe('alta de cartas: lo publicado no se pisa', () => {
  it('separa nuevas, publicadas y eliminadas', () => {
    const items = compararConCatalogo(
      [fila('BASE|1'), fila('BASE|2'), fila('TOTW|3', 'TOTW'), fila('TOTW|4', 'TOTW')],
      [{ clave: 'BASE|1', rareza: 'plata' }],
      new Set(['TOTW|4']),
    );
    expect(items.map((i) => i.estado)).toEqual(['publicada', 'nueva', 'nueva', 'eliminada']);
    expect(items[0].existente.rareza).toBe('plata'); // la publicada manda
    expect(resumenAlta(items)).toEqual({ estados: { nueva: 2, publicada: 1, eliminada: 1 }, nuevasPorTipo: { BASE: 1, TOTW: 1 } });
  });
});

describe('alta de cartas: la carta base a mano', () => {
  const plantel = [
    { id: 1, apellido: 'Zeta', posicion: 'Ala' },
    { id: 2, apellido: 'Alfa', posicion: 'Arquero' },
    { id: 3, apellido: 'Beta', posicion: 'Pivot' },
    { id: 4, apellido: 'Gama', posicion: 'Cierre', estado_ficha: 'baja' },
    { id: 5, apellido: 'Delta', posicion: 'Ala' },
  ];
  it('ofrece sólo a quien no tiene carta publicada ni calculada (o está en evaluación)', () => {
    const cartas = [{ id: '1', enEvaluacion: true, stats: { pj: 2 } }, { id: '3', enEvaluacion: false, stats: { pj: 9 } }];
    const sin = jugadoresSinCarta(plantel, cartas, [{ clave: 'BASE|5' }]);
    expect(sin.map((j) => j.id)).toEqual([2, 1]); // por apellido; 3 tiene carta, 4 está de baja, 5 ya publicada
    expect(sin[1]).toMatchObject({ rol: 'ALA', partidos: 2 });
  });

  it('arma la fila del catálogo con su rareza por la media', () => {
    const f = cartaBaseManual({ id: 7, nombre: 'Ana', apellido: 'Paz', posicion: 'Cierre' }, { ovr: 68 });
    expect(f).toMatchObject({ clave: 'BASE|7', jugador_id: '7', tipo: 'BASE', rareza: 'plata' });
    expect(f.carta).toMatchObject({ rol: 'CIE', ovr: 68, tier: 'plata', manual: true, enEvaluacion: false });
    expect(f.carta.atributos.map(([k]) => k)).toEqual(['TIR', 'PAS', 'REG', 'DEF', 'IMP', 'FÍS']);
  });

  it('las stats sugeridas siguen al puesto y quedan entre 1 y 99', () => {
    expect(atributosSugeridos('ARQ', 70).map(([k]) => k)).toEqual(['ATA', 'EVI', 'PIE', 'SAL', 'IMP', 'FÍS']);
    expect(Object.fromEntries(atributosSugeridos('PIV', 97)).TIR).toBe(99);
    expect(cartaBaseManual({ id: 1, posicion: 'Ala' }, { ovr: 80, atributos: [['TIR', 150]] }).carta.atributos).toEqual([['TIR', 99]]);
  });
});
