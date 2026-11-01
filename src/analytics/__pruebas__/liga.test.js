import { describe, it, expect } from 'vitest';
import {
  esMiEquipo, tablaPosiciones, parsearGoleadores, tablaGoleadores, fixturePorJornada, jornadaActual, reportesLiga, zonasDe, nombreZona,
  soloRegular, soloPlayoff, cuadroPlayoff, etiquetaCorta, etiquetaPlayoff, ordenFase, etapasDe, textoPenales,
} from '../liga';
import { ordenarJornadas, ruedaDeJornada } from '../../utils/ruedas';
import { crucesDeLiga } from '../../utils/importarFixtureJson';
import { normalizarPrimera, normalizarInferiores, consultaDe, consultasDe, planificar, bloqueDeFase, etapaInferiores } from '../../../supabase/functions/liga-sync/logica.js';

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
      .toEqual({ id_externo: 18963, jornada: 1, fecha: '2026-03-28', hora: '19:30', local: 'Dep Moron', visitante: 'Rosario Ctral', goles_local: 2, goles_visitante: 0, estado: 'Finalizado', estadio: 'Parque', goleadores_local: 'L.Gonzalez1', goleadores_visitante: null, zona: null,
        fase: null, llave: null, partido_playoff: null, penales_local: null, penales_visitante: null,
        etapa: null, etapa_tabla: null, grupo: null, torneo_tipo: null });
    expect(normalizarInferiores({ ID: 7, jornada: 'Fecha 3', fecha: '2026-04-11', hora: '10:00:00', equipolocal: 'A', equipovisitante: 'B', goleslocal: null, golesvisitante: '', estado: 'Pendiente' }))
      .toMatchObject({ id_externo: 7, jornada: 3, hora: '10:00', goles_local: null, goles_visitante: null, estadio: null });
  });

  it('inferiores: el ID viene como texto con los ids de los equipos', () => {
    const real = { ID: 'inf-127-3-1-28-144', equipolocal: 'Estrella Maldonado', equipovisitante: 'Villa Heredia', goleslocal: 1, golesvisitante: 1, estado: 'Finalizado', fecha: '2026-03-28', hora: '09:00:00', jornada: 1, equipo_local_id: 28, equipo_visitante_id: 144 };
    expect(normalizarInferiores(real)).toMatchObject({ id_externo: 28000144, local: 'Estrella Maldonado', goles_local: 1, jornada: 1, hora: '09:00' });
    expect(normalizarInferiores({ ...real, equipo_local_id: 144, equipo_visitante_id: 28, ID: 'inf-127-3-1-144-28' }).id_externo).toBe(144000028);
    expect(normalizarInferiores({ ...real, ID: 'raro' }).id_externo).toBe(28000144);
    expect(planificar([], [normalizarInferiores(real)]).resumen.nuevos).toBe(1);
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

describe('liga-sync: etapas (playoffs, desempates, Copa Futuro)', () => {
  const pri = { id: 1, jornada: 1, equipos_local_nombre: 'A', equipos_visitante_nombre: 'B', estados_partido_nombre: 'Pendiente' };

  it('primera: el regular no tiene etapa; el resto, la de segundopalo', () => {
    expect(normalizarPrimera({ ...pri, ediciones_partidos_fases_id: 1 })).toMatchObject({ etapa: null, torneo_tipo: 1 });
    expect(normalizarPrimera({ ...pri, ediciones_partidos_fases_id: 17, zona: 'z1' })).toMatchObject({ etapa: null, zona: 'z1' });
    expect(normalizarPrimera({ ...pri, ediciones_partidos_fases_id: 11, fase_nombre_fases_web: 'Playoff', fase_copas: 'Semifinal', fase_mostrar_tabla_posiciones: false }))
      .toMatchObject({ etapa: 'Playoff', fase: 'Semifinal', etapa_tabla: false });
    // Un triangular de desempate: con tabla y sin fase de copa.
    expect(normalizarPrimera({ ...pri, ediciones_partidos_fases_id: 4, fase_nombre_fases_web: 'Desempate Descenso', fase_mostrar_tabla_posiciones: true, grupo_copas: 'Triangular 1', penales_local: 4, penales_visitante: 3 }))
      .toMatchObject({ etapa: 'Desempate Descenso', fase: null, etapa_tabla: true, grupo: 'Triangular 1', penales_local: 4 });
  });

  it('inferiores: cada tipo de torneo es una etapa, con sus ids aparte', () => {
    expect(etapaInferiores('copafuturooro', 8)).toBe('Copa Futuro de Oro');
    expect(etapaInferiores('copafuturoplata', 9)).toBe('Copa Futuro de Plata');
    expect(etapaInferiores('regular', 1)).toBe(null);
    expect(etapaInferiores('torneo nuevo', 12)).toBe('Torneo nuevo');
    const ida = { ID: 'cp-123-5-2-1-cuartosdefinal-ida-9-5', tipo_torneo_nombre: 'playoff', tipo_torneo_inferiores_id: 5, fase_copas: 'Cuartos de Final', tipo_partido: 'Ida', equipolocal: 'América del Sud', equipovisitante: 'Boca', equipo_local_id: 9, equipo_visitante_id: 5 };
    const n = normalizarInferiores(ida);
    expect(n).toMatchObject({ etapa: 'Playoff', fase: 'Cuartos de Final', partido_playoff: 'Ida', torneo_tipo: 5 });
    // El mismo cruce en la Copa Futuro de Oro no pisa al del playoff.
    expect(normalizarInferiores({ ...ida, tipo_torneo_nombre: 'copafuturooro', tipo_torneo_inferiores_id: 8 }).id_externo).not.toBe(n.id_externo);
    // El regular conserva los ids de siempre.
    expect(normalizarInferiores({ ID: 'inf-127-3-1-28-144', equipolocal: 'A', equipovisitante: 'B' }, 1).id_externo).toBe(28000144);
  });

  it('inferiores: una consulta por tipo de torneo', () => {
    const comp = { fuente: 'inferiores', fuente_params: { edicion_id: 123, categoria_id: 2, tipo: 1 } };
    expect(consultasDe(comp, [1, 5, 8]).map((c) => c.cuerpo.p_tipo_torneo_inferiores_id)).toEqual([1, 5, 8]);
    expect(consultasDe({ ...comp, fuente_params: { ...comp.fuente_params, tipos: [1, 4] } }, [1, 5]).map((c) => c.tipo)).toEqual([1, 4]);
    expect(consultasDe({ fuente: 'primera', fuente_params: { competencia_id: 10 } })).toHaveLength(1);
  });
});

describe('liga: etapas en pantalla', () => {
  const p = (local, visitante, gl, gv, extra = {}) => ({ local, visitante, goles_local: gl, goles_visitante: gv, estado: 'Finalizado', fecha: '2026-11-01', ...extra });

  it('el regular queda aparte; triangular en tabla, playoff en cruces', () => {
    const partidos = [
      p('A', 'B', 1, 0),
      p('C', 'D', 2, 2, { etapa: 'Desempate Descenso', etapa_tabla: true, jornada: 1, penales_local: 4, penales_visitante: 3 }),
      p('D', 'E', 0, 1, { etapa: 'Desempate Descenso', etapa_tabla: true, jornada: 2 }),
      p('F', 'G', 3, 1, { etapa: 'Playoff', fase: 'Semifinal', partido_playoff: 'Ida', llave: 1, fecha: '2026-11-08' }),
    ];
    expect(soloRegular(partidos)).toHaveLength(1);
    const e = etapasDe(partidos);
    expect(e.map((x) => x.nombre)).toEqual(['Desempate Descenso', 'Playoff']);
    expect(e[0].tablas[0].filas.map((f) => f.equipo)).toEqual(['E', 'C', 'D']);
    expect(e[0].cuadro).toEqual([]);
    expect(e[0].conPenales).toBe(true);
    expect(e[1].tablas).toEqual([]);
    expect(e[1].cuadro[0].fase).toBe('Semifinal');
    expect(textoPenales(partidos[1])).toBe('(pen. 4-3)');
  });

  it('una copa con grupos y después cruces: las dos cosas', () => {
    const e = etapasDe([
      p('A', 'B', 1, 0, { etapa: 'Copa Futuro de Oro', grupo: 'Grupo 1' }),
      p('C', 'D', 1, 0, { etapa: 'Copa Futuro de Oro', grupo: 'Grupo 2' }),
      p('A', 'C', 2, 1, { etapa: 'Copa Futuro de Oro', fase: 'Final', fecha: '2026-12-01' }),
    ]);
    expect(e).toHaveLength(1);
    expect(e[0].tablas.map((t) => t.grupo)).toEqual(['Grupo 1', 'Grupo 2']);
    expect(e[0].cuadro.map((f) => f.fase)).toEqual(['Final']);
  });

  it('playoff de la A: serie al mejor de 3 (como el real de 2026)', () => {
    const c = (llave, pp, local, visitante, gl, gv, extra = {}) => p(local, visitante, gl, gv, { etapa: 'Playoff', fase: 'Cuartos de final', llave, partido_playoff: pp, ...extra });
    const [f] = etapasDe([
      c(4, 'Ida', 'América del Sud', '17deAgosto', 4, 1),
      c(4, 'Vuelta', '17deAgosto', 'América del Sud', 3, 3, { penales_local: 3, penales_visitante: 4 }),
      c(3, 'Ida', 'Boca', 'River', 3, 2),
      c(3, 'Vuelta', 'River', 'Boca', 1, 0),
      c(3, 'Tercer partido', 'Boca', 'River', null, null, { estado: 'Pendiente', fecha: null }),
    ])[0].cuadro;
    expect(f.serie).toBe(true);
    const [boca, america] = f.cruces;
    expect(boca.ganados).toEqual([1, 1]);
    expect(boca.pasa).toBe(null);
    expect(america.ganados).toEqual([2, 0]);
    expect(america.pasa).toBe('América del Sud');
  });

  it('por global si nada indica serie', () => {
    const c = (pp, local, visitante, gl, gv) => p(local, visitante, gl, gv, { fase: 'Cuartos de Final', partido_playoff: pp });
    const [f] = cuadroPlayoff([c('Ida', 'A', 'B', 0, 3), c('Vuelta', 'B', 'A', 1, 4)]);
    expect(f.serie).toBe(false);
    expect(f.cruces[0].global).toEqual([4, 4]);
    expect(f.cruces[0].pasa).toBe(null);
  });

  it('los playoffs viejos (sólo con fase) siguen siendo el Playoff', () => {
    const e = etapasDe([p('A', 'B', 1, 0, { fase: 'Cuartos de final' })]);
    expect(e.map((x) => x.nombre)).toEqual(['Playoff']);
  });
});

describe('liga: zonas', () => {
  const cruce = (l, v, zona) => ({ local: l, visitante: v, zona, estado: 'Finalizado', goles_local: 1, goles_visitante: 0 });

  it('usa la zona de la fuente', () => {
    const z = zonasDe([cruce('Almagro', 'Mitre', 'z1'), cruce('All Boys', 'Huracán', 'z2'), cruce('Mitre', 'Almagro', 'z1')]);
    expect(z.map((x) => x.zona)).toEqual(['Zona 1', 'Zona 2']);
    expect(z[0].partidos).toHaveLength(2);
    expect([...z[1].equipos].sort()).toEqual(['All Boys', 'Huracán']);
  });

  it('sin zona: separa por quién juega con quién y nombra con la Primera', () => {
    const z = zonasDe(
      [cruce('All Boys', 'Huracán'), cruce('Almagro', 'Mitre'), cruce('Huracán', 'Dock Sud')],
      { Almagro: 'z1', Mitre: 'z1', 'All Boys': 'z2', 'Dock Sud': 'z2' },
    );
    expect(z.map((x) => [x.zona, x.partidos.length])).toEqual([['Zona 1', 1], ['Zona 2', 2]]);
  });

  it('una sola zona: nada', () => {
    expect(zonasDe([cruce('A', 'B', 'z1'), cruce('B', 'A', 'z1')])).toEqual([]);
    expect(zonasDe([cruce('A', 'B'), cruce('B', 'C')])).toEqual([]);
    expect(nombreZona('z2')).toBe('Zona 2');
  });
});

describe('liga: playoffs', () => {
  const real = { id: 20828, jornada: 1, fecha: '2026-11-01', hora: '16:30:00', equipos_local_nombre: 'Kimberley', equipos_visitante_nombre: 'Barracas Ctral',
    goles_local: null, goles_visitante: null, estados_partido_nombre: 'Pendiente', fase_copas: 'Cuartos de final', llave_playoff: 2, partido_playoff: 'Vuelta',
    penales_local: null, penales_visitante: null };

  it('el sync guarda la fase, la llave y si es ida o vuelta', () => {
    expect(normalizarPrimera(real)).toMatchObject({ fase: 'Cuartos de final', llave: 2, partido_playoff: 'Vuelta', jornada: 1 });
    expect(normalizarPrimera({ ...real, fase_copas: null }).fase).toBeNull();
  });

  it('en inferiores, el cruce de playoff no pisa al mismo cruce del regular', () => {
    const inf = { ID: 'inf-123-2-1-36-20', equipolocal: 'A', equipovisitante: 'B', estado: 'Pendiente', jornada: 1, equipo_local_id: 36, equipo_visitante_id: 20 };
    const regular = normalizarInferiores(inf).id_externo;
    const cuartos = normalizarInferiores({ ...inf, fase_copas: 'Cuartos de final' }).id_externo;
    const semi = normalizarInferiores({ ...inf, fase_copas: 'Semifinal' }).id_externo;
    expect(new Set([regular, cuartos, semi]).size).toBe(3);
    expect(bloqueDeFase(null)).toBe(0);
  });

  it('una fase nueva en un partido ya guardado se actualiza', () => {
    const previo = { ...normalizarPrimera(real), fase: null, llave: null, partido_playoff: null };
    expect(planificar([previo], [normalizarPrimera(real)]).guardar).toHaveLength(1);
  });

  const p = (o) => ({ estado: 'Finalizado', jornada: 1, ...o });
  const partidos = [
    p({ id_externo: 1, local: 'A', visitante: 'B', goles_local: 3, goles_visitante: 0 }),            // regular
    p({ id_externo: 10, fase: 'Cuartos de final', llave: 1, partido_playoff: 'Ida', local: 'B', visitante: 'A', goles_local: 2, goles_visitante: 1 }),
    p({ id_externo: 11, fase: 'Cuartos de final', llave: 1, partido_playoff: 'Vuelta', local: 'A', visitante: 'B', goles_local: 2, goles_visitante: 0 }),
    p({ id_externo: 12, fase: 'Cuartos de final', llave: 2, partido_playoff: 'Ida', local: 'C', visitante: 'D', goles_local: 1, goles_visitante: 1 }),
    p({ id_externo: 13, fase: 'Cuartos de final', llave: 2, partido_playoff: 'Vuelta', local: 'D', visitante: 'C', goles_local: 0, goles_visitante: 0, penales_local: 4, penales_visitante: 3 }),
    p({ id_externo: 14, fase: 'Semifinal', llave: 1, partido_playoff: 'Ida', local: 'A', visitante: 'D', estado: 'Pendiente', goles_local: null, goles_visitante: null }),
  ];

  it('la tabla y el fixture del regular no cuentan los playoffs', () => {
    expect(tablaPosiciones(soloRegular(partidos)).find((f) => f.equipo === 'A').pj).toBe(1);
    expect(soloPlayoff(partidos)).toHaveLength(5);
  });

  it('arma el cuadro: fases en orden, global, penales y quién pasa', () => {
    const c = cuadroPlayoff(partidos);
    expect(c.map((f) => f.fase)).toEqual(['Cuartos de final', 'Semifinal']);
    const [l1, l2] = c[0].cruces;
    expect(l1).toMatchObject({ llave: 1, equipos: ['B', 'A'], global: [2, 3], pasa: 'A' });
    expect(l1.partidos.map((x) => x.partido_playoff)).toEqual(['Ida', 'Vuelta']);
    expect(l2).toMatchObject({ equipos: ['C', 'D'], global: [1, 1], penales: [3, 4], pasa: 'D' });
    expect(c[1].cruces[0]).toMatchObject({ global: null, pasa: null });
  });

  it('etiquetas y orden de fases', () => {
    expect(etiquetaCorta(partidos[0])).toBe('F1');
    expect(etiquetaCorta(partidos[1])).toBe('4tos I');
    expect(etiquetaPlayoff(partidos[2])).toBe('Cuartos de final · Vuelta');
    expect(ordenFase('Final')).toBeGreaterThan(ordenFase('Semifinal'));
    expect(ordenFase('Semifinal')).toBeGreaterThan(ordenFase('Cuartos de final'));
  });
});

describe('torneos: jornadas de playoff', () => {
  it('van después de las fechas, en orden de fase, la ida antes que la vuelta', () => {
    expect(ordenarJornadas(['Final', 'Fecha 10', 'Cuartos de final · Vuelta', 'Fecha 2', 'Cuartos de final · Ida', 'Semifinal · Ida']))
      .toEqual(['Fecha 2', 'Fecha 10', 'Cuartos de final · Ida', 'Cuartos de final · Vuelta', 'Semifinal · Ida', 'Final']);
  });

  it('no son de ninguna rueda', () => {
    expect(ruedaDeJornada('Cuartos de final · Ida', 9, ['Fecha 1', 'Cuartos de final · Ida'])).toBeNull();
    expect(ruedaDeJornada('Fecha 3', 9)).toBe(1);
  });

  it('el sync del fixture trae los playoffs con su fase como jornada', () => {
    const { cruces, avisos } = crucesDeLiga([
      { id_externo: 1, jornada: 1, local: 'A', visitante: 'B', estado: 'Pendiente' },
      { id_externo: 2, jornada: 1, local: 'A', visitante: 'B', estado: 'Pendiente', fase: 'Cuartos de final', partido_playoff: 'Ida' },
    ]);
    expect(avisos).toEqual([]);
    expect(cruces.map((c) => c.jornada)).toEqual(['Fecha 1', 'Cuartos de final · Ida']);
  });
});
