/* ============================================================================
   TUTORES Y AUTORIZACIONES
   ----------------------------------------------------------------------------
   Quién está a cargo de cada jugador y qué tiene permitido el club.

   Este módulo no consulta nada: recibe los jugadores y los tutores, y dice qué
   está cargado, qué falta y a quién hay que llamar. La pantalla sólo pinta.

   El criterio que ordena todo: un permiso SIN RESPONDER no es un "no". Son
   tres estados (sin responder / no autoriza / autoriza) y se muestran como
   tres, porque "falta pedirlo" es trabajo pendiente del club y "dijo que no"
   es una decisión de la familia. Meterlos en la misma bolsa esconde una de
   las dos cosas.
============================================================================ */

/** La edad legal en Argentina. Debajo de esto hacen falta tutor y permisos. */
export const MAYORIA_EDAD = 18;

export const PARENTESCOS = ['Madre', 'Padre', 'Tutor legal', 'Abuelo/a', 'Hermano/a', 'Otro'];

export const PERMISOS = [
  {
    k: 'autoriza_traslado',
    rotulo: 'Viajar con el club',
    ayuda: 'Ir a partidos y torneos en el transporte del club.',
    soloMenores: true,
  },
  {
    k: 'autoriza_imagen',
    rotulo: 'Uso de imagen',
    ayuda: 'Fotos y video en las redes y las placas del club.',
    soloMenores: false,
  },
  {
    k: 'autoriza_atencion_medica',
    rotulo: 'Atención médica de urgencia',
    ayuda: 'Que lo atienda un médico si la familia no llegó todavía.',
    soloMenores: true,
  },
  {
    k: 'retira_solo',
    rotulo: 'Se retira solo',
    ayuda: 'Puede irse del club sin que lo pase a buscar un adulto.',
    soloMenores: true,
  },
];

/* ── edad ──────────────────────────────────────────────────────────────────
   Se calcula sobre el texto 'YYYY-MM-DD' y no con `new Date(fechanac)`: esa
   forma parsea la fecha como medianoche UTC y después la compara en hora
   local, así que en Argentina (UTC−3) puede dar un día de menos justo el día
   del cumpleaños. `hoy` entra por parámetro para poder probarlo.          */
export function edadDe(fechanac, hoy = new Date().toISOString().slice(0, 10)) {
  const nac = fechanac ? String(fechanac).slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nac) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null;
  const [an, mn, dn] = nac.split('-').map(Number);
  const [ah, mh, dh] = hoy.split('-').map(Number);
  let e = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) e--;
  return e < 0 ? null : e;
}

/** Sin fecha de nacimiento no se puede afirmar que sea menor: devuelve null. */
export function esMenor(jugador, hoy) {
  const e = edadDe(jugador?.fechanac, hoy);
  return e == null ? null : e < MAYORIA_EDAD;
}

/** Los permisos que le corresponden a este jugador según la edad. */
export function permisosDe(jugador, hoy) {
  const menor = esMenor(jugador, hoy);
  // Sin fecha de nacimiento se piden todos: es el caso en que menos se sabe.
  return menor === false ? PERMISOS.filter((p) => !p.soloMenores) : PERMISOS;
}

export const estadoPermiso = (v) => (v == null ? 'pendiente' : v ? 'si' : 'no');

/**
 * La foto de un jugador: sus tutores, quién lo retira y qué falta.
 *
 * `faltantes` es lo que el club todavía tiene que resolver, en orden de
 * urgencia. No incluye los permisos que la familia contestó que no: eso ya
 * está resuelto, aunque la respuesta sea negativa.
 */
export function estadoDeJugador(jugador, tutores = [], hoy) {
  const mios = (tutores || []).filter((t) => String(t.jugador_id) === String(jugador?.id));
  const principal = mios.find((t) => t.principal) || null;
  const quienesRetiran = mios.filter((t) => t.puede_retirar);
  const menor = esMenor(jugador, hoy);
  const pedidos = permisosDe(jugador, hoy);

  const faltantes = [];
  if (menor !== false && mios.length === 0) faltantes.push({ k: 'sin_tutor', rotulo: 'Sin ningún tutor cargado', grave: true });
  if (mios.length > 0 && !principal) faltantes.push({ k: 'sin_principal', rotulo: 'Nadie marcado como contacto principal', grave: true });
  if (mios.length > 0 && !mios.some((t) => t.telefono)) faltantes.push({ k: 'sin_telefono', rotulo: 'Ningún tutor tiene teléfono', grave: true });
  if (menor === true && mios.length > 0 && quienesRetiran.length === 0 && jugador?.retira_solo !== true) {
    faltantes.push({ k: 'sin_quien_retire', rotulo: 'Nadie puede retirarlo, y no se retira solo', grave: true });
  }
  pedidos.forEach((p) => {
    if (jugador?.[p.k] == null) faltantes.push({ k: p.k, rotulo: `Falta responder: ${p.rotulo.toLowerCase()}`, grave: false });
  });

  return {
    jugador,
    edad: edadDe(jugador?.fechanac, hoy),
    esMenor: menor,
    tutores: [...mios].sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0)
      || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
    principal,
    quienesRetiran,
    permisos: pedidos.map((p) => ({ ...p, valor: jugador?.[p.k] ?? null, estado: estadoPermiso(jugador?.[p.k]) })),
    faltantes,
    completo: faltantes.length === 0,
  };
}

/**
 * Lo mismo para todo el plantel, con el pendiente primero y lo grave arriba
 * de todo. Es la lista de trabajo del club, no un ranking.
 */
export function resumenClub(jugadores = [], tutores = [], hoy) {
  const filas = (jugadores || []).map((j) => estadoDeJugador(j, tutores, hoy));
  const graves = (f) => f.faltantes.filter((x) => x.grave).length;

  const ordenadas = [...filas].sort((a, b) => {
    const ga = graves(a), gb = graves(b);
    if (ga !== gb) return gb - ga;
    if (a.faltantes.length !== b.faltantes.length) return b.faltantes.length - a.faltantes.length;
    return String(a.jugador?.apellido || '').localeCompare(String(b.jugador?.apellido || ''), 'es');
  });

  return {
    filas: ordenadas,
    total: filas.length,
    menores: filas.filter((f) => f.esMenor === true).length,
    sinFechaNac: filas.filter((f) => f.esMenor == null).length,
    sinTutor: filas.filter((f) => f.faltantes.some((x) => x.k === 'sin_tutor')).length,
    conPendientes: filas.filter((f) => !f.completo).length,
    conGraves: filas.filter((f) => graves(f) > 0).length,
  };
}
