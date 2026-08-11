// src/pages/GeneradorReportes.jsx
import React, { useMemo, useRef, useState } from "react";
import useReportData from "../reportes/hooks/useReportData";
import usePosicionesReporte from "../reportes/hooks/usePosicionesReporte";
import usePosicionesGrupo, { calcularGrupoJugador } from "../reportes/hooks/usePosicionesGrupo";
import Toolbar from "../reportes/components/Toolbar";
import Preview from "../reportes/components/Preview";

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

  // Foto elegida a mano por el usuario para ESTE reporte puntual (no se
  // persiste en Supabase, es solo un override local antes de exportar).
  const [fotoOverride, setFotoOverride] = useState(null);

  const jugadorSeleccionadoIdRef = useRef(jugadorSeleccionadoId);
  if (jugadorSeleccionadoIdRef.current !== jugadorSeleccionadoId) {
    jugadorSeleccionadoIdRef.current = jugadorSeleccionadoId;
    if (fotoOverride) setFotoOverride(null);
  }

  const dataReporteFinal = useMemo(() => {
    if (!dataReporte) return dataReporte;
    if (!fotoOverride) return dataReporte;
    return {
      ...dataReporte,
      jugador: { ...dataReporte.jugador, foto: fotoOverride },
    };
  }, [dataReporte, fotoOverride]);

  const grupo = calcularGrupoJugador(dataReporteFinal?.jugador);

  // Capa 1: diseño de plantilla compartido por TODOS los jugadores del
  // mismo grupo (arquero / jugador de campo) para esta plantilla.
  const {
    posicionesGrupo,
    setPosicionesGrupo,
    guardarPosicionesGrupo,
    guardandoGrupo,
    errorGrupo,
  } = usePosicionesGrupo(clubId, templateSeleccionado, grupo);

  // Capa 2: ajuste fino de ESTE jugador puntual, por encima del diseño de grupo.
  const {
    posiciones: posicionesJugador,
    setPosiciones: setPosicionesJugador,
    guardarPosiciones: guardarPosicionesJugador,
    guardando: guardandoJugador,
    errorPosiciones: errorJugador,
  } = usePosicionesReporte(jugadorSeleccionadoId, templateSeleccionado);

  // Lo que se ve en pantalla es la suma de las dos capas: el diseño de
  // grupo primero, y el ajuste individual del jugador pisando por encima.
  const overridesFinal = useMemo(
    () => ({ ...posicionesGrupo, ...posicionesJugador }),
    [posicionesGrupo, posicionesJugador]
  );

  const [modoEdicion, setModoEdicion] = useState(false);
  // Qué capa se está moviendo cuando arrastrás una manija.
  const [capaEdicion, setCapaEdicion] = useState("grupo"); // "grupo" | "jugador"

  const handleMoverElemento = (elementoId, nuevaPosicion) => {
    if (capaEdicion === "grupo") {
      setPosicionesGrupo((prev) => ({ ...prev, [elementoId]: nuevaPosicion }));
    } else {
      setPosicionesJugador((prev) => ({ ...prev, [elementoId]: nuevaPosicion }));
    }
  };

  const handleToggleVisibilidad = (elementoId, oculto) => {
    const actualizar = (prev) => ({
      ...prev,
      [elementoId]: { ...prev[elementoId], oculto },
    });
    if (capaEdicion === "grupo") {
      setPosicionesGrupo(actualizar);
    } else {
      setPosicionesJugador(actualizar);
    }
  };

  const handleGuardar = () => {
    if (capaEdicion === "grupo") {
      guardarPosicionesGrupo(posicionesGrupo);
    } else {
      guardarPosicionesJugador(clubId, posicionesJugador);
    }
  };

  return (
    <div style={estilos.pagina}>
      <h1 style={estilos.titulo}>Generador de Reportes</h1>

      {error && <p style={estilos.error}>{error}</p>}

      {!error && (
        <>
          <Toolbar
            jugadores={jugadores}
            jugadorSeleccionadoId={jugadorSeleccionadoId}
            setJugadorSeleccionadoId={setJugadorSeleccionadoId}
            templateSeleccionado={templateSeleccionado}
            setTemplateSeleccionado={setTemplateSeleccionado}
            torneos={torneos}
            torneoSeleccionado={torneoSeleccionado}
            setTorneoSeleccionado={setTorneoSeleccionado}
            canvasRef={canvasRef}
            jugadorActual={dataReporteFinal?.jugador}
            dataReporte={dataReporteFinal}
            onCambiarFoto={setFotoOverride}
            modoEdicion={modoEdicion}
            setModoEdicion={setModoEdicion}
            capaEdicion={capaEdicion}
            setCapaEdicion={setCapaEdicion}
            grupo={grupo}
            onGuardarPosiciones={handleGuardar}
            guardandoPosiciones={capaEdicion === "grupo" ? guardandoGrupo : guardandoJugador}
            errorPosiciones={capaEdicion === "grupo" ? errorGrupo : errorJugador}
            overridesPosicionActuales={overridesFinal}
            onToggleVisibilidad={handleToggleVisibilidad}
          />

          <Preview
            ref={canvasRef}
            templateName={templateSeleccionado}
            data={dataReporteFinal}
            cargando={cargando}
            modoEdicion={modoEdicion}
            overridesPosicion={overridesFinal}
            onMoverElemento={handleMoverElemento}
            onToggleVisibilidad={handleToggleVisibilidad}
          />
        </>
      )}
    </div>
  );
}

const estilos = {
  pagina: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    animation: "fadeIn 0.3s ease",
  },
  titulo: {
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
    margin: 0,
  },
  error: {
    color: "#ff6b6b",
  },
};