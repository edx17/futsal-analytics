import { describe, it, expect } from 'vitest';
import { mejorCarta, modosDelMenu, resumenMisiones } from '../juegosHub';

const c = (ovr, rareza, apellido) => ({ rareza, carta: { ovr, apellido } });

describe('juegos: la carta protagonista', () => {
  it('es la de mayor media; si empatan, la más rara', () => {
    expect(mejorCarta([c(80, 'oro', 'A'), c(91, 'totw', 'B'), c(88, 'toty', 'C')]).carta.apellido).toBe('B');
    expect(mejorCarta([c(90, 'totw', 'A'), c(90, 'toty', 'B')]).carta.apellido).toBe('B');
    expect(mejorCarta([])).toBeNull();
  });
});

describe('juegos: los modos del menú', () => {
  it('sobres gratis y V-Draft gratis llevan GRATIS HOY', () => {
    const m = modosDelMenu({ sobres: { disponibles: { diario: true }, puntos: 0, costo_puntos: 300 }, vdraft: { gratis_hoy: true } });
    expect(m.map((x) => x.id)).toEqual(['vdraft', 'penales', 'sobres', 'mysquad']);
    expect(m[0].badge.texto).toBe('GRATIS HOY');
    expect(m[2].badge.texto).toBe('GRATIS HOY');
  });

  it('sin sobres gratis: con V-Coins si alcanza, si no la cuenta regresiva', () => {
    const conPuntos = modosDelMenu({ sobres: { disponibles: {}, puntos: 500, costo_puntos: 300 } });
    expect(conPuntos.find((x) => x.id === 'sobres').badge.texto).toBe('CON V-COINS');
    const sin = modosDelMenu({ sobres: { disponibles: {}, puntos: 10, costo_puntos: 300 } });
    expect(sin.find((x) => x.id === 'sobres').badge.cuenta).toBe(true);
  });

  it('una partida a medias del V-Draft se avisa', () => {
    const m = modosDelMenu({ vdraft: { partida: { estado: 'torneo' }, gratis_hoy: false, costo: 100 } });
    expect(m[0].badge.texto).toBe('PARTIDA EN JUEGO');
  });

  it('en el kiosco no está MySquad; el superusuario ve Modo GOD y no compite', () => {
    expect(modosDelMenu({ kiosco: true }).map((x) => x.id)).toEqual(['vdraft', 'penales', 'sobres']);
    const s = modosDelMenu({ esSuper: true });
    expect(s[0].titulo).toBe('MODO GOD');
    expect(s.find((x) => x.titulo === 'V-DRAFT').bloqueado).toBeTruthy();
  });
});

describe('juegos: misiones', () => {
  it('cuenta las cumplidas y lo que hay para cobrar', () => {
    const r = resumenMisiones([
      { id: 'a', meta: 1, progreso: 1, premio: 25, cobrada: true },
      { id: 'b', meta: 1, progreso: 1, premio: 25, cobrada: false },
      { id: 'c', meta: 2, progreso: 1, premio: 50, cobrada: false },
    ]);
    expect(r).toEqual({ total: 3, cumplidas: 2, paraCobrar: 1, vcoinsPendientes: 25 });
  });
});
