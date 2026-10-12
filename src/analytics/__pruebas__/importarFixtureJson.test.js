import { describe, it, expect } from 'vitest';
import { parseFixtureJson, planificarSincronizacion, aliasDeResueltos, itemsElegibles, elegirCambios } from '../../utils/importarFixtureJson';
import { matchearRivales, ID_MI_CLUB } from '../../utils/parseFixturePegado';

const MI = 'LIBERTADORES SC (AFA - Masc)';
const RIVALES = [
  { id: 'r1', nombre: 'V. MALCOLM' },
  { id: 'r2', nombre: 'ALMAFUERTE' },
  { id: 'r3', nombre: 'JUV TAPIALES' },
  { id: 'r4', nombre: 'UNLAM' },
  { id: 'r5', nombre: 'EXCURSIONISTAS' },
];
const ALIAS = [{ rival_id: 'r1', alias_norm: 'villamalcolm' }];
const CTX = { clubId: 'c1', torneo: { id: 't1', nombre: 'Torneo 2026', categoria: 'Primera' }, miClub: MI, miEscudo: null };

const json = (lista) => JSON.stringify(lista);
const p = (o) => ({ id_externo: 1, jornada: 1, fecha: '2026-03-28', hora: '20:00:00', goles_local: null, goles_visitante: null, estado: 'Pendiente', ...o });

const plan = (archivo, fixture) => {
  const { cruces } = parseFixtureJson(json(archivo));
  return planificarSincronizacion(matchearRivales(cruces, RIVALES, ALIAS, MI), fixture, RIVALES, CTX);
};

describe('parseFixtureJson', () => {
  it('lee el archivo del scraper', () => {
    const { cruces, avisos } = parseFixtureJson(json([p({ jornada: 25, equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales', goles_local: 5, goles_visitante: 5, estado: 'Finalizado' })]));
    expect(avisos).toEqual([]);
    expect(cruces[0]).toMatchObject({ jornada: 'Fecha 25', hora: '20:00', finalizado: true, golesLocal: 5, golesVisitante: 5 });
  });
  it('"Jugándose" con marcador a medias no cuenta como final', () => {
    const { cruces } = parseFixtureJson(json([p({ equipo_local: 'A', equipo_visitante: 'B', goles_local: 1, goles_visitante: 1, estado: 'Jugandose' })]));
    expect(cruces[0].finalizado).toBe(false);
  });
  it('avisa si no es JSON o no es una lista', () => {
    expect(parseFixtureJson('hola').avisos[0]).toMatch(/JSON/);
    expect(parseFixtureJson('{"a":1}').avisos[0]).toMatch(/lista/);
  });
});

describe('matchearRivales reconoce tu club por prefijo', () => {
  it('"Libertadores" es LIBERTADORES SC (AFA - Masc)', () => {
    const [m] = matchearRivales([{ local: 'Libertadores', visitante: 'UNLAM', jornada: 'Fecha 2' }], RIVALES, [], MI);
    expect(m.local_id).toBe(ID_MI_CLUB);
    expect(m.visitante_id).toBe('r4');
  });
});

describe('planificarSincronizacion', () => {
  const ajeno = (o) => ({ id: 'x', condicion: 'Neutral', jornada: 'Fecha 25', fecha: '2026-09-20', horario: null, estado: 'Pendiente', goles_propios: 0, goles_rival: 0, nombre_propio: 'ALMAFUERTE', rival: 'JUV TAPIALES', local_rival_id: 'r2', rival_id: 'r3', ...o });

  it('completa el resultado que falta y no lo vuelve a insertar', () => {
    const r = plan([p({ jornada: 25, fecha: '2026-09-20', hora: null, equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales', goles_local: 5, goles_visitante: 5, estado: 'Finalizado' })], [ajeno()]);
    expect(r.nuevos).toHaveLength(0);
    expect(r.actualizar).toHaveLength(1);
    expect(r.actualizar[0].cambios).toEqual({ estado: 'Finalizado', goles_propios: 5, goles_rival: 5 });
  });

  it('correrlo dos veces no cambia nada la segunda', () => {
    const fila = ajeno({ estado: 'Finalizado', goles_propios: 5, goles_rival: 5, fecha: '2026-09-20' });
    const r = plan([p({ jornada: 25, fecha: '2026-09-20', hora: null, equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales', goles_local: 5, goles_visitante: 5, estado: 'Finalizado' })], [fila]);
    expect(r.iguales).toBe(1);
    expect(r.actualizar).toHaveLength(0);
    expect(r.nuevos).toHaveLength(0);
  });

  it('un finalizado en la app no vuelve a pendiente', () => {
    const fila = ajeno({ estado: 'Finalizado', goles_propios: 4, goles_rival: 2 });
    const r = plan([p({ jornada: 25, fecha: '2026-09-20', hora: null, equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales', estado: 'Pendiente' })], [fila]);
    expect(r.iguales).toBe(1);
  });

  it('resultado distinto: a revisar, y si está trackeado no se propone cambio', () => {
    const fila = { id: 'm', condicion: 'Visitante', jornada: 'Fecha 2', fecha: '2026-04-04', horario: '21:30', estado: 'Finalizado', goles_propios: 3, goles_rival: 1, nombre_propio: MI, rival: 'UNLAM', rival_id: 'r4', esTrackeado: true };
    const r = plan([p({ jornada: 2, fecha: '2026-04-05', equipo_local: 'UNLAM', equipo_visitante: 'Libertadores', goles_local: 2, goles_visitante: 3, estado: 'Finalizado' })], [fila]);
    expect(r.revisar).toHaveLength(1);
    expect(r.revisar[0].cambios).toBeNull();
    // tu partido ya jugado: la fecha tampoco se toca
    expect(r.actualizar).toHaveLength(0);
  });

  it('tu partido de visitante: los goles se guardan del lado correcto', () => {
    const fila = { id: 'm', condicion: 'Visitante', jornada: 'Fecha 2', fecha: '2026-04-04', horario: null, estado: 'Pendiente', goles_propios: 0, goles_rival: 0, nombre_propio: MI, rival: 'UNLAM', rival_id: 'r4' };
    const r = plan([p({ jornada: 2, fecha: '2026-04-04', hora: null, equipo_local: 'UNLAM', equipo_visitante: 'Libertadores', goles_local: 1, goles_visitante: 3, estado: 'Finalizado' })], [fila]);
    expect(r.actualizar[0].cambios).toMatchObject({ estado: 'Finalizado', goles_propios: 3, goles_rival: 1 });
  });

  it('reprogramación: cambia fecha y hora de un partido que no se jugó', () => {
    const r = plan([p({ jornada: 25, fecha: '2026-10-30', hora: '21:00:00', equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales' })], [ajeno()]);
    expect(r.actualizar[0].cambios).toEqual({ fecha: '2026-10-30', horario: '21:00' });
  });

  it('partido que no está: nuevo, con el alias resuelto y tu club como local', () => {
    const r = plan([
      p({ jornada: 1, equipo_local: 'Libertadores', equipo_visitante: 'Villa Malcolm', goles_local: 5, goles_visitante: 0, estado: 'Finalizado' }),
      p({ jornada: 1, equipo_local: 'Excursionistas', equipo_visitante: 'Almafuerte' }),
    ], []);
    expect(r.nuevos).toHaveLength(2);
    expect(r.nuevos[0].fila).toMatchObject({ condicion: 'Local', rival_id: 'r1', goles_propios: 5, goles_rival: 0, estado: 'Finalizado', jornada: 'Fecha 1' });
    expect(r.nuevos[1].fila).toMatchObject({ condicion: 'Neutral', local_rival_id: 'r5', rival_id: 'r2', estado: 'Pendiente' });
  });

  it('equipos que no se reconocen quedan aparte y no se guardan', () => {
    const r = plan([p({ equipo_local: 'Equipo Fantasma', equipo_visitante: 'Almafuerte' })], []);
    expect(r.sinResolver).toEqual(['Equipo Fantasma']);
    expect(r.nuevos).toHaveLength(0);
  });
});

describe('elegir qué se trae', () => {
  const ajeno = (o) => ({ id: 'x', condicion: 'Neutral', jornada: 'Fecha 25', fecha: '2026-09-20', horario: '20:00:00', estado: 'Pendiente', goles_propios: 0, goles_rival: 0, nombre_propio: 'ALMAFUERTE', rival: 'JUV TAPIALES', local_rival_id: 'r2', rival_id: 'r3', ...o });
  const liga = (o) => p({ jornada: 25, fecha: '2026-09-21', hora: '21:30:00', equipo_local: 'Almafuerte', equipo_visitante: 'Juv Tapiales', goles_local: 3, goles_visitante: 1, estado: 'Finalizado', ...o });

  it('resultado, fecha y horario se eligen por separado', () => {
    const r = plan([liga()], [ajeno()]);
    const items = itemsElegibles(r);
    expect(items.map((i) => i.clave)).toEqual(['resultado:x', 'fecha:x', 'hora:x']);
    expect(elegirCambios(r, new Set(['resultado:x'])).updates).toEqual([{ id: 'x', cambios: { estado: 'Finalizado', goles_propios: 3, goles_rival: 1 } }]);
    expect(elegirCambios(r, new Set(['fecha:x', 'hora:x'])).updates).toEqual([{ id: 'x', cambios: { fecha: '2026-09-21', horario: '21:30' } }]);
    expect(elegirCambios(r, new Set()).updates).toEqual([]);
  });

  it('la hora guardada con segundos no cuenta como cambio', () => {
    const r = plan([liga({ fecha: '2026-09-20', hora: '20:00:00', estado: 'Pendiente', goles_local: null, goles_visitante: null })], [ajeno()]);
    expect(r.actualizar).toHaveLength(0);
    expect(r.iguales).toBe(1);
  });

  it('nuevos y correcciones solo si se eligen', () => {
    const r = plan([liga({ jornada: 26, equipo_local: 'UNLAM', equipo_visitante: 'Almafuerte' }), liga()], [ajeno({ estado: 'Finalizado', goles_propios: 1, goles_rival: 1, fecha: '2026-09-21', horario: '21:30' })]);
    expect(itemsElegibles(r).map((i) => i.grupo)).toEqual(['nuevo', 'corregir']);
    expect(elegirCambios(r, new Set(['nuevo:0'])).inserts).toHaveLength(1);
    expect(elegirCambios(r, new Set(['nuevo:0'])).updates).toEqual([]);
    expect(elegirCambios(r, new Set(['corregir:x'])).updates).toEqual([{ id: 'x', cambios: { goles_propios: 3, goles_rival: 1 } }]);
  });

  it('el mismo cruce con la localía al revés no se duplica', () => {
    const mio = { id: 'm', condicion: 'Local', jornada: 'Fecha 4', fecha: '2026-04-19', estado: 'Finalizado', goles_propios: 2, goles_rival: 2, rival: 'UNLAM', rival_id: 'r4' };
    const r = plan([p({ jornada: 4, equipo_local: 'UNLAM', equipo_visitante: 'Libertadores', goles_local: 2, goles_visitante: 2, estado: 'Finalizado' })], [mio]);
    expect(r.nuevos).toHaveLength(0);
    expect(r.revisar[0]).toMatchObject({ id: 'm', cambios: null });
    expect(r.revisar[0].motivo).toMatch(/localía al revés/);
  });
});

describe('aliasDeResueltos', () => {
  it('guarda sólo los nombres que no se reconocen solos, y nunca tu club', () => {
    const a = aliasDeResueltos({ 'Estrella Maldonado': 'r2', 'ALMAFUERTE': 'r2', 'Lib': ID_MI_CLUB }, RIVALES);
    expect(a).toEqual([{ rival_id: 'r2', alias: 'Estrella Maldonado', alias_norm: 'estrellamaldonado' }]);
  });
});
