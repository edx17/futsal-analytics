import { describe, it, expect } from 'vitest';
import { resultados, rachaMasLarga, golesDelEquipo, enLaLiga, reporteCategoria } from '../reporteCategoria';

const P = (id, fecha, gf, gc, extra = {}) => ({ id, fecha, rival: 'R' + id, goles_propios: gf, goles_rival: gc, condicion: 'Local', ...extra });

describe('reporte de categoría: resultados y rachas', () => {
  const ps = [P(1, '2026-03-01', 3, 1), P(2, '2026-03-08', 2, 2), P(3, '2026-03-15', 4, 0), P(4, '2026-03-22', 5, 1),
    P(5, '2026-03-29', 0, 1, { condicion: 'Visitante' }), P(6, '2026-04-05', null, null)];

  it('sólo los que tienen resultado, en orden', () => {
    const r = resultados(ps);
    expect(r.map((x) => x.res)).toEqual(['G', 'E', 'G', 'G', 'P']);
    expect(r[4].dg).toBe(-1);
  });

  it('la racha más larga', () => {
    const r = resultados(ps);
    expect(rachaMasLarga(r, (x) => x.res === 'G')).toMatchObject({ n: 2, desde: '2026-03-15', hasta: '2026-03-22' });
    expect(rachaMasLarga(r, (x) => x.res !== 'P').n).toBe(4);
  });
});

describe('reporte de categoría: los goles', () => {
  it('por tramo de 10 minutos y por origen, a favor y en contra', () => {
    const ev = (id, periodo, minuto, equipo, origen) => ({ id, id_partido: 1, periodo, minuto, segundos: 0, accion: 'Remate - Gol', equipo, origen_gol: origen });
    const g = golesDelEquipo([{ id: 1 }], [
      ev(1, 'PT', 3, 'Propio', 'Contraataque | algo'), ev(2, 'PT', 15, 'Propio', 'Córner'), ev(3, 'ST', 5, 'Rival', 'Córner'),
      ev(4, 'ST', 18, 'Propio', 'Contraataque'), { id: 9, id_partido: 2, periodo: 'PT', minuto: 1, accion: 'Remate - Gol', equipo: 'Propio' },
    ]);
    expect(g.tramos.map((t) => [t.tramo, t.favor, t.contra])).toEqual([['0-10', 1, 0], ['10-20', 1, 0], ['20-30', 0, 1], ['30-40', 1, 0]]);
    expect(g.origenFavor[0]).toEqual({ nombre: 'Contraataque', n: 2 });
    expect(g.origenContra).toEqual([{ nombre: 'Córner', n: 1 }]);
  });
});

describe('reporte de categoría: la liga', () => {
  const L = (local, visitante, gl, gv, extra = {}) => ({ local, visitante, goles_local: gl, goles_visitante: gv, estado: 'Finalizado', fecha: '2026-05-01', ...extra });
  it('su posición en la tabla y hasta dónde llegó en el playoff', () => {
    const l = enLaLiga([
      L('LIBERTADORES SC', 'B', 3, 0), L('C', 'LIBERTADORES SC', 1, 1), L('B', 'C', 0, 2),
      L('LIBERTADORES SC', 'C', 2, 1, { etapa: 'Playoff', fase: 'Semifinal', partido_playoff: 'Ida', llave: 1, fecha: '2026-11-01' }),
      L('C', 'LIBERTADORES SC', 4, 0, { etapa: 'Playoff', fase: 'Semifinal', partido_playoff: 'Vuelta', llave: 1, fecha: '2026-11-08' }),
    ], 'LIBERTADORES SC');
    expect(l).toMatchObject({ posicion: 1, de: 3 });
    expect(l.etapas).toEqual(['Playoff: llegó a semifinal']);
  });

  it('sin el club en la liga: nada', () => {
    expect(enLaLiga([L('A', 'B', 1, 0)], 'LIBERTADORES SC')).toBe(null);
  });
});

describe('reporte de categoría: armado', () => {
  const filas = [
    { id: 1, nombre: 'Juan', apellido: 'Pérez', posicion: 'Ala', categoria: 'Primera', jugados: 5, minutos: 150, goles: 6, asistencias: 2, gPorPJ: 1.2, ratingProm: 7.2, ratingCount: 5, amarillas: 1, rojas: 0 },
    { id: 2, nombre: 'Luis', apellido: 'Gómez', posicion: 'Arquero', categoria: 'Primera', jugados: 5, minutos: 200, atajadas: 20, pctAtajadas: 70, golesEvitables: 1.5, amarillas: 0, rojas: 0 },
  ];
  const base = { categoria: 'Primera', temporada: '2026', club: { nombre: 'Club' }, filas,
    partidos: [P(1, '2026-03-01', 3, 1), P(2, '2026-03-08', 2, 0), P(3, '2026-03-15', 4, 0)], eventos: [],
    asistencias: [{ jugador_id: 1, estado: 'presente' }, { jugador_id: 2, estado: 'ausente' }] };

  it('números, plantel y destacados; la directiva no ve lo que hay que trabajar', () => {
    const ct = reporteCategoria({ ...base, audiencia: 'ct' });
    const ids = ct.secciones.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['portada', 'numeros', 'evolucion', 'plantel', 'compromiso', 'cierre']));
    const numeros = ct.secciones.find((s) => s.id === 'numeros').bloques[0].items;
    expect(numeros.find((k) => k.rotulo === 'Efectividad').valor).toBe('100%');
    expect(numeros.find((k) => k.rotulo === 'Vallas invictas').valor).toBe(2);
    const dir = reporteCategoria({ ...base, audiencia: 'directiva' });
    expect(dir.secciones.find((s) => s.id === 'cierre').bloques.every((b) => b.tono === 'bien')).toBe(true);
  });

  it('sin partidos lo dice', () => {
    expect(reporteCategoria({ ...base, partidos: [] }).secciones.map((s) => s.id)).toEqual(['portada', 'sin']);
  });
});
