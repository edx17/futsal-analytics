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

const esPrimera = (cat) => /primera|1ra|^1$/i.test(String(cat || ''));

export const EDICIONES = {
  TOTY: {
    tipo: 'TOTY', rareza: 'toty', exclusiva: false, plus: 5,
    nombre: 'TOTY', titulo: () => 'TEAM OF THE YEAR', edicion: (anio) => `TOTY ${anio}`, pie: (j, anio) => `TEMPORADA ${anio}`,
    entra: () => true,
    ayuda: 'Las cartas TOTY del plantel por su temporada. Salen de su carta de la temporada con un plus de media (la podés corregir). No tienen sobre propio: van a todos los sobres con la rareza más alta, la menos probable.',
  },
  CFOR: {
    tipo: 'CFOR', rareza: 'toty', exclusiva: true, plus: 4,
    nombre: 'COPA FUTURO DE ORO', titulo: () => 'COPA FUTURO DE ORO', edicion: (anio) => `COPA FUTURO ${anio}`,
    pie: (j, anio) => `${String(j.categoria || 'INFERIORES').toUpperCase()} · ${anio}`,
    entra: (j) => !esPrimera(j.categoria),
    ayuda: 'Las cartas de los de inferiores que juegan la Copa Futuro de Oro, con el diseño TOTY Icons. Quedan exclusivas del evento: armalo con la plantilla + COPA FUTURO DE ORO en EVENTOS.',
  },
};

/* Los que no son del plantel (Héroes) y las ediciones de evento no cuentan como su carta de temporada. */
const NO_SON_BASE = new Set(['HERO', 'HALW', 'TOTY', 'CFOR']);
const conAtributos = (k) => Array.isArray(k?.carta?.atributos) && k.carta.atributos.length > 0;
const fecha = (k) => String(k.actualizada_at || k.alta_at || '');
const tope = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 0)));

export const claveEdicion = (cfg, jugadorId, anio) => `${cfg.tipo}|${anio}|${jugadorId}`;

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
    clave: claveEdicion(cfg, j.jugador_id, anio),
    jugador_id: String(j.jugador_id),
    tipo: cfg.tipo,
    rareza: cfg.rareza,
    exclusiva_evento: cfg.exclusiva,
    carta: {
      id: j.jugador_id, nombre: j.nombre, apellido: j.apellido, rol: j.rol, ovr: media,
      foto: j.foto, atributos: (j.atributos || []).map(([k, v]) => [k, tope(Number(v) + suba)]), dorsal: j.dorsal, categoria: j.categoria,
      premio: cfg.tipo, tier: 'oro', edicion: cfg.edicion(anio), titulo: cfg.titulo(anio), pie: cfg.pie(j, anio),
      enEvaluacion: false,
    },
  };
}
