/* PREMIOS DE MYSQUAD: POTW, TOTW, POTM, TOTM, TOTY
 *
 * Todo sale de `partidosJugados` (ver analizarPartidos en quinteto.js): para
 * cada partido con datos, la nota de cada jugador que estuvo, con su
 * participación y sus goles y asistencias. Acá no se calcula ningún rating
 * nuevo: sólo se elige a quién destacar.
 *
 *   POTW  jugador del último partido. Es la figura: la misma regla que
 *         `elegirMVP`, que usan Resumen e Inicio.
 *   TOTW  el quinteto del último partido: arquero + los cuatro mejores de
 *         campo. El POTW siempre está adentro.
 *   POTM  jugador del mes: la mejor nota PROMEDIO de los partidos del mes,
 *         pidiendo haber jugado más de la mitad (mitad + 1: de 5 partidos,
 *         mínimo 3).
 *   TOTM  el quinteto del mes, con el mismo mínimo y el POTM adentro.
 *   TOTY  el mejor jugador de la temporada, pidiendo haber jugado al menos el
 *         65% de los partidos.
 *
 * Funciones puras, sin pantalla, para poder probarlas.
 */

import { elegirMVP } from './rating';
import { diasDelMes } from '../utils/resumenMensual';

/** Qué porcentaje de los partidos hay que haber jugado para el TOTY. */
export const PORCENTAJE_MIN_TOTY = 0.65;

/* Igual que en elegirMVP: con menos de un cuarto del partido en cancha la nota
   no dice nada. Si no queda nadie con ese mínimo, se usan todos. */
export const MIN_PARTICIPACION = 0.25;

export const TIPOS = ['POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY'];

const redondear = (n, d = 2) => Number(Number(n).toFixed(d));
const ga = (c) => (Number(c.goles) || 0) + (Number(c.asistencias) || 0);

/* Mejor primero: la nota, y a igual nota los goles+asistencias y después los goles. */
const porNota = (a, b) =>
  (b.rating - a.rating) || (ga(b) - ga(a)) || ((Number(b.goles) || 0) - (Number(a.goles) || 0));

/** Nota 0-10 → media 40-99, igual que las cartas (ovrDesdeRating) pero sin
    acercar a la media del equipo: un premio ya pasó un mínimo de partidos. */
export const ovrDeNota = (nota) => Math.max(40, Math.min(99, Math.round(40 + (Number(nota) - 4) * 12.5)));

/** Meses mínimos: la mitad más uno. 5 partidos → 3; 4 → 3; 2 → 2; 1 → 1. */
export const minimoPartidosMes = (partidosDelMes) => (partidosDelMes > 0 ? Math.floor(partidosDelMes / 2) + 1 : 0);

/** Partidos mínimos para el TOTY: el 65% de los que jugó el equipo, redondeado para arriba. */
export const minimoPartidosTemporada = (partidosEquipo) => Math.ceil((Number(partidosEquipo) || 0) * PORCENTAJE_MIN_TOTY - 1e-9);

export const claveMes = (fecha) => String(fecha || '').slice(0, 7);
export const claveAnio = (fecha) => String(fecha || '').slice(0, 4);

/* ══════════════════════════════════════════════════════════════════════════
   EL QUINTETO: arquero + los cuatro mejores de campo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `candidatos`: [{ id, rol, rating, goles, asistencias }] ya filtrados por el
 * mínimo que corresponda. `obligado`: id que tiene que estar sí o sí (el
 * jugador del partido/mes), aunque por una décima no entre en el corte.
 * Devuelve los ids en este orden: [arquero, campo, campo, campo, campo].
 */
export function armarQuinteto(candidatos = [], obligado = null) {
  const orden = [...candidatos].sort(porNota);
  const arqueros = orden.filter((c) => c.rol === 'ARQ');
  const campo = orden.filter((c) => c.rol !== 'ARQ');
  const sid = obligado != null ? String(obligado) : null;

  let arquero = arqueros[0] || null;
  if (sid) {
    const forzadoArq = arqueros.find((c) => String(c.id) === sid);
    if (forzadoArq) arquero = forzadoArq;
  }

  let elegidos = campo.slice(0, 4);
  if (sid && !elegidos.some((c) => String(c.id) === sid)) {
    const forzado = campo.find((c) => String(c.id) === sid);
    if (forzado) elegidos = [...campo.slice(0, 3), forzado];
  }

  /* Sin arquero entre los candidatos el quinteto igual se arma, con cinco de
     campo: es mejor mostrar algo que dejar el premio vacío. */
  if (!arquero) {
    let cinco = campo.slice(0, 5);
    if (sid && !cinco.some((c) => String(c.id) === sid)) {
      const forzado = campo.find((c) => String(c.id) === sid);
      if (forzado) cinco = [...campo.slice(0, 4), forzado];
    }
    return { ids: cinco.map((c) => String(c.id)), sinArquero: true };
  }

  const ids = [arquero, ...elegidos].map((c) => String(c.id));
  return { ids, sinArquero: false };
}

/* ══════════════════════════════════════════════════════════════════════════
   POTW y TOTW: el último partido
   ══════════════════════════════════════════════════════════════════════════ */

const elegibles = (jugadores) => {
  const ok = jugadores.filter((c) => (Number(c.participacion) || 0) >= MIN_PARTICIPACION);
  return ok.length ? ok : jugadores;
};

/**
 * Los premios de UN partido. Devuelve null si el partido no tiene jugadores
 * con nota.
 */
export function premiosDelPartido(partido) {
  const jugadores = (partido?.jugadores || []).filter((c) => Number.isFinite(Number(c.rating)));
  if (jugadores.length === 0) return null;

  const mvp = elegirMVP(jugadores, { golesFavor: partido.golesFavor, golesContra: partido.golesContra });
  if (!mvp) return null;

  const quinteto = armarQuinteto(elegibles(jugadores), mvp.id);
  const porId = new Map(jugadores.map((c) => [String(c.id), c]));

  return {
    partido: {
      id: String(partido.id), fecha: partido.fecha, rival: partido.rival,
      golesFavor: partido.golesFavor, golesContra: partido.golesContra,
    },
    potw: {
      id: String(mvp.id), rol: mvp.rol, nota: redondear(mvp.rating, 1),
      goles: mvp.goles || 0, asistencias: mvp.asistencias || 0, etiqueta: mvp.etiqueta,
    },
    totw: {
      sinArquero: quinteto.sinArquero,
      jugadores: quinteto.ids.map((id) => {
        const c = porId.get(id);
        return { id, rol: c.rol, nota: redondear(c.rating, 1), goles: c.goles || 0, asistencias: c.asistencias || 0 };
      }),
    },
  };
}

/** El último partido con datos del filtro (los partidos vienen del más viejo al más nuevo). */
export const ultimoPartido = (partidosJugados = []) =>
  (partidosJugados.length ? partidosJugados[partidosJugados.length - 1] : null);

/* ══════════════════════════════════════════════════════════════════════════
   POTM, TOTM, TOTY: promedios de un período
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Por jugador: en cuántos partidos estuvo y su nota promedio.
 * El rol es el del último partido en que apareció.
 */
export function acumularPeriodo(partidos = []) {
  const acc = new Map();
  partidos.forEach((p) => {
    (p.jugadores || []).forEach((c) => {
      if (!Number.isFinite(Number(c.rating))) return;
      const id = String(c.id);
      if (!acc.has(id)) acc.set(id, { id, rol: c.rol, pj: 0, suma: 0, goles: 0, asistencias: 0 });
      const a = acc.get(id);
      a.pj += 1;
      a.suma += Number(c.rating);
      a.goles += Number(c.goles) || 0;
      a.asistencias += Number(c.asistencias) || 0;
      a.rol = c.rol || a.rol;
    });
  });
  return [...acc.values()].map((a) => ({
    id: a.id, rol: a.rol, pj: a.pj,
    rating: redondear(a.suma / a.pj, 2),
    goles: a.goles, asistencias: a.asistencias,
  }));
}

const fichaPeriodo = (c) => ({
  id: c.id, rol: c.rol, pj: c.pj, nota: redondear(c.rating, 2), goles: c.goles, asistencias: c.asistencias,
});

/** Los meses ('YYYY-MM') con partidos, del más viejo al más nuevo. */
export const mesesConPartidos = (partidosJugados = []) =>
  [...new Set(partidosJugados.map((p) => claveMes(p.fecha)).filter(Boolean))].sort();

/**
 * POTM y TOTM de un mes. Devuelve null si ese mes no tuvo partidos, o si
 * nadie llegó al mínimo.
 */
export function premiosDelMes(partidosJugados = [], mes) {
  const delMes = partidosJugados.filter((p) => claveMes(p.fecha) === mes);
  if (delMes.length === 0) return null;

  const minimo = minimoPartidosMes(delMes.length);
  const acumulado = acumularPeriodo(delMes);
  const aptos = acumulado.filter((c) => c.pj >= minimo);
  if (aptos.length === 0) return null;

  const mejor = [...aptos].sort(porNota)[0];
  const quinteto = armarQuinteto(aptos, mejor.id);
  const porId = new Map(aptos.map((c) => [c.id, c]));

  return {
    mes, partidos: delMes.length, minimo,
    potm: fichaPeriodo(mejor),
    totm: {
      sinArquero: quinteto.sinArquero,
      jugadores: quinteto.ids.map((id) => fichaPeriodo(porId.get(id))),
    },
  };
}

/**
 * TOTY: el mejor jugador de los partidos que se le pasen (la temporada, o el
 * torneo si el filtro lo acota). Pide haber jugado el 65% de esos partidos.
 */
export function premioTemporada(partidosJugados = []) {
  const n = partidosJugados.length;
  if (n === 0) return null;

  const minimo = minimoPartidosTemporada(n);
  const aptos = acumularPeriodo(partidosJugados).filter((c) => c.pj >= minimo);
  if (aptos.length === 0) return null;

  const mejor = [...aptos].sort(porNota)[0];
  return { partidos: n, minimo, toty: fichaPeriodo(mejor) };
}

/* ══════════════════════════════════════════════════════════════════════════
   CUÁNDO SE PUEDE GUARDAR EN EL HISTORIAL
   ══════════════════════════════════════════════════════════════════════════ */

/** Un mes está cerrado cuando ya empezó uno posterior. `hoy`: 'YYYY-MM-DD'. */
export const mesCerrado = (mes, hoy) => mes < claveMes(hoy);

/* Los registros que se guardan en el historial: un formato único para los
   cinco premios, así lo que se lee de la base se dibuja igual que lo que se
   acaba de calcular.
   { tipo, periodo, fechaRef, destacadoId, jugadores:[ficha], contexto } */

/** POTW y TOTW de un partido, a partir de `premiosDelPartido`. */
export function registrosDePartido(pr) {
  if (!pr) return [];
  const contexto = { ...pr.partido, etiqueta: pr.potw.etiqueta };
  return [
    {
      tipo: 'POTW', periodo: pr.partido.id, fechaRef: pr.partido.fecha,
      destacadoId: pr.potw.id, jugadores: [pr.potw], contexto,
    },
    {
      tipo: 'TOTW', periodo: pr.partido.id, fechaRef: pr.partido.fecha,
      destacadoId: pr.potw.id, jugadores: pr.totw.jugadores, contexto: { ...contexto, sinArquero: pr.totw.sinArquero },
    },
  ];
}

/** POTM y TOTM de un mes, a partir de `premiosDelMes`. */
export function registrosDeMes(pm) {
  if (!pm) return [];
  const contexto = { mes: pm.mes, partidos: pm.partidos, minimo: pm.minimo };
  const [anio, nroMes] = pm.mes.split('-').map(Number);
  const fechaRef = `${pm.mes}-${String(diasDelMes(anio, nroMes)).padStart(2, '0')}`;
  return [
    { tipo: 'POTM', periodo: pm.mes, fechaRef, destacadoId: pm.potm.id, jugadores: [pm.potm], contexto },
    {
      tipo: 'TOTM', periodo: pm.mes, fechaRef, destacadoId: pm.potm.id,
      jugadores: pm.totm.jugadores, contexto: { ...contexto, sinArquero: pm.totm.sinArquero },
    },
  ];
}

/** TOTY de la temporada que cubren los partidos, a partir de `premioTemporada`. */
export function registroTemporada(pt, partidosJugados = []) {
  if (!pt) return null;
  const ultimo = ultimoPartido(partidosJugados);
  const fechaRef = ultimo?.fecha || null;
  return {
    tipo: 'TOTY', periodo: claveAnio(fechaRef), fechaRef,
    destacadoId: pt.toty.id, jugadores: [pt.toty],
    contexto: { partidos: pt.partidos, minimo: pt.minimo },
  };
}

/**
 * Todo lo que ya es definitivo y conviene congelar en el historial:
 * el POTW/TOTW de cada partido, y el POTM/TOTM de cada mes cerrado.
 * El TOTY de la temporada en curso no se congela solo: sigue moviéndose, se
 * guarda a mano cuando se cierra.
 */
export function registrosDefinitivos(partidosJugados = [], hoy) {
  const registros = [];
  partidosJugados.forEach((p) => registros.push(...registrosDePartido(premiosDelPartido(p))));
  mesesConPartidos(partidosJugados)
    .filter((m) => mesCerrado(m, hoy))
    .forEach((mes) => registros.push(...registrosDeMes(premiosDelMes(partidosJugados, mes))));
  return registros;
}
