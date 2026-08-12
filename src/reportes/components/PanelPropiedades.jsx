// src/reportes/components/PanelPropiedades.jsx
import React, { useRef } from "react";
import { GRUPOS_CAMPOS, FUENTES } from "../engine/campos";

/**
 * Panel contextual del elemento seleccionado. Muestra solo las props que
 * aplican a su `type`, y escribe cada cambio como patch en la capa activa.
 */
export default function PanelPropiedades({
  elemento,
  onEditar,
  onBorrar,
  onRestaurar,
  onDuplicar,
}) {
  const textareaRef = useRef(null);

  if (!elemento) {
    return (
      <aside style={estilos.panel}>
        <p style={estilos.vacio}>
          Elegí un elemento del reporte para editarlo. Doble click sobre un texto lo abre
          para escribir.
        </p>
      </aside>
    );
  }

  const editar = (prop) => (e) => {
    const bruto = e.target.value;
    const numericas = ["fontSize", "width", "height", "radius", "zIndex", "rotate", "lineHeight", "borderRadius"];
    const valor = numericas.includes(prop) && bruto !== "" ? Number(bruto) : bruto;
    onEditar(elemento.id, { [prop]: valor });
  };

  const insertarCampo = (path) => {
    const area = textareaRef.current;
    const texto = String(elemento.text ?? "");
    const inicio = area?.selectionStart ?? texto.length;
    const fin = area?.selectionEnd ?? texto.length;
    const nuevo = `${texto.slice(0, inicio)}{${path}}${texto.slice(fin)}`;
    onEditar(elemento.id, { text: nuevo });
  };

  const esBase = elemento.__origen === "base";

  return (
    <aside style={estilos.panel}>
      <header style={estilos.header}>
        <span style={estilos.tipo}>{ETIQUETA_TIPO[elemento.type] || elemento.type}</span>
        <code style={estilos.id}>{elemento.id}</code>
      </header>

      {/* ---------- Posición y tamaño (todos los tipos) ---------- */}
      <Seccion titulo="Posición">
        <Fila>
          <Campo label="X"><input type="number" style={estilos.input} value={elemento.x ?? 0} onChange={editar("x")} /></Campo>
          <Campo label="Y"><input type="number" style={estilos.input} value={elemento.y ?? 0} onChange={editar("y")} /></Campo>
        </Fila>
        <Fila>
          {elemento.type === "circle" ? (
            <Campo label="Radio"><input type="number" style={estilos.input} value={elemento.radius ?? 40} onChange={editar("radius")} /></Campo>
          ) : (
            <>
              <Campo label="Ancho"><input type="number" style={estilos.input} value={elemento.width ?? ""} onChange={editar("width")} /></Campo>
              {elemento.type !== "text" && (
                <Campo label="Alto"><input type="number" style={estilos.input} value={elemento.height ?? ""} onChange={editar("height")} /></Campo>
              )}
            </>
          )}
        </Fila>
        <Fila>
          <Campo label="Capa (z)"><input type="number" style={estilos.input} value={elemento.zIndex ?? 1} onChange={editar("zIndex")} /></Campo>
          <Campo label="Rotación"><input type="number" style={estilos.input} value={elemento.rotate ?? 0} onChange={editar("rotate")} /></Campo>
        </Fila>
      </Seccion>

      {/* ---------- Texto ---------- */}
      {elemento.type === "text" && (
        <>
          <Seccion titulo="Contenido">
            <textarea
              ref={textareaRef}
              style={estilos.textarea}
              rows={3}
              value={elemento.text ?? ""}
              onChange={editar("text")}
            />
            <label style={estilos.label}>Insertar dato</label>
            <select
              style={estilos.select}
              value=""
              onChange={(e) => {
                if (e.target.value) insertarCampo(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Elegir un dato…</option>
              {GRUPOS_CAMPOS.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.campos.map((c) => (
                    <option key={c.path} value={c.path}>{c.etiqueta}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Seccion>

          <Seccion titulo="Tipografía">
            <Campo label="Fuente">
              <select style={estilos.select} value={elemento.fontFamily || "Anton"} onChange={editar("fontFamily")}>
                {FUENTES.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}
              </select>
            </Campo>
            <Fila>
              <Campo label="Tamaño"><input type="number" style={estilos.input} value={elemento.fontSize ?? 20} onChange={editar("fontSize")} /></Campo>
              <Campo label="Peso">
                <select style={estilos.select} value={elemento.fontWeight ?? 400} onChange={editar("fontWeight")}>
                  {[300, 400, 600, 700, 800, 900].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
            </Fila>
            <Fila>
              <Campo label="Alineación">
                <select style={estilos.select} value={elemento.align || "left"} onChange={editar("align")}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </select>
              </Campo>
              <Campo label="Mayúsculas">
                <select style={estilos.select} value={elemento.textTransform || "none"} onChange={editar("textTransform")}>
                  <option value="none">Como está</option>
                  <option value="uppercase">MAYÚSCULAS</option>
                  <option value="lowercase">minúsculas</option>
                </select>
              </Campo>
            </Fila>
            <Fila>
              <Campo label="Interlineado"><input type="number" step="0.05" style={estilos.input} value={elemento.lineHeight ?? 1.2} onChange={editar("lineHeight")} /></Campo>
              <Campo label="Tracking"><input style={estilos.input} value={elemento.letterSpacing ?? ""} placeholder="-2px" onChange={editar("letterSpacing")} /></Campo>
            </Fila>
            <Fila>
              <Campo label="Color"><input type="color" style={estilos.color} value={normalizarColor(elemento.color, "#ffffff")} onChange={editar("color")} /></Campo>
              <Campo label="Sombra"><input style={estilos.input} value={elemento.textShadow ?? ""} placeholder="2px 2px 0 #000" onChange={editar("textShadow")} /></Campo>
            </Fila>
          </Seccion>
        </>
      )}

      {/* ---------- Rectángulo y círculo ---------- */}
      {(elemento.type === "rectangle" || elemento.type === "circle") && (
        <Seccion titulo="Relleno y borde">
          <Fila>
            <Campo label="Color"><input type="color" style={estilos.color} value={normalizarColor(elemento.color, "#e2f018")} onChange={editar("color")} /></Campo>
            <Campo label="Opacidad"><input type="range" min="0" max="1" step="0.05" style={estilos.input} value={elemento.opacity ?? 1} onChange={editar("opacity")} /></Campo>
          </Fila>
          <Campo label="Borde"><input style={estilos.input} value={elemento.border ?? ""} placeholder="5px solid #000" onChange={editar("border")} /></Campo>
          {elemento.type === "rectangle" && (
            <Fila>
              <Campo label="Esquinas"><input type="number" style={estilos.input} value={elemento.borderRadius ?? 0} onChange={editar("borderRadius")} /></Campo>
              <Campo label="Sombra"><input style={estilos.input} value={elemento.shadow ?? ""} placeholder="0 4px 12px #0006" onChange={editar("shadow")} /></Campo>
            </Fila>
          )}
          <Campo label="Transparente">
            <button
              type="button"
              style={estilos.botonChico}
              onClick={() => onEditar(elemento.id, { color: "transparent" })}
            >
              Sacar relleno
            </button>
          </Campo>
        </Seccion>
      )}

      {/* ---------- Imagen ---------- */}
      {elemento.type === "image" && (
        <Seccion titulo="Imagen">
          <Campo label="Origen (URL o dato)">
            <input style={estilos.input} value={elemento.src ?? ""} placeholder="{jugador.foto}" onChange={editar("src")} />
          </Campo>
          <Fila>
            <Campo label="Ajuste">
              <select style={estilos.select} value={elemento.objectFit || "contain"} onChange={editar("objectFit")}>
                <option value="contain">Entero</option>
                <option value="cover">Recortado</option>
                <option value="fill">Estirado</option>
              </select>
            </Campo>
            <Campo label="Mezcla">
              <select style={estilos.select} value={elemento.mixBlendMode || "normal"} onChange={editar("mixBlendMode")}>
                <option value="normal">Normal</option>
                <option value="screen">Screen (borra el negro)</option>
                <option value="multiply">Multiply (borra el blanco)</option>
                <option value="overlay">Overlay</option>
              </select>
            </Campo>
          </Fila>
          <Fila>
            <Campo label="Opacidad"><input type="range" min="0" max="1" step="0.05" style={estilos.input} value={elemento.opacity ?? 1} onChange={editar("opacity")} /></Campo>
            <Campo label="Esquinas"><input type="number" style={estilos.input} value={elemento.borderRadius ?? 0} onChange={editar("borderRadius")} /></Campo>
          </Fila>
        </Seccion>
      )}

      {/* ---------- Acciones ---------- */}
      <Seccion titulo="Acciones">
        <div style={estilos.filaBotones}>
          <button type="button" style={estilos.botonChico} onClick={() => onDuplicar(elemento)}>
            Duplicar
          </button>
          {esBase && (
            <button type="button" style={estilos.botonChico} onClick={() => onRestaurar(elemento.id)}>
              Volver al original
            </button>
          )}
          <button type="button" style={estilos.botonPeligro} onClick={() => onBorrar(elemento.id)}>
            Quitar
          </button>
        </div>
      </Seccion>
    </aside>
  );
}

const ETIQUETA_TIPO = {
  text: "Texto",
  image: "Imagen",
  rectangle: "Rectángulo",
  circle: "Círculo",
};

/** <input type="color"> solo entiende hex; devolvemos un fallback si no lo es. */
function normalizarColor(valor, fallback) {
  if (typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor)) return valor;
  if (typeof valor === "string" && /^#[0-9a-f]{3}$/i.test(valor)) {
    return "#" + valor.slice(1).split("").map((c) => c + c).join("");
  }
  return fallback;
}

function Seccion({ titulo, children }) {
  return (
    <section style={estilos.seccion}>
      <h3 style={estilos.tituloSeccion}>{titulo}</h3>
      <div style={estilos.contenidoSeccion}>{children}</div>
    </section>
  );
}

function Fila({ children }) {
  return <div style={estilos.fila}>{children}</div>;
}

function Campo({ label, children }) {
  return (
    <div style={estilos.campo}>
      <label style={estilos.label}>{label}</label>
      {children}
    </div>
  );
}

const estilos = {
  panel: {
    width: 300,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    maxHeight: "78vh",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  tipo: { fontSize: 15, fontWeight: 800, color: "#fff" },
  id: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "'JetBrains Mono', monospace" },
  vacio: { fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, margin: 0 },
  seccion: { paddingTop: 12 },
  tituloSeccion: {
    fontSize: 11,
    fontWeight: 800,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 8px",
  },
  contenidoSeccion: { display: "flex", flexDirection: "column", gap: 8 },
  fila: { display: "flex", gap: 8 },
  campo: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 },
  label: { fontSize: 11, color: "rgba(255,255,255,0.55)" },
  input: {
    width: "100%",
    padding: "7px 9px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    boxSizing: "border-box",
  },
  select: {
    width: "100%",
    padding: "7px 9px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    resize: "vertical",
    boxSizing: "border-box",
  },
  color: {
    width: "100%",
    height: 34,
    padding: 2,
    borderRadius: 8,
    background: "#111",
    border: "1px solid rgba(255,255,255,0.12)",
    boxSizing: "border-box",
  },
  filaBotones: { display: "flex", gap: 8, flexWrap: "wrap" },
  botonChico: {
    padding: "7px 12px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
    cursor: "pointer",
  },
  botonPeligro: {
    padding: "7px 12px",
    borderRadius: 8,
    background: "rgba(255,107,107,0.15)",
    color: "#ff8f8f",
    border: "1px solid rgba(255,107,107,0.4)",
    fontSize: 12,
    cursor: "pointer",
  },
};