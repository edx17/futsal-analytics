/* CARTAS ESPECIALES: GOLEADORES, ASISTIDORES, PRESENCIA, MVP Y RECUPERADORES
 *
 * Premios individuales del mes y de la primera rueda, y dos series de diez
 * (GOLEADORES y RECUPERADORES de la primera rueda). Acá no se calcula ningún
 * número nuevo: todo sale de las mismas cuentas que ya muestra la app.
 *
 *   goles, asistencias, recuperaciones, partidos jugados y nota promedio:
 *     procesarPlantel (analytics/plantel.js), lo mismo que Resumen de plantel.
 *       · gol: acción 'Gol' o 'Remate - Gol' del jugador;
 *       · asistencia: figura como `id_asistencia` de un gol propio;
 *       · recuperación: acción 'Recuperación' (la columna REC del Resumen);
 *       · partido jugado: pisó la cancha (participación > 0);
 *       · nota: el rating de cada partido (ratingPartido.js), promediado.
 *   MVP de un partido: el POTW (premiosDelPartido → elegirMVP), la misma figura
 *     que muestran Resumen, Inicio y los premios.
 *
 * Los períodos:
 *   mes           'YYYY-MM', con los partidos del filtro (categoría y torneo);
 *   primera rueda las fechas hasta `torneos.fechas_primera_rueda` de UN torneo
 *                 (utils/ruedas.js). Sin ese corte configurado no hay rueda.
 *
 * Los criterios (los mismos que se acordaron):
 *   GOLEADOR / ASISTIDOR  más goles / más asistencias. Con empate en el
 *                         primer puesto la carta es para todos los empatados
 *                         (no se inventa un desempate).
 *   PRESENCIA             más partidos jugados del período; entre los que
 *                         jugaron los mismos, la mejor nota promedio. Si
 *                         también empatan en la nota (a dos decimales), es
 *                         compartida.
 *   MVP 1ª RUEDA          más veces figura (MVP) de partido. Empate: compartida.
 *   SERIES (top 10)       ranking "de competición": los empatados comparten el
 *                         puesto (1, 2, 2, 4…) y entran todos los que quedan
 *                         del 1 al 10, aunque sean más de diez. Con cero no se
 *                         entra en ningún ranking.
 *
 * Funciones puras, sin pantalla ni base de datos, para poder probarlas.
 */

import { procesarPlantel } from './plantel';
import { analizarPartidos, rolDe } from './quinteto';
import { premiosDelPartido, claveMes, minimoPartidosMes } from './premios';
import { ruedaDePartido, ordenarJornadas, tieneRuedasConfiguradas } from '../utils/ruedas';
import { diasDelMes } from '../utils/resumenMensual';

const redondear = (n, d = 2) => Number(Number(n).toFixed(d));

/* Los tipos de carta especial (se guardan en cartas_destacadas.tipo). */
export const TIPOS_ESPECIALES = ['GOLM', 'ASIM', 'PREM', 'GOLR', 'ASIR', 'PRER', 'MVPR', 'SGOL', 'SREC'];
export const TIPOS_MES = ['GOLM', 'ASIM', 'PREM'];
export const TIPOS_RUEDA = ['GOLR', 'ASIR', 'PRER', 'MVPR'];
export const TIPOS_SERIE = ['SGOL', 'SREC'];
export const TOPE_SERIE = 10;

/* La clave del período de la primera rueda: el torneo va adentro porque cada
   torneo tiene la suya (y la clave de la carta es TIPO|periodo|jugador: sin
   barras verticales acá). */
export const periodoRueda = (torneoId) => `R1:${torneoId}`;
export const torneoDePeriodo = (periodo) => (String(periodo).startsWith('R1:') ? String(periodo).slice(3) : null);

/* ══════════════════════════════════════════════════════════════════════════
   LOS PARTIDOS DE CADA PERÍODO
   ══════════════════════════════════════════════════════════════════════════ */

/** Los partidos de un mes ('YYYY-MM') dentro de los que se le pasen. */
export const partidosDelMes = (partidos = [], mes) => partidos.filter((p) => claveMes(p.fecha) === mes);

/** Los partidos de la primera rueda de un torneo (vacío si el torneo no tiene el corte configurado). */
export function partidosPrimeraRueda(partidos = [], torneo) {
  if (!tieneRuedasConfiguradas(torneo)) return [];
  const delTorneo = partidos.filter((p) => p.torneo_id === torneo.id);
  const jornadas = ordenarJornadas(delTorneo.map((p) => p.jornada));
  return delTorneo.filter((p) => ruedaDePartido(p, torneo, jornadas) === 1);
}

/**
 * ¿Terminó la primera rueda? Cuando ya hay un partido CON DATOS de la segunda
 * (como un mes: está cerrado cuando empezó otro). Antes de eso los premios de
 * la rueda pueden cambiar.
 */
export function ruedaCerrada(partidos = [], torneo, conDatos = new Set()) {
  if (!tieneRuedasConfiguradas(torneo)) return false;
  const delTorneo = partidos.filter((p) => p.torneo_id === torneo.id);
  const jornadas = ordenarJornadas(delTorneo.map((p) => p.jornada));
  return delTorneo.some((p) => conDatos.has(String(p.id)) && ruedaDePartido(p, torneo, jornadas) === 2);
}

/* ══════════════════════════════════════════════════════════════════════════
   LAS ESTADÍSTICAS DE UN PERÍODO (las de Resumen de plantel)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Una fila por jugador que jugó algún partido del período, con lo que hace
 * falta para los rankings. `partidos`: los del período, ya filtrados.
 * Devuelve también cuántos partidos con datos tuvo el equipo y las figuras.
 */
export function estadisticasDelPeriodo({ raw, partidos = [], misCategorias = [] }) {
  const ids = new Set(partidos.map((p) => String(p.id)));
  const eventos = (raw.eventos || []).filter((e) => ids.has(String(e.id_partido)));
  const conDatos = new Set(eventos.map((e) => String(e.id_partido)));
  const scope = { ...raw, eventos };

  const { jugadoresProc, arquerosProc } = procesarPlantel({
    raw: scope, partidosScopeCat: partidos, filtroTorneo: 'Todos', filtroCategoria: 'Todas', misCategorias,
    hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  });

  // Las figuras de cada partido (el mismo POTW de los premios).
  const { partidosJugados } = analizarPartidos({ partidos, eventos, jugadores: raw.jugadores || [] });
  const mvps = new Map();
  partidosJugados.forEach((p) => {
    const pr = premiosDelPartido(p);
    if (pr) mvps.set(pr.potw.id, (mvps.get(pr.potw.id) || 0) + 1);
  });

  const filas = [...jugadoresProc, ...arquerosProc]
    .filter((j) => j.jugados > 0)
    .map((j) => ({
      id: String(j.id),
      nombre: j.nombre || '',
      apellido: j.apellido || '',
      rol: rolDe(j.posicion),
      pj: j.jugados,
      goles: j.goles,
      asistencias: j.asistencias,
      rec: j.rec,
      mvp: mvps.get(String(j.id)) || 0,
      nota: j.ratingCount > 0 ? redondear(j.ratingProm, 2) : null,
    }));

  const fechas = partidos.filter((p) => conDatos.has(String(p.id))).map((p) => String(p.fecha || '').slice(0, 10)).filter(Boolean).sort();
  return { filas, partidosEquipo: conDatos.size, ultimaFecha: fechas[fechas.length - 1] || null, figuras: partidosJugados.length };
}

/* ══════════════════════════════════════════════════════════════════════════
   RANKINGS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ranking de competición por `valor` (de mayor a menor): los empatados
 * comparten el puesto y el siguiente salta (1, 2, 2, 4). Sólo entran los que
 * tienen más de cero. Desempate de ORDEN (no de puesto): apellido.
 */
export function rankear(filas = [], valor) {
  const lista = filas
    .map((f) => ({ fila: f, v: Number(valor(f)) || 0 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => (b.v - a.v) || String(a.fila.apellido).localeCompare(String(b.fila.apellido)));
  let puesto = 0;
  return lista.map((x, i) => {
    if (i === 0 || x.v !== lista[i - 1].v) puesto = i + 1;
    return { ...x.fila, puesto, valor: x.v, empate: false };
  }).map((x, i, todos) => ({ ...x, empate: todos.some((y, j) => j !== i && y.puesto === x.puesto) }));
}

/** Los diez primeros de un ranking (con los empatados en el décimo puesto adentro). */
export const topSerie = (ranking, tope = TOPE_SERIE) => ranking.filter((x) => x.puesto <= tope);

/** Los del primer puesto de un ranking (uno, o todos los empatados). */
export const ganadores = (ranking) => ranking.filter((x) => x.puesto === 1);

/**
 * Presencia: más partidos jugados; entre iguales, mejor nota. Devuelve el
 * ranking con el puesto compartido sólo si empatan en las dos cosas.
 */
export function rankingPresencia(filas = []) {
  const lista = filas.filter((f) => f.pj > 0)
    .sort((a, b) => (b.pj - a.pj) || ((b.nota ?? -1) - (a.nota ?? -1)) || String(a.apellido).localeCompare(String(b.apellido)));
  let puesto = 0;
  const igual = (a, b) => a.pj === b.pj && (a.nota ?? -1) === (b.nota ?? -1);
  return lista.map((f, i) => {
    if (i === 0 || !igual(f, lista[i - 1])) puesto = i + 1;
    return { ...f, puesto, valor: f.pj };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   LOS REGISTROS (el mismo formato que los de premios.js)
   { tipo, periodo, fechaRef, destacadoId, jugadores:[ficha], contexto }
   ══════════════════════════════════════════════════════════════════════════ */

const ficha = (x, extra = {}) => ({
  id: x.id, rol: x.rol, pj: x.pj, nota: x.nota, goles: x.goles, asistencias: x.asistencias,
  rec: x.rec, mvp: x.mvp, puesto: x.puesto ?? 1, valor: x.valor ?? null, empate: !!x.empate, ...extra,
});

function individual(tipo, ranking, { periodo, fechaRef, contexto }) {
  const ganan = ganadores(ranking);
  if (ganan.length === 0) return null;
  return {
    tipo, periodo, fechaRef,
    destacadoId: ganan.length === 1 ? ganan[0].id : null,
    jugadores: ganan.map((x) => ficha(x)),
    contexto: { ...contexto, compartido: ganan.length > 1 },
  };
}

function serie(tipo, ranking, { periodo, fechaRef, contexto }) {
  const top = topSerie(ranking);
  if (top.length === 0) return null;
  return {
    tipo, periodo, fechaRef,
    destacadoId: top.filter((x) => x.puesto === 1).length === 1 ? top[0].id : null,
    jugadores: top.map((x) => ficha(x)),
    contexto: { ...contexto, tope: TOPE_SERIE, entran: top.length },
  };
}

/** El último día de un mes 'YYYY-MM'. */
const finDeMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(diasDelMes(a, m)).padStart(2, '0')}`;
};

/**
 * Las tres cartas del mes: Goleador, Asistidor y Presencia.
 * `partidos`: TODOS los del filtro (se recortan acá al mes).
 */
export function especialesDelMes({ raw, partidos = [], mes, misCategorias = [] }) {
  const delMes = partidosDelMes(partidos, mes);
  const est = estadisticasDelPeriodo({ raw, partidos: delMes, misCategorias });
  if (est.partidosEquipo === 0) return { estadisticas: est, registros: [] };
  const base = { periodo: mes, fechaRef: finDeMes(mes), contexto: { mes, partidos: est.partidosEquipo } };
  const registros = [
    individual('GOLM', rankear(est.filas, (f) => f.goles), base),
    individual('ASIM', rankear(est.filas, (f) => f.asistencias), base),
    individual('PREM', rankingPresencia(est.filas), {
      ...base, contexto: { ...base.contexto, minimo: minimoPartidosMes(est.partidosEquipo) },
    }),
  ].filter(Boolean);
  return { estadisticas: est, registros };
}

/**
 * Las cartas de la primera rueda de un torneo: Goleador, Asistidor, Presencia,
 * MVP y las dos series (GOLEADORES y RECUPERADORES, del 1 al 10).
 * `partidos`: los del filtro de categoría (se recortan acá al torneo y la rueda).
 */
export function especialesPrimeraRueda({ raw, partidos = [], torneo, misCategorias = [] }) {
  const deLaRueda = partidosPrimeraRueda(partidos, torneo);
  if (deLaRueda.length === 0) return { estadisticas: null, registros: [], sinCorte: !tieneRuedasConfiguradas(torneo) };
  const est = estadisticasDelPeriodo({ raw, partidos: deLaRueda, misCategorias });
  if (est.partidosEquipo === 0) return { estadisticas: est, registros: [] };
  const base = {
    periodo: periodoRueda(torneo.id),
    fechaRef: est.ultimaFecha,
    contexto: { torneo: torneo.nombre || '', torneoId: torneo.id, rueda: 1, fechas: Number(torneo.fechas_primera_rueda), partidos: est.partidosEquipo },
  };
  const goles = rankear(est.filas, (f) => f.goles);
  const recuperaciones = rankear(est.filas, (f) => f.rec);
  const registros = [
    individual('GOLR', goles, base),
    individual('ASIR', rankear(est.filas, (f) => f.asistencias), base),
    individual('PRER', rankingPresencia(est.filas), base),
    individual('MVPR', rankear(est.filas, (f) => f.mvp), { ...base, contexto: { ...base.contexto, figuras: est.figuras } }),
    serie('SGOL', goles, base),
    serie('SREC', recuperaciones, base),
  ].filter(Boolean);
  return { estadisticas: est, registros };
}
