// src/reportes/components/BarraEdicion.jsx
import React, { useState } from "react";

const CAPAS = [
  { valor: "club", etiqueta: "Todo el club", ayuda: "El diseño base para cualquier jugador" },
  { valor: "grupo", etiqueta: "Grupo", ayuda: "Solo arqueros, o solo jugadores de campo" },
  { valor: "jugador", etiqueta: "Este jugador", ayuda: "Ajuste fino para este jugador nada más" },
];

const TIPOS = [
  { tipo: "text", etiqueta: "Texto" },
  { tipo: "rectangle", etiqueta: "Rectángulo" },
  { tipo: "circle", etiqueta: "Círculo" },
  { tipo: "image", etiqueta: "Imagen" },
];

const ZOOMS = [0.4, 0.6, 0.8, 1];

/**
 * Barra fina sobre el canvas con las acciones de edición. Separada de la
 * Toolbar para que la barra superior no cambie de alto al entrar y salir
 * del modo edición.
 */
export default function BarraEdicion({
  capa,
  setCapa,
  grupo,
  onInsertar,
  onDeshacer,
  onRehacer,
  zoom,
  setZoom,
  onGuardar,
  guardando,
  hayCambios,
  error,
  plantillaActiva,
  onGuardarComoPlantilla,
  onActualizarPlantilla,
  guardandoPlantilla,
}) {
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [mostrarGuardarComo, setMostrarGuardarComo] = useState(false);

  const etiquetaGrupo = grupo === "arquero" ? "Arqueros" : "Campo";
  const ayuda = CAPAS.find((c) => c.valor === capa)?.ayuda;

  const confirmarGuardarComo = () => {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    onGuardarComoPlantilla(nombre);
    setNombreNuevo("");
    setMostrarGuardarComo(false);
  };

  return (
    <div style={estilos.barra}>
      <div style={estilos.seccion}>
        <span style={estilos.etiqueta}>Aplicar a</span>
        <div style={estilos.grupoChips}>
          {CAPAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              title={c.ayuda}
              onClick={() => setCapa(c.valor)}
              style={{
                ...estilos.chip,
                background: capa === c.valor ? "#00e676" : "transparent",
                color: capa === c.valor ? "#000" : "rgba(255,255,255,0.75)",
                borderColor: capa === c.valor ? "#00e676" : "rgba(255,255,255,0.12)",
              }}
            >
              {c.valor === "grupo" ? etiquetaGrupo : c.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div style={estilos.divisor} />

      <div style={estilos.seccion}>
        <span style={estilos.etiqueta}>Agregar</span>
        <div style={estilos.grupoChips}>
          {TIPOS.map((t) => (
            <button key={t.tipo} type="button" style={estilos.chip} onClick={() => onInsertar(t.tipo)}>
              + {t.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div style={estilos.divisor} />

      <div style={estilos.grupoChips}>
        <button type="button" style={estilos.chip} onClick={onDeshacer} title="Ctrl+Z">↺</button>
        <button type="button" style={estilos.chip} onClick={onRehacer} title="Ctrl+Shift+Z">↻</button>
      </div>

      <div style={estilos.divisor} />

      <div style={estilos.grupoChips}>
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            style={{
              ...estilos.chip,
              background: zoom === z ? "rgba(0,230,118,0.2)" : "transparent",
              borderColor: zoom === z ? "#00e676" : "rgba(255,255,255,0.12)",
            }}
          >
            {Math.round(z * 100)}%
          </button>
        ))}
      </div>

      <div style={estilos.divisor} />

      <div style={estilos.seccion}>
        <span style={estilos.etiqueta}>Plantilla</span>
        <div style={estilos.grupoChips}>
          <button
            type="button"
            style={estilos.chip}
            onClick={() => setMostrarGuardarComo((v) => !v)}
            title="Crear una plantilla nueva del club con el diseño actual"
          >
            Guardar como…
          </button>
          {plantillaActiva && !plantillaActiva.esBase && (
            <button
              type="button"
              style={estilos.chip}
              onClick={onActualizarPlantilla}
              disabled={guardandoPlantilla}
              title="Escribir estos cambios dentro de la plantilla del club"
            >
              {guardandoPlantilla ? "Guardando…" : "Actualizar plantilla"}
            </button>
          )}
        </div>
      </div>

      {mostrarGuardarComo && (
        <div style={estilos.filaGuardarComo}>
          <input
            autoFocus
            style={estilos.input}
            placeholder="Nombre de la plantilla"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarGuardarComo();
              if (e.key === "Escape") setMostrarGuardarComo(false);
            }}
          />
          <button
            type="button"
            style={{ ...estilos.chip, borderColor: "#00e676", color: "#00e676" }}
            onClick={confirmarGuardarComo}
            disabled={guardandoPlantilla || !nombreNuevo.trim()}
          >
            Crear
          </button>
          <button type="button" style={estilos.chip} onClick={() => setMostrarGuardarComo(false)}>
            Cancelar
          </button>
        </div>
      )}

      <div style={estilos.derecha}>
        {error ? (
          <span style={estilos.error}>{error}</span>
        ) : (
          <span style={estilos.ayuda}>{ayuda}</span>
        )}
        <button
          type="button"
          style={{
            ...estilos.guardar,
            background: hayCambios ? "#00e676" : "transparent",
            color: hayCambios ? "#000" : "rgba(255,255,255,0.4)",
            borderColor: hayCambios ? "#00e676" : "rgba(255,255,255,0.12)",
          }}
          onClick={onGuardar}
          disabled={guardando || !hayCambios}
        >
          {guardando ? "Guardando..." : hayCambios ? "Guardar diseño" : "Guardado"}
        </button>
      </div>
    </div>
  );
}

const estilos = {
  barra: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  seccion: { display: "flex", alignItems: "center", gap: 8 },
  etiqueta: {
    fontSize: 10,
    fontWeight: 800,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  grupoChips: { display: "flex", gap: 4, flexWrap: "wrap" },
  chip: {
    padding: "5px 11px",
    borderRadius: 999,
    background: "transparent",
    color: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
    cursor: "pointer",
  },
  divisor: { width: 1, height: 22, background: "rgba(255,255,255,0.1)" },
  derecha: { display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" },
  filaGuardarComo: { display: "flex", alignItems: "center", gap: 6, width: "100%" },
  input: {
    flex: "0 1 260px",
    padding: "6px 10px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 12,
  },
  ayuda: { fontSize: 11, color: "rgba(255,255,255,0.4)" },
  error: { fontSize: 11, color: "#ff8f8f" },
  guardar: {
    padding: "7px 16px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid",
    cursor: "pointer",
  },
};