// src/pages/GeneradorReportes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useReportData from "../reportes/hooks/useReportData";
import useDisenoReporte from "../reportes/hooks/useDisenoReporte";
import useTemplatesClub from "../reportes/hooks/useTemplatesClub";
import { calcularGrupoJugador } from "../reportes/hooks/usePosicionesGrupo";
import { aplanar, componer, crearElemento } from "../reportes/engine/documento";
import { plantillaEnBlanco } from "../reportes/templates";
import Toolbar from "../reportes/components/Toolbar";
import BarraEdicion from "../reportes/components/BarraEdicion";
import Preview from "../reportes/components/Preview";
import PanelCapas from "../reportes/components/PanelCapas";
import PanelPropiedades from "../reportes/components/PanelPropiedades";

export default function GeneradorReportes() {
  const {
    cargando,
    error,
    jugadores,
    clubId,
    jugadorSeleccionadoId,
    setJugadorSeleccionadoId,
    templateSeleccionado,
    setTemplateSeleccionado,
    torneos,
    torneoSeleccionado,
    setTorneoSeleccionado,
    dataReporte,
  } = useReportData();

  const canvasRef = useRef(null);

  const {
    catalogo,
    guardando: guardandoPlantilla,
    error: errorPlantillas,
    crearPlantilla,
    actualizarPlantilla,
    borrarPlantilla,
  } = useTemplatesClub(clubId);

  const plantillaActiva = catalogo[templateSeleccionado] || null;

  // Si la plantilla activa desaparece (la borraron), volvemos a una base.
  useEffect(() => {
    if (!plantillaActiva && Object.keys(catalogo).length > 0) {
      setTemplateSeleccionado("verde");
    }
  }, [plantillaActiva, catalogo, setTemplateSeleccionado]);

  // Foto elegida a mano solo para esta exportación (no se persiste).
  const [fotoOverride, setFotoOverride] = useState(null);
  useEffect(() => setFotoOverride(null), [jugadorSeleccionadoId]);

  const dataFinal = useMemo(() => {
    if (!dataReporte || !fotoOverride) return dataReporte;
    return { ...dataReporte, jugador: { ...dataReporte.jugador, foto: fotoOverride } };
  }, [dataReporte, fotoOverride]);

  const grupo = calcularGrupoJugador(dataFinal?.jugador);

  const {
    documentoEfectivo,
    capa,
    setCapa,
    guardando,
    error: errorDiseno,
    hayCambios,
    editarElemento,
    alternarVisibilidad,
    insertarElemento,
    borrarElemento,
    restaurarElemento,
    reordenarElementos,
    limpiarCapas,
    deshacer,
    rehacer,
    guardar,
  } = useDisenoReporte({
    clubId,
    templateName: templateSeleccionado,
    grupo,
    jugadorId: jugadorSeleccionadoId,
  });

  const [modoEdicion, setModoEdicion] = useState(false);
  const [seleccionId, setSeleccionId] = useState(null);
  const [zoom, setZoom] = useState(0.6);

  useEffect(() => {
    if (!modoEdicion) setSeleccionId(null);
  }, [modoEdicion]);

  const elementoSeleccionado = useMemo(() => {
    if (!seleccionId || !plantillaActiva) return null;
    return componer(plantillaActiva, documentoEfectivo).find((el) => el.id === seleccionId) || null;
  }, [seleccionId, plantillaActiva, documentoEfectivo]);

  // ----------------------------------------------------------------
  // Elementos
  // ----------------------------------------------------------------
  const handleInsertar = useCallback(
    (tipo) => {
      const elemento = crearElemento(tipo, { x: 420, y: 620 });
      insertarElemento(elemento);
      setSeleccionId(elemento.id);
    },
    [insertarElemento]
  );

  const handleDuplicar = useCallback(
    (elemento) => {
      const { id, __origen, __orden, ...props } = elemento;
      const x = (Number(elemento.x) || 0) + 24;
      const y = (Number(elemento.y) || 0) + 24;
      const copia = { ...crearElemento(elemento.type, { x, y }, props), x, y };
      insertarElemento(copia);
      setSeleccionId(copia.id);
    },
    [insertarElemento]
  );

  const handleBorrar = useCallback(
    (id) => {
      borrarElemento(id);
      setSeleccionId(null);
    },
    [borrarElemento]
  );

  // ----------------------------------------------------------------
  // Plantillas del club
  // ----------------------------------------------------------------

  /** Lienzo en blanco: nada heredado, se arma desde cero. */
  const handleNuevaPlantilla = useCallback(async () => {
    const nombre = window.prompt("Nombre de la plantilla nueva:", "Plantilla del club");
    if (!nombre?.trim()) return;
    const creada = await crearPlantilla({
      nombre: nombre.trim(),
      base: plantillaEnBlanco(nombre.trim()),
      derivadaDe: null,
    });
    if (creada) {
      setTemplateSeleccionado(creada.slug);
      setModoEdicion(true);
      setSeleccionId(null);
    }
  }, [crearPlantilla, setTemplateSeleccionado]);

  /** Congela el diseño actual (plantilla + capas) en una plantilla nueva. */
  const handleGuardarComoPlantilla = useCallback(
    async (nombre) => {
      if (!plantillaActiva) return;
      const base = aplanar(plantillaActiva, documentoEfectivo, { nombre });
      const creada = await crearPlantilla({
        nombre,
        base,
        derivadaDe: plantillaActiva.slug,
      });
      // No limpiamos las capas: los diseños siguen perteneciendo a la
      // plantilla de origen, que queda intacta.
      if (creada) setTemplateSeleccionado(creada.slug);
    },
    [plantillaActiva, documentoEfectivo, crearPlantilla, setTemplateSeleccionado]
  );

  /** Escribe los cambios dentro de la plantilla del club y vacía las capas. */
  const handleActualizarPlantilla = useCallback(async () => {
    if (!plantillaActiva || plantillaActiva.esBase) return;
    const confirmado = window.confirm(
      `Los cambios van a quedar dentro de "${plantillaActiva.nombre}" para todos los jugadores, y los ajustes por grupo o por jugador de esta plantilla se borran. ¿Seguimos?`
    );
    if (!confirmado) return;

    const base = aplanar(plantillaActiva, documentoEfectivo, { nombre: plantillaActiva.nombre });
    const ok = await actualizarPlantilla(plantillaActiva.slug, { base });
    if (ok) await limpiarCapas();
  }, [plantillaActiva, documentoEfectivo, actualizarPlantilla, limpiarCapas]);

  const handleBorrarPlantilla = useCallback(
    async (slug, nombre) => {
      if (!window.confirm(`¿Borrar la plantilla "${nombre}"? No se puede deshacer.`)) return;
      const ok = await borrarPlantilla(slug);
      if (ok) setTemplateSeleccionado("verde");
    },
    [borrarPlantilla, setTemplateSeleccionado]
  );

  // ----------------------------------------------------------------
  // Atajos
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!modoEdicion) return;
    const onKeyDown = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "z" && !e.shiftKey) { e.preventDefault(); deshacer(); }
      else if ((tecla === "z" && e.shiftKey) || tecla === "y") { e.preventDefault(); rehacer(); }
      else if (tecla === "s") { e.preventDefault(); guardar(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modoEdicion, deshacer, rehacer, guardar]);

  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Generador de Reportes</h1>

      {error && <p style={estilos.error}>{error}</p>}
      {errorPlantillas && <p style={estilos.error}>{errorPlantillas}</p>}

      {!error && (
        <>
          <Toolbar
            jugadores={jugadores}
            jugadorSeleccionadoId={jugadorSeleccionadoId}
            setJugadorSeleccionadoId={setJugadorSeleccionadoId}
            catalogo={catalogo}
            templateSeleccionado={templateSeleccionado}
            setTemplateSeleccionado={setTemplateSeleccionado}
            onNuevaPlantilla={handleNuevaPlantilla}
            onBorrarPlantilla={handleBorrarPlantilla}
            torneos={torneos}
            torneoSeleccionado={torneoSeleccionado}
            setTorneoSeleccionado={setTorneoSeleccionado}
            canvasRef={canvasRef}
            jugadorActual={dataFinal?.jugador}
            dataReporte={dataFinal}
            onCambiarFoto={setFotoOverride}
            modoEdicion={modoEdicion}
            setModoEdicion={setModoEdicion}
          />

          {modoEdicion && (
            <BarraEdicion
              capa={capa}
              setCapa={setCapa}
              grupo={grupo}
              onInsertar={handleInsertar}
              onDeshacer={deshacer}
              onRehacer={rehacer}
              zoom={zoom}
              setZoom={setZoom}
              onGuardar={guardar}
              guardando={guardando}
              hayCambios={hayCambios}
              error={errorDiseno}
              plantillaActiva={plantillaActiva}
              onGuardarComoPlantilla={handleGuardarComoPlantilla}
              onActualizarPlantilla={handleActualizarPlantilla}
              guardandoPlantilla={guardandoPlantilla}
            />
          )}

          <div style={estilos.area}>
            {modoEdicion && (
              <PanelCapas
                template={plantillaActiva}
                documento={documentoEfectivo}
                seleccionId={seleccionId}
                onSeleccionar={setSeleccionId}
                onAlternarVisibilidad={alternarVisibilidad}
                onReordenar={reordenarElementos}
              />
            )}

            <div style={estilos.canvas}>
              <Preview
                ref={canvasRef}
                template={plantillaActiva}
                data={dataFinal}
                cargando={cargando}
                modoEdicion={modoEdicion}
                documento={documentoEfectivo}
                zoom={zoom}
                seleccionId={seleccionId}
                onSeleccionar={setSeleccionId}
                onEditarElemento={editarElemento}
                onBorrarElemento={handleBorrar}
              />
            </div>

            {modoEdicion && (
              <PanelPropiedades
                elemento={elementoSeleccionado}
                onEditar={editarElemento}
                onBorrar={handleBorrar}
                onRestaurar={restaurarElemento}
                onDuplicar={handleDuplicar}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

const estilos = {
  pagina: { padding: 24, display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn 0.3s ease" },
  titulo: { fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 },
  area: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  canvas: { flex: "1 1 420px", minWidth: 0 },
  error: { color: "#ff6b6b" },
};

