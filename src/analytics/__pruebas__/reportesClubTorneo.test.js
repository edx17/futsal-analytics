import { describe, it, expect } from 'vitest';
import { reporteClub, reporteTorneo, reporteComparativo } from '../reportesClubTorneo';

const P = (id, fecha, gf, gc, extra = {}) => ({ id, fecha, rival: 'R' + (extra.r ?? id), goles_propios: gf, goles_rival: gc, condicion: 'Local', ...extra });
const F = (id, extra = {}) => ({ id, nombre: 'N' + id, apellido: 'A' + id, posicion: 'Ala', categoria: 'Primera', jugados: 4, minutos: 100, goles: 2, asistencias: 1,
  gPorPJ: 0.5, aPorPJ: 0.25, xg: 2, pasesClave: 4, rec: 8, defPct: 50, ofePct: 50, duelDefTot: 10, duelOfeTot: 10, pctMin: 60, ratingProm: 6.5, ratingCount: 4, amarillas: 1, rojas: 0, ...extra });

describe('reporte de club', () => {
  const d = {
    temporada: '2026', club: { nombre: 'Club' }, audiencia: 'ct',
    categorias: [
      { categoria: 'Primera', partidos: [P(1, '2026-03-01', 3, 1), P(2, '2026-03-08', 1, 1)], filas: [F(1, { goles: 5 }), F(7, { categoria: 'Tercera', minutos: 35 })], liga: null },
      { categoria: 'Tercera', partidos: [P(3, '2026-03-01', 0, 2)], filas: [F(7, { categoria: 'Tercera' })], liga: null },
    ],
  };
  it('categoría por categoría, figuras y cantera', () => {
    const r = reporteClub(d);
    const ids = r.secciones.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['numeros', 'categorias', 'figuras', 'cantera', 'cierre']));
    const tabla = r.secciones.find((s) => s.id === 'categorias').bloques[0];
    expect(tabla.filas[0]).toEqual(['Primera', 2, '1-1-0', '67%', '4-2', '–']);
    expect(tabla.resaltarFila).toBe(0);
    const cantera = r.secciones.find((s) => s.id === 'cantera').bloques;
    expect(cantera[0].items[0].valor).toBe(1);
  });
});

describe('reporte de torneo', () => {
  it('ruedas y rival por rival', () => {
    const partidos = [P(1, '2026-03-01', 3, 1, { r: 1 }), P(2, '2026-03-08', 0, 1, { r: 2 }), P(3, '2026-06-01', 2, 0, { r: 1 }), P(4, '2026-06-08', 2, 2, { r: 2 })];
    const r = reporteTorneo({ torneo: { nombre: 'Apertura', categoria: 'Primera' }, temporada: '2026', partidos, eventos: [], filas: [F(1)],
      rueda: (p) => (p.fecha < '2026-05-01' ? 1 : 2) });
    expect(r.titulo).toBe('Reporte de Apertura');
    const ruedas = r.secciones.find((s) => s.id === 'ruedas');
    expect(ruedas.bloques[0].items.map((k) => k.valor)).toEqual(['50%', '67%']);
    const rivales = r.secciones.find((s) => s.id === 'rivales').bloques[0];
    expect(rivales.filas[0][0]).toBe('R1');
    expect(rivales.filas[0][2]).toBe('6/6');
  });
});

describe('reporte comparativo', () => {
  it('quién es mejor en cada métrica', () => {
    const r = reporteComparativo({ a: F(1, { goles: 8, gPorPJ: 2 }), b: F(2, { goles: 1, gPorPJ: 0.25, ratingProm: 7 }), temporada: '2026' });
    const tabla = r.secciones.find((s) => s.id === 'numeros').bloques[0];
    expect(tabla.filas.find((f) => f[0] === 'Goles')).toEqual(['Goles', '8 ◀', '1']);
    expect(tabla.filas.find((f) => f[0] === 'Rating promedio')[2]).toMatch(/◀/);
    expect(r.secciones.find((s) => s.id === 'cierre').bloques).toHaveLength(2);
  });
});
