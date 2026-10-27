/* HALLOWEEN: LAS CARTAS DEL EVENTO (sin pantalla, para poder probarlo)
 *
 * El superusuario elige jugadores en el Modo GOD · HALLOWEEN y cada uno recibe
 * su carta de noche de brujas (tipo HALW, familia "halloween" en
 * especialesCartas.js). La carta sale de lo que ya está en el catálogo de ese
 * jugador: nombre, puesto, foto, media y los seis atributos. Nada se inventa:
 * la media se puede corregir antes de crearla.
 */

export const TIPO = 'HALW';
export const RAREZA = 'potm';
/* Los que no son jugadores del plantel (Héroes) o ya son de Halloween no entran. */
const NO_ENTRAN = new Set(['HERO', TIPO]);

export const claveHalloween = (jugadorId, anio) => `${TIPO}|${anio}|${jugadorId}`;
const conAtributos = (k) => Array.isArray(k?.carta?.atributos) && k.carta.atributos.length > 0;
const fecha = (k) => String(k.actualizada_at || k.alta_at || '');

/**
 * Los jugadores que pueden recibir carta: uno por jugador_id, con sus datos
 * tomados de su carta BASE (o, si no tiene, de la más reciente). `fotos`: Map
 * clave → url (las fotos especiales cargadas a mano).
 * Devuelve [{ jugador_id, nombre, apellido, rol, ovr, foto, atributos, dorsal, categoria, tiene }].
 */
export function jugadoresParaHalloween(catalogo = [], fotos = new Map(), anio = new Date().getFullYear()) {
  const porJugador = new Map();
  (catalogo || []).filter((k) => k?.carta && !NO_ENTRAN.has(k.tipo)).forEach((k) => {
    const id = String(k.jugador_id);
    if (!porJugador.has(id)) porJugador.set(id, []);
    porJugador.get(id).push(k);
  });
  const yaTienen = new Set((catalogo || []).filter((k) => k.tipo === TIPO).map((k) => k.clave));
  return [...porJugador.entries()].map(([id, cartas]) => {
    const recientes = [...cartas].sort((a, b) => fecha(b).localeCompare(fecha(a)));
    const base = cartas.find((k) => k.tipo === 'BASE') || recientes[0];
    const atr = (conAtributos(base) ? base : recientes.find(conAtributos))?.carta.atributos || [];
    const foto = cartas.map((k) => fotos.get(k.clave)).find(Boolean)
      || base.carta.foto || recientes.map((k) => k.carta.foto).find(Boolean) || null;
    const c = base.carta;
    return {
      jugador_id: id, nombre: c.nombre || '', apellido: c.apellido || '', rol: c.rol || 'ALA', ovr: Number(c.ovr) || 60,
      foto, atributos: atr, dorsal: c.dorsal ?? null, categoria: c.categoria ?? null,
      tiene: yaTienen.has(claveHalloween(id, anio)),
    };
  }).sort((a, b) => a.apellido.localeCompare(b.apellido, 'es'));
}

/** La fila del catálogo de una carta de Halloween (lista para publicarCatalogo). */
export function filaHalloween(j, { anio = new Date().getFullYear(), ovr = j.ovr, exclusiva = true } = {}) {
  return {
    clave: claveHalloween(j.jugador_id, anio),
    jugador_id: String(j.jugador_id),
    tipo: TIPO,
    rareza: RAREZA,
    exclusiva_evento: exclusiva,
    carta: {
      id: j.jugador_id, nombre: j.nombre, apellido: j.apellido, rol: j.rol, ovr: Math.max(1, Math.min(99, Math.round(Number(ovr) || j.ovr))),
      foto: j.foto, atributos: j.atributos, dorsal: j.dorsal, categoria: j.categoria,
      premio: TIPO, tier: 'oro', edicion: `HALLOWEEN ${anio}`, titulo: `HALLOWEEN ${anio}`, pie: 'NOCHE DE BRUJAS · 31/10',
      enEvaluacion: false,
    },
  };
}
