// src/reportes/components/Preview.jsx
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import TemplateRenderer from "../engine/TemplateRenderer";
import { templates } from "../templates";

const ANCHO_BASE = 1080;
const ALTO_BASE = 1350;

// Tamaño aproximado del elemento en el canvas real, para que la caja de
// arrastre cubra el elemento (no un punto diminuto imposible de agarrar).
function obtenerTamanioAprox(el) {
  if (el.type === "circle") {
    const d = (el.radius || 40) * 2;
    return { width: d, height: d };
  }
  if (el.type === "image" || el.type === "rectangle") {
    return { width: el.width || 80, height: el.height || 80 };
  }
  // texto: si no declaró width, calculamos algo razonable a partir del fontSize
  const alto = (el.fontSize || 20) * 1.6;
  const ancho = el.width || Math.max(120, (el.fontSize || 20) * 6);
  return { width: ancho, height: alto };
}

const Preview = forwardRef(function Preview(
  { templateName, data, cargando, modoEdicion, overridesPosicion, onMoverElemento, onToggleVisibilidad },
  canvasRef
) {
  const contenedorRef = useRef(null);
  const [escala, setEscala] = useState(1);
  const arrastreRef = useRef(null);
  const rafRef = useRef(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    const recalcularEscala = () => {
      const anchoDisponible = contenedor.clientWidth;
      if (anchoDisponible > 0) setEscala(Math.min(1, anchoDisponible / ANCHO_BASE));
    };

    recalcularEscala();
    const observer = new ResizeObserver(recalcularEscala);
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, []);

  // En modo edición mostramos el canvas a tamaño real (escala 1): así 1px
  // de mouse mueve exactamente 1px real, sin el salto que introduce
  // convertir movimiento de pantalla -> coordenadas reales con una escala
  // reducida. Fuera de edición, sigue viéndose achicado para entrar en pantalla.
  const escalaEfectiva = modoEdicion ? 1 : escala;

  // Solo los elementos que la plantilla marcó con `id` son "datos" movibles.
  const elementosEditables = useMemo(() => {
    const template = templates[templateName];
    if (!template?.elements) return [];
    return template.elements.filter((el) => el.id);
  }, [templateName]);

  const posicionActual = useCallback(
    (el) => {
      const override = overridesPosicion?.[el.id];
      return { x: override?.x ?? el.x, y: override?.y ?? el.y };
    },
    [overridesPosicion]
  );

  const aplicarMovimientoPendiente = useCallback(() => {
    rafRef.current = null;
    const pendiente = pendingRef.current;
    if (pendiente && onMoverElemento) {
      onMoverElemento(pendiente.id, { x: pendiente.x, y: pendiente.y });
    }
  }, [onMoverElemento]);

  const handlePointerMove = useCallback(
    (e) => {
      const arrastre = arrastreRef.current;
      if (!arrastre) return;
      const deltaX = (e.clientX - arrastre.startPointerX) / escalaEfectiva;
      const deltaY = (e.clientY - arrastre.startPointerY) / escalaEfectiva;
      pendingRef.current = {
        id: arrastre.id,
        x: Math.round(arrastre.baseX + deltaX),
        y: Math.round(arrastre.baseY + deltaY),
      };
      // Agrupamos todos los pointermove del frame en UNA sola actualización
      // de estado, en vez de una por evento — esto es lo que hacía sentir
      // el arrastre como "a los clicks" en vez de fluido.
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(aplicarMovimientoPendiente);
      }
    },
    [escalaEfectiva, aplicarMovimientoPendiente]
  );

  const handlePointerUp = useCallback((e) => {
    const objetivo = e.currentTarget;
    try {
      objetivo.releasePointerCapture(e.pointerId);
    } catch {
      // el navegador ya pudo haber liberado la captura; no pasa nada
    }
    objetivo.removeEventListener("pointermove", handlePointerMove);
    objetivo.removeEventListener("pointerup", handlePointerUp);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      aplicarMovimientoPendiente(); // aplicamos el último movimiento pendiente al soltar
    }
    arrastreRef.current = null;
    pendingRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePointerMove, aplicarMovimientoPendiente]);

  const handlePointerDown = useCallback(
    (el) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const objetivo = e.currentTarget;
      // Pointer capture: el navegador sigue mandándonos los eventos de este
      // puntero aunque se mueva muy rápido o salga del elemento. Sin esto,
      // perder el "agarre" a mitad de arrastre es justamente lo que se
      // siente como tener que volver a clickear para seguir moviendo.
      objetivo.setPointerCapture(e.pointerId);
      const { x, y } = posicionActual(el);
      arrastreRef.current = {
        id: el.id,
        startPointerX: e.clientX,
        startPointerY: e.clientY,
        baseX: x,
        baseY: y,
      };
      objetivo.addEventListener("pointermove", handlePointerMove);
      objetivo.addEventListener("pointerup", handlePointerUp);
    },
    [posicionActual, handlePointerMove, handlePointerUp]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (cargando) {
    return (
      <div style={estilos.contenedorVacio}>
        <style>{KEYFRAMES}</style>
        <div style={estilos.skeleton} />
      </div>
    );
  }

  return (
    <div
      ref={contenedorRef}
      style={{ ...estilos.contenedor, ...(modoEdicion ? estilos.contenedorEdicion : null) }}
    >
      <div
        style={{
          width: ANCHO_BASE * escalaEfectiva,
          height: ALTO_BASE * escalaEfectiva,
          position: "relative",
        }}
      >
        <div
          ref={canvasRef}
          style={{
            width: ANCHO_BASE,
            height: ALTO_BASE,
            transform: `scale(${escalaEfectiva})`,
            transformOrigin: "top left",
          }}
        >
          <TemplateRenderer
            templateName={templateName}
            data={data}
            overridesPosicion={overridesPosicion}
          />
        </div>

        {modoEdicion && (
          <div style={estilos.overlayEdicion}>
            {elementosEditables.map((el) => {
              const { x, y } = posicionActual(el);
              const oculto = !!overridesPosicion?.[el.id]?.oculto;
              const tam = obtenerTamanioAprox(el);
              return (
                <div
                  key={el.id}
                  onPointerDown={handlePointerDown(el)}
                  onDoubleClick={() => onToggleVisibilidad && onToggleVisibilidad(el.id, !oculto)}
                  title={`${el.id} — ${oculto ? "oculto (doble click para mostrar)" : "doble click para ocultar"}`}
                  style={{
                    ...estilos.caja,
                    opacity: oculto ? 0.35 : 1,
                    borderColor: oculto ? "#ff6b6b" : "#00e676",
                    background: oculto ? "rgba(255,107,107,0.12)" : "rgba(0,230,118,0.12)",
                    left: x * escalaEfectiva,
                    top: y * escalaEfectiva,
                    width: Math.max(tam.width * escalaEfectiva, 28),
                    height: Math.max(tam.height * escalaEfectiva, 28),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

const KEYFRAMES = `
@keyframes reportesShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

const estilos = {
  contenedor: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  contenedorEdicion: {
    overflow: "auto",
    maxHeight: "80vh",
    justifyContent: "flex-start",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  contenedorVacio: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: `${ANCHO_BASE} / ${ALTO_BASE}`,
    borderRadius: 16,
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    margin: "0 auto",
  },
  skeleton: {
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.03) 75%)",
    backgroundSize: "200% 100%",
    animation: "reportesShimmer 1.4s infinite linear",
  },
  overlayEdicion: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  },
  caja: {
    position: "absolute",
    border: "2px solid #00e676",
    borderRadius: 6,
    cursor: "grab",
    pointerEvents: "auto",
    touchAction: "none",
  },
};

export default Preview;