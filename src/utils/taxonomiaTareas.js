/* ═══════════════════════════════════════════════════════════════════════════
   TAXONOMÍA DE TAREAS — fuente única

   Antes cada pantalla tenía su propia copia de estas listas y no coincidían
   entre sí: el Creador ofrecía dos vocabularios distintos para el mismo
   campo según la naturaleza, el Banco filtraba por valores que ya no se
   podían crear, y el Planificador armaba los chips con lo que encontrara en
   los datos, así que mezclaba las dos familias en la misma fila.

   Ahora hay un solo lugar. Cuatro ejes, cada uno respondiendo una pregunta
   distinta:

     NATURALEZA  qué capacidad entrena      (Táctico, Físico…)
     FASE        qué momento del juego      (Ataque, Transiciones…)
     SUBFASE     qué situación dentro       (Salida de presión, Corner…)
     FORMATO     cómo se estructura         (Reducido, Juego real…)

   Los valores que se guardan en la base son los de `id`. Las etiquetas son
   sólo para mostrar, así se pueden reescribir sin migrar nada.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── NATURALEZA · el contenido ────────────────────────────────────────────── */
export const NATURALEZAS = [
  { id: 'Táctico',      label: 'Táctico',      color: '#00ff88' },
  { id: 'Técnico',      label: 'Técnico',      color: '#22d3ee' },
  { id: 'Físico',       label: 'Físico',       color: '#f59e0b' },
  { id: 'Cognitivo',    label: 'Cognitivo',    color: '#a78bfa' },
  { id: 'Libro Táctico',label: 'Libro Táctico',color: '#ec4899' },
];

/* ── FASE · el momento del juego, con sus situaciones ─────────────────────── */
export const FASES = [
  {
    id: 'Ataque', label: 'Ataque', color: '#00ff88',
    subfases: ['Salida de presión', 'Construcción', 'Progresión', 'Finalización', 'Sistema'],
  },
  {
    id: 'Defensa', label: 'Defensa', color: '#ef4444',
    subfases: ['Presión alta', 'Bloque medio', 'Bloque bajo', 'Individual', 'Zona'],
  },
  {
    id: 'Transiciones', label: 'Transiciones', color: '#f59e0b',
    subfases: ['Contraataque', 'Oleadas', 'Repliegue', 'Presión tras pérdida', 'Balance defensivo'],
  },
  {
    id: 'Situaciones Especiales', label: 'Situaciones Especiales', color: '#a78bfa',
    subfases: ['5v4', '4v5', '4v3', '3v4', '5v3', '3v5'],
  },
  {
    id: 'Balón Parado', label: 'Balón Parado', color: '#22d3ee',
    subfases: ['Inicio', 'Lateral bajo', 'Lateral medio', 'Lateral alto',
               'Corner', 'Tiro libre', 'Saque de arco', 'Penal', 'Doble penal'],
  },
  {
    id: 'Sup/Inf', label: 'Superioridad / Inferioridad', color: '#ec4899',
    subfases: ['2vA', '2v1', '3v1', '3v2'],
  },
];

export const FASES_POR_ID = Object.fromEntries(FASES.map(f => [f.id, f]));

export const subfasesDe = (faseId) => FASES_POR_ID[faseId]?.subfases || [];

export const colorFase = (faseId) => FASES_POR_ID[faseId]?.color || 'var(--text-dim)';

/* Todas las subfases, para el filtro cuando no hay fase elegida. */
export const TODAS_LAS_SUBFASES = FASES.flatMap(f =>
  f.subfases.map(s => ({ subfase: s, fase: f.id })));

/* ── FORMATO · cómo se estructura la práctica ─────────────────────────────── */
export const FORMATOS = [
  { id: 'Analítico',          label: 'Analítico',   ayuda: 'sin oposición, gesto aislado' },
  { id: 'Drill',              label: 'Drill',       ayuda: 'mecanización con series' },
  { id: 'Sintético',          label: 'Sintético',   ayuda: 'con oposición, tarea construida' },
  { id: 'Reducido',           label: 'Reducido / SSG', ayuda: '2v2, 3v3, 4v4 en espacio chico' },
  { id: 'Juego Condicionado', label: 'Juego Condicionado', ayuda: 'juego real con reglas' },
  { id: 'Juego Real',         label: 'Juego Real',  ayuda: '5v5 libre' },
  { id: 'Circuito',           label: 'Circuito / Estaciones', ayuda: 'varias postas' },
];

export const FORMATOS_POR_ID = Object.fromEntries(FORMATOS.map(f => [f.id, f]));
export const etiquetaFormato = (id) => FORMATOS_POR_ID[id]?.label || id || '';

/* ── LO VIEJO ─────────────────────────────────────────────────────────────
   Cómo se leía `fase_juego` antes de partirlo en dos. Se usa para migrar la
   base y también en vivo, para que una tarea todavía sin migrar se siga
   viendo bien en pantalla. La misma tabla alimenta el SQL de migración. */
export const MAPA_FASE_VIEJA = {
  'Ataque Posicional':     { fase: 'Ataque',                 subfase: 'Sistema' },
  'Defensa Posicional':    { fase: 'Defensa',                subfase: 'Zona' },
  'Transición Ofensiva':   { fase: 'Transiciones',           subfase: 'Contraataque' },
  'Transición Defensiva':  { fase: 'Transiciones',           subfase: 'Repliegue' },
  'Situaciones Especiales':{ fase: 'Situaciones Especiales', subfase: null },
  'ABP / Pelota Parada':   { fase: 'Balón Parado',           subfase: null },
  'ABP':                   { fase: 'Balón Parado',           subfase: null },
  /* Las del Libro Táctico, que vivían en el mismo campo. */
  'Salida de Presión':     { fase: 'Ataque',                 subfase: 'Salida de presión' },
  'Saque Inicial':         { fase: 'Balón Parado',           subfase: 'Inicio' },
  'Laterales Bajos':       { fase: 'Balón Parado',           subfase: 'Lateral bajo' },
  'Laterales Medios':      { fase: 'Balón Parado',           subfase: 'Lateral medio' },
  'Laterales Altos':       { fase: 'Balón Parado',           subfase: 'Lateral alto' },
  'Corners':               { fase: 'Balón Parado',           subfase: 'Corner' },
  'Tiros Libres':          { fase: 'Balón Parado',           subfase: 'Tiro libre' },
  '5v4':                   { fase: 'Situaciones Especiales', subfase: '5v4' },
  /* Las que escribe el Creador Físico. */
  'Fuerza / Prevención':          { fase: null, subfase: null },
  'Acondicionamiento Metabólico': { fase: null, subfase: null },
};

/* Lee la fase y la subfase de una tarea, esté migrada o no. */
export function leerFase(tarea = {}) {
  const fase = tarea.fase_juego;
  if (fase && FASES_POR_ID[fase]) {
    return { fase, subfase: tarea.subfase_juego || null, migrada: true };
  }
  const viejo = MAPA_FASE_VIEJA[fase];
  if (viejo) return { ...viejo, subfase: tarea.subfase_juego || viejo.subfase, migrada: false };
  return { fase: fase || null, subfase: tarea.subfase_juego || null, migrada: false };
}

/* Texto corto para mostrar en una carta: "Balón Parado · Corner". */
export function etiquetaFase(tarea = {}) {
  const { fase, subfase } = leerFase(tarea);
  if (!fase) return '';
  return subfase ? `${fase} · ${subfase}` : fase;
}

/* ── BÚSQUEDA ─────────────────────────────────────────────────────────────
   Un solo lugar que define contra qué se busca, así las tres pantallas
   encuentran lo mismo escribiendo lo mismo. */
export const normalizarTexto = (s) =>
  (s ?? '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function coincideBusqueda(tarea = {}, termino = '') {
  const t = normalizarTexto(termino).trim();
  if (!t) return true;
  const { fase, subfase } = leerFase(tarea);
  return [
    tarea.titulo, tarea.descripcion, tarea.objetivo_principal,
    tarea.categoria_ejercicio, fase, subfase,
    etiquetaFormato(tarea.formato_tarea), tarea.espacio,
  ].some(campo => normalizarTexto(campo).includes(t));
}

/* Aplica los filtros de la barra a una tarea. Vive acá para que el Banco y
   el Planificador filtren igual: antes cada uno tenía su propia versión y
   daban resultados distintos con los mismos filtros puestos. */
export function pasaFiltros(tarea = {}, f = {}) {
  const { fase, subfase } = leerFase(tarea);
  if (f.naturaleza && f.naturaleza !== 'Todas' && tarea.categoria_ejercicio !== f.naturaleza) return false;
  if (f.fase && f.fase !== 'Todas' && fase !== f.fase) return false;
  if (f.subfase && f.subfase !== 'Todas' && subfase !== f.subfase) return false;
  if (f.formato && f.formato !== 'Todos' && tarea.formato_tarea !== f.formato) return false;
  return coincideBusqueda(tarea, f.busqueda || '');
}

/* ── FILTROS ──────────────────────────────────────────────────────────────
   El estado vacío de la barra y cuántos hay puestos. Viven acá y no en el
   componente para que la pantalla pueda inicializar el estado sin importar
   nada de React. */
export const FILTROS_VACIOS = {
  busqueda: '', naturaleza: 'Todas', fase: 'Todas', subfase: 'Todas', formato: 'Todos',
};

export function contarFiltros(v = FILTROS_VACIOS) {
  return ['naturaleza', 'fase', 'subfase', 'formato']
    .filter(k => v[k] && v[k] !== 'Todas' && v[k] !== 'Todos').length
    + (v.busqueda?.trim() ? 1 : 0);
}
