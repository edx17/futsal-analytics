import { describe, it, expect } from 'vitest';
import {
  esMiEquipo, tablaPosiciones, parsearGoleadores, tablaGoleadores, fixturePorJornada, jornadaActual, reportesLiga,
} from '../liga';
import { normalizarPrimera, normalizarInferiores, consultaDe, planificar } from '../../../supabase/functions/liga-sync/logica.js';

const p = (o) => ({ jornada: 1, fecha: '2026-03-28', hora: '20:00', estado: 'Finalizado', goleadores_local: null, goleadores_visitante: null, ...o });

const PARTIDOS = [
  p({ id_externo: 1, jornada: 1, local: 'Libertadores', visitante: 'UNLAM', goles_local: 3, goles_visitante: 1, goleadores_local: 'F.Nannini1, F.Nannini2, D.González 1', goleadores_visitante: 'J.Perez1' }),
  p({ id_externo: 2, jornada: 1, local: 'Almafuerte', visitante: 'GEVS', goles_local: 2, goles_visitante: 2 }),
  p({ id_externo: 3, jornada: 2, fecha: '2026-04-04', local: 'UNLAM', visitante: 'Almafuerte', goles_local: 0, goles_visitante: 1 }),
  p({ id_externo: 4, jornada: 2, fecha: '2026-04-04', local: 'GEVS', visitante: 'Libertadores', goles_local: 1, goles_visitante: 1, goleadores_visitante: 'F. Nannini1' }),
  p({ id_externo: 5, jornada: 3, fecha: '2026-04-11', local: 'Libertadores', visitante: 'Almafuerte', goles_local: null, goles_visitante: null, estado: 'Pendiente' }),
];

describe('liga: tabla de posiciones', () => {
  it('suma puntos, diferencia y forma', () => {
    const t = tablaPosiciones(PARTIDOS);
    expect(t[0]).toMatchObject({ equipo: 'Libertadores', pj: 2, pg: 1, pe: 1, pts: 4, gf: 4, gc: 2, dg: 2, pos: 1, forma: ['G', 'E'] });
    expect(t[1]).toMatchObject({ equipo: 'Almafuerte', pts: 4, dg: 1 });
    expect(t.find((f) => f.equipo === 'UNLAM')).toMatchObject({ pj: 2, pp: 2, pts: 0 });
  });

  it('local y visitante cuentan solo esa condición', () => {
    expect(tablaPosiciones(PARTIDOS, 'local').find((f) => f.equipo === 'Libertadores')).toMatchObject({ pj: 1, pts: 3 });
    expect(tablaPosiciones(PARTIDOS, 'visitante').find((f) => f.equipo === 'Libertadores')).toMatchObject({ pj: 1, pts: 1 });
  });

  it('los pendientes no suman pero el equipo aparece', () => {
    const t = tablaPosiciones([p({ local: 'A', visitante: 'B', goles_local: null, goles_visitante: null, estado: 'Pendiente' })]);
    expect(t.map((f) => f.pj)).toEqual([0, 0]);
  });
});

describe('liga: goleadores', () => {
  it('el número del final es el orden del gol, no la cantidad', () => {
    expect(parsearGoleadores('F.Nannini1, F.Nannini2, D.González 1, G. Ramírez1')).toEqual(['F.Nannini', 'F.Nannini', 'D.González', 'G.Ramírez']);
    expect(parsearGoleadores(null)).toEqual([]);
  });

  it('acumula por jugador y equipo, y cuenta partidos con gol', () => {
    const g = tablaGoleadores(PARTIDOS);
    expect(g[0]).toMatchObject({ nombre: 'F.Nannini', equipo: 'Libertadores', goles: 3, partidos: 2, pos: 1 });
    expect(g.find((x) => x.nombre === 'D.González').goles).toBe(1);
    expect(g.filter((x) => x.goles === 1).slice(1).every((x) => x.pos === null)).toBe(true);
  });
});

describe('liga: fixture y reportes', () => {
  it('agrupa por fecha y encuentra la fecha actual', () => {
    const f = fixturePorJornada(PARTIDOS);
    expect(f.map((x) => x.jornada)).toEqual([1, 2, 3]);
    expect(jornadaActual(f)).toBe(3);
  });

  it('calcula promedios, resultados y mejores', () => {
    const r = reportesLiga(PARTIDOS);
    expect(r).toMatchObject({ total: 5, jugados: 4, goles: 11 });
    expect(r.resultados).toMatchObject({ local: 1, empates: 2, visita: 1, pctEmpate: 50 });
    expect(r.mejorAtaque.equipos).toEqual(['Libertadores']);
    expect(r.goleada.id_externo).toBe(1);
  });

  it('reconoce mi club por prefijo', () => {
    expect(esMiEquipo('Libertadores', 'LIBERTADORES SC (AFA - Masc)')).toBe(true);
    expect(esMiEquipo('Dep Moron', 'LIBERTADORES SC (AFA - Masc)')).toBe(false);
    expect(esMiEquipo('GEVS', 'GE')).toBe(false);
  });
});

describe('liga-sync: lo que viene de segundopalo', () => {
  it('normaliza primera e inferiores', () => {
    expect(normalizarPrimera({ id: 18963, jornada: 1, fecha: '2026-03-28', hora: '19:30:00', equipos_local_nombre: 'Dep Moron ', equipos_visitante_nombre: 'Rosario Ctral', goles_local: 2, goles_visitante: 0, estados_partido_nombre: 'Finalizado', estadios_nombre: 'Parque', goleadores_local: 'L.Gonzalez1', goleadores_visitante: null }))
      .toEqual({ id_externo: 18963, jornada: 1, fecha: '2026-03-28', hora: '19:30', local: 'Dep Moron', visitante: 'Rosario Ctral', goles_local: 2, goles_visitante: 0, estado: 'Finalizado', estadio: 'Parque', goleadores_local: 'L.Gonzalez1', goleadores_visitante: null });
    expect(normalizarInferiores({ ID: 7, jornada: 'Fecha 3', fecha: '2026-04-11', hora: '10:00:00', equipolocal: 'A', equipovisitante: 'B', goleslocal: null, golesvisitante: '', estado: 'Pendiente' }))
      .toMatchObject({ id_externo: 7, jornada: 3, hora: '10:00', goles_local: null, goles_visitante: null, estadio: null });
  });

  it('arma la consulta según la fuente', () => {
    expect(consultaDe({ fuente: 'primera', anio: 2026, fuente_params: { competencia_id: 10 } }).cuerpo).toEqual({ competencia_id_input: 10, 'año_input': 2026 });
    expect(consultaDe({ fuente: 'inferiores', anio: 2026, fuente_params: { edicion_id: 127, categoria_id: 3 } }).cuerpo)
      .toEqual({ p_edicion_id: 127, p_categoria_id: 3, p_tipo_torneo_inferiores_id: 1 });
  });

  it('no duplica, y lo finalizado no vuelve atrás', () => {
    const base = { id_externo: 1, jornada: 1, fecha: '2026-03-28', hora: '20:00', local: 'A', visitante: 'B', goles_local: 2, goles_visitante: 1, estado: 'Finalizado', estadio: null, goleadores_local: null, goleadores_visitante: null };
    expect(planificar([base], [base]).guardar).toEqual([]);
    expect(planificar([base], [{ ...base, estado: 'Jugandose', goles_local: 0 }]).resumen.sinCambios).toBe(1);

    const pendiente = { ...base, id_externo: 2, estado: 'Pendiente', goles_local: null, goles_visitante: null };
    const { guardar, resumen } = planificar([pendiente], [
      { ...pendiente, estado: 'Finalizado', goles_local: 1, goles_visitante: 0 },
      { ...base, id_externo: 3 },
      { ...base, id_externo: 3 },
      { ...base, id_externo: null },
    ]);
    expect(guardar.map((g) => g.id_externo)).toEqual([2, 3]);
    expect(resumen).toMatchObject({ nuevos: 1, resultados: 1, descartados: 1 });
  });

  it('cuenta las reprogramaciones', () => {
    const a = { id_externo: 1, jornada: 1, fecha: '2026-03-28', hora: '20:00', local: 'A', visitante: 'B', estado: 'Pendiente' };
    expect(planificar([a], [{ ...a, hora: '21:00' }]).resumen.reprogramados).toBe(1);
  });
});
