// src/reportes/components/PanelCapas.jsx
import React, { useMemo, useState } from "react";
import { componer, esElementoDeDatos } from "../engine/documento";
import { nombreLegible } from "../engine/campos";

const FILTROS = [
  { valor: "todos", etiqueta: "Todo" },
  { valor: "datos", etiqueta: "Datos" },
  { valor: "deco", etiqueta: "Decoración" },
  { valor: "ocultos", etiqueta: "Ocultos" },
];

/**
 * Lista de capas. Se muestra de adelante hacia atrás (el primero de la lista
 * es el que tapa a los demás), que es lo que espera cualquiera que haya usado
 * un editor gráfico.
 */
export default function PanelCapas({
  template,
  documento,
  seleccionId,
  onSeleccionar,
  onAlternarVisibilidad,
  onReordenar,
}) {
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [arrastrando, setArrastrando] = useState(null);
  const [sobre, setSobre] = useState(null);

  // componer() devuelve de atrás hacia adelante; acá lo damos vuelta.
  const todos = useMemo(() => {
    if (!template) return [];
    return componer(template, documento).filter((el) => el.id).reverse();
  }, [template, documento]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return todos.filter((el) => {
      if (filtro === "datos" && !esElementoDeDatos(el)) return false;
      if (filtro === "deco" && esElementoDeDatos(el)) return false;
      if (filtro === "ocultos" && !el.oculto) return false;
      if (!texto) return true;
      return (
        el.id.toLowerCase().includes(texto) ||
        nombreLegible(el).toLowerCase().includes(texto)
      );
    });
  }, [todos, filtro, busqueda]);

  const soltar = (idDestino) => {
    if (!arrastrando || arrastrando === idDestino) {
      setArrastrando(null);
      setSobre(null);
      return;
    }
    // Reordenamos sobre la lista COMPLETA, no sobre la filtrada: mover algo
    // con un filtro activo no debería reacomodar lo que no ves.
    const ids = todos.map((el) => el.id);
    const desde = ids.indexOf(arrastrando);
    const hasta = ids.indexOf(idDestino);
    if (desde < 0 || hasta < 0) return;

    ids.splice(hasta, 0, ids.splice(desde, 1)[0]);
    onReordenar([...ids].reverse()); // el modelo espera de atrás hacia adelante

    setArrastrando(null);
    setSobre(null);
  };

  return (
    <aside style={estilos.panel}>
      <h3 style={estilos.titulo}>Capas</h3>

      <input
        style={estilos.buscador}
        placeholder="Buscar elemento…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div style={estilos.filtros}>
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            style={{
              ...estilos.chipFiltro,
              background: filtro === f.valor ? "#00e676" : "transparent",
              color: filtro === f.valor ? "#000" : "rgba(255,255,255,0.7)",
              borderColor: filtro === f.valor ? "#00e676" : "rgba(255,255,255,0.12)",
            }}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      <div style={estilos.lista}>
        {visibles.length === 0 && (
          <p style={estilos.vacio}>
            {busqueda ? "Ningún elemento coincide con la búsqueda." : "No hay elementos en este filtro."}
          </p>
        )}

        {visibles.map((el) => {
          const activo = el.id === seleccionId;
          const esObjetivo = sobre === el.id;
          return (
            <div
              key={el.id}
              draggable
              onDragStart={() => setArrastrando(el.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(el.id);
              }}
              onDragLeave={() => setSobre((prev) => (prev === el.id ? null : prev))}
              onDrop={() => soltar(el.id)}
              onDragEnd={() => {
                setArrastrando(null);
                setSobre(null);
              }}
              onClick={() => onSeleccionar(el.id)}
              style={{
                ...estilos.fila,
                background: activo ? "rgba(0,230,118,0.16)" : "transparent",
                borderTop: esObjetivo ? "2px solid #00e676" : "2px solid transparent",
                opacity: arrastrando === el.id ? 0.4 : 1,
              }}
            >
              <span style={estilos.agarre} title="Arrastrar para reordenar">⠿</span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAlternarVisibilidad(el.id, !el.oculto);
                }}
                title={el.oculto ? "Mostrar" : "Ocultar"}
                style={{ ...estilos.ojo, color: el.oculto ? "rgba(255,255,255,0.3)" : "#00e676" }}
              >
                {el.oculto ? "○" : "●"}
              </button>

              <div style={{ ...estilos.textos, opacity: el.oculto ? 0.45 : 1 }}>
                <span style={estilos.nombre}>{nombreLegible(el)}</span>
                <span style={estilos.id}>{el.id}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p style={estilos.pie}>Arriba tapa a lo de abajo. Arrastrá para cambiar el orden.</p>
    </aside>
  );
}

const estilos = {
  panel: {
    width: 260,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    maxHeight: "78vh",
  },
  titulo: {
    fontSize: 11,
    fontWeight: 800,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: 0,
  },
  buscador: {
    padding: "8px 10px",
    borderRadius: 8,
    background: "#111",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13,
    boxSizing: "border-box",
  },
  filtros: { display: "flex", gap: 4, flexWrap: "wrap" },
  chipFiltro: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 11,
    cursor: "pointer",
  },
  lista: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 },
  fila: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 6px",
    borderRadius: 6,
    cursor: "pointer",
  },
  agarre: { color: "rgba(255,255,255,0.25)", fontSize: 13, cursor: "grab", lineHeight: 1 },
  ojo: {
    background: "transparent",
    border: "none",
    fontSize: 12,
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
  },
  textos: { display: "flex", flexDirection: "column", minWidth: 0, flex: 1 },
  nombre: {
    fontSize: 12,
    color: "#fff",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  id: {
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  vacio: { fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0, padding: "8px 0" },
  pie: { fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0, lineHeight: 1.4 },
};