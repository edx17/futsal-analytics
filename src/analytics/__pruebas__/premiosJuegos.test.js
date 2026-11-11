import { describe, it, expect } from 'vitest';
import {
  PREMIOS_DE_SIEMPRE, GRUPOS_PREMIOS, erroresDePremios, cambiosRespectoDeSiempre, paraGuardarPremios,
  premiosDeNivel, premiosDeVictorias, premiosDelDesafio, maximoDe,
} from '../premiosJuegos';

describe('V-Coins por juego', () => {
  it('cada clave de la base aparece una sola vez en la pantalla', () => {
    const enPantalla = GRUPOS_PREMIOS.flatMap((g) => g.campos.map(([k]) => k));
    expect(new Set(enPantalla).size).toBe(enPantalla.length);
    expect(enPantalla.sort()).toEqual(Object.keys(PREMIOS_DE_SIEMPRE).sort());
  });

  it('los de siempre se pueden guardar; avisa los vacíos, negativos, decimales y topes', () => {
    expect(erroresDePremios(PREMIOS_DE_SIEMPRE)).toEqual({});
    const e = erroresDePremios({ ...PREMIOS_DE_SIEMPRE, penales_n0: '', rep_oro: 2.5, vdraft_v1: -1, penales_por_dia: 51, desafio_1: 100001 });
    expect(Object.keys(e).sort()).toEqual(['desafio_1', 'penales_n0', 'penales_por_dia', 'rep_oro', 'vdraft_v1']);
    expect(maximoDe('duelo_premios_dia')).toBe(50);
    expect(maximoDe('rep_toty')).toBe(100000);
  });

  it('sólo cuentan como cambio los distintos a los de siempre', () => {
    expect(cambiosRespectoDeSiempre({ ...PREMIOS_DE_SIEMPRE, rep_toty: '250', penales_n0: 20 })).toEqual({ rep_toty: 250 });
    expect(paraGuardarPremios({ ...PREMIOS_DE_SIEMPRE, rep_toty: '250' }).rep_toty).toBe(250);
  });

  it('las pantallas usan lo del club si llega, si no los de siempre', () => {
    expect(premiosDeNivel({ premios_nivel: [1, 2, 3, 4] })).toEqual([1, 2, 3, 4]);
    expect(premiosDeNivel({})).toEqual([20, 35, 50, 80]);
    expect(premiosDeVictorias({ premios_victorias: [25, 75, 150, 500] })[3]).toBe(500);
    expect(premiosDeVictorias(null)).toEqual([25, 75, 150, 300]);
    expect(premiosDelDesafio({ desafio: { premios: [2000, 750, 500, 150] } })[0]).toBe(2000);
    expect(premiosDelDesafio({ desafio: {} })).toEqual([1000, 750, 500, 150]);
  });
});
