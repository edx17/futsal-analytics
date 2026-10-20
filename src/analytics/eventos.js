/* EVENTOS DE SOBRES (los que arma el superusuario en el Modo GOD)
 *
 * Un evento vive en la base (sobres_eventos, migración 20261022140000) y es un
 * sobre propio: sus cartas, sus reglas y su escena. Acá se valida lo que se
 * guarda y se convierte en una variante de apertura (aperturas.js), que es lo
 * que dibuja la apertura. Funciones puras, para poder probarlas.
 *
 *   { id, nombre, activo, desde, hasta,
 *     cartas: ['SGOL|R1:…|12', …]          claves del catálogo
 *     sobre:  { cartas, costo, por_dia }     cuántas trae, cuánto cuesta, cuántos por día
 *     escena: { video, video_alternativo, titulo, colores{principal, secundario, acento, fondo, luz, texto},
 *               particulas, intensidad } }
 */

import { completarVariante, VARIANTES, VIDEOS } from './aperturas';

/* sobre.exclusivas: las cartas del evento sólo salen en su sobre (no en los demás ni en el V-Draft). */
export const REGLAS = {
  cartas: { def: 3, min: 1, max: 10 },
  costo: { def: 0, min: 0, max: 5000 },
  por_dia: { def: 1, min: 1, max: 5 },
};

const entero = (v, { def, min, max }) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const esColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim());

/* Las escenas base que se pueden elegir: los videos que existen (más la apertura estándar). */
export const ESCENAS_BASE = [
  { id: '', nombre: 'Apertura estándar (sin video)' },
  { id: 'evento_goleadores', nombre: 'Evento Goleadores (pabellón rojo y dorado)' },
  { id: 'evento_recuperadores', nombre: 'Evento Recuperadores (pabellón verde azulado)' },
  { id: 'evento_demo', nombre: 'Evento (pabellón rojo y ámbar)' },
  { id: 'elite', nombre: 'Élite (pabellón azul)' },
  { id: 'epico', nombre: 'Épico (pabellón violeta, portal)' },
  { id: 'leyenda', nombre: 'Leyenda (negro y oro, solemne)' },
  { id: 'excepcional', nombre: 'Excepcional (el haz central)' },
  { id: 'vdraft', nombre: 'V-Draft (el pasillo)' },
];

/* Si la escena elegida todavía no tiene video, ésta (la primera que exista). */
const RESPALDO = ['elite', 'epico', 'vdraft'];

/** Lo que se guarda, siempre dentro de rango. */
export function normalizarEvento(ev = {}) {
  const escena = ev.escena || {};
  const colores = Object.fromEntries(Object.entries(escena.colores || {}).filter(([, v]) => esColor(v)));
  return {
    ...(ev.id ? { id: ev.id } : {}),
    nombre: String(ev.nombre || '').trim().slice(0, 60) || 'EVENTO',
    activo: !!ev.activo,
    desde: ev.desde || null,
    hasta: ev.hasta || null,
    cartas: [...new Set((ev.cartas || []).map(String).filter(Boolean))],
    sobre: { ...Object.fromEntries(Object.entries(REGLAS).map(([k, r]) => [k, entero(ev.sobre?.[k], r)])), exclusivas: ev.sobre?.exclusivas !== false },
    escena: {
      video: ESCENAS_BASE.some((e) => e.id === escena.video) ? escena.video : '',
      video_alternativo: escena.video_alternativo || null,
      titulo: String(escena.titulo || '').trim().slice(0, 40),
      colores,
      particulas: entero(escena.particulas, { def: 80, min: 0, max: 160 }),
      intensidad: Math.min(1.5, Math.max(0, Number(escena.intensidad) || 1.1)),
    },
  };
}

/** Problemas que impiden guardarlo (lista vacía = se puede). */
export function erroresEvento(ev) {
  const e = [];
  if (!String(ev.nombre || '').trim()) e.push('Ponele un nombre.');
  if (!ev.cartas?.length) e.push('Elegí al menos una carta.');
  if (ev.desde && ev.hasta && ev.desde > ev.hasta) e.push('La fecha de fin es anterior a la de inicio.');
  return e;
}

/** La variante de apertura de un evento (para AperturaSobre). */
export function varianteDeEventoDb(ev, videos = VIDEOS) {
  const n = normalizarEvento(ev);
  const alternativo = [n.escena.video_alternativo, ...RESPALDO].find((v) => v && videos[v]) || null;
  return completarVariante({
    ...VARIANTES.vdraft,
    id: `evento:${ev.id || 'nuevo'}`,
    nombre: n.escena.titulo || n.nombre,
    icono: 'estrella',
    modo: n.escena.video ? 'video' : 'estandar',
    video: n.escena.video || null,
    videoAlternativo: n.escena.video ? alternativo : null,
    colores: { ...VARIANTES.vdraft.colores, ...n.escena.colores, particulas: [n.escena.colores.luz, n.escena.colores.acento, '#ffffff'].filter(Boolean) },
    particulas: n.escena.particulas,
    intensidad: n.escena.intensidad,
  }, videos);
}

/**
 * Qué cartas tienen que quedar exclusivas y cuáles no, después de guardar un
 * evento: exclusivas = las de todos los eventos que las piden; el resto de las
 * que tocó este evento, no. Devuelve { si: [claves], no: [claves] }.
 */
export function cambiosDeExclusivas(evento, otros = [], antes = []) {
  const deOtros = new Set(otros.filter((o) => o.id !== evento.id && o.sobre?.exclusivas !== false).flatMap((o) => o.cartas || []));
  const si = evento.sobre?.exclusivas !== false ? [...evento.cartas] : [];
  const tocadas = new Set([...(antes || []), ...evento.cartas]);
  const no = [...tocadas].filter((c) => !si.includes(c) && !deOtros.has(c));
  return { si, no };
}

/** Las claves del catálogo de un tipo de carta (p. ej. todas las de la serie GOLEADORES). */
export const clavesDeTipo = (catalogo = [], tipos = []) =>
  catalogo.filter((k) => tipos.includes(k.tipo) && k.activa !== false).map((k) => k.clave);

/* Plantillas: los dos eventos pedidos, listos para crear (las cartas se toman del catálogo). */
export const PLANTILLAS = {
  goleadores: {
    nombre: 'EVENTO GOLEADORES',
    tipos: ['SGOL'],
    sobre: { cartas: 3, costo: 0, por_dia: 1, exclusivas: true },
    escena: {
      video: 'evento_goleadores', video_alternativo: 'elite', titulo: 'EVENTO GOLEADORES',
      colores: { principal: '#b91c1c', secundario: '#1a0304', acento: '#f5d77a', fondo: '#050101', luz: '#ef4444', texto: '#fff7e0' },
      particulas: 90, intensidad: 1.25,
    },
  },
  recuperadores: {
    nombre: 'EVENTO RECUPERADORES',
    tipos: ['SREC'],
    sobre: { cartas: 3, costo: 0, por_dia: 1, exclusivas: true },
    escena: {
      video: 'evento_recuperadores', video_alternativo: 'elite', titulo: 'EVENTO RECUPERADORES',
      colores: { principal: '#0f766e', secundario: '#0b1214', acento: '#e2e8f0', fondo: '#020607', luz: '#2dd4bf', texto: '#effaf8' },
      particulas: 80, intensidad: 1.15,
    },
  },
};

/** Un evento nuevo a partir de una plantilla y el catálogo. */
export const eventoDePlantilla = (id, catalogo = []) => {
  const p = PLANTILLAS[id];
  return normalizarEvento({ nombre: p.nombre, activo: true, cartas: clavesDeTipo(catalogo, p.tipos), sobre: p.sobre, escena: p.escena });
};
