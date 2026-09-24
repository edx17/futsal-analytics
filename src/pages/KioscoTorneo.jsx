import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cargarFichaKiosco } from '../utils/kiosco';
import { torneoDe } from '../analytics/fichaKiosco';
import { normalizarPartido } from '../utils/analisisTorneo';
import { partesDeFecha, formatearHora } from '../utils/citacion';

/* ══════════════════════════════════════════════════════════════════════════
   TORNEO (KIOSCO)

   La tabla de posiciones y el fixture del torneo de la categoría del
   jugador. Es de sólo lectura y sale de la ficha (kiosco_ficha), no de la
   pantalla de Torneos: esa es del staff, pide permisos y tiene todas las
   herramientas de carga.
   ══════════════════════════════════════════════════════════════════════════ */

export default function KioscoTorneo() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState('cargando');
  const [ficha, setFicha] = useState(null);
  const [tab, setTab] = useState('tabla');

  useEffect(() => {
    let vivo = true;
    cargarFichaKiosco().then((r) => {
      if (!vivo) return;
      if (r.ficha) { setFicha(r.ficha); setEstado('ok'); }
      else if (r.vencida) setEstado('vencida');
      else setEstado('error');
    });
    return () => { vivo = false; };
  }, []);

  const datos = useMemo(
    () => (ficha?.torneo ? torneoDe(ficha.fixture, ficha.club?.nombre || localStorage.getItem('mi_club')) : null),
    [ficha]
  );

  const porJornada = useMemo(() => {
    if (!datos) return [];
    const grupos = new Map();
    datos.fixture.forEach((p) => {
      const k = p.jornada ? `Fecha ${p.jornada}` : 'Sin fecha asignada';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    });
    return [...grupos.entries()];
  }, [datos]);

  const contenedor = { padding: '16px', maxWidth: '640px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '60px' };

  if (estado === 'cargando') {
    return <div style={{ ...contenedor, textAlign: 'center', color: 'var(--text-dim)', paddingTop: '40px' }}>Cargando el torneo…</div>;
  }
  if (estado !== 'ok') {
    return (
      <div style={{ ...contenedor, textAlign: 'center', paddingTop: '40px' }}>
        <p style={{ color: 'var(--text-dim)' }}>
          {estado === 'vencida' ? 'Tu sesión venció: volvé a entrar con tu PIN.' : 'No se pudo cargar el torneo.'}
        </p>
        <button onClick={() => navigate('/kiosco')} style={btnTab(true)}>IR AL MENÚ</button>
      </div>
    );
  }

  if (!datos) {
    return (
      <div style={{ ...contenedor, textAlign: 'center', paddingTop: '40px', color: 'var(--text-dim)' }}>
        Tu categoría todavía no tiene un torneo cargado.
      </div>
    );
  }

  return (
    <div style={contenedor}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' }}>
          🏆 {String(ficha.torneo.categoria || ficha.jugador?.categoria || '').toUpperCase()}
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>
          {ficha.torneo.nombre || 'Torneo'}
        </h1>
        {datos.puesto && (
          <div style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 800, marginTop: '4px' }}>
            Van {datos.puesto}º de {datos.tabla.length}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button onClick={() => setTab('tabla')} style={btnTab(tab === 'tabla')}>POSICIONES</button>
        <button onClick={() => setTab('fixture')} style={btnTab(tab === 'fixture')}>FIXTURE</button>
      </div>

      {tab === 'tabla' && (
        datos.tabla.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>Todavía no hay resultados para armar la tabla.</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'var(--panel)', color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                  {['#', 'EQUIPO', 'PJ', 'DG', 'PTS'].map((h) => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: h === 'EQUIPO' ? 'left' : 'center', fontWeight: 900 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.tabla.map((t, i) => {
                  const mio = t.nombre === datos.miClub;
                  return (
                    <tr key={t.nombre} style={{ borderTop: '1px solid var(--border)', background: mio ? 'rgba(0,255,136,0.08)' : 'transparent' }}>
                      <td style={celda}>{i + 1}</td>
                      <td style={{ ...celda, textAlign: 'left', fontWeight: mio ? 900 : 600, color: mio ? 'var(--accent)' : 'var(--text)' }}>{t.nombre}</td>
                      <td style={celda}>{t.pj}</td>
                      <td style={celda}>{t.difGeneral > 0 ? `+${t.difGeneral}` : t.difGeneral}</td>
                      <td style={{ ...celda, fontWeight: 900 }}>{t.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'fixture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {porJornada.map(([jornada, partidos]) => (
            <div key={jornada}>
              <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '6px' }}>{jornada.toUpperCase()}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {partidos.map((p) => {
                  const n = normalizarPartido(p, datos.miClub);
                  const f = partesDeFecha(p.fecha);
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px',
                      background: n.esMio ? 'rgba(0,255,136,0.07)' : 'var(--panel)',
                      border: `1px solid ${n.esMio ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`,
                    }}>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: '0.8rem', fontWeight: n.local === datos.miClub ? 900 : 600 }}>{n.local}</span>
                      <span style={{ minWidth: '64px', textAlign: 'center', fontWeight: 900, fontSize: n.jugado ? '0.95rem' : '0.65rem', color: n.jugado ? 'var(--text)' : 'var(--text-dim)' }}>
                        {n.jugado ? `${n.golesLocal} - ${n.golesVisita}` : (
                          <>{p.fecha ? f.corta : 'a conf.'}{p.horario ? <><br />{formatearHora(String(p.horario).slice(0, 5))}</> : null}</>
                        )}
                      </span>
                      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: n.visita === datos.miClub ? 900 : 600 }}>{n.visita}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const celda = { padding: '9px 6px', textAlign: 'center', color: 'var(--text)' };
const btnTab = (activo) => ({
  flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', minHeight: '40px',
  border: '1px solid var(--border)', background: activo ? 'var(--accent)' : 'var(--panel)', color: activo ? '#000' : 'var(--text-dim)',
});
