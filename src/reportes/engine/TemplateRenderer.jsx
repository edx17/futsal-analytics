// src/reportes/engine/TemplateRenderer.jsx
import React from "react";
import RenderText from "../components/RenderText";
import RenderImage from "../components/RenderImage";
import RenderRectangle from "../components/RenderRectangle";
import RenderCircle from "../components/RenderCircle";
import { resolve, cumpleCondicion } from "./FieldResolver";
import { templates } from "../templates";

const RENDERERS = {
  text: RenderText,
  image: RenderImage,
  rectangle: RenderRectangle,
  circle: RenderCircle,
};

/**
 * @param {string} templateName
 * @param {object} data - dataReporte (jugador, stats, club)
 * @param {object} [overridesPosicion] - { [elementoId]: { x, y } }, posiciones
 *   guardadas a mano por el usuario para ESTE jugador+plantilla (ver
 *   usePosicionesReporte). Solo aplica a elementos que declaran `id` en la
 *   plantilla; el resto se ignora.
 */
function TemplateRenderer({ templateName, data, overridesPosicion }) {
  const template = templates[templateName];

  if (!template || !template.elements) return null;

  return (
    <div
      style={{
        width: template.width || 1080,
        height: template.height || 1350,
        backgroundColor: template.background || "#ffffff",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {template.elements.map((element, index) => {
        // Elementos condicionales (ej: bloque de arquero) se filtran ANTES
        // de resolver sus campos, para no gastar trabajo en algo que no se ve.
        if (!cumpleCondicion(element.condicion, data)) return null;

        // Ocultado a mano por el usuario (independiente de `condicion`,
        // que es automático según el jugador; esto es una decisión manual).
        if (element.id && overridesPosicion?.[element.id]?.oculto) return null;

        // Clonamos y resolvemos cada propiedad del elemento.
        // Si un campo puntual falla al resolver (ej: dato inesperado en {a.b.c}),
        // no tiramos abajo todo el reporte: ese campo queda vacío y seguimos.
        const resolvedElement = {};
        Object.keys(element).forEach((key) => {
          if (key === "condicion") return; // no es una prop visual, no hace falta resolverla
          try {
            resolvedElement[key] = resolve(element[key], data);
          } catch (err) {
            console.warn(`No se pudo resolver "${key}" en el elemento ${index}:`, err);
            resolvedElement[key] = "";
          }
        });

        // Si el usuario movió este elemento a mano, la posición guardada
        // pisa la de la plantilla.
        if (element.id && overridesPosicion?.[element.id]) {
          resolvedElement.x = overridesPosicion[element.id].x;
          resolvedElement.y = overridesPosicion[element.id].y;
        }

        const Renderer = RENDERERS[resolvedElement.type];
        return Renderer ? <Renderer key={index} element={resolvedElement} /> : null;
      })}
    </div>
  );
}

export default React.memo(TemplateRenderer);