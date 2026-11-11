/* DUELO DE CARTAS · LO QUE MUESTRA LA PANTALLA (sin pantalla, para probarlo)
 *
 * El equipo de un duelo: 5 cartas de tu colección, una por lugar de la
 * formación (el 1º es el arco). La base vuelve a validar todo (que sean tuyas,
 * de 5 jugadores distintos) y simula el partido; acá se arma el equipo y se
 * muestra la fuerza con las mismas reglas que el V-Draft.
 */
import { FORMACIONES } from './quinteto';
import { fuerzaDelEquipo } from './vdraft';

export const FORMACIONES_DUELO = ['1-2-1', '2-2', '3-1', '4-0'];
export const APUESTAS = [0, 50, 100, 250, 500, 1000];

export const lugaresDe = (formacion) => FORMACIONES[formacion]?.lugares || [];
const jugadorDe = (c) => String(c?.carta?.id ?? c?.catalogo_id ?? '');

/** El primer lugar vacío (0 a 4) o null si está completo. */
export function lugarLibre(equipo = []) {
  for (let i = 0; i < 5; i += 1) if (!equipo[i]) return i;
  return null;
}

/**
 * Las cartas que se pueden poner en un lugar: arqueros en el arco y de
 * campo en el resto, sin repetir jugador. Primero las de su puesto y después
 * por media (las de otro puesto juegan con menos química).
 */
export function opcionesParaLugar(coleccion = [], equipo = [], lugar = 0, formacion = '1-2-1') {
  const roles = lugaresDe(formacion)[lugar]?.roles || [];
  const usados = new Set(equipo.filter((c, i) => c && i !== lugar).map(jugadorDe));
  return coleccion
    .filter((c) => !usados.has(jugadorDe(c)))
    .filter((c) => (lugar === 0 ? c.carta?.rol === 'ARQ' : c.carta?.rol !== 'ARQ'))
    .map((c) => ({ ...c, enSuPuesto: roles.includes(c.carta?.rol) }))
    .sort((a, b) => (b.enSuPuesto - a.enSuPuesto) || ((b.carta?.ovr ?? 0) - (a.carta?.ovr ?? 0)));
}

/** Pone una carta en un lugar (si ese jugador ya estaba en otro lugar, sale de ahí). */
export function ponerCarta(equipo = [], lugar, carta) {
  const nuevo = Array.from({ length: 5 }, (_, i) => equipo[i] || null);
  nuevo.forEach((c, i) => { if (c && jugadorDe(c) === jugadorDe(carta)) nuevo[i] = null; });
  nuevo[lugar] = carta;
  return nuevo;
}

/** Al cambiar de formación, se quedan las cartas (la química se recalcula). */
export const fuerzaDuelo = (equipo = [], formacion = '1-2-1') => fuerzaDelEquipo(equipo, lugaresDe(formacion));

export const equipoCompleto = (equipo = []) => equipo.length === 5 && equipo.every(Boolean);

/** Arma el mejor equipo posible de una colección (para "ARMÁ POR MÍ"). */
export function mejorEquipo(coleccion = [], formacion = '1-2-1') {
  let equipo = [null, null, null, null, null];
  for (let i = 0; i < 5; i += 1) {
    const [mejor] = opcionesParaLugar(coleccion, equipo, i, formacion);
    if (mejor) equipo = ponerCarta(equipo, i, mejor);
  }
  return equipo;
}

/** "vence en 5 h", "vence en 40 min" o "vencido". */
export function venceEn(venceAt, ahora = Date.now()) {
  const ms = new Date(venceAt).getTime() - ahora;
  if (!Number.isFinite(ms) || ms <= 0) return 'vencido';
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `vence en ${h} h` : `vence en ${Math.max(1, Math.round(ms / 60000))} min`;
}

/** Cómo terminó un duelo, desde mi lado. */
export function textoResultado(d) {
  if (!d) return '';
  if (d.estado === 'rechazado') return d.soy === 'retador' ? 'Lo rechazó' : 'Lo rechazaste';
  if (d.estado === 'cancelado') return 'Cancelado';
  if (d.estado === 'vencido') return 'Venció sin respuesta';
  const r = d.resultado;
  if (!r) return 'Esperando respuesta';
  const pen = r.penales ? ` (pen. ${d.soy === 'retador' ? `${r.penales.r}-${r.penales.v}` : `${r.penales.v}-${r.penales.r}`})` : '';
  return `${r.gane ? 'GANASTE' : 'PERDISTE'} ${r.mis_goles}-${r.sus_goles}${pen}`;
}
