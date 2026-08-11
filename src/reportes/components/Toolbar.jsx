// src/reportes/components/Toolbar.jsx
import React, { useRef, useState } from "react";
import { exportarComoPNG } from "../engine/ExportPNG";
import TemplateRenderer from "../engine/TemplateRenderer";
import { templates } from "../templates";

const PLANTILLAS_DISPONIBLES = [
  { valor: "verde", etiqueta: "Verde" },
  { valor: "vintage", etiqueta: "Vintage" },
];

export default function Toolbar({
  jugadores,
  jugadorSeleccionadoId,
  setJugadorSeleccionadoId,
  templateSeleccionado,
  setTemplateSeleccionado,
  torneos,
  torneoSeleccionado,
  setTorneoSeleccionado,
  canvasRef,
  jugadorActual,
  dataReporte,
  onCambiarFoto,
  modoEdicion,
  setModoEdicion,
  capaEdicion,
  setCapaEdicion,
  grupo,
  onGuardarPosiciones,
  guardandoPosiciones,
  errorPosiciones,
  overridesPosicionActuales,
  onToggleVisibilidad,
}) {
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState(null);
  const inputFotoRef = useRef(null);

  const handleExportar = async () => {
    setErrorExport(null);
    setExportando(true);
    try {
      const apellido = (jugadorActual?.apellido || "reporte").toLowerCase();
      const nombreArchivo = `${apellido}_${templateSeleccionado}`;
      await exportarComoPNG(canvasRef, nombreArchivo);
    } catch (err) {
      console.error("Error exportando reporte:", err);
      setErrorExport("No se pudo exportar la imagen. Probá de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const handleCambiarFoto = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo || !onCambiarFoto) return;

    const lector = new FileReader();
    lector.onload = () => onCambiarFoto(lector.result);
    lector.readAsDataURL(archivo);

    e.target.value = "";
  };

  return (
    <div style={estilos.panel}>
      {/* Selector visual de plantillas: miniatura en vivo con los datos reales del jugador */}
      <div style={estilos.grupo}>
        <label style={estilos.label}>Plantilla</label>
        <div style={estilos.filaPlantillas}>
          {PLANTILLAS_DISPONIBLES.map((p) => {
            const activa = templateSeleccionado === p.valor;
            return (
              <button
                type="button"
                key={p.valor}
                onClick={() => setTemplateSeleccionado(p.valor)}
                style={{
                  ...estilos.miniatura,
                  borderColor: activa ? "#00e676" : "rgba(255,255,255,0.12)",
                }}
                title={p.etiqueta}
              >
                <div style={estilos.miniaturaViewport}>
                  <div style={estilos.miniaturaEscala}>
                    {dataReporte && (
                      <TemplateRenderer templateName={p.valor} data={dataReporte} />
                    )}
                  </div>
                </div>
                <span style={estilos.miniaturaEtiqueta}>{p.etiqueta}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={estilos.grupo}>
        <label style={estilos.label}>Torneo</label>
        <select
          style={estilos.select}
          value={torneoSeleccionado}
          onChange={(e) => setTorneoSeleccionado(e.target.value)}
        >
          <option value="">Todos</option>
          {torneos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>

      <div style={estilos.grupo}>
        <label style={estilos.label}>Jugador</label>
        <select
          style={estilos.select}
          value={jugadorSeleccionadoId}
          onChange={(e) => setJugadorSeleccionadoId(e.target.value)}
          disabled={jugadores.length === 0}
        >
          {jugadores.map((j) => (
            <option key={j.id} value={j.id}>
              #{j.dorsal ?? "--"} {j.nombre} {j.apellido}
            </option>
          ))}
        </select>
      </div>

      <div style={estilos.grupo}>
        <label style={estilos.label}>Foto del jugador</label>
        <button type="button" style={estilos.botonSecundario} onClick={() => inputFotoRef.current?.click()}>
          Cambiar foto
        </button>
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleCambiarFoto}
        />
      </div>

      <div style={estilos.grupo}>
        <label style={estilos.label}>Diseño de la plantilla</label>
        <div style={estilos.filaBotones}>
          <button
            type="button"
            style={{
              ...estilos.botonSecundario,
              background: modoEdicion ? "#00e676" : "#111",
              color: modoEdicion ? "#000" : "#fff",
            }}
            onClick={() => setModoEdicion(!modoEdicion)}
          >
            {modoEdicion ? "Salir de edición" : "Mover elementos"}
          </button>
        </div>

        {modoEdicion && (
          <>
            <div style={{ ...estilos.filaBotones, marginTop: 8 }}>
              <button
                type="button"
                style={{
                  ...estilos.botonSecundario,
                  background: capaEdicion === "grupo" ? "#00e676" : "#111",
                  color: capaEdicion === "grupo" ? "#000" : "#fff",
                }}
                onClick={() => setCapaEdicion("grupo")}
                title={`Afecta a todos los jugadores del grupo "${grupo}" con esta plantilla`}
              >
                Diseño: {grupo === "arquero" ? "Arqueros" : "Jugadores de campo"}
              </button>
              <button
                type="button"
                style={{
                  ...estilos.botonSecundario,
                  background: capaEdicion === "jugador" ? "#00e676" : "#111",
                  color: capaEdicion === "jugador" ? "#000" : "#fff",
                }}
                onClick={() => setCapaEdicion("jugador")}
                title="Afecta solo a este jugador puntual"
              >
                Solo este jugador
              </button>
            </div>

            <div style={{ ...estilos.filaBotones, marginTop: 8 }}>
              <button
                type="button"
                style={{ ...estilos.botonSecundario, opacity: guardandoPosiciones ? 0.6 : 1 }}
                onClick={onGuardarPosiciones}
                disabled={guardandoPosiciones}
              >
                {guardandoPosiciones ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </>
        )}

        {errorPosiciones && <p style={estilos.error}>{errorPosiciones}</p>}
      </div>

      {modoEdicion && (
        <PanelElementos
          templateName={templateSeleccionado}
          overridesPosicion={overridesPosicionActuales}
          onToggleVisibilidad={onToggleVisibilidad}
        />
      )}

      <button
        type="button"
        style={{
          ...estilos.boton,
          opacity: exportando ? 0.6 : 1,
          cursor: exportando ? "wait" : "pointer",
        }}
        onClick={handleExportar}
        disabled={exportando || jugadores.length === 0}
      >
        {exportando ? "Exportando..." : "Descargar PNG"}
      </button>

      {errorExport && <p style={estilos.error}>{errorExport}</p>}
    </div>
  );
}

// Lista de TODOS los elementos de la plantilla activa con un checkbox para
// mostrar/ocultar cada uno — la misma acción que el doble-click en el
// canvas, pero como lista completa (más fácil de repasar que ir elemento
// por elemento sobre el dibujo).
function PanelElementos({ templateName, overridesPosicion, onToggleVisibilidad }) {
  const template = templates[templateName];
  const elementos = (template?.elements || []).filter((el) => el.id);
  if (elementos.length === 0) return null;

  const datos = elementos.filter((el) => !el.id.startsWith("deco-"));
  const decorativos = elementos.filter((el) => el.id.startsWith("deco-"));

  const renderFila = (el) => {
    const oculto = !!overridesPosicion?.[el.id]?.oculto;
    return (
      <label key={el.id} style={estilos.filaCheckbox}>
        <input
          type="checkbox"
          checked={!oculto}
          onChange={() => onToggleVisibilidad && onToggleVisibilidad(el.id, !oculto)}
        />
        <span style={{ opacity: oculto ? 0.5 : 1 }}>{el.id}</span>
      </label>
    );
  };

  return (
    <div style={{ ...estilos.grupo, minWidth: "100%" }}>
      <label style={estilos.label}>Elementos visibles</label>
      <div style={estilos.panelElementos}>
        <div>
          <div style={estilos.subtitulo}>Datos</div>
          {datos.map(renderFila)}
        </div>
        <div>
          <div style={estilos.subtitulo}>Decorativos</div>
          {decorativos.map(renderFila)}
        </div>
      </div>
    </div>
  );
}

const estilos = {
  panel: {
    display: "flex",
    flexWrap: "wrap",
    gap: 20,
    alignItems: "flex-end",
    padding: 20,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  grupo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 180,
    flex: "1 1 180px",
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.6)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    padding: "10px 12px",
    borderRadius: 10,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
  },
  filaPlantillas: {
    display: "flex",
    gap: 10,
  },
  filaBotones: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  miniatura: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    alignItems: "center",
    background: "transparent",
    border: "2px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 4,
    cursor: "pointer",
  },
  miniaturaViewport: {
    width: 64,
    height: 80,
    overflow: "hidden",
    borderRadius: 6,
    background: "#000",
  },
  miniaturaEscala: {
    width: 1080,
    height: 1350,
    transform: "scale(0.0593)",
    transformOrigin: "top left",
    pointerEvents: "none",
  },
  miniaturaEtiqueta: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
  botonSecundario: {
    padding: "10px 16px",
    borderRadius: 10,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    cursor: "pointer",
  },
  boton: {
    padding: "12px 24px",
    borderRadius: 10,
    background: "#00e676",
    color: "#000",
    fontWeight: 800,
    border: "none",
    fontSize: 14,
  },
  error: {
    color: "#ff6b6b",
    fontSize: 13,
    width: "100%",
    margin: 0,
  },
  panelElementos: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    padding: 12,
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    maxHeight: 220,
    overflowY: "auto",
  },
  subtitulo: {
    fontSize: 11,
    fontWeight: 800,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  },
  filaCheckbox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#fff",
    padding: "4px 0",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
  },
};