/* LAS CARTAS DE HÉROES
 *
 * Figuras que ya no están en el club: no hay partidos de donde sacar números,
 * así que la carta la arma el superusuario (Modo GOD · HÉROES) con lo que la
 * gente recuerda de ese jugador: su puesto, su media y sus rasgos. Se dibujan
 * con CartaEspecial (familia "heroe": sepia, marco de retrato antiguo).
 *
 * En el catálogo: tipo 'HERO', clave 'HERO|<nombre-apellido>', rareza 'toty'
 * (la más alta: no cambia los pesos de nada), y por defecto exclusivas de su
 * evento, así sólo salen en el sobre de Héroes.
 */

export const ROLES_HEROE = [['ARQ', 'Arquero'], ['CIE', 'Cierre'], ['ALA', 'Ala'], ['PIV', 'Pivot']];
export const MAX_RASGOS = 4;
const LARGO_RASGO = 16;

/** 'Dylan Machado' → 'dylan-machado' (sin tildes). */
export const slugHeroe = (nombre, apellido) =>
  `${nombre || ''} ${apellido || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const claveHeroe = (h) => `HERO|${slugHeroe(h.nombre, h.apellido)}`;

/** Lo que se guarda, siempre prolijo. `rasgos` acepta lista o texto separado por comas. */
export function normalizarHeroe(h = {}) {
  const lista = Array.isArray(h.rasgos) ? h.rasgos : String(h.rasgos || '').split(',');
  return {
    nombre: String(h.nombre || '').trim().slice(0, 30),
    apellido: String(h.apellido || '').trim().slice(0, 30),
    rol: ROLES_HEROE.some(([r]) => r === h.rol) ? h.rol : 'ALA',
    ovr: Math.max(1, Math.min(99, Math.round(Number(h.ovr) || 80))),
    rasgos: [...new Set(lista.map((r) => String(r).trim().slice(0, LARGO_RASGO)).filter(Boolean))].slice(0, MAX_RASGOS),
    capitan: !!h.capitan,
    exclusiva: h.exclusiva !== false,
  };
}

export function erroresHeroe(h, existentes = []) {
  const e = [];
  if (!h.nombre && !h.apellido) e.push('Poné el nombre.');
  if (!slugHeroe(h.nombre, h.apellido)) e.push('El nombre necesita letras o números.');
  if (existentes.some((k) => k.clave === claveHeroe(h) && k.clave !== h.claveOriginal)) e.push('Ya hay un héroe con ese nombre.');
  return e;
}

/** La fila del catálogo (cartas_catalogo) de un héroe. */
export function filaDeHeroe(datos) {
  const h = normalizarHeroe(datos);
  const slug = slugHeroe(h.nombre, h.apellido);
  return {
    clave: `HERO|${slug}`,
    jugador_id: `heroe:${slug}`,
    tipo: 'HERO',
    rareza: 'toty',
    exclusiva_evento: h.exclusiva,
    carta: {
      id: `heroe:${slug}`,
      nombre: h.nombre,
      apellido: h.apellido,
      rol: h.rol,
      ovr: h.ovr,
      premio: 'HERO',
      titulo: 'HÉROE DEL CLUB',
      pie: h.capitan ? 'CAPITÁN · LEYENDA' : 'LEYENDA DEL CLUB',
      rasgos: h.rasgos,
      capitan: h.capitan,
      atributos: [],
      stats: {},
      enEvaluacion: false,
    },
  };
}

/** Del catálogo al formulario. */
export const heroeDeFila = (k) => ({
  nombre: k.carta?.nombre || '',
  apellido: k.carta?.apellido || '',
  rol: k.carta?.rol || 'ALA',
  ovr: k.carta?.ovr ?? 80,
  rasgos: (k.carta?.rasgos || []).join(', '),
  capitan: !!k.carta?.capitan,
  exclusiva: k.exclusiva_evento !== false,
  claveOriginal: k.clave,
});
