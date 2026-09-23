import { describe, it, expect } from 'vitest';
import { marcadorDe, resultadoDeMarcador, esGol, tieneCaptura, eventosPorPartido } from '../marcador.js';

const gol = (equipo, accion = 'Gol') => ({ accion, equipo });
const pase = (equipo) => ({ accion: 'Pase', equipo });

describe('esGol', () => {
  it('reconoce las dos formas en que se anota un gol', () => {
    expect(esGol({ accion: 'Gol' })).toBe(true);
    expect(esGol({ accion: 'Remate - Gol' })).toBe(true);
  });

  it('no confunde un remate cualquiera con un gol', () => {
    expect(esGol({ accion: 'Remate - Atajado' })).toBe(false);
    expect(esGol({ accion: 'Pase' })).toBe(false);
    expect(esGol(null)).toBe(false);
  });
});

describe('marcadorDe: partido CARGADO A MANO', () => {
  // El caso que reportó el bug: resultado escrito en el fixture, sin eventos.
  it('usa el marcador de la tabla cuando no hay ni un evento', () => {
    expect(marcadorDe({ goles_propios: 4, goles_rival: 2 }, []))
      .toEqual({ gf: 4, gc: 2, origen: 'marcador' });
  });

  it('una derrota cargada a mano NO se vuelve empate', () => {
    // Antes esto daba 0-0 = E, y la tira de forma mostraba puros empates.
    const m = marcadorDe({ goles_propios: 0, goles_rival: 1 }, []);
    expect(m).toEqual({ gf: 0, gc: 1, origen: 'marcador' });
    expect(resultadoDeMarcador(m.gf, m.gc)).toBe('D');
  });

  it('aguanta el marcador guardado como texto', () => {
    expect(marcadorDe({ goles_propios: '3', goles_rival: '1' }, []))
      .toEqual({ gf: 3, gc: 1, origen: 'marcador' });
  });
});

describe('marcadorDe: partido CAPTURADO', () => {
  const evs = [gol('Propio'), gol('Propio', 'Remate - Gol'), gol('Rival'), pase('Propio')];

  it('el marcador de la tabla y los eventos coinciden, y gana la tabla', () => {
    expect(marcadorDe({ goles_propios: 2, goles_rival: 1 }, evs))
      .toEqual({ gf: 2, gc: 1, origen: 'marcador' });
  });

  it('si el marcador nunca se actualizó, cuenta los eventos', () => {
    // Datos viejos: hay captura pero las columnas quedaron en cero.
    expect(marcadorDe({ goles_propios: 0, goles_rival: 0 }, evs))
      .toEqual({ gf: 2, gc: 1, origen: 'eventos' });
  });

  it('sin columnas de marcador, cuenta los eventos', () => {
    expect(marcadorDe({}, evs)).toEqual({ gf: 2, gc: 1, origen: 'eventos' });
    expect(marcadorDe({ goles_propios: null, goles_rival: null }, evs))
      .toEqual({ gf: 2, gc: 1, origen: 'eventos' });
  });

  it('no cuenta como gol un remate que no entró', () => {
    const r = marcadorDe({}, [gol('Propio'), { accion: 'Remate - Atajado', equipo: 'Propio' }]);
    expect(r.gf).toBe(1);
  });
});

describe('marcadorDe: el 0 a 0, que es el caso engañoso', () => {
  it('un 0 a 0 de verdad se respeta', () => {
    expect(marcadorDe({ goles_propios: 0, goles_rival: 0 }, [pase('Propio')]))
      .toEqual({ gf: 0, gc: 0, origen: 'marcador' });
  });

  it('un partido sin nada cargado queda marcado como vacío', () => {
    expect(marcadorDe({}, [])).toEqual({ gf: 0, gc: 0, origen: 'vacio' });
    expect(marcadorDe(null, null)).toEqual({ gf: 0, gc: 0, origen: 'vacio' });
  });

  it('el cero de las columnas no le gana a los goles que sí están como eventos', () => {
    // Es el único caso donde el cero es, con seguridad, un dato que falta.
    expect(marcadorDe({ goles_propios: 0, goles_rival: 0 }, [gol('Propio'), gol('Propio')]))
      .toEqual({ gf: 2, gc: 0, origen: 'eventos' });
  });
});

describe('resultadoDeMarcador', () => {
  it('las tres, como corresponde', () => {
    expect(resultadoDeMarcador(4, 2)).toBe('V');
    expect(resultadoDeMarcador(3, 3)).toBe('E');
    expect(resultadoDeMarcador(0, 1)).toBe('D');
  });

  it('reproduce la tira real del club que reportó el bug', () => {
    // Asturiano 4-2, Maldonado 3-3, Tapiales 2-4, Primera Junta 0-1, Almafuerte 2-4
    const fixture = [[4, 2], [3, 3], [2, 4], [0, 1], [2, 4]];
    const tira = fixture.map(([gf, gc]) => {
      const m = marcadorDe({ goles_propios: gf, goles_rival: gc }, []);
      return resultadoDeMarcador(m.gf, m.gc);
    });
    expect(tira).toEqual(['V', 'E', 'D', 'D', 'D']);
    expect(tira.every((r) => r === 'E')).toBe(false);   // lo que se veía antes
  });
});

describe('tieneCaptura', () => {
  it('distingue el partido capturado del cargado a mano', () => {
    expect(tieneCaptura([pase('Propio')])).toBe(true);
    expect(tieneCaptura([])).toBe(false);
    expect(tieneCaptura(null)).toBe(false);
  });
});

describe('eventosPorPartido', () => {
  it('agrupa por partido', () => {
    const m = eventosPorPartido([
      { id_partido: 'a', accion: 'Gol' }, { id_partido: 'b', accion: 'Pase' }, { id_partido: 'a', accion: 'Pase' },
    ]);
    expect(m.get('a')).toHaveLength(2);
    expect(m.get('b')).toHaveLength(1);
  });

  it('descarta los eventos sin partido en vez de agruparlos bajo undefined', () => {
    const m = eventosPorPartido([{ accion: 'Gol' }, { id_partido: null, accion: 'Gol' }]);
    expect(m.size).toBe(0);
  });

  it('no se cae con la lista vacía', () => {
    expect(eventosPorPartido([]).size).toBe(0);
    expect(eventosPorPartido().size).toBe(0);
  });
});
