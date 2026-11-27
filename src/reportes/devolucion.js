import { supabase } from '../supabase';

/* LO QUE EL REPORTE DEL JUGADOR NO SACA DE LOS PARTIDOS
 *
 * La devolución de cada área (reportes_devoluciones), el staff de la
 * categoría (reportes_staff), las mediciones de Fisiología (rendimiento) y
 * la condición (un préstamo entrante activo en transferencias).
 * Migración: 20261127120000_reportes_devoluciones.sql. Sin la migración, la
 * devolución y el staff quedan vacíos y se avisa (el resto del reporte sale igual).
 */

export const MENSAJE_SIN_MIGRACION = 'Falta correr la migración 20261127120000_reportes_devoluciones.sql en Supabase para guardar la devolución y el staff.';
const sinTabla = (error) => ['42P01', 'PGRST205', 'PGRST204'].includes(error?.code);

/** { devolucion: { area → { texto, autor_nombre, updated_at } }, staff: [{ cargo, nombre }], sinMigracion } */
export async function leerDevolucionYStaff({ clubId, jugadorId, temporada, categoria }) {
  const [dev, st] = await Promise.all([
    supabase.from('reportes_devoluciones').select('area, texto, autor_nombre, updated_at')
      .eq('club_id', clubId).eq('jugador_id', jugadorId).eq('temporada', Number(temporada)),
    supabase.from('reportes_staff').select('integrantes').eq('club_id', clubId).eq('categoria', categoria).eq('temporada', Number(temporada)).maybeSingle(),
  ]);
  const sinMigracion = sinTabla(dev.error) || sinTabla(st.error);
  return {
    devolucion: Object.fromEntries((dev.data || []).map((d) => [d.area, d])),
    staff: Array.isArray(st.data?.integrantes) ? st.data.integrantes : [],
    sinMigracion,
  };
}

export async function guardarArea({ clubId, jugadorId, temporada, area, texto, autorNombre }) {
  const { error } = await supabase.from('reportes_devoluciones').upsert(
    { club_id: clubId, jugador_id: jugadorId, temporada: Number(temporada), area, texto, autor_nombre: autorNombre || null },
    { onConflict: 'club_id,jugador_id,temporada,area' },
  );
  if (error) throw (sinTabla(error) ? new Error(MENSAJE_SIN_MIGRACION) : error);
}

export async function guardarStaff({ clubId, categoria, temporada, integrantes }) {
  const { error } = await supabase.from('reportes_staff').upsert(
    { club_id: clubId, categoria, temporada: Number(temporada), integrantes, updated_at: new Date().toISOString() },
    { onConflict: 'club_id,categoria,temporada' },
  );
  if (error) throw (sinTabla(error) ? new Error(MENSAJE_SIN_MIGRACION) : error);
}

/** Las mediciones de Fisiología de la temporada y la condición (propio / a préstamo). */
export async function leerFisicoYCondicion({ clubId, jugadorId, temporada }) {
  const [rend, trans] = await Promise.all([
    supabase.from('rendimiento').select('*').eq('club_id', clubId).eq('id_jugador', jugadorId)
      .gte('fecha_medicion', `${temporada}-01-01`).lte('fecha_medicion', `${temporada}-12-31`),
    supabase.from('transferencias').select('club_destino, tipo_movimiento, direccion, estado').eq('club_id', clubId).eq('jugador_id', jugadorId),
  ]);
  const prestamo = (trans.data || []).find((t) => t.tipo_movimiento === 'Prestamo' && t.direccion === 'Entrante' && t.estado === 'Activo');
  return {
    fisico: rend.data || [],
    condicion: prestamo ? `A préstamo${prestamo.club_destino ? ` (de ${prestamo.club_destino})` : ''}` : 'Propio',
  };
}

/** Sugerencia para el staff: los usuarios del cuerpo técnico asignados a la categoría. */
export async function sugerirStaff({ clubId, categoria }) {
  const { data } = await supabase.from('perfiles').select('nombre_completo, rol, categorias_asignadas').eq('club_id', clubId).eq('rol', 'ct');
  return (data || [])
    .filter((p) => !Array.isArray(p.categorias_asignadas) || !p.categorias_asignadas.length || p.categorias_asignadas.includes(categoria))
    .filter((p) => p.nombre_completo)
    .map((p) => ({ cargo: '', nombre: p.nombre_completo }));
}
