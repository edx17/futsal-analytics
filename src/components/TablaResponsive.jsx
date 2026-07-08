import React, { useState } from 'react';
import { useEsMovil } from '../utils/useEsMovil';

const MONO = 'JetBrains Mono, monospace';

/**
 * TablaResponsive
 * ─────────────────────────────────────────────────────────────
 * En PC (o tablet): devuelve `children` — o sea, tu tabla tal cual, sin tocar.
 * En teléfono: arma cards a partir de columnas + filas, reusando tus render fns.
 *
 * Props:
 *   filas          array de filas (los objetos jugador).
 *   columnas       [{ k, t, g, r }]  (misma forma que tu COLS: clave, título, grupo, render).
 *   colsClave      [k, k, k]         claves destacadas en la cara de la card (2-4).
 *   grupos         { g: color }      (tu GRUPOS).
 *   gruposLabel    { g: label }      (tu GRUPO_LABEL).
 *   getId          (fila) => id
 *   getTitulo      (fila) => string  (nombre).
 *   getSubtitulo   (fila) => string  (ej: "7 · Pivot").  opcional.
 *   renderBadges   (fila) => JSX     (INV / ⚠️ / ⛔).    opcional.
 *   onRowClick     (fila) => void    (navegar al perfil). opcional.
 *   colorCelda     (fila, col) => color   para pintar valores. opcional.
 *   sortKey, sortDir, onSort         control de orden (usa tu setSort).
 *   titulo         string            título de sección.
 *   vacio          string            texto cuando no hay filas.
 *   children       tu tabla de PC.
 */
export function TablaResponsive({
  filas = [],
  columnas = [],
  colsClave = [],
  grupos = {},
  gruposLabel = {},
  getId = (f) => f.id,
  getTitulo = (f) => f.nombre,
  getSubtitulo,
  renderBadges,
  onRowClick,
  colorCelda,
  sortKey,
  sortDir = 'desc',
  onSort,
  titulo,
  vacio = 'No hay datos con esos filtros.',
  children,
}) {
  const esMovil = useEsMovil();
  const [abiertas, setAbiertas] = useState(() => new Set());

  // ── PC / tablet: tu tabla original, intacta ──
  if (!esMovil) return children;

  const toggle = (id) => setAbiertas((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const claves = colsClave.length ? colsClave : columnas.slice(0, 3).map((c) => c.k);
  const colDe = (k) => columnas.find((c) => c.k === k);
  const colorDe = (fila, col) => (colorCelda ? colorCelda(fila, col) : (grupos[col?.g] || '#fff'));

  return (
    <div>
      {/* Barra de título + orden (sticky) */}
      {(titulo || onSort) && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: '8px', alignItems: 'center',
          background: 'var(--bg, #0a0a0a)', padding: '8px 2px 12px', marginBottom: '4px',
        }}>
          {titulo && <span className="stat-label" style={{ color: 'var(--accent)', flex: 1, fontSize: '0.72rem' }}>{titulo} ({filas.length})</span>}
          {onSort && (
            <select
              value={sortKey || ''}
              onChange={(e) => onSort(e.target.value)}
              aria-label="Ordenar por"
              style={{
                background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '6px',
                padding: '7px 10px', fontSize: '0.72rem', fontWeight: 800, outline: 'none', maxWidth: '55%',
              }}
            >
              {columnas.map((c) => <option key={c.k} value={c.k}>Ordenar: {c.t}</option>)}
            </select>
          )}
          {onSort && (
            <button
              onClick={() => sortKey && onSort(sortKey)}
              aria-label={sortDir === 'desc' ? 'Descendente' : 'Ascendente'}
              style={{
                background: '#111', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px',
                width: '38px', height: '34px', fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', flexShrink: 0,
              }}
            >
              {sortDir === 'desc' ? '▾' : '▴'}
            </button>
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>{vacio}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filas.map((fila) => {
            const id = getId(fila);
            const abierta = abiertas.has(id);
            return (
              <div key={id} className="bento-card" style={{ padding: '0', overflow: 'hidden' }}>
                {/* Cabecera de la card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px' }}>
                  <div
                    onClick={() => onRowClick && onRowClick(fila)}
                    style={{ flex: 1, minWidth: 0, cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: '0.95rem', color: onRowClick ? '#3b82f6' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getTitulo(fila)}
                      </span>
                      {renderBadges && renderBadges(fila)}
                    </div>
                    {getSubtitulo && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: MONO, marginTop: '2px' }}>
                        {getSubtitulo(fila)}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(id)}
                    aria-label={abierta ? 'Ocultar detalle' : 'Ver todo'}
                    style={{
                      background: abierta ? 'var(--accent)' : 'transparent', color: abierta ? '#000' : 'var(--accent)',
                      border: '1px solid var(--accent)', borderRadius: '20px', padding: '5px 12px',
                      fontSize: '0.62rem', fontWeight: 900, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    {abierta ? 'CERRAR ▴' : 'VER TODO ▾'}
                  </button>
                </div>

                {/* Stats destacadas */}
                <div style={{ display: 'flex', gap: '2px', padding: '0 6px 10px', flexWrap: 'wrap' }}>
                  {claves.map((k) => {
                    const col = colDe(k);
                    if (!col) return null;
                    return (
                      <div key={k} style={{ flex: 1, minWidth: '70px', textAlign: 'center', background: '#0a0a0a', border: '1px solid #1c1c1c', borderRadius: '6px', padding: '8px 4px' }}>
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase' }}>{col.t}</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, fontFamily: MONO, color: colorDe(fila, col), marginTop: '3px' }}>{col.r(fila)}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Detalle completo, agrupado */}
                {abierta && (
                  <div style={{ borderTop: '1px solid #1c1c1c', padding: '10px 14px 14px', background: '#080808' }}>
                    {agruparPorGrupo(columnas, claves).map(({ g, cols }) => (
                      <div key={g} style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 900, color: grupos[g] || 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          {gruposLabel[g] || g}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '6px 10px' }}>
                          {cols.map((col) => (
                            <div key={col.k} style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', fontSize: '0.72rem', borderBottom: '1px solid #141414', paddingBottom: '3px' }}>
                              <span style={{ color: 'var(--text-dim)' }}>{col.t}</span>
                              <span style={{ fontFamily: MONO, fontWeight: 700, color: colorDe(fila, col) }}>{col.r(fila)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Agrupa columnas por su grupo `g`, excluyendo las que ya se muestran destacadas.
function agruparPorGrupo(columnas, claves) {
  const orden = [];
  const map = new Map();
  columnas.forEach((c) => {
    if (claves.includes(c.k)) return;
    if (!map.has(c.g)) { map.set(c.g, []); orden.push(c.g); }
    map.get(c.g).push(c);
  });
  return orden.map((g) => ({ g, cols: map.get(g) }));
}

export default TablaResponsive;