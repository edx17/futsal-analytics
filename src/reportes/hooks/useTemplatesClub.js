// src/reportes/hooks/useTemplatesClub.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { PLANTILLAS_BASE } from "../templates";

/** Convierte "Mi plantilla 2026" en "mi-plantilla-2026". */
export function slugificar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "plantilla";
}

/**
 * Plantillas creadas por el club, guardadas en `reporte_plantillas`.
 * Se combinan con las base para armar el catálogo completo del selector.
 */
export default function useTemplatesClub(clubId) {
  const [plantillasClub, setPlantillasClub] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Si esto está vacío, el selector queda sin verde ni vintage y el canvas
  // no dibuja nada. Casi siempre significa que templates/index.js quedó en
  // la versión vieja, que no exporta PLANTILLAS_BASE.
  if (!PLANTILLAS_BASE || Object.keys(PLANTILLAS_BASE).length === 0) {
    console.error(
      "[reportes] PLANTILLAS_BASE llegó vacío. Revisá que src/reportes/templates/index.js sea la versión que exporta PLANTILLAS_BASE."
    );
  }

  const cargar = useCallback(async () => {
    if (!clubId) {
      setPlantillasClub([]);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { data, error: errorSupabase } = await supabase
        .from("reporte_plantillas")
        .select("id, slug, nombre, base, derivada_de, updated_at")
        .eq("club_id", clubId)
        .order("updated_at", { ascending: false });

      if (errorSupabase) throw errorSupabase;
      setPlantillasClub(data || []);
    } catch (err) {
      console.error("Error cargando plantillas del club:", err);
      setError("No se pudieron cargar las plantillas del club.");
    } finally {
      setCargando(false);
    }
  }, [clubId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Catálogo completo: las dos base primero, después las del club.
   * La clave de cada plantilla es su slug — el mismo valor que viaja en
   * `reporte_disenos.template_name`, así que un diseño guardado sigue
   * apuntando a su plantilla aunque le cambien el nombre visible.
   */
  const catalogo = useMemo(() => {
    const mapa = { ...PLANTILLAS_BASE };
    plantillasClub.forEach((p) => {
      mapa[p.slug] = {
        ...p.base,
        slug: p.slug,
        nombre: p.nombre,
        esBase: false,
        registroId: p.id,
        derivadaDe: p.derivada_de,
      };
    });
    return mapa;
  }, [plantillasClub]);

  /** Crea una plantilla nueva. Si el slug ya existe, le agrega un sufijo. */
  const crearPlantilla = useCallback(
    async ({ nombre, base, derivadaDe = null }) => {
      if (!clubId) return null;
      setGuardando(true);
      setError(null);
      try {
        const usados = new Set(Object.keys(catalogo));
        let slug = slugificar(nombre);
        let n = 2;
        while (usados.has(slug)) slug = `${slugificar(nombre)}-${n++}`;

        const { data, error: errorSupabase } = await supabase
          .from("reporte_plantillas")
          .insert({
            club_id: clubId,
            slug,
            nombre,
            base,
            derivada_de: derivadaDe,
            updated_at: new Date().toISOString(),
          })
          .select("id, slug, nombre, base, derivada_de, updated_at")
          .single();

        if (errorSupabase) throw errorSupabase;
        setPlantillasClub((prev) => [data, ...prev]);
        return data;
      } catch (err) {
        console.error("Error creando plantilla:", err);
        setError("No se pudo crear la plantilla.");
        return null;
      } finally {
        setGuardando(false);
      }
    },
    [clubId, catalogo]
  );

  /** Sobrescribe la base de una plantilla del club ya existente. */
  const actualizarPlantilla = useCallback(
    async (slug, { base, nombre }) => {
      if (!clubId) return false;
      const actual = plantillasClub.find((p) => p.slug === slug);
      if (!actual) {
        setError("Esa plantilla no es del club, no se puede sobrescribir.");
        return false;
      }
      setGuardando(true);
      setError(null);
      try {
        const cambios = { updated_at: new Date().toISOString() };
        if (base) cambios.base = base;
        if (nombre) cambios.nombre = nombre;

        const { error: errorSupabase } = await supabase
          .from("reporte_plantillas")
          .update(cambios)
          .eq("id", actual.id);

        if (errorSupabase) throw errorSupabase;
        setPlantillasClub((prev) =>
          prev.map((p) => (p.id === actual.id ? { ...p, ...cambios } : p))
        );
        return true;
      } catch (err) {
        console.error("Error actualizando plantilla:", err);
        setError("No se pudo actualizar la plantilla.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [clubId, plantillasClub]
  );

  /**
   * Borra una plantilla del club. Los diseños guardados contra ese slug
   * quedan huérfanos a propósito: no se borran en cascada por si fue un
   * error, y no molestan porque nadie los va a leer.
   */
  const borrarPlantilla = useCallback(
    async (slug) => {
      const actual = plantillasClub.find((p) => p.slug === slug);
      if (!actual) return false;
      setGuardando(true);
      setError(null);
      try {
        const { error: errorSupabase } = await supabase
          .from("reporte_plantillas")
          .delete()
          .eq("id", actual.id);
        if (errorSupabase) throw errorSupabase;
        setPlantillasClub((prev) => prev.filter((p) => p.id !== actual.id));
        return true;
      } catch (err) {
        console.error("Error borrando plantilla:", err);
        setError("No se pudo borrar la plantilla.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [plantillasClub]
  );

  return {
    catalogo,
    plantillasClub,
    cargando,
    guardando,
    error,
    crearPlantilla,
    actualizarPlantilla,
    borrarPlantilla,
    recargar: cargar,
  };
}