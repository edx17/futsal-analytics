// src/reportes/components/Preview.jsx
import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import TemplateRenderer from "../engine/TemplateRenderer";
import { componer, medidaAproximada } from "../engine/documento";

const ANCHO_BASE = 1080;
const ALTO_BASE = 1350;
// Nota: el snapping y el viewport siguen asumiendo 1080x1350. Todas las
// plantillas (base y del club) se crean con esa medida; si algún día se
// permite otro tamaño, esto tiene que leerlo de la plantilla.
const UMBRAL_SNAP = 8; // en px reales del canvas

// Handles de resize según el tipo de elemento.
const HANDLES_POR_TIPO = {
  rectangle: ["nw", "n", "ne", "e", "se", "s", "sw", "w"],
  image: ["nw", "n", "ne", "e", "se", "s", "sw", "w"],
  circle: ["se"],
  text: ["e", "w"], // el texto se estira en ancho; el tamaño va por fontSize
};

const CURSOR_HANDLE = {
  nw: "nwse-resize", se: "nwse-resize",
  ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize",
  e: "ew-resize", w: "ew-resize",
};

/** Calcula el ajuste a guías: bordes/centro del canvas y bordes de los demás. */
function calcularSnap(caja, otros) {
  const guias = [];
  let ajusteX = 0;
  let ajusteY = 0;
  let mejorX = UMBRAL_SNAP + 1;
  let mejorY = UMBRAL_SNAP + 1;

  const candidatosX = [0, ANCHO_BASE / 2, ANCHO_BASE];
  const candidatosY = [0, ALTO_BASE / 2, ALTO_BASE];

  otros.forEach((o) => {
    candidatosX.push(o.x, o.x + o.width / 2, o.x + o.width);
    candidatosY.push(o.y, o.y + o.height / 2, o.y + o.height);
  });

  const bordesX = [caja.x, caja.x + caja.width / 2, caja.x + caja.width];
  const bordesY = [caja.y, caja.y + caja.height / 2, caja.y + caja.height];

  bordesX.forEach((borde) => {
    candidatosX.forEach((c) => {
      const d = c - borde;
      if (Math.abs(d) <= UMBRAL_SNAP && Math.abs(d) < Math.abs(mejorX)) {
        mejorX = d;
        ajusteX = d;
        guias.push({ eje: "x", pos: c });
      }
    });
  });

  bordesY.forEach((borde) => {
    candidatosY.forEach((c) => {
      const d = c - borde;
      if (Math.abs(d) <= UMBRAL_SNAP && Math.abs(d) < Math.abs(mejorY)) {
        mejorY = d;
        ajusteY = d;
        guias.push({ eje: "y", pos: c });
      }
    });
  });

  return {
    x: Math.abs(mejorX) <= UMBRAL_SNAP ? ajusteX : 0,
    y: Math.abs(mejorY) <= UMBRAL_SNAP ? ajusteY : 0,
    guias: guias.filter(
      (g) =>
        (g.eje === "x" && Math.abs(mejorX) <= UMBRAL_SNAP) ||
        (g.eje === "y" && Math.abs(mejorY) <= UMBRAL_SNAP)
    ),
  };
}

const Preview = forwardRef(function Preview(
  {
    template,
    data,
    cargando,
    modoEdicion,
    documento,
    zoom = 0.6,
    seleccionId,
    onSeleccionar,
    onEditarElemento,
    onBorrarElemento,
    snapActivo = true,
  },
  canvasRef
) {
  const contenedorRef = useRef(null);
  const [escalaAuto, setEscalaAuto] = useState(1);
  const [guias, setGuias] = useState([]);
  const [editandoTexto, setEditandoTexto] = useState(null);

  const gestoRef = useRef(null);
  const rafRef = useRef(null);
  const pendienteRef = useRef(null);

  // Escala automática solo fuera de edición; en edición manda el zoom elegido.
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    const recalcular = () => {
      const ancho = contenedor.clientWidth;
      if (ancho > 0) setEscalaAuto(Math.min(1, ancho / ANCHO_BASE));
    };
    recalcular();
    const observer = new ResizeObserver(recalcular);
    observer.observe(contenedor);
    return () => observer.disconnect();
  }, []);

  // Un prop faltante nunca debe llegar a una coordenada: sin este guard,
  // `x * undefined` produce NaN y React descarta el estilo entero.
  const escalaCruda = modoEdicion ? zoom : escalaAuto;
  const escala = Number.isFinite(escalaCruda) && escalaCruda > 0 ? escalaCruda : 1;

  // Elementos ya compuestos (base + patches + extras), en orden de zIndex.
  const elementos = useMemo(() => {
    if (!template) return [];
    return componer(template, documento).filter((el) => el.id && !el.oculto);
  }, [template, documento]);

  const cajaDe = useCallback((el) => {
    const medida = medidaAproximada(el);
    return {
      x: Number(el.x) || 0,
      y: Number(el.y) || 0,
      width: medida.width,
      height: medida.height,
    };
  }, []);

  const seleccionado = elementos.find((el) => el.id === seleccionId) || null;

  // ----------------------------------------------------------------
  // Aplicación diferida por frame (un solo setState por frame de arrastre)
  // ----------------------------------------------------------------
  const aplicarPendiente = useCallback(() => {
    rafRef.current = null;
    const p = pendienteRef.current;
    if (p && onEditarElemento) onEditarElemento(p.id, p.patch, { agrupar: true });
  }, [onEditarElemento]);

  const encolar = useCallback(
    (id, patch) => {
      pendienteRef.current = { id, patch };
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(aplicarPendiente);
    },
    [aplicarPendiente]
  );

  // ----------------------------------------------------------------
  // Arrastre y resize
  // ----------------------------------------------------------------
  const handlePointerMove = useCallback(
    (e) => {
      const gesto = gestoRef.current;
      if (!gesto) return;

      const dx = (e.clientX - gesto.px) / escala;
      const dy = (e.clientY - gesto.py) / escala;

      if (gesto.tipo === "mover") {
        let x = Math.round(gesto.base.x + dx);
        let y = Math.round(gesto.base.y + dy);

        if (snapActivo && !e.altKey) {
          const snap = calcularSnap(
            { x, y, width: gesto.base.width, height: gesto.base.height },
            gesto.otros
          );
          x += snap.x;
          y += snap.y;
          setGuias(snap.guias);
        } else {
          setGuias([]);
        }

        encolar(gesto.id, { x, y });
        return;
      }

      // resize
      const dir = gesto.tipo;
      const patch = {};
      const b = gesto.base;

      if (gesto.elementoTipo === "circle") {
        const nuevoRadio = Math.max(8, Math.round(gesto.radio + Math.max(dx, dy) / 2));
        patch.radius = nuevoRadio;
      } else if (gesto.elementoTipo === "text") {
        if (dir.includes("e")) patch.width = Math.max(40, Math.round(b.width + dx));
        if (dir.includes("w")) {
          patch.width = Math.max(40, Math.round(b.width - dx));
          patch.x = Math.round(b.x + dx);
        }
      } else {
        if (dir.includes("e")) patch.width = Math.max(8, Math.round(b.width + dx));
        if (dir.includes("s")) patch.height = Math.max(8, Math.round(b.height + dy));
        if (dir.includes("w")) {
          patch.width = Math.max(8, Math.round(b.width - dx));
          patch.x = Math.round(b.x + dx);
        }
        if (dir.includes("n")) {
          patch.height = Math.max(8, Math.round(b.height - dy));
          patch.y = Math.round(b.y + dy);
        }
      }

      encolar(gesto.id, patch);
    },
    [escala, snapActivo, encolar]
  );

  const handlePointerUp = useCallback(
    (e) => {
      const objetivo = e.currentTarget;
      try {
        objetivo.releasePointerCapture(e.pointerId);
      } catch {
        // el navegador ya liberó la captura
      }
      objetivo.removeEventListener("pointermove", handlePointerMove);
      objetivo.removeEventListener("pointerup", handlePointerUp);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        aplicarPendiente();
      }
      gestoRef.current = null;
      pendienteRef.current = null;
      setGuias([]);
    },
    [handlePointerMove, aplicarPendiente]
  );

  const iniciarGesto = useCallback(
    (el, tipo) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      const objetivo = e.currentTarget;
      objetivo.setPointerCapture(e.pointerId);

      // La primera edición del gesto NO se agrupa: así el undo vuelve al
      // estado previo al gesto completo, no al medio del arrastre.
      if (onEditarElemento) onEditarElemento(el.id, {}, { agrupar: false });
      if (onSeleccionar) onSeleccionar(el.id);

      gestoRef.current = {
        id: el.id,
        tipo,
        elementoTipo: el.type,
        px: e.clientX,
        py: e.clientY,
        base: cajaDe(el),
        radio: Number(el.radius) || 40,
        otros: elementos.filter((o) => o.id !== el.id).map(cajaDe),
      };

      objetivo.addEventListener("pointermove", handlePointerMove);
      objetivo.addEventListener("pointerup", handlePointerUp);
    },
    [cajaDe, elementos, handlePointerMove, handlePointerUp, onEditarElemento, onSeleccionar]
  );

  // ----------------------------------------------------------------
  // Teclado: flechas para mover, Delete para borrar, Escape para deseleccionar
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!modoEdicion || !seleccionado) return;

    const onKeyDown = (e) => {
      const enCampo = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (enCampo) return;

      const paso = e.shiftKey ? 10 : 1;
      const x = Number(seleccionado.x) || 0;
      const y = Number(seleccionado.y) || 0;

      if (e.key === "ArrowLeft") { e.preventDefault(); onEditarElemento(seleccionado.id, { x: x - paso }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onEditarElemento(seleccionado.id, { x: x + paso }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); onEditarElemento(seleccionado.id, { y: y - paso }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); onEditarElemento(seleccionado.id, { y: y + paso }); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onBorrarElemento(seleccionado.id); }
      else if (e.key === "Escape") { onSeleccionar(null); }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modoEdicion, seleccionado, onEditarElemento, onBorrarElemento, onSeleccionar]);

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

  const cajaSeleccion = seleccionado ? cajaDe(seleccionado) : null;
  const handles = seleccionado ? HANDLES_POR_TIPO[seleccionado.type] || [] : [];

  return (
    <div
      ref={contenedorRef}
      style={{ ...estilos.contenedor, ...(modoEdicion ? estilos.contenedorEdicion : null) }}
    >
      <div
        style={{
          width: ANCHO_BASE * escala,
          height: ALTO_BASE * escala,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* El nodo que exporta html2canvas: siempre a 1080x1350 reales */}
        <div
          ref={canvasRef}
          style={{
            width: ANCHO_BASE,
            height: ALTO_BASE,
            transform: `scale(${escala})`,
            transformOrigin: "top left",
          }}
        >
          <TemplateRenderer template={template} data={data} documento={documento} />
        </div>

        {modoEdicion && (
          <div
            style={estilos.overlay}
            onPointerDown={() => onSeleccionar && onSeleccionar(null)}
          >
            {/* Zonas de agarre, una por elemento */}
            {elementos.map((el) => {
              const caja = cajaDe(el);
              const activo = el.id === seleccionId;
              return (
                <div
                  key={el.id}
                  onPointerDown={iniciarGesto(el, "mover")}
                  onDoubleClick={() => el.type === "text" && setEditandoTexto(el.id)}
                  title={el.id}
                  style={{
                    ...estilos.zona,
                    left: caja.x * escala,
                    top: caja.y * escala,
                    width: Math.max(caja.width * escala, 20),
                    height: Math.max(caja.height * escala, 20),
                    outline: activo ? "2px solid #00e676" : "1px dashed rgba(255,255,255,0.25)",
                    background: activo ? "rgba(0,230,118,0.10)" : "transparent",
                  }}
                />
              );
            })}

            {/* Handles de resize del elemento seleccionado */}
            {cajaSeleccion &&
              handles.map((dir) => {
                const izq = dir.includes("w") ? 0 : dir.includes("e") ? cajaSeleccion.width : cajaSeleccion.width / 2;
                const arr = dir.includes("n") ? 0 : dir.includes("s") ? cajaSeleccion.height : cajaSeleccion.height / 2;
                return (
                  <div
                    key={dir}
                    onPointerDown={iniciarGesto(seleccionado, dir)}
                    style={{
                      ...estilos.handle,
                      cursor: CURSOR_HANDLE[dir],
                      left: (cajaSeleccion.x + izq) * escala - 6,
                      top: (cajaSeleccion.y + arr) * escala - 6,
                    }}
                  />
                );
              })}

            {/* Guías de alineación */}
            {guias.map((g, i) =>
              g.eje === "x" ? (
                <div key={`gx-${i}`} style={{ ...estilos.guia, left: g.pos * escala, top: 0, width: 1, height: "100%" }} />
              ) : (
                <div key={`gy-${i}`} style={{ ...estilos.guia, top: g.pos * escala, left: 0, height: 1, width: "100%" }} />
              )
            )}

            {/* Edición de texto sobre el canvas */}
            {editandoTexto && (() => {
              const el = elementos.find((e) => e.id === editandoTexto);
              if (!el) return null;
              const caja = cajaDe(el);
              return (
                <textarea
                  autoFocus
                  defaultValue={el.text || ""}
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    onEditarElemento(el.id, { text: e.target.value });
                    setEditandoTexto(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditandoTexto(null);
                    e.stopPropagation();
                  }}
                  style={{
                    position: "absolute",
                    left: caja.x * escala,
                    top: caja.y * escala,
                    width: Math.max(caja.width * escala, 120),
                    height: Math.max(caja.height * escala, 40),
                    pointerEvents: "auto",
                    fontFamily: el.fontFamily || "Arial",
                    fontSize: (Number(el.fontSize) || 20) * escala,
                    lineHeight: el.lineHeight || 1.2,
                    color: "#fff",
                    background: "rgba(0,0,0,0.85)",
                    border: "2px solid #00e676",
                    borderRadius: 4,
                    padding: 2,
                    resize: "none",
                  }}
                />
              );
            })()}
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
    maxHeight: "78vh",
    justifyContent: "flex-start",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    background:
      "repeating-conic-gradient(#141414 0% 25%, #1c1c1c 0% 50%) 50% / 24px 24px",
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
  overlay: {
    position: "absolute",
    inset: 0,
    pointerEvents: "auto",
  },
  zona: {
    position: "absolute",
    borderRadius: 4,
    cursor: "grab",
    pointerEvents: "auto",
    touchAction: "none",
  },
  handle: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 3,
    background: "#00e676",
    border: "2px solid #000",
    pointerEvents: "auto",
    touchAction: "none",
  },
  guia: {
    position: "absolute",
    background: "#ff2d95",
    pointerEvents: "none",
  },
};

export default Preview;