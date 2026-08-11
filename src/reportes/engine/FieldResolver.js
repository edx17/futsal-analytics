// src/reportes/engine/FieldResolver.js

// Devuelve el valor en `data` para un path tipo "jugador.posicion".
function obtenerValorPorPath(path, data) {
  const keys = path.split(".");
  let result = data;
  for (const key of keys) {
    if (result === undefined || result === null) break;
    result = result[key];
  }
  return result;
}

export function resolve(value, data) {
  if (value === null || value === undefined) return "";

  // Si no es string (por ejemplo números directos de coordenadas x, y), lo devuelve intacto
  if (typeof value !== "string") return value;

  // Busca todo lo que esté entre llaves y reemplaza dinámicamente
  return value.replace(/\{([^{}]+)\}/g, (match, path) => {
    const result = obtenerValorPorPath(path, data);
    return result !== undefined && result !== null ? result : "";
  });
}

/**
 * Evalúa si un elemento de la plantilla debe renderizarse.
 * En la plantilla se declara así (opcional, si no está, el elemento siempre se muestra):
 *
 *   condicion: { campo: "jugador.posicion", operador: "incluye", valor: "arquero" }
 *   condicion: { campo: "jugador.posicion", operador: "distinto", valor: "Arquero" }
 *
 * Operadores soportados: "igual" (default), "distinto", "incluye" (case-insensitive,
 * pensado para campos de texto libre como posicion).
 */
export function cumpleCondicion(condicion, data) {
  if (!condicion) return true;

  const valorActual = obtenerValorPorPath(condicion.campo, data);
  const operador = condicion.operador || "igual";

  switch (operador) {
    case "igual":
      return valorActual === condicion.valor;
    case "distinto":
      return valorActual !== condicion.valor;
    case "incluye":
      return (
        typeof valorActual === "string" &&
        valorActual.toLowerCase().includes(String(condicion.valor).toLowerCase())
      );
    default:
      return true;
  }
}

export { obtenerValorPorPath };