// src/reportes/hooks/useDisenoReporte.js
//
// Reemplaza a usePosicionesReporte + usePosicionesGrupo.
// Carga las tres capas (club / grupo / jugador) de `reporte_disenos`,
// las combina, y expone las mutaciones con historial de undo/redo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabase";
import {
  DOCUMENTO_VACIO,
  aplicarPatch,
  agregarElemento,
  combinar,
  eliminarElemento,
  normalizar,
  reordenar,
  resetearElemento,
} from "../engine/documento";

const LIMITE_HISTORIAL = 60;

/** Devuelve la clave de alcance que le corresponde a cada capa. */
function claveDeAlcance(alcance, { grupo, jugadorId }) {
  if (alcance === "grupo") return grupo || "";
  if (alcance === "jugador") return jugadorId ? String(jugadorId) : "";
  return "";
}

export default function useDisenoReporte({ clubId, templateName, grupo, jugadorId }) {
  // Capa activa: sobre cuál de las tres escriben las ediciones.
  const [capa, setCapa] = useState("grupo"); // "club" | "grupo" | "jugador"

  const [documentos, setDocumentos] = useState({
    club: DOCUMENTO_VACIO,
    grupo: DOCUMENTO_VACIO,
    jugador: DOCUMENTO_VACIO,
  });

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [hayCambios, setHayCambios] = useState(false);

  // Historial por capa: cada entrada es un documento completo.
  const historial = useRef({ club: [], grupo: [], jugador: [] });
  const futuro = useRef({ club: [], grupo: [], jugador: [] });

  // ----------------------------------------------------------------
  // Carga
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!clubId || !templateName) {
      setDocumentos({ club: DOCUMENTO_VACIO, grupo: DOCUMENTO_VACIO, jugador: DOCUMENTO_VACIO });
      return;
    }

    let cancelado = false;

    const cargar = async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error: errorSupabase } = await supabase
          .from("reporte_disenos")
          .select("alcance, alcance_key, documento")
          .eq("club_id", clubId)
          .eq("template_name", templateName);

        if (errorSupabase) throw errorSupabase;
        if (cancelado) return;

        const siguiente = {
          club: DOCUMENTO_VACIO,
          grupo: DOCUMENTO_VACIO,
          jugador: DOCUMENTO_VACIO,
        };

        (data || []).forEach((fila) => {
          const esperada = claveDeAlcance(fila.alcance, { grupo, jugadorId });
          if (fila.alcance_key !== esperada) return; // otro grupo u otro jugador
          siguiente[fila.alcance] = normalizar(fila.documento);
        });

        setDocumentos(siguiente);
        historial.current = { club: [], grupo: [], jugador: [] };
        futuro.current = { club: [], grupo: [], jugador: [] };
        setHayCambios(false);
      } catch (err) {
        console.error("Error cargando diseños de reporte:", err);
        if (!cancelado) setError("No se pudo cargar el diseño. Probá recargar la página.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [clubId, templateName, grupo, jugadorId]);

  // ----------------------------------------------------------------
  // Documento efectivo (lo que se ve en pantalla)
  // ----------------------------------------------------------------
  const documentoEfectivo = useMemo(
    () => combinar(documentos.club, documentos.grupo, documentos.jugador),
    [documentos]
  );

  // ----------------------------------------------------------------
  // Mutaciones sobre la capa activa
  // ----------------------------------------------------------------
  const mutar = useCallback(
    (transformar, { agrupar = false } = {}) => {
      setDocumentos((prev) => {
        const actual = prev[capa];
        const siguiente = transformar(actual);
        if (siguiente === actual) return prev;

        // `agrupar` sirve para el arrastre: 200 pointermove no deberían
        // dejar 200 entradas de undo, sino una sola por gesto.
        const pila = historial.current[capa];
        if (!agrupar || pila.length === 0) {
          pila.push(actual);
          if (pila.length > LIMITE_HISTORIAL) pila.shift();
        }
        futuro.current[capa] = [];

        return { ...prev, [capa]: siguiente };
      });
      setHayCambios(true);
    },
    [capa]
  );

  const editarElemento = useCallback(
    (id, patch, opciones) => mutar((doc) => aplicarPatch(doc, id, patch), opciones),
    [mutar]
  );

  const moverElemento = useCallback(
    (id, { x, y }, opciones) => editarElemento(id, { x, y }, opciones),
    [editarElemento]
  );

  const alternarVisibilidad = useCallback(
    (id, oculto) => editarElemento(id, { oculto }),
    [editarElemento]
  );

  const insertarElemento = useCallback(
    (elemento) => mutar((doc) => agregarElemento(doc, elemento)),
    [mutar]
  );

  const borrarElemento = useCallback(
    (id) => mutar((doc) => eliminarElemento(doc, id)),
    [mutar]
  );

  const restaurarElemento = useCallback(
    (id) => mutar((doc) => resetearElemento(doc, id)),
    [mutar]
  );

  const reordenarElementos = useCallback(
    (idsDeAtrasHaciaAdelante) => mutar((doc) => reordenar(doc, idsDeAtrasHaciaAdelante)),
    [mutar]
  );

  /**
   * Vacía las tres capas y las marca como guardadas. Se usa después de
   * aplanar el diseño dentro de una plantilla: los cambios ya viven en la
   * plantilla, así que dejarlos también como patches los aplicaría dos veces
   * (y duplicaría los elementos agregados).
   */
  const limpiarCapas = useCallback(async () => {
    if (!clubId || !templateName) return;
    setDocumentos({ club: DOCUMENTO_VACIO, grupo: DOCUMENTO_VACIO, jugador: DOCUMENTO_VACIO });
    historial.current = { club: [], grupo: [], jugador: [] };
    futuro.current = { club: [], grupo: [], jugador: [] };
    setHayCambios(false);
    try {
      await supabase
        .from("reporte_disenos")
        .delete()
        .eq("club_id", clubId)
        .eq("template_name", templateName);
    } catch (err) {
      console.error("Error limpiando diseños tras aplanar:", err);
    }
  }, [clubId, templateName]);

  // ----------------------------------------------------------------
  // Undo / redo
  // ----------------------------------------------------------------
  const deshacer = useCallback(() => {
    setDocumentos((prev) => {
      const pila = historial.current[capa];
      if (pila.length === 0) return prev;
      futuro.current[capa].push(prev[capa]);
      const anterior = pila.pop();
      return { ...prev, [capa]: anterior };
    });
    setHayCambios(true);
  }, [capa]);

  const rehacer = useCallback(() => {
    setDocumentos((prev) => {
      const pila = futuro.current[capa];
      if (pila.length === 0) return prev;
      historial.current[capa].push(prev[capa]);
      const siguiente = pila.pop();
      return { ...prev, [capa]: siguiente };
    });
    setHayCambios(true);
  }, [capa]);

  // ----------------------------------------------------------------
  // Guardado
  // ----------------------------------------------------------------
  const guardar = useCallback(async () => {
    if (!clubId || !templateName) return false;
    setGuardando(true);
    setError(null);
    try {
      const { error: errorSupabase } = await supabase.from("reporte_disenos").upsert(
        {
          club_id: clubId,
          template_name: templateName,
          alcance: capa,
          alcance_key: claveDeAlcance(capa, { grupo, jugadorId }),
          documento: documentos[capa],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "club_id,template_name,alcance,alcance_key" }
      );
      if (errorSupabase) throw errorSupabase;
      setHayCambios(false);
      return true;
    } catch (err) {
      console.error("Error guardando diseño de reporte:", err);
      setError("No se pudo guardar el diseño. Los cambios siguen en pantalla, probá de nuevo.");
      return false;
    } finally {
      setGuardando(false);
    }
  }, [clubId, templateName, capa, grupo, jugadorId, documentos]);

  return {
    // estado
    documentoEfectivo,
    documentoCapa: documentos[capa],
    capa,
    setCapa,
    cargando,
    guardando,
    error,
    hayCambios,
    puedeDeshacer: historial.current[capa].length > 0,
    puedeRehacer: futuro.current[capa].length > 0,

    // acciones
    editarElemento,
    moverElemento,
    alternarVisibilidad,
    insertarElemento,
    borrarElemento,
    restaurarElemento,
    reordenarElementos,
    limpiarCapas,
    deshacer,
    rehacer,
    guardar,
  };
}