// src/reportes/components/Toolbar.jsx
import React, { useRef, useState } from "react";
import { exportarComoPNG } from "../engine/ExportPNG";
import TemplateRenderer from "../engine/TemplateRenderer";

/**
 * Barra superior: qué se está viendo y las dos acciones principales.
 * Todo lo que es edición vive en BarraEdicion y en los paneles laterales.
 */
export default function Toolbar({
  jugadores,
  jugadorSeleccionadoId,
  setJugadorSeleccionadoId,
  catalogo,
  templateSeleccionado,
  setTemplateSeleccionado,
  onNuevaPlantilla,
  onBorrarPlantilla,
  torneos,
  torneoSeleccionado,
  setTorneoSeleccionado,
  canvasRef,
  jugadorActual,
  dataReporte,
  onCambiarFoto,
  modoEdicion,
  setModoEdicion,
}) {
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState(null);
  const inputFotoRef = useRef(null);

  const entradas = Object.values(catalogo || {});
  const activa = catalogo?.[templateSeleccionado];

  const handleExportar = async () => {
    setErrorExport(null);
    setExportando(true);
    try {
      const apellido = (jugadorActual?.apellido || "reporte").toLowerCase();
      await exportarComoPNG(canvasRef, `${apellido}_${templateSeleccionado}`);
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
      <div style={estilos.campoPlantillas}>
        <label style={estilos.label}>Plantilla</label>
        <div style={estilos.tira}>
          {entradas.map((p) => {
            const seleccionada = templateSeleccionado === p.slug;
            return (
              <button
                type="button"
                key={p.slug}
                onClick={() => setTemplateSeleccionado(p.slug)}
                style={{ ...estilos.miniatura, borderColor: seleccionada ? "#00e676" : "rgba(255,255,255,0.12)" }}
                title={p.esBase ? p.nombre : `${p.nombre} (del club)`}
              >
                <div style={estilos.miniaturaViewport}>
                  <div style={estilos.miniaturaEscala}>
                    {dataReporte && <TemplateRenderer template={p} data={dataReporte} />}
                  </div>
                </div>
                <span style={estilos.miniaturaEtiqueta}>
                  {p.nombre.length > 9 ? `${p.nombre.slice(0, 9)}…` : p.nombre}
                </span>
                {!p.esBase && <span style={estilos.puntoClub} title="Plantilla del club" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onNuevaPlantilla}
            style={{ ...estilos.miniatura, ...estilos.miniaturaNueva }}
            title="Crear una plantilla desde cero"
          >
            <span style={estilos.mas}>+</span>
            <span style={estilos.miniaturaEtiqueta}>Nueva</span>
          </button>
        </div>
      </div>

      <div style={estilos.campo}>
        <label style={estilos.label}>Jugador</label>
        <select
          style={estilos.select}
          value={jugadorSeleccionadoId}
          onChange={(e) => setJugadorSeleccionadoId(e.target.value)}
          disabled={jugadores.length === 0}
        >
          {jugadores.map((j) => (
            <option key={j.id} value={j.id}>#{j.dorsal ?? "--"} {j.nombre} {j.apellido}</option>
          ))}
        </select>
      </div>

      <div style={estilos.campo}>
        <label style={estilos.label}>Torneo</label>
        <select style={estilos.select} value={torneoSeleccionado} onChange={(e) => setTorneoSeleccionado(e.target.value)}>
          <option value="">Todos</option>
          {torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div style={estilos.campo}>
        <label style={estilos.label}>Foto</label>
        <button type="button" style={estilos.botonSecundario} onClick={() => inputFotoRef.current?.click()}>
          Cambiar foto
        </button>
        <input ref={inputFotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleCambiarFoto} />
      </div>

      <div style={estilos.acciones}>
        {activa && !activa.esBase && (
          <button
            type="button"
            style={estilos.botonPeligro}
            onClick={() => onBorrarPlantilla(activa.slug, activa.nombre)}
            title="Borrar esta plantilla del club"
          >
            Borrar plantilla
          </button>
        )}

        <button
          type="button"
          style={{
            ...estilos.botonSecundario,
            background: modoEdicion ? "#00e676" : "#111",
            color: modoEdicion ? "#000" : "#fff",
            fontWeight: modoEdicion ? 800 : 400,
          }}
          onClick={() => setModoEdicion(!modoEdicion)}
        >
          {modoEdicion ? "Terminar de editar" : "Editar diseño"}
        </button>

        <button
          type="button"
          style={{ ...estilos.boton, opacity: exportando ? 0.6 : 1, cursor: exportando ? "wait" : "pointer" }}
          onClick={handleExportar}
          disabled={exportando || jugadores.length === 0}
        >
          {exportando ? "Exportando..." : "Descargar PNG"}
        </button>
      </div>

      {errorExport && <p style={estilos.error}>{errorExport}</p>}
    </div>
  );
}

const estilos = {
  panel: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-end",
    padding: 16,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  campoPlantillas: { display: "flex", flexDirection: "column", gap: 6 },
  tira: { display: "flex", gap: 8, maxWidth: 380, overflowX: "auto", paddingBottom: 2 },
  campo: { display: "flex", flexDirection: "column", gap: 6, minWidth: 160, flex: "0 1 200px" },
  acciones: { display: "flex", gap: 10, marginLeft: "auto", alignItems: "flex-end" },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    padding: "9px 11px",
    borderRadius: 10,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
  },
  miniatura: {
    position: "relative",
    display: "flex", flexDirection: "column", gap: 4, alignItems: "center",
    background: "transparent", border: "2px solid rgba(255,255,255,0.12)",
    borderRadius: 10, padding: 4, cursor: "pointer", flexShrink: 0,
  },
  miniaturaNueva: {
    justifyContent: "center",
    width: 60,
    borderStyle: "dashed",
    color: "rgba(255,255,255,0.6)",
  },
  mas: { fontSize: 24, color: "rgba(255,255,255,0.5)", lineHeight: 1, marginTop: 14 },
  miniaturaViewport: { width: 52, height: 65, overflow: "hidden", borderRadius: 5, background: "#000" },
  miniaturaEscala: { width: 1080, height: 1350, transform: "scale(0.0482)", transformOrigin: "top left", pointerEvents: "none" },
  miniaturaEtiqueta: { fontSize: 10, color: "rgba(255,255,255,0.7)" },
  puntoClub: {
    position: "absolute", top: 6, right: 6, width: 6, height: 6,
    borderRadius: "50%", background: "#00e676",
  },
  botonSecundario: {
    padding: "10px 16px", borderRadius: 10, background: "#111", color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, cursor: "pointer",
  },
  botonPeligro: {
    padding: "10px 14px", borderRadius: 10, background: "rgba(255,107,107,0.12)",
    color: "#ff8f8f", border: "1px solid rgba(255,107,107,0.35)", fontSize: 13, cursor: "pointer",
  },
  boton: {
    padding: "10px 20px", borderRadius: 10, background: "#00e676", color: "#000",
    fontWeight: 800, border: "none", fontSize: 13, cursor: "pointer",
  },
  error: { color: "#ff6b6b", fontSize: 13, width: "100%", margin: 0 },
};