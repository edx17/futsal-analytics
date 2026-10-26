/* SOBRES · LO QUE MUESTRA LA PANTALLA (sin pantalla, para poder probarlo)
 *
 *   - qué sobres están para abrir y cuáles bloqueados (y si vuelven mañana,
 *     para la cuenta regresiva, o por qué no);
 *   - qué imagen 3D lleva cada sobre;
 *   - el álbum: filtros por rareza y posición, y el "X / Total".
 */

import { ORDEN_RAREZA } from './aperturas';

export const ORDEN_SOBRES = ['premio_especial', 'premio', 'diario', 'wellness', 'racha', 'puntos', 'mega'];

/* Los sobres con su propio render en public/juegos/sobres. El resto (eventos,
   sobres creados por el club) usa el neutro teñido con sus colores. */
const CON_IMAGEN = new Set(ORDEN_SOBRES);

/** La imagen del sobre y, si va el neutro, el color con que se tiñe. */
export function imagenDeSobre(tipo, colores = null) {
  const propio = colores?.principal || colores?.luz || null;
  if (CON_IMAGEN.has(tipo) && !propio) return { src: `/juegos/sobres/${tipo}.webp`, tinte: null };
  return { src: '/juegos/sobres/neutro.webp', tinte: propio || '#fbbf24' };
}

/* El wellness no es para el staff; los del V-Draft, sólo si tenés alguno. */
export const seMuestra = (tipo, e) => {
  if (tipo === 'wellness') return !e.es_staff;
  if (tipo === 'premio') return (e.sobres_premio || 0) > 0;
  if (tipo === 'premio_especial') return (e.sobres_especiales || 0) > 0;
  return true;
};

/* Bloqueado sólo por hoy: mañana vuelve solo (va la cuenta regresiva). */
const vuelveManana = (tipo, e) => {
  if ((e.suspendidos || []).includes(tipo)) return false;
  if (tipo === 'diario') return true;
  if (tipo === 'wellness') return !!e.wellness_hecho;
  if (tipo === 'racha') return true; // un día más de racha
  return false;
};

/**
 * Los sobres de hoy repartidos en dos listas.
 * Cada uno: { tipo, evento?, manana } (manana: true si vuelve a medianoche).
 */
export function repartirSobres(e) {
  const disponibles = [];
  const bloqueados = [];
  if (!e) return { disponibles, bloqueados };
  ORDEN_SOBRES.filter((t) => seMuestra(t, e)).forEach((t) => {
    if (e.disponibles?.[t]) disponibles.push({ tipo: t });
    else bloqueados.push({ tipo: t, manana: vuelveManana(t, e) });
  });
  (e.eventos || []).forEach((ev) => {
    if (ev.disponible) disponibles.push({ tipo: 'evento', evento: ev });
    else bloqueados.push({ tipo: 'evento', evento: ev, manana: ev.abiertos_hoy >= ev.por_dia });
  });
  return { disponibles, bloqueados };
}

const ESPECIALES = new Set(['totw', 'potw', 'totm', 'potm', 'toty']);

/** ¿El sobre trae alguna carta especial? (para la vibración). */
export const traeEspecial = (resultado) => (resultado?.cartas || []).some((c) => ESPECIALES.has(c?.rareza));

export const POSICIONES = [
  { id: 'ARQ', nombre: 'ARQUEROS' },
  { id: 'CIE', nombre: 'CIERRES' },
  { id: 'ALA', nombre: 'ALAS' },
  { id: 'PIV', nombre: 'PIVOTS' },
];

const rango = (r) => {
  const i = ORDEN_RAREZA.indexOf(r);
  return i === -1 ? ORDEN_RAREZA.length : i;
};

/**
 * El álbum filtrado y ordenado: las que tenés primero (más raras y de más
 * media arriba), después las siluetas (también de la más rara a la más común).
 */
export function filtrarAlbum(album = [], { rareza = 'todas', rol = 'todas', soloFaltan = false } = {}) {
  return (album || [])
    .filter((c) => (rareza === 'todas' || c.rareza === rareza) && (rol === 'todas' || c.rol === rol) && (!soloFaltan || !c.tengo))
    .sort((a, b) => (b.tengo - a.tengo) || rango(a.rareza) - rango(b.rareza)
      || (Number(b.carta?.ovr) || 0) - (Number(a.carta?.ovr) || 0));
}

/** Cuántas tenés de cuántas, en total y por rareza. */
export function contarAlbum(album = []) {
  const porRareza = {};
  let tengo = 0;
  (album || []).forEach((c) => {
    const r = (porRareza[c.rareza] ||= { tengo: 0, total: 0 });
    r.total += 1;
    if (c.tengo) { r.tengo += 1; tengo += 1; }
  });
  return { tengo, total: (album || []).length, porRareza };
}
