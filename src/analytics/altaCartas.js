import { rolDe, tierDe } from './quinteto';
import { rarezaDeCarta } from './sobres';

/* ALTA DE CARTAS (Configurador GOD › Alta)
 *
 * Regla: una carta publicada NO se pisa nunca. La carta básica es la inicial
 * del jugador; lo que cambia con los partidos llega como cartas nuevas (las de
 * premio: POTW, TOTW, TOTM…, o una segunda tirada). Por eso el alta sólo ofrece
 * lo que todavía no está en el catálogo y muestra aparte lo ya publicado y lo
 * eliminado (que no vuelve).
 *
 * Al principio de temporada, quien todavía no tiene partidos (o no llega al
 * mínimo) no tiene carta calculada: la carta BASE se carga a mano.
 */

export const ATRIBUTOS_CAMPO = ['TIR', 'PAS', 'REG', 'DEF', 'IMP', 'FÍS'];
export const ATRIBUTOS_ARQUERO = ['ATA', 'EVI', 'PIE', 'SAL', 'IMP', 'FÍS'];

/* Cómo se reparte la media en las stats según el puesto (diferencia con la media). */
const PERFIL = {
  ARQ: { ATA: 4, EVI: 2, PIE: -6, SAL: 3, IMP: -2, FÍS: -1 },
  CIE: { TIR: -6, PAS: 2, REG: -4, DEF: 6, IMP: 2, FÍS: 2 },
  ALA: { TIR: 1, PAS: 2, REG: 4, DEF: -4, IMP: 0, FÍS: -1 },
  PIV: { TIR: 6, PAS: -2, REG: 0, DEF: -5, IMP: 1, FÍS: 2 },
};

const limitar = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 0)));

/** Las 6 stats sugeridas para una media y un puesto: [['TIR', 66], …]. */
export function atributosSugeridos(rol, ovr) {
  const nombres = rol === 'ARQ' ? ATRIBUTOS_ARQUERO : ATRIBUTOS_CAMPO;
  const perfil = PERFIL[rol] || {};
  return nombres.map((k) => [k, limitar(Number(ovr) + (perfil[k] || 0))]);
}

/**
 * Cada fila que se podría publicar, con su estado frente al catálogo:
 *   'nueva'      no está: se puede publicar
 *   'publicada'  ya está: no se toca (la publicada manda)
 *   'eliminada'  se eliminó a propósito: no vuelve
 */
export function compararConCatalogo(filas = [], catalogo = [], eliminadas = new Set()) {
  const porClave = new Map((catalogo || []).map((k) => [k.clave, k]));
  return filas.map((f) => {
    if (eliminadas.has(f.clave)) return { ...f, estado: 'eliminada' };
    const existente = porClave.get(f.clave);
    return existente ? { ...f, estado: 'publicada', existente } : { ...f, estado: 'nueva' };
  });
}

/** Cuántas hay en cada estado y, de las nuevas, de qué tipo. */
export function resumenAlta(items = []) {
  const estados = { nueva: 0, publicada: 0, eliminada: 0 };
  const nuevasPorTipo = {};
  items.forEach((i) => {
    estados[i.estado] = (estados[i.estado] || 0) + 1;
    if (i.estado === 'nueva') nuevasPorTipo[i.tipo] = (nuevasPorTipo[i.tipo] || 0) + 1;
  });
  return { estados, nuevasPorTipo };
}

/**
 * Los jugadores del plantel que no tienen carta BASE en el catálogo ni una
 * calculada para publicar (sin partidos o todavía en evaluación).
 * `jugadores`: los del plantel (raw.jugadores); `cartas`: las calculadas.
 */
export function jugadoresSinCarta(jugadores = [], cartas = [], catalogo = [], eliminadas = new Set()) {
  const enCatalogo = new Set((catalogo || []).map((k) => k.clave));
  const calculada = new Map(cartas.map((c) => [String(c.id), c]));
  return jugadores
    .filter((j) => !/baja|inactiv/i.test(String(j.estado_ficha || '')))
    .filter((j) => {
      const clave = `BASE|${j.id}`;
      if (enCatalogo.has(clave) || eliminadas.has(clave)) return false;
      const c = calculada.get(String(j.id));
      return !c || c.enEvaluacion;
    })
    .map((j) => ({ ...j, rol: rolDe(j.posicion), partidos: calculada.get(String(j.id))?.stats?.pj || 0 }))
    .sort((a, b) => String(a.apellido || '').localeCompare(String(b.apellido || '')));
}

/** La fila del catálogo de una carta BASE cargada a mano. */
export function cartaBaseManual(jugador, { ovr, atributos }) {
  const media = limitar(ovr);
  const rol = jugador.rol || rolDe(jugador.posicion);
  const carta = {
    id: String(jugador.id),
    nombre: jugador.nombre || '',
    apellido: jugador.apellido || '',
    dorsal: jugador.dorsal ?? null,
    categoria: jugador.categoria || '',
    rol,
    ovr: media,
    tier: tierDe(media),
    atributos: (atributos || atributosSugeridos(rol, media)).map(([k, v]) => [k, limitar(v)]),
    stats: {},
    enEvaluacion: false,
    manual: true,
  };
  if (jugador.foto) carta.foto = jugador.foto;
  return { clave: `BASE|${carta.id}`, jugador_id: carta.id, tipo: 'BASE', rareza: rarezaDeCarta(carta), carta };
}
