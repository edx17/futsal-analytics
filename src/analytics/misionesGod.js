/* CONFIGURADOR GOD › MISIONES: las reglas puras de la pantalla.
 *
 * Las acciones son las que la base sabe contar sola (ver la migración
 * 20261115120000_juegos_misiones_config.sql): el progreso no se puede inflar.
 */

export const ACCIONES_MISION = [
  { id: 'sobres', nombre: 'Abrir sobres', icono: '🎴', titulo: (n) => (n === 1 ? 'Abrí 1 sobre' : `Abrí ${n} sobres`) },
  { id: 'vdraft_partidos', nombre: 'Jugar partidos del V-Draft', icono: '⚽', titulo: (n) => (n === 1 ? 'Jugá 1 partido del V-Draft' : `Jugá ${n} partidos del V-Draft`) },
  { id: 'vdraft_victorias', nombre: 'Ganar partidos del V-Draft', icono: '🏆', titulo: (n) => (n === 1 ? 'Ganá 1 partido del V-Draft' : `Ganá ${n} partidos del V-Draft`) },
  { id: 'desafio', nombre: 'Jugar el desafío del día', icono: '🎯', titulo: () => 'Jugá el desafío del día', metaFija: 1 },
  { id: 'penales', nombre: 'Ganar tandas de penales', icono: '🥅', titulo: (n) => (n === 1 ? 'Ganá 1 tanda de penales' : `Ganá ${n} tandas de penales`) },
  { id: 'duelos_jugados', nombre: 'Jugar duelos', icono: '⚔️', titulo: (n) => (n === 1 ? 'Jugá 1 duelo' : `Jugá ${n} duelos`) },
  { id: 'duelos_ganados', nombre: 'Ganar duelos', icono: '🥇', titulo: (n) => (n === 1 ? 'Ganá 1 duelo' : `Ganá ${n} duelos`) },
];
export const accionPorId = Object.fromEntries(ACCIONES_MISION.map((a) => [a.id, a]));

/* Días de la semana como los cuenta la base (isodow: 1 = lunes … 7 = domingo). */
export const DIAS_SEMANA = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
export const TODOS_LOS_DIAS = [1, 2, 3, 4, 5, 6, 7];
export const LIMITES = { misiones: 20, meta: 50, premio: 5000, titulo: 80 };

export const tituloSugerido = (accion, meta) => accionPorId[accion]?.titulo(Number(meta) || 1) || '';

/** Una misión nueva, con un id que no choca con las que ya hay. */
export function nuevaMision(lista = [], accion = 'sobres') {
  const ids = new Set(lista.map((m) => m.id));
  let n = lista.length + 1;
  while (ids.has(`m_${n}`)) n += 1;
  return { id: `m_${n}`, accion, titulo: tituloSugerido(accion, 1), meta: 1, premio: 25, dias: [...TODOS_LOS_DIAS], activa: true, orden: lista.length + 1 };
}

/** Lo que está mal en la lista: [{ i, texto }] (vacío si se puede guardar). */
export function erroresDeMisiones(lista = []) {
  const errores = [];
  if (lista.length > LIMITES.misiones) errores.push({ i: null, texto: `Hasta ${LIMITES.misiones} misiones.` });
  const vistos = new Set();
  lista.forEach((m, i) => {
    if (!/^[a-z0-9_]{1,40}$/.test(m.id || '')) errores.push({ i, texto: 'Id inválido.' });
    if (vistos.has(m.id)) errores.push({ i, texto: 'Id repetido.' });
    vistos.add(m.id);
    if (!accionPorId[m.accion]) errores.push({ i, texto: 'Elegí qué hay que hacer.' });
    const titulo = String(m.titulo || '').trim();
    if (!titulo || titulo.length > LIMITES.titulo) errores.push({ i, texto: `El título va de 1 a ${LIMITES.titulo} letras.` });
    if (!Number.isInteger(Number(m.meta)) || m.meta < 1 || m.meta > LIMITES.meta) errores.push({ i, texto: `La meta va de 1 a ${LIMITES.meta}.` });
    if (!Number.isInteger(Number(m.premio)) || m.premio < 0 || m.premio > LIMITES.premio) errores.push({ i, texto: `El premio va de 0 a ${LIMITES.premio} V-Coins.` });
    if (!m.dias?.length) errores.push({ i, texto: 'Elegí al menos un día.' });
  });
  return errores;
}

/** Lo que se manda a la base: el orden según la lista. */
export const paraGuardar = (lista = []) => lista.map((m, i) => ({
  id: m.id, accion: m.accion, titulo: String(m.titulo).trim(), meta: Number(m.meta), premio: Number(m.premio),
  dias: [...(m.dias || TODOS_LOS_DIAS)].sort((a, b) => a - b), activa: m.activa !== false, orden: i + 1,
}));

/** Las que se ven un día de la semana (isodow) y cuánto se puede ganar con ellas. */
export function misionesDelDia(lista = [], dia) {
  const del = lista.filter((m) => m.activa !== false && (m.dias || TODOS_LOS_DIAS).includes(dia));
  return { misiones: del, vcoins: del.reduce((s, m) => s + (Number(m.premio) || 0), 0) };
}

/** isodow de una fecha (1 = lunes … 7 = domingo). */
export const diaIso = (fecha = new Date()) => ((fecha.getDay() + 6) % 7) + 1;
