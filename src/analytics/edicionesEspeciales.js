/* EDICIONES ESPECIALES QUE CREA EL SUPERUSUARIO: TOTY Y COPA FUTURO DE ORO
 *
 * Igual que Halloween (halloween.js): el superusuario elige jugadores en el
 * Modo GOD y cada uno recibe la carta de la edición. Sale de lo que ya está
 * en el catálogo de ese jugador (su carta de la temporada: nombre, puesto,
 * foto, media y los seis atributos), con un plus de media que se puede
 * corregir antes de crearla. Después, como cualquier carta: se cambia la foto
 * o se ajusta la media en CARTAS.
 *
 *   TOTY  Team of the Year: los del plantel, por su temporada. Va a los sobres
 *         de siempre con la rareza más alta (la menos probable). Sin sobre propio.
 *   CFOR  Copa Futuro de Oro (diseño TOTY Icons): los de inferiores. Exclusiva
 *         de su evento (plantilla "Copa Futuro de Oro" en EVENTOS).
 */

import { procesarPlantel } from './plantel';
import { analizarPartidos, armarCartas } from './quinteto';

const esPrimera = (cat) => /primera|1ra|^1$/i.test(String(cat || ''));

export const EDICIONES = {
  TOTY: {
    tipo: 'TOTY', rareza: 'toty', exclusiva: false, plus: 5,
    nombre: 'TOTY', titulo: () => 'TEAM OF THE YEAR', edicion: (anio) => `TOTY ${anio}`, pie: (j, anio) => `TEMPORADA ${anio}`,
    entra: () => true,
    ayuda: 'Las cartas TOTY del plantel por su temporada. Salen de su carta de la temporada con un plus de media (la podés corregir). No tienen sobre propio: van a todos los sobres con la rareza más alta, la menos probable.',
  },
  CFOR: {
    tipo: 'CFOR', rareza: 'toty', exclusiva: true, plus: 0, desdePartidos: true,
    nombre: 'COPA FUTURO DE ORO', titulo: () => 'COPA FUTURO DE ORO', edicion: (anio) => `COPA FUTURO ${anio}`,
    pie: (j, anio) => `${String(j.categoria || 'INFERIORES').toUpperCase()} · ${anio}`,
    entra: (j) => !esPrimera(j.categoria),
    ayuda: 'Las cartas de los que jugaron la Copa Futuro de Oro, con el diseño TOTY Icons. Salen de lo que se cargó en el partido elegido (o en todo el torneo): media y atributos calculados igual que las básicas, sin nada agregado. Cada partido da una carta nueva (no pisa las de otro partido). Quedan exclusivas del evento: armalo con la plantilla + COPA FUTURO DE ORO en EVENTOS.',
  },
};

/* Los que no son del plantel (Héroes) y las ediciones de evento no cuentan como su carta de temporada. */
const NO_SON_BASE = new Set(['HERO', 'HALW', 'TOTY', 'CFOR']);
const conAtributos = (k) => Array.isArray(k?.carta?.atributos) && k.carta.atributos.length > 0;
const fecha = (k) => String(k.actualizada_at || k.alta_at || '');
const tope = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 0)));

/* Sin origen: una por año ('TOTY|2026|<jugador>'). Con origen (un partido o un torneo): una por origen,
   así cada partido da una carta nueva ('CFOR|p:<partido>|<jugador>'). */
export const claveEdicion = (cfg, jugadorId, anio, origen = null) => `${cfg.tipo}|${origen || anio}|${jugadorId}`;

/**
 * Los jugadores que pueden recibir la carta de la edición, con su media
 * sugerida (la de su temporada + el plus).
 * Devuelve [{ jugador_id, nombre, apellido, rol, ovr, sugerida, foto, atributos, dorsal, categoria, tiene }].
 */
export function jugadoresParaEdicion(cfg, catalogo = [], fotos = new Map(), anio = new Date().getFullYear()) {
  const porJugador = new Map();
  (catalogo || []).filter((k) => k?.carta && !NO_SON_BASE.has(k.tipo)).forEach((k) => {
    const id = String(k.jugador_id);
    if (!porJugador.has(id)) porJugador.set(id, []);
    porJugador.get(id).push(k);
  });
  const yaTienen = new Set((catalogo || []).filter((k) => k.tipo === cfg.tipo).map((k) => k.clave));
  return [...porJugador.entries()].map(([id, cartas]) => {
    const recientes = [...cartas].sort((a, b) => fecha(b).localeCompare(fecha(a)));
    const base = cartas.find((k) => k.tipo === 'BASE') || recientes[0];
    const atr = (conAtributos(base) ? base : recientes.find(conAtributos))?.carta.atributos || [];
    const foto = cartas.map((k) => fotos.get(k.clave)).find(Boolean) || base.carta.foto || recientes.map((k) => k.carta.foto).find(Boolean) || null;
    const c = base.carta;
    const ovr = Number(c.ovr) || 60;
    return {
      jugador_id: id, nombre: c.nombre || '', apellido: c.apellido || '', rol: c.rol || 'ALA', ovr, sugerida: tope(ovr + cfg.plus),
      foto, atributos: atr, dorsal: c.dorsal ?? null, categoria: c.categoria ?? null,
      tiene: yaTienen.has(claveEdicion(cfg, id, anio)),
    };
  }).filter((j) => cfg.entra(j)).sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));
}

/** La fila del catálogo (lista para publicarCatalogo). Los atributos suben lo mismo que la media. */
export function filaEdicion(cfg, j, { anio = new Date().getFullYear(), ovr = j.sugerida ?? j.ovr } = {}) {
  const media = tope(ovr);
  const suba = media - (Number(j.ovr) || media);
  return {
    clave: claveEdicion(cfg, j.jugador_id, anio, j.origen || null),
    jugador_id: String(j.jugador_id),
    tipo: cfg.tipo,
    rareza: cfg.rareza,
    exclusiva_evento: cfg.exclusiva,
    carta: {
      id: j.jugador_id, nombre: j.nombre, apellido: j.apellido, rol: j.rol, ovr: media,
      foto: j.foto, atributos: (j.atributos || []).map(([k, v]) => [k, tope(Number(v) + suba)]), dorsal: j.dorsal, categoria: j.categoria,
      premio: cfg.tipo, tier: 'oro', edicion: cfg.edicion(anio), titulo: cfg.titulo(anio), pie: j.pieOrigen || cfg.pie(j, anio),
      enEvaluacion: false,
    },
  };
}

/* ── COPA FUTURO: LAS CARTAS SALEN DE LOS PARTIDOS DEL TORNEO ───────────────
 * Nada inventado: la media y los atributos se calculan con los eventos
 * cargados en el partido (o los partidos) elegidos, con la misma cuenta que
 * las cartas básicas (procesarPlantel + armarCartas). */

export const esCopaFuturo = (nombre) => /futuro/i.test(String(nombre || ''));

const fechaCorta = (iso) => { const [, m, d] = String(iso || '').split('-'); return d && m ? `${d}/${m}` : ''; };

/** Los partidos con eventos cargados de los torneos de Copa Futuro, del más nuevo al más viejo. */
export function partidosCopaFuturo(raw = {}) {
  const torneos = new Map((raw.torneos || []).map((t) => [t.id, t]));
  const eventos = new Map();
  (raw.eventos || []).forEach((e) => eventos.set(e.id_partido, (eventos.get(e.id_partido) || 0) + 1));
  return (raw.partidos || [])
    .filter((p) => (esCopaFuturo(torneos.get(p.torneo_id)?.nombre) || esCopaFuturo(p.competicion)) && eventos.get(p.id) > 0)
    .map((p) => ({
      id: p.id, fecha: p.fecha || '', rival: p.rival || '', categoria: p.categoria || '', torneoId: p.torneo_id || null,
      torneo: torneos.get(p.torneo_id)?.nombre || p.competicion || 'Copa Futuro', eventos: eventos.get(p.id),
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/** Los orígenes para elegir: cada partido y, si el torneo tiene más de uno, el torneo entero. */
export function origenesCopaFuturo(partidos = []) {
  const lista = partidos.map((p) => ({
    id: `p:${p.id}`, partidos: [p.id],
    etiqueta: `${p.fecha || 's/f'} · vs ${p.rival || '?'} · ${p.categoria} · ${p.torneo} (${p.eventos} eventos)`,
    pie: [String(p.categoria || '').toUpperCase(), p.rival ? `VS ${String(p.rival).toUpperCase()}` : null, fechaCorta(p.fecha)].filter(Boolean).join(' · '),
  }));
  const porTorneo = new Map();
  partidos.forEach((p) => { if (p.torneoId) porTorneo.set(p.torneoId, [...(porTorneo.get(p.torneoId) || []), p]); });
  porTorneo.forEach((ps, id) => {
    if (ps.length < 2) return;
    lista.push({ id: `t:${id}`, partidos: ps.map((p) => p.id), etiqueta: `Todo el torneo ${ps[0].torneo} · ${ps[0].categoria} (${ps.length} partidos)`,
      pie: [String(ps[0].categoria || '').toUpperCase(), String(ps[0].torneo).toUpperCase()].join(' · ') });
  });
  return lista;
}

/** Las cartas calculadas sólo con esos partidos (la misma cuenta que las básicas). */
export function cartasDePartidos(raw = {}, ids = []) {
  const elegidos = new Set(ids);
  const partidos = (raw.partidos || []).filter((p) => elegidos.has(p.id));
  if (!partidos.length) return [];
  const datos = { jugadores: [], eventos: [], sanciones: [], torneos: [], ...raw, partidos: raw.partidos || [] };
  const { jugadoresProc, arquerosProc } = procesarPlantel({
    raw: datos, partidosScopeCat: partidos, filtroTorneo: 'Todos', filtroCategoria: 'Todas', misCategorias: [],
    hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  });
  const a = analizarPartidos({ partidos, eventos: raw.eventos || [], jugadores: raw.jugadores || [] });
  return armarCartas({ jugadoresProc, arquerosProc, forma: a.forma, figura: a.figura }).cartas;
}

/** Los jugadores de ese origen, listos para la edición (misma forma que jugadoresParaEdicion). La media sugerida es la calculada. */
export function jugadoresDeOrigen(cfg, cartas = [], origen, catalogo = [], fotos = new Map()) {
  const yaTienen = new Set((catalogo || []).filter((k) => k.tipo === cfg.tipo).map((k) => k.clave));
  const fotoDe = (id) => (catalogo || []).filter((k) => String(k.jugador_id) === id && !NO_SON_BASE.has(k.tipo))
    .map((k) => fotos.get(k.clave) || k.carta?.foto).find(Boolean) || null;
  return cartas.filter((c) => (c.stats?.pj || 0) > 0).map((c) => {
    const id = String(c.id);
    return {
      jugador_id: id, nombre: c.nombre || '', apellido: c.apellido || '', rol: c.rol || 'ALA', ovr: c.ovr, sugerida: c.ovr,
      foto: fotoDe(id) || c.foto || null, atributos: c.atributos || [], dorsal: c.dorsal ?? null, categoria: c.categoria || null,
      stats: c.stats, origen: origen.id, pieOrigen: origen.pie,
      tiene: yaTienen.has(claveEdicion(cfg, id, null, origen.id)),
    };
  }).sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));
}
