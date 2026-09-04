/**
 * Quién está en el plantel hoy y quién ya no.
 *
 * Dar de baja a un jugador es marcarlo, no borrarlo: su historia (goles,
 * asistencias, minutos, tarjetas) tiene que seguir contando en los resúmenes
 * del año. Lo único que cambia es que deja de aparecer en las listas del día
 * a día: pasar lista, convocar, pedir el wellness.
 *
 * El filtro se hace en JS y no en la consulta a propósito. Si se filtrara con
 * .eq('activo', true), la app quedaría rota hasta que se corra la migración,
 * porque PostgREST falla al filtrar por una columna que todavía no existe.
 * Comparando contra `false`, un jugador sin la columna cargada (undefined)
 * cuenta como activo, que es exactamente lo que queremos mientras el SQL no
 * esté corrido. Y como estas pantallas ya traen el plantel entero a memoria,
 * filtrar acá no cuesta nada.
 */

export const estaActivo = (jugador) => jugador?.activo !== false;

export const soloActivos = (lista = []) => (lista || []).filter(estaActivo);

export const dadosDeBaja = (lista = []) => (lista || []).filter((j) => j?.activo === false);

/** Para mostrar "Baja · 12/08/2026" debajo del nombre, sin desarmar fechas a mano. */
export function textoBaja(jugador) {
  if (!jugador || jugador.activo !== false) return null;
  const f = jugador.fecha_baja;
  if (!f) return 'Dado de baja';
  const [a, m, d] = String(f).split('T')[0].split('-');
  return `Baja · ${d}/${m}/${a}`;
}
