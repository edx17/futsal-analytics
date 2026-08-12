// src/reportes/templates/index.js
import verde from "./verde";
import vintage from "./vintage";

/**
 * Plantillas base: viven en el código porque importan assets del bundle
 * (verde usa la textura de papel) y no se pueden serializar a JSONB.
 * Las del club se cargan desde `reporte_plantillas` — ver useTemplatesClub.
 */
export const PLANTILLAS_BASE = {
  verde: { ...verde, slug: "verde", nombre: "Verde", esBase: true },
  vintage: { ...vintage, slug: "vintage", nombre: "Vintage", esBase: true },
};

// Alias histórico: varios módulos siguen importando `templates`.
export const templates = PLANTILLAS_BASE;

export const ANCHO_BASE = 1080;
export const ALTO_BASE = 1350;

/** Lienzo vacío para arrancar una plantilla desde cero. */
export function plantillaEnBlanco(nombre = "Plantilla nueva") {
  return {
    nombre,
    width: ANCHO_BASE,
    height: ALTO_BASE,
    background: "#111111",
    elements: [],
  };
}

export default PLANTILLAS_BASE;