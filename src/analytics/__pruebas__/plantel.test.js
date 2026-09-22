import { describe, test, expect } from 'vitest';
import { procesarPlantel } from '../plantel';
import { procesarPlantelAntes } from './plantelAntes';

/* ¿QUÉ PRUEBA ESTO?
 *
 * El cálculo del plantel se sacó de adentro de Resumenplantel.jsx para poder
 * usarlo desde Comparar. Mover 222 líneas de cuentas es exactamente donde se
 * pierde un número sin que nadie se entere, así que acá se corre la versión
 * vieja y la nueva con los mismos datos y se exige que den IDÉNTICO.
 *
 * No se prueba que las cuentas sean correctas —eso ya lo decidiste vos cuando
 * las escribiste— sino que sigan dando lo mismo que antes. */

/* ── Un club de mentira, con la forma de los datos reales ───────────────── */

const jug = (id, apellido, posicion, categoria = 'Primera') => ({
  id, nombre: 'N' + id, apellido, posicion, categoria,
  dorsal: id, fechanac: '2005-03-14', foto: null,
  estado_ficha: 'ok', vencimiento_apto: '2026-12-01',
});

const JUGADORES = [
  jug(1, 'MACK', 'Arquero'),
  jug(2, 'GONZI', 'Cierre'),
  jug(3, 'RECHE', 'Ala'),
  jug(4, 'PERVIU', 'Pivot'),
  jug(5, 'STANIZZI', 'Ala'),
  jug(6, 'BARQUIN', 'Arquero', 'Tercera'),
  jug(7, 'WIEMEYER', 'Ala', 'Tercera'),
];

const quinteto = (...ids) => JSON.stringify(ids.map(String));

/* Un partido con quintetos, goles, remates, duelos y tarjetas: lo justo para
 * que se muevan minutos, rating, xG y disciplina a la vez. */
function partidoCon(id, opciones = {}) {
  const { categoria = 'Primera', torneo_id = 't1', jornada = 'Fecha 1' } = opciones;
  return {
    id, categoria, torneo_id, jornada,
    rival: 'RIVAL ' + id, fecha: `2026-0${id}-10`,
    estado: 'Finalizado', condicion: id % 2 ? 'Local' : 'Visitante',
    goles_propios: 3, goles_rival: 2,
    plantilla: JSON.stringify([1, 2, 3, 4, 5].map(x => ({ id_jugador: x, titular: x <= 5 }))),
  };
}

function eventosDe(idPartido, desdeId) {
  const base = { id_partido: idPartido, club_id: 'c1', equipo: 'Propio', periodo: 'PT' };
  const q = quinteto(1, 2, 3, 4, 5);
  return [
    { ...base, id: desdeId + 1, accion: 'Gol', id_jugador: 4, id_asistencia: 3, minuto: 5, segundos: 10, quinteto_activo: q, zona_x: 82, zona_y: 50, origen_gol: 'Contraataque' },
    { ...base, id: desdeId + 2, accion: 'Remate - Atajado', id_jugador: 5, minuto: 9, segundos: 0, quinteto_activo: q, zona_x: 70, zona_y: 35 },
    { ...base, id: desdeId + 3, accion: 'Recuperación', id_jugador: 2, minuto: 12, segundos: 30, quinteto_activo: q, zona_x: 40, zona_y: 55 },
    { ...base, id: desdeId + 4, accion: 'Pérdida', id_jugador: 3, minuto: 14, segundos: 0, quinteto_activo: q, zona_x: 30, zona_y: 20 },
    { ...base, id: desdeId + 5, accion: 'Duelo DEF Ganado', id_jugador: 2, minuto: 16, segundos: 0, quinteto_activo: q },
    { ...base, id: desdeId + 6, accion: 'Duelo OFE Perdido', id_jugador: 4, minuto: 18, segundos: 0, quinteto_activo: q },
    { ...base, id: desdeId + 7, accion: 'Tarjeta Amarilla', id_jugador: 3, minuto: 19, segundos: 0, quinteto_activo: q },
    { ...base, id: desdeId + 8, periodo: 'ST', accion: 'Remate - Gol', id_jugador: 5, minuto: 3, segundos: 0, quinteto_activo: quinteto(1, 2, 3, 5, 4), zona_x: 90, zona_y: 48 },
    { ...base, id: desdeId + 9, periodo: 'ST', equipo: 'Rival', accion: 'Remate - Gol', minuto: 7, segundos: 0, quinteto_activo: q, zona_x: 15, zona_y: 50 },
  ];
}

const PARTIDOS = [partidoCon(1), partidoCon(2), partidoCon(3, { categoria: 'Tercera', torneo_id: 't2', jornada: 'Fecha 2' })];
const EVENTOS = [...eventosDe(1, 100), ...eventosDe(2, 200), ...eventosDe(3, 300)];

const SANCIONES = [
  { id: 1, jugador_id: 3, tipo: 'roja', fechas_tribunal: 2, fechas_internas: 0, fechas_cumplidas: 1 },
];

const raw = {
  jugadores: JUGADORES, partidos: PARTIDOS, eventos: EVENTOS,
  sanciones: SANCIONES, torneos: [{ id: 't1', nombre: 'Torneo 2026', categoria: 'Primera' }],
};

/* Las nueve entradas, en varias combinaciones: lo que cambia entre una y otra
 * es justamente lo que una mudanza puede romper sin que se note. */
const escenarios = [
  ['todo el plantel, sin filtros', {
    raw, partidosScopeCat: PARTIDOS, filtroTorneo: 'Todos', filtroCategoria: 'Todas',
    misCategorias: [], hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  }],
  ['filtrado por torneo', {
    raw, partidosScopeCat: PARTIDOS, filtroTorneo: 't1', filtroCategoria: 'Todas',
    misCategorias: [], hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  }],
  ['un CT que sólo ve Primera', {
    raw, partidosScopeCat: PARTIDOS.filter(p => p.categoria === 'Primera'),
    filtroTorneo: 'Todos', filtroCategoria: 'Primera', misCategorias: ['Primera'],
    hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  }],
  ['sin jugadores', {
    raw: { ...raw, jugadores: [] }, partidosScopeCat: PARTIDOS, filtroTorneo: 'Todos',
    filtroCategoria: 'Todas', misCategorias: [], hayRuedas: false, filtroRueda: 'Todas',
    torneoElegido: null, jornadasOrdenadas: [],
  }],
  ['sin un solo evento cargado', {
    raw: { ...raw, eventos: [] }, partidosScopeCat: PARTIDOS, filtroTorneo: 'Todos',
    filtroCategoria: 'Todas', misCategorias: [], hayRuedas: false, filtroRueda: 'Todas',
    torneoElegido: null, jornadasOrdenadas: [],
  }],
];

describe('procesarPlantel da exactamente lo mismo que antes de moverlo', () => {
  test.each(escenarios)('%s', (_nombre, entrada) => {
    expect(procesarPlantel(entrada)).toEqual(procesarPlantelAntes(entrada));
  });
});

describe('y además calcula lo que tiene que calcular', () => {
  const { jugadoresProc, arquerosProc } = procesarPlantel(escenarios[0][1]);
  const porApellido = (a) => jugadoresProc.find(j => j.apellido === a);

  test('separa arqueros de jugadores de campo', () => {
    expect(arquerosProc.map(a => a.apellido).sort()).toEqual(['BARQUIN', 'MACK']);
    expect(jugadoresProc.some(j => j.apellido === 'MACK')).toBe(false);
  });

  test('cuenta los goles de cada uno', () => {
    expect(porApellido('PERVIU').goles).toBe(3);    // un gol por partido
    expect(porApellido('STANIZZI').goles).toBe(3);  // el del segundo tiempo
    expect(porApellido('GONZI').goles).toBe(0);
  });

  test('cuenta asistencias, recuperaciones y pérdidas', () => {
    expect(porApellido('RECHE').asistencias).toBe(3);
    expect(porApellido('GONZI').rec).toBe(3);
    expect(porApellido('RECHE').perd).toBe(3);
  });

  test('cuenta duelos ganados y disputados por separado', () => {
    expect(porApellido('GONZI').duelDefGan).toBe(3);
    expect(porApellido('GONZI').duelDefTot).toBe(3);
    expect(porApellido('PERVIU').duelOfeGan).toBe(0);
    expect(porApellido('PERVIU').duelOfeTot).toBe(3);
  });

  test('marca el apto vencido a partir de la fecha', () => {
    expect(porApellido('GONZI').aptoVencido).toBe(false);
  });

  test('un jugador sin minutos no inventa rating', () => {
    const sinJugar = jugadoresProc.find(j => j.apellido === 'WIEMEYER');
    expect(sinJugar.minutos).toBe(0);
  });
});
