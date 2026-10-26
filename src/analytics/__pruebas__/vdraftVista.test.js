import { describe, it, expect } from 'vitest';
import { caminoDePremios, podioDelRanking, destinoDeCarta, avanceDelDraft } from '../vdraftVista';
import { FORMACIONES } from '../quinteto';

describe('v-draft: el camino de premios', () => {
  it('4 escalones con su trofeo, V-Coins y sobre', () => {
    const c = caminoDePremios();
    expect(c.map((e) => e.trofeo)).toEqual(['bronce', 'plata', 'oro', 'leyenda']);
    expect(c.map((e) => e.vcoins)).toEqual([25, 75, 150, 300]);
    expect(c[2].sobre).toBe('SOBRE DE CAMPEÓN');
    expect(c[0].sobre).toBeNull();
  });
});

describe('v-draft: el podio', () => {
  const r = (nombre, yo = false) => ({ nombre, yo });
  it('2º, 1º, 3º arriba y el resto abajo, con mi puesto', () => {
    const p = podioDelRanking([r('A'), r('B'), r('C'), r('D', true), r('E')]);
    expect(p.podio.map((x) => [x.nombre, x.puesto])).toEqual([['B', 2], ['A', 1], ['C', 3]]);
    expect(p.resto.map((x) => x.puesto)).toEqual([4, 5]);
    expect(p.yo).toBe(4);
  });
  it('con menos de 3 no deja huecos', () => {
    expect(podioDelRanking([r('A')]).podio.map((x) => x.nombre)).toEqual(['A']);
    expect(podioDelRanking([]).yo).toBeNull();
  });
});

describe('v-draft: adónde vuela la carta', () => {
  const lugares = FORMACIONES['1-2-1'].lugares;
  const base = { lugares, equipo: [null, null, null, null, null], banco: [] };
  it('el capitán, al lugar de su puesto (o al 1 si no hay)', () => {
    expect(destinoDeCarta({ ...base, paso: 'capitan' }, { carta: { rol: 'PIV' } })).toEqual({ lugar: 4 });
    expect(destinoDeCarta({ ...base, paso: 'capitan' }, { carta: { rol: 'XXX' } })).toEqual({ lugar: 1 });
  });
  it('en la cancha, al lugar del draft; en el banco, al siguiente suplente', () => {
    expect(destinoDeCarta({ ...base, paso: 'lugar', lugar_actual: 2 }, {})).toEqual({ lugar: 2 });
    expect(destinoDeCarta({ ...base, paso: 'banco', banco: [{}] }, {})).toEqual({ banco: 1 });
  });
  it('cuenta lo elegido', () => {
    expect(avanceDelDraft({ equipo: [{}, null, {}, null, null], banco: [{}] })).toEqual({ hechos: 3, total: 7 });
  });
});
