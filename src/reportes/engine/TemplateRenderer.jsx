// src/reportes/engine/TemplateRenderer.jsx
import React from "react";
import RenderText from "../components/RenderText";
import RenderImage from "../components/RenderImage";
import RenderRectangle from "../components/RenderRectangle";
import RenderCircle from "../components/RenderCircle";
import { resolve, cumpleCondicion } from "./FieldResolver";
import { componer } from "./documento";
import { PLANTILLAS_BASE } from "../templates";

const RENDERERS = {
  text: RenderText,
  image: RenderImage,
  rectangle: RenderRectangle,
  circle: RenderCircle,
};

// Props del modelo que no deben resolverse ni llegar al DOM.
const PROPS_INTERNAS = new Set(["condicion", "oculto", "eliminado", "__orden", "__origen"]);

/**
 * @param {object} [template] - la plantilla a renderizar. Puede venir del
 *   código (verde/vintage) o de `reporte_plantillas` — por eso se pasa como
 *   objeto y no por nombre: las del club no existen en el bundle.
 * @param {string} [templateName] - compatibilidad: si no se pasa `template`,
 *   se busca entre las base.
 * @param {object} data - dataReporte (jugador, stats, club)
 * @param {object} [documento] - capa editable ya combinada (engine/documento.js).
 *   Acepta el formato viejo `{ [id]: {x, y, oculto} }`; componer() lo normaliza.
 */
function TemplateRenderer({ template, templateName, data, documento }) {
  const plantilla = template || PLANTILLAS_BASE[templateName];

  if (!plantilla || !plantilla.elements) return null;

  const elementos = componer(plantilla, documento);

  return (
    <div
      style={{
        width: plantilla.width || 1080,
        height: plantilla.height || 1350,
        backgroundColor: plantilla.background || "#ffffff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {elementos.map((element, index) => {
        // Condición automática de la plantilla (ej: bloque de arquero).
        if (!cumpleCondicion(element.condicion, data)) return null;

        // Ocultado a mano por el usuario: distinto de `condicion`, que
        // depende del jugador.
        if (element.oculto) return null;

        const resolvedElement = {};
        Object.keys(element).forEach((key) => {
          if (PROPS_INTERNAS.has(key)) return;
          try {
            resolvedElement[key] = resolve(element[key], data);
          } catch (err) {
            console.warn(`No se pudo resolver "${key}" en el elemento ${element.id || index}:`, err);
            resolvedElement[key] = "";
          }
        });

        const Renderer = RENDERERS[resolvedElement.type];
        return Renderer ? (
          <Renderer key={element.id || `el-${index}`} element={resolvedElement} />
        ) : null;
      })}
    </div>
  );
}

export default React.memo(TemplateRenderer);