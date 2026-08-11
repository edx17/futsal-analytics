// src/reportes/hooks/usePosicionesGrupo.js
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabase";

/**
 * Determina el grupo de un jugador para el diseño compartido de plantilla.
 * Hoy solo distingue arquero vs el resto, igual que el criterio que ya usa
 * useReportData para mostrar atajadas/goles recibidos.
 */
export function calcularGrupoJugador(jugador) {
  const posicion = (jugador?.posicion || "").toLowerCase();
  // Mismo criterio que esArquero() en Resumenplantel.jsx
  const esArquero = posicion.includes("arquero") || posicion.includes("portero");
  return esArquero ? "arquero" : "jugador";
}

/**
 * Carga y guarda el diseño de plantilla compartido por TODOS los jugadores
 * de un mismo grupo (club + plantilla + grupo), persistido en
 * `reporte_posiciones_grupo` (ver migración SQL).
 */
export default function usePosicionesGrupo(clubId, templateName, grupo) {
  const [posicionesGrupo, setPosicionesGrupo] = useState({});
  const [cargandoGrupo, setCargandoGrupo] = useState(false);
  const [guardandoGrupo, setGuardandoGrupo] = useState(false);
  const [errorGrupo, setErrorGrupo] = useState(null);

  useEffect(() => {
    if (!clubId || !templateName || !grupo) {
      setPosicionesGrupo({});
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      setCargandoGrupo(true);
      setErrorGrupo(null);
      try {
        const { data, error } = await supabase
          .from("reporte_posiciones_grupo")
          .select("posiciones")
          .eq("club_id", clubId)
          .eq("template_name", templateName)
          .eq("grupo", grupo)
          .maybeSingle();

        if (error) throw error;
        if (!cancelado) setPosicionesGrupo(data?.posiciones || {});
      } catch (err) {
        console.error("Error cargando diseño de grupo:", err);
        if (!cancelado) setErrorGrupo("No se pudo cargar el diseño de grupo.");
      } finally {
        if (!cancelado) setCargandoGrupo(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [clubId, templateName, grupo]);

  const guardarPosicionesGrupo = useCallback(
    async (nuevasPosiciones) => {
      if (!clubId || !templateName || !grupo) return false;
      setGuardandoGrupo(true);
      setErrorGrupo(null);
      try {
        const { error } = await supabase.from("reporte_posiciones_grupo").upsert(
          {
            club_id: clubId,
            template_name: templateName,
            grupo,
            posiciones: nuevasPosiciones,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "club_id,template_name,grupo" }
        );
        if (error) throw error;
        setPosicionesGrupo(nuevasPosiciones);
        return true;
      } catch (err) {
        console.error("Error guardando diseño de grupo:", err);
        setErrorGrupo("No se pudo guardar el diseño de grupo.");
        return false;
      } finally {
        setGuardandoGrupo(false);
      }
    },
    [clubId, templateName, grupo]
  );

  return {
    posicionesGrupo,
    setPosicionesGrupo,
    cargandoGrupo,
    guardarPosicionesGrupo,
    guardandoGrupo,
    errorGrupo,
  };
}