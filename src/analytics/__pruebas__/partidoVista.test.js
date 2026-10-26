import { describe, it, expect } from 'vitest';
import { atributo, perfilEquipo, parte, favorito, cartaDelAutor, despuesDelPartido, monedasQueCaen } from '../partidoVista';

const campo = (ap, tir, pas, reg, def) => ({ carta: { apellido: ap, atributos: [['TIR', tir], ['PAS', pas], ['REG', reg], ['DEF', def]] } });
const arq = { carta: { apellido: 'ARQ', atributos: [['ATA', 80], ['SAL', 70], ['EVI', 90]] } };

describe('partido: el perfil de tu equipo', () => {
  it('lee los atributos de la carta', () => {
    expect(atributo(campo('A', 80, 70, 60, 50), 'PAS')).toBe(70);
    expect(atributo({ carta: {} }, 'TIR')).toBeNull();
  });
  it('ataque, defensa y arco desde las cartas', () => {
    const p = perfilEquipo([arq, campo('A', 80, 70, 60, 50), campo('B', 90, 80, 70, 70)]);
    expect(p).toEqual({ ataque: 75, defensa: 60, arco: 80 });
  });
  it('sin cartas no inventa', () => {
    expect(perfilEquipo([null, null])).toEqual({ ataque: null, defensa: null, arco: null });
  });
});

describe('partido: el VS', () => {
  it('reparte la barra y marca al favorito', () => {
    expect(parte(75, 25)).toBe(0.75);
    expect(parte(null, 3)).toBe(0.5);
    expect(favorito(80, 70)).toBe('propio');
    expect(favorito(70, 80)).toBe('rival');
    expect(favorito(70, 71)).toBe('parejo');
  });
});

describe('partido: goles y después', () => {
  it('encuentra la carta del autor, también en el banco', () => {
    const partida = { equipo: [arq, campo('PEREZ', 1, 1, 1, 1)], banco: [campo('GOMEZ', 1, 1, 1, 1)] };
    expect(cartaDelAutor(partida, 'GOMEZ').carta.apellido).toBe('GOMEZ');
    expect(cartaDelAutor(partida, 'NADIE')).toBeNull();
  });
  it('a mitad del torneo: el próximo rival y lo asegurado', () => {
    const d = despuesDelPartido({ estado: 'torneo', victorias: 1, partidos: [{}], rivales: [{ equipo: 'A' }, { equipo: 'B' }] });
    expect(d.siguiente.equipo).toBe('B');
    expect(d.asegurado.vcoins).toBe(25);
    expect(d.proximo.vcoins).toBe(75);
    expect(d.fin).toBe(false);
  });
  it('torneo terminado: premio y campeón', () => {
    const d = despuesDelPartido({ estado: 'terminada', victorias: 3, premio: { vcoins: 150, sobre: 'premio' } });
    expect(d.campeon).toBe(true);
    expect(d.premio.vcoins).toBe(150);
    expect(monedasQueCaen(150)).toBe(19);
    expect(monedasQueCaen(9999)).toBe(40);
  });
});
