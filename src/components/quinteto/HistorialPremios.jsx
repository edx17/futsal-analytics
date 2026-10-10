import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Premio } from './PanelPremios';
import { ModalPlacaPremio } from '../../placas/PlacaPremio';
import { listarHistorial, quitarRegistro } from '../../utils/cartasDestacadas';
import { datosDePlaca, descripcionRegistro, rankingDestacados } from '../../analytics/premiosCartas';
import { TIPOS } from '../../analytics/premios';

/* HISTORIAL DE PREMIOS
 *
 * Lo que se guardó desde la pestaña PREMIOS, con la carta tal como se veía ese
 * día. Arriba, quiénes aparecen más; abajo, la lista, filtrable por tipo y
 * por categoría. Cada premio se puede volver a exportar como placa.
 */

const MONO = 'JetBrains Mono, monospace';

export default function HistorialPremios({ clubId, club, esMovil }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [tipo, setTipo] = useState('Todos');
  const [categoria, setCategoria] = useState('Todas');
  const [placa, setPlaca] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      setRegistros(await listarHistorial(clubId));
    } catch (err) {
      console.error('Historial de premios:', err);
      setError(err?.message || 'No se pudo leer el historial.');
    } finally {
      setCargando(false);
    }
  }, [clubId]);

  useEffect(() => { if (clubId) cargar(); else setCargando(false); }, [clubId, cargar]);

  const categorias = useMemo(() => [...new Set(registros.map((r) => r.categoria).filter(Boolean))].sort(), [registros]);

  const visibles = useMemo(
    () => registros.filter((r) => (tipo === 'Todos' || r.tipo === tipo) && (categoria === 'Todas' || r.categoria === categoria)),
    [registros, tipo, categoria],
  );
  const ranking = useMemo(() => rankingDestacados(visibles).filter((f) => f.individuales + f.quintetos > 0).slice(0, 5), [visibles]);

  const exportar = (r) => setPlaca(datosDePlaca({ ...r, cartas: r.cartas, club, categoria: r.categoria }));

  const quitar = async (r) => {
    if (!window.confirm('¿Sacar este premio del historial? Se puede volver a guardar desde la pestaña PREMIOS.')) return;
    try {
      await quitarRegistro(r.id);
      setRegistros((rs) => rs.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(err?.message || 'No se pudo quitar.');
    }
  };

  if (cargando) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Leyendo el historial…</div>;

  if (error) {
    return (
      <div className="bento-card" style={{ padding: 20, color: '#ef4444', fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.5 }}>
        {error}
      </div>
    );
  }

  if (registros.length === 0) {
    return (
      <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', lineHeight: 1.6 }}>
        Todavía no hay nada guardado.<br />
        En la pestaña <b style={{ color: 'var(--text)' }}>PREMIOS</b> podés guardar cada premio, o todo lo definitivo de una vez.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['Todos', ...TIPOS].map((t) => (
          <button key={t} onClick={() => setTipo(t)} style={{
            ...chip, borderColor: tipo === t ? 'var(--accent)' : 'var(--border)',
            color: tipo === t ? 'var(--accent)' : 'var(--text-dim)', background: tipo === t ? 'rgba(0,255,136,.08)' : 'transparent',
          }}>{t === 'Todos' ? 'TODOS' : t}</button>
        ))}
        {categorias.length > 1 && (
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selectChico} aria-label="Categoría">
            <option value="Todas">TODAS LAS CATEGORÍAS</option>
            {categorias.filter((c) => c !== 'Todas').map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: MONO }}>
          {visibles.length} {visibles.length === 1 ? 'premio' : 'premios'}
        </span>
      </div>

      {ranking.length > 0 && (
        <div className="bento-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)', marginBottom: 10 }}>LOS MÁS DESTACADOS</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {ranking.map((f, i) => (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', fontSize: '0.85rem' }}>
                <b style={{ fontFamily: MONO, color: 'var(--text-dim)' }}>{i + 1}</b>
                <span style={{ fontWeight: 800 }}>{String(f.apellido || '').toUpperCase()} {f.nombre}</span>
                <span style={{ fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                  {[
                    f.potw && `${f.potw} POTW`, f.potm && `${f.potm} POTM`, f.toty && `${f.toty} TOTY`,
                    f.totw && `${f.totw} TOTW`, f.totm && `${f.totm} TOTM`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          No hay premios con ese filtro.
        </div>
      ) : visibles.map((r) => (
        <Premio key={r.id} registro={r} esMovil={esMovil} soloLectura
          subtitulo={descripcionRegistro(r)}
          onExportar={exportar} onQuitar={() => quitar(r)} />
      ))}

      <ModalPlacaPremio datos={placa} onCerrar={() => setPlaca(null)} />
    </div>
  );
}

const chip = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '.04em' };
const selectChico = { padding: '8px 10px', fontSize: '0.78rem', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, outline: 'none', fontWeight: 800, cursor: 'pointer' };
