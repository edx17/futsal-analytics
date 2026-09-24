/**
 * LA FICHA DEL JUGADOR EN EL KIOSCO
 *
 * Todo lo de acá es puro: entra lo que devuelve kiosco_ficha() (ver la
 * migración 20260924120000) y sale lo que el menú del jugador pinta. Sin
 * Supabase ni React, para poder probarlo sin navegador.
 *
 * Los criterios son los mismos que ya usa el staff, para que el jugador y el
 * técnico vean lo mismo: 5 amarillas por categoría = 1 fecha (Disciplina,
 * Citación, Inicio), y un partido es "mío" según partidosPropios.js.
 */
import { esPartidoPropio, deducirMiClub, normalizarNombre } from '../utils/partidosPropios.js';
import { calcularTabla, ES_JUGADO } from '../utils/analisisTorneo.js';

export const UMBRAL_AMARILLAS = 5;

const soloDia = (f) => String(f || '').slice(0, 10);

/* ══════════════════════════════════════════════════════════════════════════
   DISCIPLINA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tarjetas de la temporada y sanciones → cómo está el jugador.
 *
 * Las amarillas se cuentan por categoría (un jugador que juega en dos
 * categorías acumula por separado). Cada 5 se gana una fecha; las fechas ya
 * cumplidas por acumulación están en disciplina_sanciones con tipo
 * 'acumulacion'. Las rojas y las sanciones internas suman fechas aparte.
 */
export function disciplinaDe(tarjetas = [], sanciones = [], umbral = UMBRAL_AMARILLAS) {
  const porCat = new Map();
  const cat = (c) => {
    const k = c || 'Sin categoría';
    if (!porCat.has(k)) porCat.set(k, { categoria: k, amarillas: 0, rojas: 0, cumplidas: 0 });
    return porCat.get(k);
  };

  (tarjetas || []).forEach((t) => {
    if (t.accion === 'Tarjeta Amarilla') cat(t.categoria).amarillas++;
    else if (t.accion === 'Tarjeta Roja') cat(t.categoria).rojas++;
  });

  let fechasPendientes = 0;
  (sanciones || []).forEach((s) => {
    if (s.tipo === 'acumulacion') {
      cat(s.categoria).cumplidas++;
      return;
    }
    const total = (Number(s.fechas_tribunal) || 0) + (Number(s.fechas_internas) || 0);
    fechasPendientes += Math.max(0, total - (Number(s.fechas_cumplidas) || 0));
  });

  const categorias = [...porCat.values()].map((c) => {
    const ganadas = Math.floor(c.amarillas / umbral);
    const pendientes = Math.max(0, ganadas - c.cumplidas);
    const resto = c.amarillas % umbral;
    return {
      ...c,
      suspendido: pendientes > 0,
      alBorde: pendientes === 0 && resto === umbral - 1,
      faltanParaSuspension: umbral - resto,
    };
  });

  const amarillas = categorias.reduce((a, c) => a + c.amarillas, 0);
  const rojas = categorias.reduce((a, c) => a + c.rojas, 0);
  const suspendido = fechasPendientes > 0 || categorias.some((c) => c.suspendido);
  const alBorde = !suspendido && categorias.some((c) => c.alBorde);

  let estado = 'ok';
  if (suspendido) estado = 'suspendido';
  else if (alBorde) estado = 'alBorde';

  return { amarillas, rojas, fechasPendientes, categorias, suspendido, alBorde, estado, umbral };
}

/* ══════════════════════════════════════════════════════════════════════════
   PRÓXIMO PARTIDO Y CITACIÓN
   ══════════════════════════════════════════════════════════════════════════ */

/** `partidos.plantilla` puede venir como array o como texto JSON. */
export function convocadosDe(partido) {
  let pl = partido?.plantilla;
  if (typeof pl === 'string') {
    try { pl = JSON.parse(pl); } catch { pl = []; }
  }
  if (!Array.isArray(pl)) return [];
  return pl.map((x) => String(x?.id_jugador ?? x?.id ?? x)).filter(Boolean);
}

/**
 * El próximo partido propio y si el jugador está citado.
 *
 * `citacion`:
 *   'citado'        → la citación está publicada y el jugador figura.
 *   'no-citado'     → está publicada y no figura.
 *   'sin-publicar'  → todavía no se publicó: no se dice nada de la lista,
 *                     porque la convocatoria en borrador puede cambiar.
 */
export function proximoPartidoDe(partidos = [], { miClub = null, jugadorId = null, hoy = null } = {}) {
  const desde = soloDia(hoy);
  const club = deducirMiClub(partidos || [], miClub).nombre || miClub;
  const propios = (partidos || [])
    .filter((p) => esPartidoPropio(p, { miClub: club }))
    .filter((p) => !desde || soloDia(p.fecha) >= desde)
    .sort((a, b) => soloDia(a.fecha).localeCompare(soloDia(b.fecha)) || (a.id - b.id));

  const p = propios[0];
  if (!p) return null;

  const publicada = !!p?.citacion?.publicada_at;
  const figura = jugadorId != null && convocadosDe(p).includes(String(jugadorId));
  let citacion = 'sin-publicar';
  if (publicada) citacion = figura ? 'citado' : 'no-citado';

  return {
    partido: p,
    citacion,
    horaCitacion: p.hora_citacion || null,
    sede: p.lugar || null,
    direccion: p.direccion || null,
    horario: p.horario ? String(p.horario).slice(0, 5) : null,
    indumentaria: p?.citacion?.indumentaria || null,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   WELLNESS
   ══════════════════════════════════════════════════════════════════════════ */

const CAMPOS_PRE = ['sueno', 'estres', 'fatiga', 'dolor_muscular'];

/** Cargó el wellness de hoy si tiene al menos una respuesta del "cómo llego". */
export function wellnessDeHoy(wellness = [], hoy) {
  const reg = (wellness || []).find((w) => soloDia(w.fecha) === soloDia(hoy)) || null;
  const completo = !!reg && CAMPOS_PRE.some((c) => reg[c] !== null && reg[c] !== undefined);
  return { completo, registro: reg };
}

/**
 * Semáforo de un registro, con los mismos umbrales que el Inicio del staff:
 * fatiga/dolor/estrés >= 4 o sueño <= 2 es rojo.
 */
export function colorWellness(w) {
  if (!w) return null;
  const n = (v, d = 3) => (v === null || v === undefined ? d : Number(v));
  const rojo = n(w.fatiga) >= 4 || n(w.dolor_muscular) >= 4 || n(w.estres) >= 4 || n(w.sueno) <= 2;
  if (rojo) return 'rojo';
  const amarillo = n(w.fatiga) >= 3.5 || n(w.dolor_muscular) >= 3.5 || n(w.sueno) <= 2.5;
  return amarillo ? 'amarillo' : 'verde';
}

/** Los últimos `dias` días, del más nuevo al más viejo, con hueco si no cargó. */
export function historialWellness(wellness = [], hoy, dias = 7) {
  const porDia = new Map((wellness || []).map((w) => [soloDia(w.fecha), w]));
  const base = new Date(`${soloDia(hoy)}T12:00:00`);
  const out = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const reg = porDia.get(f) || null;
    out.push({ fecha: f, registro: reg, color: colorWellness(reg) });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   CUMPLEAÑOS
   ══════════════════════════════════════════════════════════════════════════ */

const esBisiesto = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** ¿Hoy es su cumpleaños? El del 29/2 lo festeja el 28/2 los años no bisiestos. */
export function esCumpleHoy(fechanac, hoy) {
  const n = soloDia(fechanac).split('-');
  const h = soloDia(hoy).split('-');
  if (n.length < 3 || h.length < 3) return false;
  let [, mn, dn] = n;
  if (mn === '02' && dn === '29' && !esBisiesto(Number(h[0]))) dn = '28';
  return mn === h[1] && dn === h[2];
}

/** Años que cumple hoy (o cumplió este año). null si no hay fecha. */
export function edadQueCumple(fechanac, hoy) {
  const an = Number(soloDia(fechanac).slice(0, 4));
  const ah = Number(soloDia(hoy).slice(0, 4));
  if (!an || !ah) return null;
  return ah - an;
}

/* ══════════════════════════════════════════════════════════════════════════
   TORNEO
   ══════════════════════════════════════════════════════════════════════════ */

const numJornada = (j) => {
  const m = String(j ?? '').match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
};

/* calcularTabla compara el nombre exacto: "JUVENTUD" y "Juventud" serían
   dos equipos. Se usa la grafía con la que el club figura en el fixture. */
function grafiaEnFixture(lista, nombre) {
  const clave = normalizarNombre(nombre);
  if (!clave) return nombre;
  for (const p of lista) {
    if (normalizarNombre(p.nombre_propio) === clave) return p.nombre_propio;
    if (normalizarNombre(p.rival) === clave) return p.rival;
  }
  return nombre;
}

/**
 * Tabla de posiciones y fixture del torneo de su categoría. La tabla es la
 * misma de Torneos (calcularTabla); el nombre del club se reconcilia con
 * deducirMiClub porque calcularTabla compara el nombre exacto.
 */
export function torneoDe(fixture = [], clubNombre = null) {
  const lista = fixture || [];
  const miClub = grafiaEnFixture(lista, deducirMiClub(lista, clubNombre).nombre || clubNombre);
  const tabla = calcularTabla(lista, miClub);

  const ordenado = [...lista].sort((a, b) =>
    (numJornada(a.jornada) - numJornada(b.jornada))
    || soloDia(a.fecha).localeCompare(soloDia(b.fecha))
    || (a.id - b.id));

  const mios = ordenado.filter((p) => esPartidoPropio(p, { miClub }));
  const puesto = tabla.findIndex((t) => t.nombre === miClub);

  return {
    miClub,
    tabla,
    puesto: puesto === -1 ? null : puesto + 1,
    fixture: ordenado,
    misPartidos: mios,
    jugados: mios.filter(ES_JUGADO).length,
  };
}
