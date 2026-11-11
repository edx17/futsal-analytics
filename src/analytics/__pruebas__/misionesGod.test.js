import { describe, it, expect } from 'vitest';
import { nuevaMision, erroresDeMisiones, paraGuardar, misionesDelDia, tituloSugerido, diaIso, ACCIONES_MISION } from '../misionesGod';

const base = [
  { id: 'sobre', accion: 'sobres', titulo: 'Abrí 1 sobre', meta: 1, premio: 25, dias: [1, 2, 3, 4, 5, 6, 7], activa: true },
  { id: 'penales', accion: 'penales', titulo: 'Ganá 1 tanda', meta: 1, premio: 25, dias: [6, 7], activa: true },
];

describe('misiones GOD', () => {
  it('cada acción tiene su título sugerido, en singular y plural', () => {
    expect(ACCIONES_MISION).toHaveLength(7);
    expect(tituloSugerido('sobres', 1)).toBe('Abrí 1 sobre');
    expect(tituloSugerido('duelos_ganados', 3)).toBe('Ganá 3 duelos');
    expect(tituloSugerido('desafio', 4)).toBe('Jugá el desafío del día');
  });

  it('una misión nueva no repite id', () => {
    const m = nuevaMision([...base, { id: 'm_3' }], 'duelos_jugados');
    expect(m).toMatchObject({ id: 'm_4', accion: 'duelos_jugados', titulo: 'Jugá 1 duelo', meta: 1, activa: true });
  });

  it('avisa lo que está mal antes de guardar', () => {
    expect(erroresDeMisiones(base)).toEqual([]);
    const mal = erroresDeMisiones([
      { ...base[0], titulo: '  ' },
      { ...base[1], id: 'sobre', meta: 0, premio: 9000, dias: [] },
      { id: 'X!', accion: 'volar', titulo: 'x', meta: 1, premio: 1, dias: [1] },
    ]).map((e) => `${e.i}:${e.texto}`);
    expect(mal).toEqual([
      '0:El título va de 1 a 80 letras.',
      '1:Id repetido.', '1:La meta va de 1 a 50.', '1:El premio va de 0 a 5000 V-Coins.', '1:Elegí al menos un día.',
      '2:Id inválido.', '2:Elegí qué hay que hacer.',
    ]);
  });

  it('se guarda con el orden de la lista y los días ordenados', () => {
    const g = paraGuardar([{ ...base[1], dias: [7, 6], titulo: ' Ganá ' }, base[0]]);
    expect(g.map((m) => [m.id, m.orden])).toEqual([['penales', 1], ['sobre', 2]]);
    expect(g[0]).toMatchObject({ dias: [6, 7], titulo: 'Ganá', activa: true });
  });

  it('qué se ve cada día y cuánto se puede ganar', () => {
    expect(misionesDelDia(base, 1)).toMatchObject({ vcoins: 25 });
    expect(misionesDelDia(base, 7).misiones.map((m) => m.id)).toEqual(['sobre', 'penales']);
    expect(misionesDelDia([{ ...base[0], activa: false }], 1).misiones).toEqual([]);
    expect(diaIso(new Date(2026, 10, 15))).toBe(7); // domingo
    expect(diaIso(new Date(2026, 10, 16))).toBe(1); // lunes
  });
});
