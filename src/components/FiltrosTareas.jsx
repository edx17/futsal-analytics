import React, { useMemo, useState } from 'react';
import { NATURALEZAS, FASES, FORMATOS, subfasesDe, colorFase, FILTROS_VACIOS, contarFiltros } from '../utils/taxonomiaTareas';

/* ═══════════════════════════════════════════════════════════════════════════
   FILTROS DE TAREAS

   La misma barra para el Banco y para el Planificador. Antes cada pantalla
   armaba la suya con listas distintas, y el Planificador las sacaba de los
   datos, así que mostraba mezcladas las dos familias de fases.

   Arranca PLEGADA: en el celular, con los filtros abiertos no entraba
   ninguna tarea en pantalla. Se ve la búsqueda, un botón que dice cuántos
   filtros hay puestos, y nada más hasta que lo abrís.

   Las subfases dependen de la fase elegida. Sin fase no se ofrecen: son 34 y
   sueltas no significan nada.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function FiltrosTareas({
  valores = FILTROS_VACIOS,
  onCambiar,
  mostrarNaturaleza = true,
  compacto = false,
  children,
}) {
  const [abierto, setAbierto] = useState(false);
  const activos = contarFiltros(valores);

  const subfases = useMemo(
    () => (valores.fase && valores.fase !== 'Todas' ? subfasesDe(valores.fase) : []),
    [valores.fase]
  );

  const set = (campo) => (e) => {
    const v = { ...valores, [campo]: e.target.value };
    /* Cambiar de fase invalida la subfase: una subfase de Ataque no existe
       dentro de Balón Parado. */
    if (campo === 'fase') v.subfase = 'Todas';
    onCambiar(v);
  };

  const limpiar = () => onCambiar({ ...FILTROS_VACIOS });

  const campo = {
    width: '100%', padding: '10px 12px', background: 'var(--bg)',
    borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem', outline: 'none',
    boxSizing: 'border-box',
  };
  const rotulo = {
    display: 'block', fontSize: '0.6rem', fontWeight: 900, letterSpacing: '1px',
    textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 5,
  };

  return (
    <div style={{
      background: 'var(--panel)', borderWidth: '1px', borderStyle: 'solid',
      borderColor: 'var(--border)', borderRadius: 12, padding: compacto ? 10 : 14,
      marginBottom: 16,
    }}>
      {/* Fila siempre visible: buscar + abrir */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={valores.busqueda}
          onChange={set('busqueda')}
          placeholder="Buscar por nombre, objetivo, fase o formato…"
          style={{ ...campo, flex: '1 1 220px', minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => setAbierto(o => !o)}
          aria-expanded={abierto}
          style={{
            ...campo, width: 'auto', flex: '0 0 auto', cursor: 'pointer',
            fontWeight: 800, whiteSpace: 'nowrap',
            borderColor: activos ? 'var(--accent)' : 'var(--border)',
            color: activos ? 'var(--accent)' : 'var(--text-dim)',
          }}
        >
          {abierto ? '▾' : '▸'} FILTROS{activos ? ` (${activos})` : ''}
        </button>
        {activos > 0 && (
          <button type="button" onClick={limpiar}
                  style={{ ...campo, width: 'auto', flex: '0 0 auto', cursor: 'pointer', fontWeight: 800, whiteSpace: 'nowrap' }}>
            LIMPIAR
          </button>
        )}
        {children}
      </div>

      {abierto && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
        }}>
          {mostrarNaturaleza && (
            <label>
              <span style={rotulo}>Naturaleza · el contenido</span>
              <select value={valores.naturaleza} onChange={set('naturaleza')} style={campo}>
                <option value="Todas">Todas</option>
                {NATURALEZAS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
          )}

          <label>
            <span style={rotulo}>Fase · el momento</span>
            <select value={valores.fase} onChange={set('fase')}
                    style={{ ...campo, borderColor: valores.fase !== 'Todas' ? colorFase(valores.fase) : 'var(--border)' }}>
              <option value="Todas">Todas</option>
              {FASES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>

          <label style={{ opacity: subfases.length ? 1 : 0.45 }}>
            <span style={rotulo}>Situación</span>
            <select value={valores.subfase} onChange={set('subfase')} disabled={!subfases.length}
                    style={campo}
                    title={subfases.length ? '' : 'Elegí primero una fase'}>
              <option value="Todas">{subfases.length ? 'Todas' : 'Elegí una fase'}</option>
              {subfases.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label>
            <span style={{ ...rotulo, color: '#22d3ee' }}>Formato · el cómo</span>
            <select value={valores.formato} onChange={set('formato')}
                    style={{ ...campo, borderColor: valores.formato !== 'Todos' ? '#0e7490' : 'var(--border)' }}>
              <option value="Todos">Todos</option>
              {FORMATOS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
