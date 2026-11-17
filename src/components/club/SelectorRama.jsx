import React, { useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useConfigClub, useRama } from '../../club/useConfigClub';
import { normCat } from '../../utils/categorias';

/* SELECTOR DE RAMA (TODAS · MASC · FEM)
 *
 * Global: se elige acá (en Inicio o en el menú) y todas las pantallas
 * muestran sólo las categorías de esa rama. Queda guardado en el dispositivo.
 * Sólo aparece si el club tiene las dos ramas configuradas y el usuario ve
 * categorías de las dos (si tiene asignadas sólo de una, no hace falta).
 */
const ETIQUETA = { Masculino: 'MASC', Femenino: 'FEM' };

function useRamasVisibles() {
  const { perfil } = useAuth();
  const config = useConfigClub(undefined, { todasLasRamas: true });
  const asignadas = perfil?.categorias_asignadas;
  return useMemo(() => {
    if ((config.ramas || []).length < 2) return [];
    const mias = new Set((Array.isArray(asignadas) ? asignadas : []).map(normCat));
    const cats = config.categorias.filter((c) => c.activa && (mias.size === 0 || mias.has(normCat(c.nombre))));
    return config.ramas.filter((r) => cats.some((c) => c.rama === r));
  }, [config, asignadas]);
}

export default function SelectorRama({ compacto = false, style }) {
  const { perfil } = useAuth();
  const [rama, setRama] = useRama();
  const ramas = useRamasVisibles();
  const visible = ramas.length > 1;

  /* Si la rama guardada no aplica a este usuario (cambió de usuario o de
     asignadas), se vuelve a "todas" para no esconderle sus categorías. */
  useEffect(() => {
    if (!perfil || !rama) return;
    // Con ramas.length === 0 puede estar cargando la configuración: se espera a tener datos.
    if (ramas.length > 0 && (ramas.length < 2 || !ramas.includes(rama))) setRama('');
  }, [perfil, rama, ramas, setRama]);

  if (!visible) return null;
  const opciones = [['', 'TODAS'], ...ramas.map((r) => [r, ETIQUETA[r] || r.toUpperCase()])];
  return (
    <div role="group" aria-label="Rama" style={{
      display: 'flex', gap: 4, padding: 4, borderRadius: 10, border: '1px solid var(--border)',
      background: 'var(--panel)', ...style,
    }}>
      {opciones.map(([valor, texto]) => {
        const activo = rama === valor;
        return (
          <button key={texto} type="button" onClick={() => setRama(valor)} aria-pressed={activo}
            style={{
              flex: 1, minWidth: 0, padding: compacto ? '6px 4px' : '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontWeight: 800, fontSize: compacto ? '0.68rem' : '0.75rem', letterSpacing: '0.04em',
              background: activo ? 'var(--accent)' : 'transparent', color: activo ? '#000' : 'var(--text-dim)',
            }}>
            {texto}
          </button>
        );
      })}
    </div>
  );
}
