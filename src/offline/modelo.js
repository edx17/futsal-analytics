/* ═══════════════════════════════════════════════════════════════════════════
   MODELO COMPARTIDO DEL ANÁLISIS OFFLINE

   Un solo lugar donde viven las convenciones, para que la página, el
   sincronizador y las métricas no las interpreten cada uno a su manera.

   COORDENADAS: siempre 0-100 y siempre ABSOLUTAS respecto del arco propio.
   x = 0   → nuestro arco
   x = 100 → arco rival
   y = 0   → banda izquierda mirando hacia el arco rival
   Es exactamente la convención que ya guarda el tracker en vivo en
   zona_x / zona_y, así que todo lo que hoy lee eventos sigue leyendo igual.

   TIEMPO: `t_ms` son milisegundos DENTRO del período. minuto y segundos se
   siguen guardando porque medio sistema los lee, pero la fuente de verdad
   para ordenar y medir es t_ms.

   LA PELOTA: es una ficha más del tablero, con id 'balon'. Su X es la línea
   de referencia que permite contar cuántos quedaron por detrás.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DURACION_PERIODO_MS = 20 * 60 * 1000; // futsal: 20' por período
export const PERIODOS = ['PT', 'ST'];
export const BALON_ID = 'balon';

export function nuevoUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  /* Fallback para WebViews viejas sin randomUUID (que es donde más se usa
     esto: tablets baratas al costado de la cancha). */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nuevoLocalId = (prefijo = 'ev') =>
  `${prefijo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

/* ── Tiempo ──────────────────────────────────────────────────────────────── */

export const msAMinSeg = (ms = 0) => ({
  minuto: Math.floor(Math.max(0, ms) / 60000),
  segundos: Math.floor((Math.max(0, ms) % 60000) / 1000),
});

export const minSegAMs = (minuto = 0, segundos = 0) =>
  Math.max(0, (Number(minuto) || 0) * 60000 + (Number(segundos) || 0) * 1000);

export function formatearTiempo(ms = 0) {
  const { minuto, segundos } = msAMinSeg(ms);
  return `${minuto}:${String(segundos).padStart(2, '0')}`;
}

/* Reloj corrido del partido: el ST arranca donde termina el PT. Sirve para
   ordenar una lista mezclada y para dibujar líneas de tiempo. */
export const msAbsoluto = (periodo, tMs = 0) =>
  (periodo === 'ST' ? DURACION_PERIODO_MS : 0) + (Number(tMs) || 0);

/* Los eventos viejos no tienen t_ms: se lo derivamos de minuto+segundos.
   El tracker en vivo reinicia el minuto en cada período, pero algunos
   registros traen el minuto corrido del partido; si el minuto pasa de 20 en
   el ST, lo tomamos como corrido y le restamos el período. */
export function tMsDeEvento(ev = {}) {
  if (ev.t_ms != null && Number.isFinite(Number(ev.t_ms))) return Number(ev.t_ms);
  let minuto = Number(ev.minuto) || 0;
  if (ev.periodo === 'ST' && minuto >= 20) minuto -= 20;
  return minSegAMs(minuto, ev.segundos);
}

export const ordenarCronologico = (eventos = []) =>
  [...eventos].sort(
    (a, b) => msAbsoluto(a.periodo, tMsDeEvento(a)) - msAbsoluto(b.periodo, tMsDeEvento(b))
  );

/* ── Coordenadas ─────────────────────────────────────────────────────────── */

export const acotar = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/* Espeja un punto cuando la cancha se ve invertida. Es su propio inverso:
   sirve para ir de pantalla a coordenada guardada y al revés. */
export function espejar(p, invertida) {
  if (!p) return p;
  return invertida ? { ...p, x: 100 - acotar(p.x), y: 100 - acotar(p.y) }
                   : { ...p, x: acotar(p.x), y: acotar(p.y) };
}

export const coordDeEvento = (ev = {}) => ({
  x: ev.zona_x_norm != null ? ev.zona_x_norm : ev.zona_x,
  y: ev.zona_y_norm != null ? ev.zona_y_norm : ev.zona_y,
});

/* ── ZONAS Y CARRILES ────────────────────────────────────────────────────
   La cancha se lee siempre igual: cuatro zonas de 10 metros desde nuestro
   arco hacia el rival (Z1 Z2 Z3 Z4) y tres carriles a lo ancho.

   El carril se nombra desde el jugador que ataca: mirando la cancha desde
   arriba con nuestro arco a la izquierda, el que va hacia el arco rival
   tiene su derecha abajo. Por eso Derecho es la banda de abajo (y alto) e
   Izquierdo la de arriba (y bajo).

   Doce cuadraditos. "Pérdida no forzada en Z2-C" lo entiende cualquiera.
   ──────────────────────────────────────────────────────────────────────── */

export const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4'];
export const CARRILES = ['I', 'C', 'D'];
export const NOMBRE_CARRIL = { I: 'Izquierdo', C: 'Centro', D: 'Derecho' };

/* Metros reales de futsal: 40 de largo por 20 de ancho. */
export const LARGO_CANCHA_M = 40;
export const ANCHO_CANCHA_M = 20;

export function zonaDe(x, y) {
  if (x == null || y == null) return null;
  const zi = Math.max(0, Math.min(3, Math.floor(acotar(x) / 25)));
  const ci = Math.max(0, Math.min(2, Math.floor(acotar(y) / (100 / 3))));
  const zona = ZONAS[zi];
  const carril = CARRILES[ci];
  return {
    zona, carril,
    etiqueta: `${zona}-${carril}`,
    nombre: `${zona} ${NOMBRE_CARRIL[carril]}`,
    metros: `${zi * 10}-${(zi + 1) * 10}m`,
  };
}

export const etiquetaZona = (x, y) => zonaDe(x, y)?.etiqueta ?? null;

/* Las doce celdas, en coordenadas 0-100, para dibujarlas o agrupar. */
export const CELDAS = ZONAS.flatMap((zona, zi) =>
  CARRILES.map((carril, ci) => ({
    zona, carril, etiqueta: `${zona}-${carril}`,
    x0: zi * 25, x1: (zi + 1) * 25,
    y0: ci * (100 / 3), y1: (ci + 1) * (100 / 3),
  }))
);

/* ── Quinteto ────────────────────────────────────────────────────────────── */

/* quinteto_activo viaja de tres formas distintas según de dónde salga:
   array (la columna es text[]), JSON stringificado, o lista con comas. */
export function normalizarQuinteto(qa) {
  if (!qa) return [];
  if (Array.isArray(qa)) return qa.map(String);
  if (typeof qa === 'string') {
    try {
      const parseado = JSON.parse(qa);
      if (Array.isArray(parseado)) return parseado.map(String);
    } catch {
      return qa.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/* ── Catálogo de acciones ────────────────────────────────────────────────── */

/* `destino`  → pide un segundo toque en la cancha.
   `cierra`   → termina una cadena de pases.
   `resultado`→ pide completado/incompleto (pases).
   `perdida`  → pide forzada/no forzada.
   `guia`     → qué significa cada toque, en pantalla, mientras cargás. */
export const ACCIONES = [
  { id: 'Pase', label: 'Pase', tecla: 'P', color: '#a78bfa',
    destino: true, resultado: true,
    guia: ['Desde dónde sale el pase', 'Dónde llega'] },

  { id: 'Recepción', label: 'Recepción', tecla: 'R', color: '#8b5cf6',
    destino: true,
    guia: ['Dónde estaba ANTES de recibir', 'Dónde recibió la pelota'] },

  { id: 'Conducción', label: 'Conducción', tecla: 'C', color: '#22d3ee',
    destino: true,
    guia: ['Dónde arranca', 'Dónde termina'] },

  { id: 'Recuperación', label: 'Recuperación', tecla: 'E', color: '#eab308',
    guia: ['Dónde recuperó'] },

  { id: 'Pérdida', label: 'Pérdida', tecla: 'X', color: '#ef4444',
    cierra: true, perdida: true,
    guia: ['Dónde se perdió la pelota'] },

  { id: 'Remate - Gol', label: 'GOL', tecla: 'G', color: '#00ff88',
    cierra: true, guia: ['Desde dónde remató'] },

  { id: 'Remate - Atajado', label: 'Remate atajado', tecla: 'A', color: '#3b82f6',
    cierra: true, guia: ['Desde dónde remató'] },

  { id: 'Remate - Desviado', label: 'Remate desviado', tecla: 'D', color: '#888888',
    cierra: true, guia: ['Desde dónde remató'] },

  { id: 'Remate - Rebatido', label: 'Remate rebatido', tecla: 'B', color: '#a855f7',
    cierra: true, guia: ['Desde dónde remató'] },

  { id: 'Bloqueo/Intercepción', label: 'Bloqueo', tecla: 'I', color: '#f97316',
    cierra: true, guia: ['Dónde bloqueó'] },

  { id: 'Duelo Ganado', label: 'Duelo ganado', tecla: 'W', color: '#10b981',
    guia: ['Dónde fue el duelo'] },

  { id: 'Duelo Perdido', label: 'Duelo perdido', tecla: 'Q', color: '#dc2626',
    guia: ['Dónde fue el duelo'] },
];

export const ACCIONES_POR_ID = Object.fromEntries(ACCIONES.map(a => [a.id, a]));

export const esGol = (accion = '') => accion === 'Remate - Gol' || accion === 'Gol';
export const esRemate = (accion = '') => accion.includes('Remate') || esGol(accion);
export const esPase = (accion = '') => accion === 'Pase' || accion === 'Pase Clave' || accion === 'Asistencia';
export const cierraSecuencia = (accion = '') => !!ACCIONES_POR_ID[accion]?.cierra;

export const ETIQUETAS_TACTICAS = [
  '—', 'Contraataque', 'Posicional', 'Pelota parada', 'Portero-jugador',
  'Segunda jugada', 'Salida de arquero', 'Presión alta', 'Repliegue',
];

/* ── Fábricas ────────────────────────────────────────────────────────────── */

/* Un evento offline es un evento común y silvestre de la tabla `eventos`:
   los mismos campos que escribe el tracker en vivo, más los nuevos. Los
   campos que empiezan con _ son locales y el sincronizador los saca. */
export function crearEvento({
  clubId, idPartido, accion, equipo = 'Propio', periodo = 'PT', tMs = 0,
  idJugador = null, idReceptor = null, idAsistencia = null,
  x = null, y = null, xFin = null, yFin = null,
  quinteto = [], contextoJuego = '5v5', secuenciaId = null, ordenSecuencia = null,
  etiquetaTactica = null, origenGol = null,
  paseCompletado = null, tipoPerdida = null, bajoPresion = null, deEspaldas = null,
  posiciones = null, linea = null,
}) {
  const { minuto, segundos } = msAMinSeg(tMs);
  return {
    local_id: nuevoLocalId('ev'),
    club_id: clubId,
    id_partido: idPartido,
    id_jugador: idJugador != null ? Number(idJugador) : null,
    id_receptor: idReceptor != null ? Number(idReceptor) : null,
    id_asistencia: idAsistencia != null ? Number(idAsistencia) : null,
    accion,
    equipo,
    periodo,
    minuto,
    segundos,
    t_ms: tMs,
    zona_x: x != null ? acotar(x) : null,
    zona_y: y != null ? acotar(y) : null,
    zona_x_fin: xFin != null ? acotar(xFin) : null,
    zona_y_fin: yFin != null ? acotar(yFin) : null,
    zona_tactica: etiquetaZona(x, y),
    zona_tactica_fin: etiquetaZona(xFin, yFin),
    secuencia_id: secuenciaId,
    orden_secuencia: ordenSecuencia,
    quinteto_activo: quinteto.map(String),
    contexto_juego: contextoJuego,
    etiqueta_tactica: etiquetaTactica,
    origen_gol: origenGol,
    pase_completado: paseCompletado,
    tipo_perdida: tipoPerdida,
    bajo_presion: bajoPresion,
    de_espaldas: deEspaldas,
    posiciones,
    defensores_linea: linea?.defensores ?? null,
    atacantes_linea: linea?.atacantes ?? null,
    balance_linea: linea?.balance ?? null,
    origen_captura: 'offline',
    _estado: 'local',
  };
}

export function crearSnapshot({
  clubId, idPartido, periodo = 'PT', tMs = 0, posiciones = [], balon = null,
  contextoJuego = '5v5', etiquetaTactica = null, linea = null,
  localIdEvento = null, idEvento = null, nota = null,
}) {
  const { minuto, segundos } = msAMinSeg(tMs);
  return {
    local_id: nuevoLocalId('snap'),
    club_id: clubId,
    id_partido: idPartido,
    id_evento: idEvento,
    periodo,
    t_ms: tMs,
    minuto,
    segundos,
    posiciones,
    x_balon: balon?.x ?? null,
    y_balon: balon?.y ?? null,
    defensores_linea: linea?.defensores ?? null,
    atacantes_linea: linea?.atacantes ?? null,
    balance_linea: linea?.balance ?? null,
    contexto_juego: contextoJuego,
    etiqueta_tactica: etiquetaTactica,
    nota,
    _local_id_evento: localIdEvento,
    _estado: 'local',
  };
}

/* El rastro de un jugador dentro de un tramo en cancha. Cada vez que lo
   movés en el tablero se le agrega un punto. */
export function crearRecorrido({
  clubId, idPartido, idJugador = null, equipo = 'Propio', dorsalRival = null,
  stintLocalId = null, periodo = 'PT', tInicioMs = 0, tFinMs = null,
  puntos = [], tipo = 'seguimiento',
}) {
  return {
    local_id: nuevoLocalId('rec'),
    club_id: clubId,
    id_partido: idPartido,
    id_jugador: idJugador != null ? Number(idJugador) : null,
    equipo,
    dorsal_rival: dorsalRival != null ? Number(dorsalRival) : null,
    stint_local_id: stintLocalId,
    periodo,
    t_inicio_ms: tInicioMs,
    t_fin_ms: tFinMs,
    puntos,
    tipo,
    _estado: 'local',
  };
}

export function crearStint({
  clubId, idPartido, idJugador, periodo = 'PT', entradaMs = 0, salidaMs = null, ajustado = false,
}) {
  return {
    local_id: nuevoLocalId('stint'),
    club_id: clubId,
    id_partido: idPartido,
    id_jugador: Number(idJugador),
    periodo,
    entrada_ms: entradaMs,
    salida_ms: salidaMs,
    ajustado,
    _estado: 'local',
  };
}

export function crearSecuencia({
  clubId, idPartido, equipo = 'Propio', periodo = 'PT', tInicioMs = 0, etiquetaTactica = null,
}) {
  return {
    id: nuevoUuid(),
    club_id: clubId,
    id_partido: idPartido,
    equipo,
    periodo,
    t_inicio_ms: tInicioMs,
    t_fin_ms: null,
    cantidad_pases: 0,
    pases_completados: 0,
    pases_incompletos: 0,
    resultado: null,
    id_evento_final: null,
    etiqueta_tactica: etiquetaTactica,
    _local_id_evento_final: null,
    _estado: 'local',
  };
}
