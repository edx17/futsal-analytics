// src/reportes/engine/campos.js
//
// Catálogo de datos que el usuario puede insertar en un texto sin escribir
// llaves a mano. Cada entrada es { path, etiqueta } y la UI inserta `{path}`
// en la posición del cursor.
//
// Si agregás una métrica nueva a useReportData, sumala acá o no va a
// aparecer en el selector.

export const GRUPOS_CAMPOS = [
  {
    grupo: "Jugador",
    campos: [
      { path: "jugador.nombre", etiqueta: "Nombre" },
      { path: "jugador.apellido", etiqueta: "Apellido" },
      { path: "jugador.dorsal", etiqueta: "Dorsal" },
      { path: "jugador.posicion", etiqueta: "Posición" },
      { path: "jugador.categoria", etiqueta: "Categoría" },
      { path: "jugador.foto", etiqueta: "Foto (URL)" },
    ],
  },
  {
    grupo: "Club",
    campos: [
      { path: "club.nombre", etiqueta: "Nombre del club" },
      { path: "club.logo", etiqueta: "Escudo (URL)" },
      { path: "club.torneo", etiqueta: "Torneo seleccionado" },
    ],
  },
  {
    grupo: "Ofensiva",
    campos: [
      { path: "stats.goles", etiqueta: "Goles" },
      { path: "stats.remates", etiqueta: "Remates" },
      { path: "stats.asistencias", etiqueta: "Asistencias" },
    ],
  },
  {
    grupo: "Participación",
    campos: [
      { path: "stats.partidosJugados", etiqueta: "Partidos jugados" },
      { path: "stats.minutos", etiqueta: "Minutos" },
      { path: "stats.titularidades", etiqueta: "Titularidades" },
      { path: "stats.rating", etiqueta: "Rating" },
    ],
  },
  {
    grupo: "Defensiva y juego",
    campos: [
      { path: "stats.recuperaciones", etiqueta: "Recuperaciones" },
      { path: "stats.perdidas", etiqueta: "Pérdidas" },
      { path: "stats.faltasRecibidas", etiqueta: "Faltas recibidas" },
      { path: "stats.faltasCometidas", etiqueta: "Faltas cometidas" },
      { path: "stats.amarillas", etiqueta: "Amarillas" },
      { path: "stats.rojas", etiqueta: "Rojas" },
    ],
  },
  {
    grupo: "Arquero",
    campos: [
      { path: "stats.atajadas", etiqueta: "Atajadas" },
      { path: "stats.golesRecibidos", etiqueta: "Goles recibidos" },
    ],
  },
];

/** Lista plana, útil para buscar la etiqueta de un path. */
export const CAMPOS = GRUPOS_CAMPOS.flatMap((g) =>
  g.campos.map((c) => ({ ...c, grupo: g.grupo }))
);

export function etiquetaDeCampo(path) {
  return CAMPOS.find((c) => c.path === path)?.etiqueta || path;
}

// Fuentes disponibles. Tienen que estar cargadas en index.html o el export
// las va a reemplazar por la fallback del sistema.
export const FUENTES = [
  { valor: "Anton", etiqueta: "Anton (display)" },
  { valor: "Montserrat", etiqueta: "Montserrat (texto)" },
  { valor: "Arial", etiqueta: "Arial (sistema)" },
  { valor: "'JetBrains Mono', monospace", etiqueta: "JetBrains Mono" },
];

const NOMBRE_TIPO = {
  text: "Texto",
  image: "Imagen",
  rectangle: "Rectángulo",
  circle: "Círculo",
};

/**
 * Nombre legible de un elemento para el panel de capas.
 * `deco-20` no le dice nada a nadie; "Texto — Faltas cometidas" sí.
 */
export function nombreLegible(el) {
  if (!el) return "";
  const tipo = NOMBRE_TIPO[el.type] || el.type;

  const fuente = el.type === "image" ? el.src : el.text;
  const texto = String(fuente ?? "").trim();
  if (!texto) return tipo;

  // Si usa campos dinámicos, mostramos sus etiquetas.
  const paths = [...texto.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
  if (paths.length > 0) {
    return `${tipo} — ${paths.map(etiquetaDeCampo).join(" + ")}`;
  }

  const plano = texto.replace(/\s+/g, " ");
  const corto = plano.length > 26 ? `${plano.slice(0, 26)}…` : plano;
  return `${tipo} — ${corto}`;
}