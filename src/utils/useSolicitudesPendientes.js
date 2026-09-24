import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

/* Pedidos de corrección de datos que mandaron los jugadores desde el kiosco
   (migración 20260925120000). */

/** Las pendientes del club. [] si la migración todavía no se corrió. */
export function useSolicitudesPendientes(clubId, activo) {
  const [lista, setLista] = useState([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!clubId || !activo) return undefined;
    let vivo = true;
    supabase.from('jugador_solicitudes_cambio')
      .select('id, jugador_id, cambios, creada_at')
      .eq('club_id', clubId).eq('estado', 'pendiente')
      .order('creada_at', { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { console.warn('Solicitudes de cambio:', error.message); setLista([]); return; }
        setLista(data || []);
      });
    return () => { vivo = false; };
  }, [clubId, activo, version]);

  return { pendientes: lista, recargar: () => setVersion((v) => v + 1) };
}

