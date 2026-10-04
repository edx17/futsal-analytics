/* MI QUINTETO: LAS CUENTAS
 *
 * Las cartas al estilo Ultimate Team salen de los mismos números que Resumen
 * de plantel (procesarPlantel): acá no se inventa ningún dato, sólo se pasa a
 * otra escala lo que la toma de datos ya registró.
 *
 * Funciones puras, sin pantalla, para poder probarlas.
 */

import { prepararRatingsPartido } from './ratingPartido';
import { esArquero, ordenEv, parseQuinteto, minimoPartidosDestacado } from './plantel';

const DUR_PARTIDO = 40;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ══════════════════════════════════════════════════════════════════════════
   LA MEDIA (OVR)
   ══════════════════════════════════════════════════════════════════════════ */

/* Con pocos partidos, el promedio propio pesa poco y la media se acerca a la
   del equipo: un solo partido de 9 no puede dar una carta de 95. K es cuántos
   "partidos del promedio del equipo" se suman a la cuenta. */
const K_PARTIDOS = 3;

/** Rating 0-10 → media 40-99. 6.0 = 65 (plata), 6.8 = 75 (oro), 8.0 = 90. */
export function ovrDesdeRating(prom, partidos, mediaEquipo) {
  const n = Math.max(0, Number(partidos) || 0);
  const base = Number.isFinite(Number(mediaEquipo)) && mediaEquipo > 0 ? Number(mediaEquipo) : 6;
  const p = Number(prom) || 0;
  const ajustado = n > 0 ? (n * p + K_PARTIDOS * base) / (n + K_PARTIDOS) : base;
  return clamp(Math.round(40 + (ajustado - 4) * 12.5), 40, 99);
}

export function tierDe(ovr) {
  if (ovr >= 75) return 'oro';
  if (ovr >= 65) return 'plata';
  return 'bronce';
}

/** ARQ / CIE / ALA / PIV a partir de la posición cargada en el plantel. */
export function rolDe(posicion) {
  const p = String(posicion || '').toLowerCase();
  if (esArquero(p)) return 'ARQ';
  if (p.includes('cierr') || p.includes('defens') || p.includes('líbero') || p.includes('libero')) return 'CIE';
  if (p.includes('pivot') || p.includes('pívot') || p.includes('delant')) return 'PIV';
  return 'ALA';
}

/* ══════════════════════════════════════════════════════════════════════════
   ATRIBUTOS
   ══════════════════════════════════════════════════════════════════════════ */

/* Posición relativa (0 a 1) de cada valor dentro del plantel. Empates: se
   promedian, así dos jugadores iguales sacan lo mismo. */
export function percentiles(valores) {
  const n = valores.length;
  if (n === 0) return [];
  if (n === 1) return [0.5];
  const orden = valores.map((v, i) => ({ v: Number(v) || 0, i })).sort((a, b) => a.v - b.v);
  const res = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && orden[j + 1].v === orden[i].v) j++;
    const rango = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) res[orden[k].i] = rango;
    i = j + 1;
  }
  return res;
}

const aEscala = (p) => Math.round(45 + p * 54); // el peor del plantel ~45, el mejor ~99

const cada40 = (v, min) => (min > 0 ? (v / min) * DUR_PARTIDO : 0);

/* Jugadores de campo: cada atributo compara contra el resto del plantel, con
   los números llevados a 40 minutos para que no gane sólo el que más jugó. */
export function atributosCampo(jugadores = []) {
  const lista = jugadores.filter((j) => j.jugados > 0);
  const col = (fn) => percentiles(lista.map(fn));
  const tir = col((j) => cada40(j.goles * 3 + j.xg * 2 + j.rematesArco, j.minutos));
  const pas = col((j) => cada40(j.asistencias * 3 + j.pasesClave, j.minutos));
  const regVol = col((j) => cada40(j.duelOfeGan + j.duelOfeIndGan, j.minutos));
  const regPct = col((j) => (j.duelOfeTot + j.duelOfeIndTot > 0 ? (j.duelOfeGan + j.duelOfeIndGan) / (j.duelOfeTot + j.duelOfeIndTot) : 0));
  const defVol = col((j) => cada40(j.rec + j.duelDefGan + j.duelDefIndGan, j.minutos));
  const defPct = col((j) => (j.duelDefTot + j.duelDefIndTot > 0 ? (j.duelDefGan + j.duelDefIndGan) / (j.duelDefTot + j.duelDefIndTot) : 0));
  const imp = col((j) => j.pmProm);
  const fis = col((j) => (j.pctMin || 0) + (j.partPct || 0));

  const res = {};
  lista.forEach((j, i) => {
    res[String(j.id)] = [
      ['TIR', aEscala(tir[i])],
      ['PAS', aEscala(pas[i])],
      ['REG', aEscala((regVol[i] + regPct[i]) / 2)],
      ['DEF', aEscala((defVol[i] + defPct[i]) / 2)],
      ['IMP', aEscala(imp[i])],
      ['FÍS', aEscala(fis[i])],
    ];
  });
  return res;
}

/* Arqueros: hay dos o tres, así que compararlos entre sí no dice nada. Van
   con escalas fijas: % de atajadas, goles evitados por partido, etc. */
const escalaFija = (v, malo, bueno) => clamp(Math.round(45 + ((v - malo) / (bueno - malo)) * 54), 40, 99);

export function atributosArquero(a) {
  const pj = Math.max(1, a.jugados || 0);
  const pases = cada40(a.perd || 0, a.minutos || 0);
  return [
    ['ATA', escalaFija(a.pctAtajadas || 0, 40, 90)],
    ['EVI', escalaFija((a.golesEvitables || 0) / pj, -1.5, 1.5)],
    ['PIE', escalaFija(-pases, -3, 0)],
    ['SAL', escalaFija(a.duelDefTot > 0 ? (a.duelDefGan / a.duelDefTot) * 100 : 50, 30, 90)],
    ['IMP', escalaFija(a.pmProm || 0, -2, 2)],
    ['FÍS', escalaFija((a.pctMin || 0) + (a.partPct || 0), 0, 200)],
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   PARTIDO A PARTIDO: FORMA, QUÍMICA, QUINTETOS Y FIGURA
   ══════════════════════════════════════════════════════════════════════════ */

const fechaDe = (p) => String(p?.fecha || '').slice(0, 10);
const esGol = (ev) => ev.accion === 'Gol' || ev.accion === 'Remate - Gol';
export const clavePareja = (a, b) => [String(a), String(b)].sort().join('|');

/**
 * Recorre los partidos una vez y arma:
 *  - forma:     id → [{ fecha, rival, rating }] del más viejo al más nuevo
 *  - parejas:   "a|b" → { minutos, pm } con los dos en cancha a la vez
 *  - quintetos: [{ ids, minutos }] de los cinco que más jugaron juntos
 *  - figura:    id del mejor rating del último partido con datos
 *
 * Los minutos juntos salen de la proporción de acciones del partido con los
 * dos en cancha (como la participación): el cronómetro en vivo no es fiable.
 */
export function analizarPartidos({ partidos = [], eventos = [], jugadores = [] }) {
  const porPartido = new Map();
  eventos.forEach((ev) => {
    if (!porPartido.has(ev.id_partido)) porPartido.set(ev.id_partido, []);
    porPartido.get(ev.id_partido).push(ev);
  });

  const forma = {};
  const parejas = {};
  const quintetos = {};
  let figura = null;

  const ordenados = [...partidos]
    .filter((p) => porPartido.has(p.id))
    .sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || (a.id > b.id ? 1 : -1));

  ordenados.forEach((p) => {
    const evs = porPartido.get(p.id).slice().sort(ordenEv);
    const total = evs.length;
    if (!total) return;

    // ── quiénes estaban en cancha en cada acción ──
    const primerQ = evs.find((e) => e.quinteto_activo);
    let enCancha = new Set(primerQ ? parseQuinteto(primerQ.quinteto_activo) : []);
    const juntos = {};
    const pmPareja = {};
    const pmJug = {};
    const conteoQ = {};
    const presentes = new Set();

    evs.forEach((ev) => {
      if (ev.quinteto_activo) {
        const q = parseQuinteto(ev.quinteto_activo);
        if (q.length) enCancha = new Set(q);
      } else if (ev.accion === 'Cambio Entra' && ev.id_jugador != null) {
        enCancha.add(String(ev.id_jugador));
      } else if (ev.accion === 'Cambio Sale' && ev.id_jugador != null) {
        enCancha.delete(String(ev.id_jugador));
      }
      const ids = [...enCancha];
      ids.forEach((id) => presentes.add(id));
      if (ev.equipo === 'Propio' && ev.id_jugador != null) presentes.add(String(ev.id_jugador));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const k = clavePareja(ids[i], ids[j]);
          juntos[k] = (juntos[k] || 0) + 1;
        }
      }
      if (ids.length === 5) {
        const kq = [...ids].sort().join('|');
        conteoQ[kq] = (conteoQ[kq] || 0) + 1;
      }
      if (esGol(ev)) {
        const signo = ev.equipo === 'Propio' ? 1 : -1;
        const enGol = ev.quinteto_activo ? parseQuinteto(ev.quinteto_activo) : ids;
        enGol.forEach((id) => { pmJug[id] = (pmJug[id] || 0) + signo; });
        for (let i = 0; i < enGol.length; i++) {
          for (let j = i + 1; j < enGol.length; j++) {
            const k = clavePareja(enGol[i], enGol[j]);
            pmPareja[k] = (pmPareja[k] || 0) + signo;
          }
        }
      }
    });

    Object.entries(juntos).forEach(([k, n]) => {
      if (!parejas[k]) parejas[k] = { minutos: 0, pm: 0 };
      parejas[k].minutos += (n / total) * DUR_PARTIDO;
      parejas[k].pm += pmPareja[k] || 0;
    });
    Object.entries(conteoQ).forEach(([k, n]) => {
      quintetos[k] = (quintetos[k] || 0) + (n / total) * DUR_PARTIDO;
    });

    // ── rating de cada uno en este partido ──
    const ratings = prepararRatingsPartido(evs, { plusMinus: pmJug });
    let mejor = null;
    jugadores.forEach((j) => {
      const sid = String(j.id);
      if (!presentes.has(sid)) return;
      const r = Number(ratings.rating(j));
      if (!Number.isFinite(r)) return;
      (forma[sid] = forma[sid] || []).push({ fecha: fechaDe(p), rival: p.rival || 'Rival', rating: r });
      if (!mejor || r > mejor.r) mejor = { id: sid, r };
    });
    if (mejor) figura = mejor.id;
  });

  const listaQ = Object.entries(quintetos)
    .map(([k, minutos]) => ({ ids: k.split('|'), minutos }))
    .sort((a, b) => b.minutos - a.minutos);

  return { forma, parejas, quintetos: listaQ, figura };
}

/* ══════════════════════════════════════════════════════════════════════════
   LAS CARTAS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Una carta por jugador que jugó al menos un partido en el filtro.
 * `tier`: oro / plata / bronce, 'figura' si fue la figura del último partido,
 * 'evaluacion' si todavía no llega al mínimo de partidos.
 */
export function armarCartas({ jugadoresProc = [], arquerosProc = [], forma = {}, figura = null }) {
  const todos = [...jugadoresProc, ...arquerosProc].filter((j) => j.jugados > 0);
  if (todos.length === 0) return { cartas: [], minimo: 0, partidosEquipo: 0 };

  const partidosEquipo = Math.max(...todos.map((j) => j.jugados));
  const minimo = minimoPartidosDestacado(partidosEquipo);
  const conRating = todos.filter((j) => j.ratingCount > 0);
  const mediaEquipo = conRating.length
    ? conRating.reduce((s, j) => s + j.ratingProm, 0) / conRating.length
    : 6;

  const attrCampo = atributosCampo(jugadoresProc);

  const cartas = todos.map((j) => {
    const sid = String(j.id);
    const rol = rolDe(j.posicion);
    const ovr = ovrDesdeRating(j.ratingProm, j.ratingCount, mediaEquipo);
    const enEvaluacion = j.jugados < minimo;
    let tier = enEvaluacion ? 'evaluacion' : tierDe(ovr);
    if (!enEvaluacion && figura != null && String(figura) === sid) tier = 'figura';
    return {
      id: sid,
      nombre: j.nombre || '',
      apellido: j.apellido || '',
      dorsal: j.dorsal,
      foto: j.foto || null,
      categoria: j.categoria || '',
      rol,
      ovr,
      tier,
      enEvaluacion,
      atributos: rol === 'ARQ' ? atributosArquero(j) : (attrCampo[sid] || []),
      stats: {
        pj: j.jugados, min: Math.round(j.minutos), goles: j.goles, asist: j.asistencias,
        rating: j.ratingCount ? j.ratingProm : null,
      },
      forma: (forma[sid] || []).slice(-5),
    };
  });

  cartas.sort((a, b) => (a.enEvaluacion - b.enEvaluacion) || (b.ovr - a.ovr));
  return { cartas, minimo, partidosEquipo };
}

/* ══════════════════════════════════════════════════════════════════════════
   FORMACIONES
   ══════════════════════════════════════════════════════════════════════════ */

/* Posiciones en la cancha: u de 0 a 1 a lo ancho, v de 0 (arco rival, al
   fondo) a 1 (arco propio, adelante). El lugar 0 es siempre el arquero.
   `enlaces`: las líneas de química, entre los que juegan cerca. */
export const FORMACIONES = {
  '2-2': {
    id: '2-2', nombre: 'CUADRADO',
    lugares: [
      { u: 0.5, v: 0.99, rol: 'ARQ' },
      { u: 0.26, v: 0.69, rol: 'CIE' }, { u: 0.74, v: 0.69, rol: 'ALA' },
      { u: 0.3, v: 0.33, rol: 'ALA' }, { u: 0.7, v: 0.33, rol: 'PIV' },
    ],
    enlaces: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]],
  },
  '1-2-1': {
    id: '1-2-1', nombre: 'ROMBO',
    lugares: [
      { u: 0.5, v: 0.99, rol: 'ARQ' },
      { u: 0.5, v: 0.74, rol: 'CIE' },
      { u: 0.17, v: 0.52, rol: 'ALA' }, { u: 0.83, v: 0.52, rol: 'ALA' },
      { u: 0.5, v: 0.27, rol: 'PIV' },
    ],
    enlaces: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]],
  },
  '3-1': {
    id: '3-1', nombre: 'CON PIVOT',
    lugares: [
      { u: 0.5, v: 0.99, rol: 'ARQ' },
      { u: 0.16, v: 0.64, rol: 'ALA' }, { u: 0.5, v: 0.72, rol: 'CIE' }, { u: 0.84, v: 0.64, rol: 'ALA' },
      { u: 0.5, v: 0.28, rol: 'PIV' },
    ],
    enlaces: [[0, 2], [1, 2], [2, 3], [1, 4], [3, 4], [2, 4]],
  },
  '4-0': {
    id: '4-0', nombre: 'EN LÍNEA',
    lugares: [
      { u: 0.5, v: 0.99, rol: 'ARQ' },
      { u: 0.12, v: 0.5, rol: 'ALA' }, { u: 0.38, v: 0.58, rol: 'CIE' },
      { u: 0.62, v: 0.58, rol: 'ALA' }, { u: 0.88, v: 0.5, rol: 'ALA' },
    ],
    enlaces: [[0, 2], [0, 3], [1, 2], [2, 3], [3, 4]],
  },
};

const permutaciones = (arr) => (arr.length <= 1 ? [arr]
  : arr.flatMap((x, i) => permutaciones([...arr.slice(0, i), ...arr.slice(i + 1)]).map((r) => [x, ...r])));

/* Ubica a cuatro jugadores de campo en los cuatro lugares de la formación
   respetando lo más posible el puesto de cada uno. */
export function ubicar(jugadores4, formacion) {
  const lugares = formacion.lugares.slice(1);
  let mejor = null;
  permutaciones(jugadores4).forEach((perm) => {
    const puntos = perm.reduce((s, c, i) => s + (c && c.rol === lugares[i].rol ? 1 : 0), 0);
    if (!mejor || puntos > mejor.puntos) mejor = { perm, puntos };
  });
  return mejor ? mejor.perm : jugadores4;
}

/** Los cinco mejores por media: el mejor arquero y los cuatro mejores de campo. */
export function quintetoIdeal(cartas, formacion) {
  const elegibles = (lista) => {
    const ok = lista.filter((c) => !c.enEvaluacion);
    return ok.length ? ok : lista;
  };
  const arqueros = elegibles(cartas.filter((c) => c.rol === 'ARQ')).sort((a, b) => b.ovr - a.ovr);
  const campo = elegibles(cartas.filter((c) => c.rol !== 'ARQ')).sort((a, b) => b.ovr - a.ovr);
  const cuatro = campo.slice(0, 4);
  while (cuatro.length < 4) cuatro.push(null);
  const ubicados = ubicar(cuatro, formacion);
  return [arqueros[0]?.id ?? null, ...ubicados.map((c) => c?.id ?? null)];
}

/** El quinteto con más minutos juntos en la realidad, en el orden de la formación. */
export function quintetoMasUsado(quintetos, cartas, formacion) {
  const porId = new Map(cartas.map((c) => [c.id, c]));
  const q = quintetos.find((x) => x.ids.every((id) => porId.has(id)));
  if (!q) return null;
  const jugadores = q.ids.map((id) => porId.get(id));
  const arq = jugadores.find((c) => c.rol === 'ARQ') || jugadores[0];
  const resto = jugadores.filter((c) => c !== arq);
  return [arq.id, ...ubicar(resto, formacion).map((c) => c.id)];
}

/* ══════════════════════════════════════════════════════════════════════════
   QUÍMICA
   ══════════════════════════════════════════════════════════════════════════ */

/* Con menos de un partido entero juntos (40 minutos) no hay de dónde sacar
   conclusiones: la línea va amarilla. */
export const MIN_JUNTOS = DUR_PARTIDO;
const PUNTOS = { verde: 100, amarilla: 50, roja: 15 };

export function colorPareja(dato) {
  if (!dato || dato.minutos < MIN_JUNTOS) return 'amarilla';
  return dato.pm >= 0 ? 'verde' : 'roja';
}

/** Las líneas de la formación con su color y la química total (0-100). */
export function quimicaDe(alineacion, formacion, parejas) {
  const lineas = formacion.enlaces
    .map(([i, j]) => {
      const a = alineacion[i], b = alineacion[j];
      if (a == null || b == null) return null;
      const dato = parejas[clavePareja(a, b)] || null;
      return { i, j, color: colorPareja(dato), minutos: dato?.minutos || 0, pm: dato?.pm || 0 };
    })
    .filter(Boolean);
  const total = lineas.length
    ? Math.round(lineas.reduce((s, l) => s + PUNTOS[l.color], 0) / lineas.length)
    : 0;
  return { lineas, total };
}
