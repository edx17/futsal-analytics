/**
 * DISPONIBILIDAD DEL PLANTEL
 *
 * La pregunta "¿este jugador está para jugar el domingo?" la hacen seis
 * pantallas distintas: Presentismo, Citación, Nuevo Partido, el Microciclo,
 * el Tablón y el perfil del jugador. Si cada una la contesta por su cuenta,
 * en tres meses dicen cosas distintas y nadie sabe cuál creer.
 *
 * Por eso la respuesta vive acá, una sola vez, en funciones puras. La
 * Enfermería escribe las lesiones; todos los demás preguntan.
 */

/* ══════════════════════════════════════════════════════════════════════════
   VOCABULARIO
   Listas fijas, no texto libre, a propósito: con texto libre "isquios",
   "Isquiotibial" e "isquio derecho" son tres cosas distintas y nunca se puede
   contar nada. Con lista fija se puede responder "el 40% de nuestras lesiones
   son de isquios", que es lo único que sirve para prevenir.
   ══════════════════════════════════════════════════════════════════════════ */

export const ZONAS = [
  'Isquiosurales', 'Cuádriceps', 'Aductores', 'Pubis / Pubalgia', 'Gemelo / Sóleo',
  'Tobillo', 'Pie', 'Rodilla', 'Cadera', 'Lumbar',
  'Cervical', 'Hombro', 'Codo', 'Muñeca / Mano', 'Cabeza / Rostro',
];

export const TIPOS = ['Muscular', 'Articular', 'Ligamentaria', 'Tendinosa', 'Ósea', 'Golpe / Contusión', 'Otra'];
export const LATERALIDADES = ['N/A', 'Izquierda', 'Derecha', 'Bilateral'];
export const MECANISMOS = ['Sin contacto', 'Con contacto', 'Sobrecarga', 'Recaída'];
export const CONTEXTOS = ['Entrenamiento', 'Partido', 'Fuera del club'];

/* Los días son una referencia para proponer la fecha de alta estimada, no una
   regla: el CT la corrige siempre que quiera. */
export const GRAVEDADES = [
  { id: 'Leve', dias: 7, color: '#eab308' },
  { id: 'Moderada', dias: 21, color: '#f97316' },
  { id: 'Grave', dias: 60, color: '#ef4444' },
];

export const ESTADOS = {
  activa:       { label: 'DE BAJA',      color: '#ef4444', disponible: false, orden: 0 },
  recaida:      { label: 'RECAÍDA',      color: '#dc2626', disponible: false, orden: 1 },
  readaptacion: { label: 'READAPTACIÓN', color: '#f59e0b', disponible: false, orden: 2 },
  alta:         { label: 'ALTA',         color: '#10b981', disponible: true,  orden: 3 },
};

/** El quinto estado del presentismo. No cuenta como falta: sale del denominador. */
export const ASISTENCIA_LESIONADO = 'lesionado';

/**
 * Qué estados de asistencia entran en el cálculo del presentismo.
 * Un día que el jugador estuvo lesionado no es una falta suya: no se cuenta
 * ni arriba ni abajo de la división.
 */
export const cuentaParaPresentismo = (estado) => estado !== ASISTENCIA_LESIONADO;
export const cuentaComoPresente = (estado) => estado === 'presente' || estado === 'tarde';

/* ══════════════════════════════════════════════════════════════════════════
   FECHAS
   ══════════════════════════════════════════════════════════════════════════ */

export const soloFecha = (f) => (f ? String(f).split('T')[0] : null);

export const hoyISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

/** Días entre dos fechas ISO. Positivo si `hasta` es posterior. */
export function diasEntre(desde, hasta) {
  const a = soloFecha(desde), b = soloFecha(hasta);
  if (!a || !b) return null;
  // El mediodía evita que el cambio de horario corra un día el resultado.
  const ms = new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`);
  return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
}

export function sumarDias(fecha, dias) {
  const base = soloFecha(fecha);
  if (!base) return null;
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(dias || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   LESIONES
   ══════════════════════════════════════════════════════════════════════════ */

/** Una lesión sigue abierta mientras no se le haya dado el alta. */
export const estaAbierta = (lesion) => !!lesion && lesion.estado !== 'alta';

/**
 * ¿Esta lesión afectaba al jugador en esa fecha?
 *
 * Sirve tanto para "hoy" como para mirar para atrás: al pasar lista de una
 * fecha vieja, o al contar los partidos que se perdió. El día del alta ya
 * cuenta como disponible.
 */
export function afectaA(lesion, fecha) {
  const f = soloFecha(fecha);
  const inicio = soloFecha(lesion?.fecha_lesion);
  if (!f || !inicio || f < inicio) return false;

  const alta = soloFecha(lesion?.fecha_alta_real);
  if (alta) return f < alta;
  return estaAbierta(lesion);
}

/**
 * De todas las lesiones de un jugador, la que manda en esa fecha.
 * Si arrastra más de una, gana la más limitante (de baja antes que
 * readaptación) y, a igual estado, la más reciente.
 */
export function lesionDe(lesiones = [], jugadorId, fecha = hoyISO()) {
  const id = String(jugadorId);
  const candidatas = lesiones.filter(l => String(l.jugador_id) === id && afectaA(l, fecha));
  if (candidatas.length === 0) return null;

  return candidatas.sort((a, b) => {
    const oa = ESTADOS[a.estado]?.orden ?? 9;
    const ob = ESTADOS[b.estado]?.orden ?? 9;
    if (oa !== ob) return oa - ob;
    return String(b.fecha_lesion).localeCompare(String(a.fecha_lesion));
  })[0];
}

/**
 * El estado de disponibilidad de un jugador, listo para pintar.
 *
 * nivel: 'ok' | 'readaptacion' | 'baja'
 *   ok            → disponible, se cita normal
 *   readaptacion  → entrena aparte; se avisa pero el CT decide
 *   baja          → no está para jugar
 */
export function disponibilidadDe(lesiones, jugadorId, fecha = hoyISO()) {
  const lesion = lesionDe(lesiones, jugadorId, fecha);
  if (!lesion) {
    return { disponible: true, nivel: 'ok', etiqueta: null, detalle: null, color: null, lesion: null, diasRestantes: null };
  }

  const info = ESTADOS[lesion.estado] || ESTADOS.activa;
  const diasRestantes = lesion.fecha_alta_estimada ? diasEntre(fecha, lesion.fecha_alta_estimada) : null;

  const partes = [lesion.zona, lesion.lateralidad && lesion.lateralidad !== 'N/A' ? lesion.lateralidad.toLowerCase() : null]
    .filter(Boolean).join(' ');

  let detalle = partes || lesion.tipo || 'Lesión';
  if (lesion.fecha_alta_estimada) {
    if (diasRestantes !== null && diasRestantes > 0) detalle += ` · vuelve en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'}`;
    else if (diasRestantes !== null && diasRestantes <= 0) detalle += ' · alta estimada vencida';
  }

  return {
    disponible: info.disponible,
    nivel: lesion.estado === 'readaptacion' ? 'readaptacion' : 'baja',
    etiqueta: info.label,
    detalle,
    color: info.color,
    lesion,
    diasRestantes,
  };
}

/** Índice { [jugadorId]: disponibilidad } para pintar listas de una pasada. */
export function mapaDisponibilidad(lesiones = [], jugadores = [], fecha = hoyISO()) {
  const mapa = {};
  jugadores.forEach(j => {
    const estado = disponibilidadDe(lesiones, j.id, fecha);
    if (estado.lesion) mapa[String(j.id)] = estado;
  });
  return mapa;
}

/** Cuántos días lleva (o llevó) de baja. */
export function diasDeBaja(lesion, hasta = hoyISO()) {
  const fin = soloFecha(lesion?.fecha_alta_real) || soloFecha(hasta);
  return diasEntre(lesion?.fecha_lesion, fin);
}

/**
 * La lesión pasó su fecha de alta estimada y nadie confirmó el alta.
 * Es lo que dispara el recordatorio: o volvió y no se cargó, o se complicó.
 */
export function altaVencida(lesion, fecha = hoyISO()) {
  if (!estaAbierta(lesion) || !lesion?.fecha_alta_estimada) return false;
  return soloFecha(fecha) > soloFecha(lesion.fecha_alta_estimada);
}

/** Resumen para el encabezado de la Enfermería y para el parte del Tablón. */
export function resumenPlantel(lesiones = [], jugadores = [], fecha = hoyISO()) {
  const mapa = mapaDisponibilidad(lesiones, jugadores, fecha);
  const estados = Object.values(mapa);
  const deBaja = estados.filter(e => e.nivel === 'baja').length;
  const enReadaptacion = estados.filter(e => e.nivel === 'readaptacion').length;
  return {
    plantel: jugadores.length,
    deBaja,
    enReadaptacion,
    disponibles: Math.max(0, jugadores.length - deBaja - enReadaptacion),
    vencidas: lesiones.filter(l => altaVencida(l, fecha)).length,
  };
}
