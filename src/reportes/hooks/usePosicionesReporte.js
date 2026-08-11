// src/reportes/hooks/usePosicionesReporte.js
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabase";

/**
 * Carga y guarda las posiciones movidas a mano por el usuario para un
 * jugador+plantilla puntual, persistidas en la tabla `reporte_posiciones`
 * (ver migración SQL). Formato: { [elementoId]: { x, y } }.
 */
export default function usePosicionesReporte(jugadorId, templateName) {
  const [posiciones, setPosiciones] = useState({});
  const [cargandoPosiciones, setCargandoPosiciones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorPosiciones, setErrorPosiciones] = useState(null);

  useEffect(() => {
    if (!jugadorId || !templateName) {
      setPosiciones({});
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      setCargandoPosiciones(true);
      setErrorPosiciones(null);
      try {
        const { data, error } = await supabase
          .from("reporte_posiciones")
          .select("posiciones")
          .eq("jugador_id", jugadorId)
          .eq("template_name", templateName)
          .maybeSingle();

        if (error) throw error;
        if (!cancelado) setPosiciones(data?.posiciones || {});
      } catch (err) {
        console.error("Error cargando posiciones guardadas:", err);
        if (!cancelado) setErrorPosiciones("No se pudieron cargar las posiciones guardadas.");
      } finally {
        if (!cancelado) setCargandoPosiciones(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [jugadorId, templateName]);

  const guardarPosiciones = useCallback(
    async (clubId, nuevasPosiciones) => {
      if (!jugadorId || !templateName || !clubId) return false;
      setGuardando(true);
      setErrorPosiciones(null);
      try {
        const { error } = await supabase.from("reporte_posiciones").upsert(
          {
            club_id: clubId,
            jugador_id: jugadorId,
            template_name: templateName,
            posiciones: nuevasPosiciones,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "club_id,jugador_id,template_name" }
        );
        if (error) throw error;
        setPosiciones(nuevasPosiciones);
        return true;
      } catch (err) {
        console.error("Error guardando posiciones:", err);
        setErrorPosiciones("No se pudo guardar la posición.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [jugadorId, templateName]
  );

  return {
    posiciones,
    setPosiciones,
    cargandoPosiciones,
    guardarPosiciones,
    guardando,
    errorPosiciones,
  };
}