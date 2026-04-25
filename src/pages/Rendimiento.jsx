import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend, Cell, ReferenceLine, LineChart, Line,
} from 'recharts';

// ─── REHAB LIBRARY ──────────────────────────────────────────────────────────
const REHAB_LIB = {
  isquiosural: [{ t: 'Dead Bugs', v: 'https://youtube.com/shorts/vn72PVWnu14' }, { t: 'Puente glúteo unilateral', v: 'https://youtube.com/shorts/Y-N53Q6XxiI' }, { t: 'Peso muerto rumano uni', v: 'https://youtu.be/YXjc7TURwfE' }],
  movilidad:   [{ t: 'Dorsiflexión c/ banda', v: 'https://youtube.com/shorts/Re7XMKgAti8' }, { t: 'Obelisco', v: 'https://youtube.com/shorts/dWLrnRwY41c' }, { t: 'Movilidad Toráxica', v: 'https://youtube.com/shorts/2et2ZXUk6co' }],
  tobillo:     [{ t: 'Mov. Articular', v: 'https://youtube.com/shorts/dYS9cgYk2lY' }, { t: 'Salto Alternado', v: 'https://youtube.com/shorts/b5qmCWB8cpo' }, { t: 'Dorsiflexión c/ carga', v: 'https://youtube.com/shorts/tXVq7MAOAVY' }],
  pelvica:     [{ t: 'Bird-dog', v: 'https://youtube.com/shorts/Tjo5oYHoS8M' }, { t: 'Puente almeja c/ banda', v: 'https://youtube.com/shorts/9vWRjF08xiQ' }, { t: 'Isométricos glúteo', v: 'https://youtube.com/shorts/oxouNCjxHWw' }],
  cadera:      [{ t: '90-90 Rotación interna', v: 'https://youtube.com/shorts/p2NUakSyUcE' }, { t: 'Ranita', v: 'https://youtube.com/shorts/cvgsb7xCgN4' }, { t: 'Curl Nórdico invertido', v: 'https://youtube.com/shorts/UZf6CbQR8_s' }],
  escapular:   [{ t: 'Movilidad Escapular', v: 'https://youtube.com/shorts/5j4inxyq-MA' }, { t: 'Halo Split KB', v: 'https://youtube.com/shorts/UARPXzqDNhM' }, { t: 'Pájaros con poleas', v: 'https://youtu.be/ki6gkb_mJr0' }],
};

const ELITE = { musc: 48.5, adip: 9.0, sum6: 45.0, cmj: 55, abk: 62, broad: 2.60, yoyo: 21.0, visc: 4, imc: 23.0 };

// ─── UTILS ───────────────────────────────────────────────────────────────────
const calcStats = (arr, key) => {
  const vals = arr.map(d => Number(d[key])).filter(v => !isNaN(v) && v != null && v !== 0);
  if (!vals.length) return { mean: 0, sd: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  return { mean, sd };
};
const zNorm = (val, stat) =>
  val == null || stat.sd === 0 ? 50
  : Math.max(0, Math.min(100, 50 + ((Number(val) - stat.mean) / stat.sd) * 20));
const estimarVO2 = lvl => (!lvl ? 'S/D' : ((Number(lvl) * 0.84) + 36.4).toFixed(1));
const asimColor = v => { const a = Math.abs(v); return a > 15 ? '#ef4444' : a > 10 ? '#f59e0b' : '#10b981'; };
const fmtNum = (v, dec = 1) => v != null && !isNaN(v) ? Number(v).toFixed(dec) : '—';
const getEmbedUrl = url => {
  if (!url) return '';
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=))([^"&?/\s]{11})/i);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=0&rel=0&modestbranding=1` : url;
};

// ─── SHARED UI ───────────────────────────────────────────────────────────────
const Tip = ({ t }) => (
  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5, cursor: 'help', verticalAlign: 'middle' }} className="tip-wrap">
    <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
    <span className="tip-box">{t}</span>
  </span>
);

const SecTitle = ({ children, color }) => (
  <div style={{ fontSize: '0.85rem', fontWeight: 900, letterSpacing: '1.5px', textTransform: 'uppercase', borderBottom: '1px solid #0f172a', paddingBottom: 9, marginBottom: 16, color: color || 'var(--text-dim)' }}>{children}</div>
);

const KpiCard = ({ label, value, unit = '', sub, color = '#fff', accent }) => (
  <div className="glass-panel" style={{ padding: 16, textAlign: 'center', borderTop: accent ? `3px solid ${accent}` : undefined }}>
    <div style={{ color: 'var(--text-dim)', fontSize: '0.62rem', fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: '2rem', fontWeight: 900, color, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.85rem' }}>{unit}</span></div>
    {sub && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6 }}>{sub}</div>}
  </div>
);

const PercBadge = ({ val, mean, sd, higher = true }) => {
  if (val == null || !sd) return <span style={{ color: '#1e293b', fontSize: '0.65rem' }}>S/D</span>;
  const z = (Number(val) - mean) / sd * (higher ? 1 : -1);
  const c = z > 0.5 ? '#10b981' : z < -0.5 ? '#ef4444' : '#f59e0b';
  const lbl = z > 1 ? 'TOP' : z > 0.5 ? 'SOBRE' : z < -1 ? 'BAJO' : z < -0.5 ? 'DEBAJO' : 'PROM';
  return <span style={{ padding: '2px 7px', borderRadius: 4, background: c + '22', color: c, fontSize: '0.62rem', fontWeight: 900, border: `1px solid ${c}33` }}>{lbl}</span>;
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════════════════
export default function Rendimiento() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('resumen');
  const [jugadoresBD, setJugadoresBD] = useState([]);
  
  const [historialGlobal, setHistorialGlobal] = useState([]); 
  const [historial, setHistorial] = useState([]); 

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selId, setSelId] = useState(null);

  // --- RESPONSIVE Y UX ESTADOS ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 800);
  const [perfilExpandido, setPerfilExpandido] = useState(false); // Para colapsar perfil en móviles

  const { showToast } = useToast();
  const { perfil } = useAuth();
  
  // --- KIOSCO Y ROLES ---
  const isKiosco = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoJugadorId = localStorage.getItem('kiosco_jugador_id');
  const esJugador = isKiosco || perfil?.rol?.toLowerCase() === 'jugador';
  const miJugadorId = isKiosco ? kioscoJugadorId : perfil?.jugador_id;
  
  const esStaff = !esJugador;
  const clubId = localStorage.getItem('club_id') || perfil?.club_id || localStorage.getItem('kiosco_club_id');

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 800);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    
    if (!clubId) {
      showToast('Error: No se pudo validar el club.', 'error');
      setLoading(false);
      return;
    }

    const { data: j } = await supabase.from('jugadores').select('id,nombre,apellido,dorsal,posicion').eq('club_id', clubId).order('dorsal');
    setJugadoresBD(j || []);
    
    const { data: r } = await supabase.from('rendimiento')
      .select('*,jugadores(nombre,apellido,posicion,dorsal)')
      .eq('club_id', clubId)
      .order('fecha_medicion', { ascending: false });

    const todosLosRegistros = r || [];
    setHistorialGlobal(todosLosRegistros);

    if (esJugador) {
      if (miJugadorId) {
        setHistorial(todosLosRegistros);
        setSelId(Number(miJugadorId)); 
      } else {
        setHistorial([]); 
      }
    } else {
      setHistorial(todosLosRegistros); 
    }

    setLoading(false);
  };

  useEffect(() => { if (clubId) cargarDatos(); }, [clubId]);

  const ultimosDatosGlobal = useMemo(() => {
    const mapa = {};
    historialGlobal.forEach(reg => { if (!mapa[reg.id_jugador]) mapa[reg.id_jugador] = reg; });
    return Object.values(mapa);
  }, [historialGlobal]);

  const ultimosDatos = useMemo(() => {
    const mapa = {};
    historial.forEach(reg => { if (!mapa[reg.id_jugador]) mapa[reg.id_jugador] = reg; });
    return Object.values(mapa);
  }, [historial]);

  useEffect(() => {
    if (esJugador && miJugadorId) { 
      setSelId(Number(miJugadorId)); 
      return; 
    }
    if (ultimosDatos.length && !selId) setSelId(ultimosDatos[0].id_jugador);
  }, [ultimosDatos, esJugador, miJugadorId]);

  const jug = ultimosDatos.find(j => j.id_jugador === selId);

  const stats = useMemo(() => ({
    cmj:    calcStats(ultimosDatosGlobal, 'cmj'),
    abk:    calcStats(ultimosDatosGlobal, 'abk'),
    broad:  calcStats(ultimosDatosGlobal, 'broad'),
    musc:   calcStats(ultimosDatosGlobal, 'musc'),
    adip:   calcStats(ultimosDatosGlobal, 'adip'),
    sum6:   calcStats(ultimosDatosGlobal, 'sum6'),
    visc:   calcStats(ultimosDatosGlobal, 'visc'),
    imc:    calcStats(ultimosDatosGlobal, 'imc'),
    ed_met: calcStats(ultimosDatosGlobal, 'ed_met'),
    yoyo:   calcStats(ultimosDatosGlobal.map(d => ({ ...d, yr: d.y26 || d.y25 })), 'yr'),
    pl_tri: calcStats(ultimosDatosGlobal, 'pl_tri'), pl_sub: calcStats(ultimosDatosGlobal, 'pl_sub'),
    pl_bic: calcStats(ultimosDatosGlobal, 'pl_bic'), pl_cre: calcStats(ultimosDatosGlobal, 'pl_cre'),
    pl_sup: calcStats(ultimosDatosGlobal, 'pl_sup'), pl_abd: calcStats(ultimosDatosGlobal, 'pl_abd'),
  }), [ultimosDatosGlobal]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 14, color: 'var(--text-dim)' }}>
      <div style={{ width: 44, height: 44, border: '3px solid #1e293b', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '0.8rem', letterSpacing: 3, textTransform: 'uppercase' }}>Cargando datos...</span>
    </div>
  );

  const TABS = [
    { id: 'resumen', lbl: '📊 RESUMEN',  col: null },
    { id: 'fisico',  lbl: '⚡ FÍSICO',   col: '#3b82f6' },
    { id: 'kine',    lbl: '🩺 KINE',     col: '#10b981' },
    { id: 'nutri',   lbl: '🥗 NUTRI',    col: '#f59e0b' },
    ...(!esJugador ? [
      { id: 'equipo',  lbl: '🏟️ EQUIPO',   col: '#8b5cf6' },
      { id: 'vs',      lbl: '⚖️ VS',       col: '#ec4899' }
    ] : []),
  ];

  return (
    <div style={{ padding: esMovil ? '15px' : '20px', maxWidth: 1500, margin: '0 auto', color: '#fff', paddingBottom: 80 }} className="fade-in">

      {/* --- BOTÓN VOLVER ATRÁS --- */}
      <button 
        onClick={() => navigate(-1)} 
        style={{ 
          background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', 
          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', 
          marginBottom: '15px', padding: '5px 0', fontSize: '0.9rem', transition: 'color 0.2s' 
        }}
      >
        ⬅ Volver atrás
      </button>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>Dpto. Rendimiento</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 4 }}>Rendimiento · Biomecánica · Antropometría · Nutrición</p>
        </div>
        {esStaff && <button onClick={() => setModalOpen(true)} className="btn-action" style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', fontWeight: 900 }}>+ NUEVA TOMA</button>}
      </div>

      {/* ── LAYOUT: SIDEBAR + CONTENT ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '260px 1fr', gap: esMovil ? 15 : 24, alignItems: 'start' }} className="rend-layout-grid">

        {/* ══ SIDEBAR OPTIMIZADO PARA MÓVIL ══ */}
        <div style={{ position: esMovil ? 'relative' : 'sticky', top: esMovil ? 0 : 16, zIndex: 10 }}>
          <div style={{ background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: esMovil ? 12 : 18, backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── SELECTOR GLOBAL ── */}
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 7 }}>
                {esJugador ? 'MI PERFIL' : 'JUGADOR ACTIVO'}
              </div>
              {esStaff ? (
                <select
                  style={{ width: '100%', background: '#060a14', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 9, padding: '10px 12px', fontSize: '0.88rem', fontWeight: 800, outline: 'none', cursor: 'pointer' }}
                  value={selId || ''}
                  onChange={e => setSelId(parseInt(e.target.value))}
                >
                  {ultimosDatos.map(j => (
                    <option key={j.id} value={j.id_jugador}>
                      #{j.jugadores?.dorsal} · {j.jugadores?.apellido}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: '10px 13px', background: '#060a14', border: '1px solid #0f172a', borderRadius: 9, color: 'var(--accent)', fontWeight: 900, fontSize: '0.9rem' }}>
                  {jug?.jugadores?.apellido} {jug?.jugadores?.nombre}
                </div>
              )}
            </div>

            {/* ── TABS EN MÓVIL (Arriba del perfil para fácil acceso) ── */}
            {esMovil && (
              <nav className="custom-scroll-hide" style={{ display: 'flex', overflowX: 'auto', gap: 8, paddingBottom: 5, marginTop: 5 }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ flex: '0 0 auto', background: tab === t.id ? (t.col ? `${t.col}22` : '#1e293b') : '#0a0f1e', border: `1px solid ${tab === t.id ? (t.col || 'var(--accent)') : '#1e293b'}`, color: tab === t.id ? (t.col || '#fff') : '#475569', padding: '8px 14px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer', transition: '0.2s' }}>
                    {t.lbl}
                  </button>
                ))}
              </nav>
            )}

            {/* ── BOTÓN TOGGLE PERFIL MÓVIL ── */}
            {esMovil && jug && (
              <button 
                onClick={() => setPerfilExpandido(!perfilExpandido)} 
                style={{ width: '100%', background: '#060a14', border: '1px solid #1e293b', color: '#94a3b8', padding: '10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 900, cursor: 'pointer' }}
              >
                {perfilExpandido ? 'Ocultar Resumen Atlético ▴' : 'Ver Resumen Atlético ▾'}
              </button>
            )}

            {/* ── PLAYER CARD (Colapsable en móvil) ── */}
            {(!esMovil || perfilExpandido) && jug && (
              <div style={{ background: 'rgba(2,6,23,0.7)', borderRadius: 12, padding: 16, border: '1px solid #0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeIn 0.3s' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#1e3a5f,#0f172a)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--accent)', fontSize: '1.1rem', marginBottom: 10, letterSpacing: -1 }}>
                  {jug.jugadores?.apellido?.charAt(0)}{jug.jugadores?.nombre?.charAt(0)}
                </div>
                <div style={{ fontWeight: 900, fontSize: '1rem', letterSpacing: -0.5 }}>{jug.jugadores?.apellido?.toUpperCase()}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{jug.jugadores?.nombre}</div>
                <div style={{ marginTop: 7, padding: '3px 11px', background: '#10b98122', border: '1px solid #10b98133', borderRadius: 4, fontSize: '0.68rem', fontWeight: 900, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>{jug.jugadores?.posicion || '—'}</div>
                <div style={{ fontSize: '0.76rem', color: '#334155', marginTop: 4, fontWeight: 900 }}>#{jug.jugadores?.dorsal}</div>

                <div style={{ width: '100%', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[['Fecha', jug.fecha_medicion?.slice(0, 10) || '—'], ['Pierna', jug.pierna || '—'], ['Peso', jug.peso ? `${jug.peso} kg` : '—'], ['Altura', jug.altura ? `${jug.altura} cm` : '—']].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 9px', background: '#060a14', borderRadius: 6 }}>
                      <span style={{ fontSize: '0.68rem', color: '#334155', fontWeight: 800, textTransform: 'uppercase' }}>{k}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#94a3b8' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ width: '100%', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    { lbl: 'CMJ',   val: jug.cmj,            elite: ELITE.cmj,   unit: 'cm', color: '#3b82f6' },
                    { lbl: 'ABK',   val: jug.abk,            elite: ELITE.abk,   unit: 'cm', color: '#8b5cf6' },
                    { lbl: 'YoYo',  val: jug.y26 || jug.y25, elite: ELITE.yoyo,  unit: '',   color: '#10b981' },
                    { lbl: 'Broad', val: jug.broad,          elite: ELITE.broad, unit: 'm',  color: '#f59e0b' },
                  ].map(({ lbl, val, elite, unit, color }) => {
                    const pct = val ? Math.min(100, (Number(val) / elite) * 100) : 0;
                    return (
                      <div key={lbl}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.66rem', fontWeight: 900, color: '#475569', textTransform: 'uppercase' }}>{lbl}</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 900, color }}>{val ?? '—'}<span style={{ fontSize: '0.62rem', color: '#475569', marginLeft: 2 }}>{unit}</span></span>
                        </div>
                        <div style={{ height: 5, background: '#0f172a', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── NAV TABS PARA ESCRITORIO (Verticales) ── */}
            {!esMovil && (
              <nav style={{ borderTop: '1px solid #0f172a', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{ background: tab === t.id ? '#0a0f1e' : 'transparent', border: 'none', borderLeft: `3px solid ${tab === t.id ? (t.col || 'var(--accent)') : 'transparent'}`, color: tab === t.id ? (t.col || 'var(--accent)') : '#475569', padding: '10px 12px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer', borderRadius: '0 7px 7px 0', transition: '0.15s' }}>
                    {t.lbl}
                  </button>
                ))}
              </nav>
            )}

          </div>
        </div>

        {/* ══ MAIN CONTENT ══ */}
        <div>
          <div style={{ animation: 'fadeUp 0.2s ease' }}>
            {tab === 'resumen' && <TabResumen jug={jug} stats={stats} historial={historial} ultimosDatos={ultimosDatos} esJugador={esJugador} selId={selId} />}
            {tab === 'fisico'  && <TabFisico  jug={jug} stats={stats} ultimosDatos={ultimosDatos} ultimosDatosGlobal={ultimosDatosGlobal} esJugador={esJugador} selId={selId} />}
            {tab === 'kine'    && <TabKine    jug={jug} stats={stats} ultimosDatos={ultimosDatos} ultimosDatosGlobal={ultimosDatosGlobal} esJugador={esJugador} selId={selId} />}
            {tab === 'nutri'   && <TabNutri   jug={jug} stats={stats} ultimosDatos={ultimosDatos} esJugador={esJugador} selId={selId} />}
            {tab === 'equipo'  && !esJugador && <TabEquipo  stats={stats} ultimosDatos={ultimosDatos} selId={selId} historial={historial} />}
            {tab === 'vs'      && !esJugador && <TabVS datos={ultimosDatos} stats={stats} selId={selId} historial={historial} />}
          </div>
        </div>
      </div>

      {modalOpen && esStaff && (
        <ModalIngreso jugadores={jugadoresBD} clubId={clubId} onClose={() => setModalOpen(false)} onSuccess={() => { setModalOpen(false); cargarDatos(); }} showToast={showToast} />
      )}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .select-dark { width:100%; padding:10px 13px; background:rgba(0,0,0,0.4); border:1px solid #1e293b; color:#fff; border-radius:8px; font-size:0.9rem; outline:none; }
        .data-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
        .data-table th { font-size:0.68rem; font-weight:900; color:#475569; text-transform:uppercase; padding:9px 12px; border-bottom:1px solid #0f172a; text-align:left; }
        .data-table td { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.03); color:#e2e8f0; }
        .data-table tr:hover td { background:rgba(255,255,255,0.02); }
        .tip-box { visibility:hidden; opacity:0; position:absolute; bottom:130%; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; padding:9px 13px; border-radius:7px; font-size:0.72rem; width:220px; text-align:center; border:1px solid #1e293b; z-index:300; pointer-events:none; transition:opacity 0.2s; white-space:normal; line-height:1.55; }
        .tip-wrap:hover .tip-box { visibility:visible; opacity:1; }
        .rg { display:flex; flex-direction:column; gap:22px; }
        .c2 { display:grid; grid-template-columns:1fr; gap:18px; }
        .c3 { display:grid; grid-template-columns:1fr; gap:16px; }
        .c4 { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
        .scroll { overflow-y:auto; max-height:360px; }
        .scroll::-webkit-scrollbar { width:3px; }
        .scroll::-webkit-scrollbar-thumb { background:#1e293b; border-radius:3px; }
        .custom-scroll-hide::-webkit-scrollbar { display: none; }
        .custom-scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* Recharts tooltip override — texto siempre blanco */
        .recharts-tooltip-wrapper .recharts-default-tooltip { background:#0f172a !important; border:1px solid #1e293b !important; color:#f8fafc !important; }
        .recharts-tooltip-item { color:#f8fafc !important; }
        .recharts-tooltip-label { color:#94a3b8 !important; }
        @media(min-width:1280px) { .c2 { grid-template-columns:1fr 1fr; } .c3 { grid-template-columns:repeat(3,1fr); } .c4 { grid-template-columns:repeat(4,1fr); } }
      `}</style>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB RESUMEN
// ════════════════════════════════════════════════════════════════════════════
function TabResumen({ jug, stats, historial, ultimosDatos, esJugador, selId }) {
  if (!jug) return <Empty />;
  const yoyo = jug.y26 || jug.y25;

  return (
    <div className="rg">
      <div className="c2">

        {/* ── HUELLA ATLÉTICA — Bullet Chart ── */}
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#3b82f6">⚡ Huella Atlética vs Élite <Tip t="La barra muestra el valor real del jugador. La línea roja marca el estándar Élite Mundial." /></SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            {[
              { lbl: 'CMJ',        val: jug.cmj,   elite: ELITE.cmj,   unit: 'cm', color: '#3b82f6', max: 75,  higher: true  },
              { lbl: 'ABK',        val: jug.abk,   elite: ELITE.abk,   unit: 'cm', color: '#8b5cf6', max: 80,  higher: true  },
              { lbl: 'Broad Jump', val: jug.broad, elite: ELITE.broad, unit: 'm',  color: '#10b981', max: 3.2, higher: true  },
              { lbl: 'Yo-Yo',      val: yoyo,      elite: ELITE.yoyo,  unit: '',   color: '#f59e0b', max: 26,  higher: true  },
              { lbl: 'Músculo',    val: jug.musc,  elite: ELITE.musc,  unit: '%',  color: '#06b6d4', max: 60,  higher: true  },
              { lbl: 'Adiposidad', val: jug.adip,  elite: ELITE.adip,  unit: '%',  color: '#ef4444', max: 30,  higher: false },
            ].map(({ lbl, val, elite, unit, color, max, higher }) => {
              const pct      = val != null ? Math.min(100, (Number(val) / max) * 100) : 0;
              const elitePct = Math.min(100, (elite / max) * 100);
              const gap      = val != null ? Number(val) - elite : null;
              const ok       = gap != null && (higher ? gap >= 0 : gap <= 0);
              const gapColor = gap == null ? '#334155' : ok ? '#10b981' : Math.abs(gap) < elite * 0.1 ? '#f59e0b' : '#ef4444';
              return (
                <div key={lbl}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{lbl}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      {gap != null && (
                        <span style={{ fontSize: '0.62rem', color: gapColor, fontWeight: 900 }}>
                          {ok ? '▲' : '▼'} {Math.abs(gap).toFixed(lbl === 'Broad Jump' ? 2 : 1)}{unit} vs élite
                        </span>
                      )}
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: val != null ? color : '#334155' }}>
                        {val ?? '—'}<span style={{ fontSize: '0.68rem', color: '#475569', marginLeft: 2 }}>{unit}</span>
                      </span>
                    </div>
                  </div>
                  <div style={{ position: 'relative', height: 10, background: '#0f172a', borderRadius: 5 }}>
                    {/* Barra jugador */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0,
                      height: '100%', width: `${pct}%`,
                      background: color, borderRadius: 5,
                      transition: 'width 0.6s ease', opacity: 0.85,
                    }} />
                    {/* Línea élite */}
                    <div style={{
                      position: 'absolute', top: -3, bottom: -3,
                      left: `${elitePct}%`, width: 2,
                      background: '#ef4444', borderRadius: 2,
                      transform: 'translateX(-50%)',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                    <span style={{ fontSize: '0.58rem', color: '#334155' }}>Élite: {elite}{unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #f59e0b' }}>
          <SecTitle color="#f59e0b">🧬 Composición Corporal</SecTitle>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Métrica</th><th style={{ textAlign: 'center', color: '#f59e0b' }}>Jugador</th><th style={{ textAlign: 'center' }}>Equipo</th><th style={{ textAlign: 'center', color: '#10b981' }}>Élite</th><th>Rank</th></tr></thead>
              <tbody>
                {[
                  { lbl: 'Músculo %',   val: jug.musc,   eq: stats.musc,   elite: '48.5', c: '#3b82f6', h: true },
                  { lbl: 'Adiposidad %',val: jug.adip,   eq: stats.adip,   elite: '11.0', c: '#ef4444', h: false },
                  { lbl: 'IMC',         val: jug.imc,    eq: stats.imc,    elite: '23.0', c: '#fff',    h: false },
                  { lbl: 'Visceral',    val: jug.visc,   eq: stats.visc,   elite: '4.0',  c: '#fff',    h: false },
                  { lbl: 'Edad Met.',   val: jug.ed_met, eq: stats.ed_met, elite: '20.0', c: '#f59e0b', h: false },
                ].map(r => (
                  <tr key={r.lbl}>
                    <td style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{r.lbl}</td>
                    <td style={{ textAlign: 'center', fontWeight: 900, color: r.c }}>{r.val ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#334155' }}>{fmtNum(r.eq.mean)}</td>
                    <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 700 }}>{r.elite}</td>
                    <td><PercBadge val={r.val} mean={r.eq.mean} sd={r.eq.sd} higher={r.h} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #10b981' }}>
          <SecTitle color="#10b981">🏃 Yo-Yo — Contexto Equipo</SecTitle>
          <div className="c4" style={{ marginBottom: 12 }}>
            {[
              { lbl: '2025', val: jug.y25, c: '#334155' },
              { lbl: '2026', val: jug.y26, c: '#10b981', bold: true },
              { lbl: 'Equipo', val: fmtNum(stats.yoyo.mean), c: '#475569' },
              { lbl: 'Élite', val: ELITE.yoyo, c: '#f59e0b' },
            ].map(({ lbl, val, c, bold }) => (
              <div key={lbl} style={{ background: '#060a14', border: '1px solid #0f172a', borderRadius: 8, padding: '9px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: bold ? '1.4rem' : '1.1rem', fontWeight: 900, color: c, lineHeight: 1 }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#1e293b', marginBottom: 8 }}>
            VO₂ est: <strong style={{ color: '#10b981' }}>{estimarVO2(jug.y26 || jug.y25)} ml/kg/min</strong>
          </div>
          
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[...ultimosDatos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25))} margin={{ left: -25, right: 5 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey={d => esJugador && d.id_jugador !== selId ? '' : d.jugadores?.apellido?.slice(0, 5)} tick={{ fill: '#64748b', fontSize: 9 }} />
              <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'Él', fill: '#ef4444', fontSize: 7 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [v, esJugador && p.payload.id_jugador !== selId ? 'Jugador' : p.payload.jugadores?.apellido]} />
              <Bar dataKey={d => d.y26 || d.y25} radius={[2, 2, 0, 0]} barSize={12}>
                {[...ultimosDatos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25)).map((d, i) => (
                  <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : '#1e3a5f'} opacity={d.id_jugador === selId ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle>⚡ Potencia y Asimetrías</SecTitle>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 360 }}>
              <thead><tr><th>Métrica</th><th style={{ textAlign: 'center' }}>Total</th><th style={{ textAlign: 'center' }}>Der</th><th style={{ textAlign: 'center' }}>Izq</th><th style={{ textAlign: 'center' }}>Asim%</th><th style={{ textAlign: 'center' }}>Eq</th></tr></thead>
              <tbody>
                {[
                  { lbl: 'CMJ cm',   tot: jug.cmj,   der: jug.cmj_de,   izq: jug.cmj_iz,   asim: jug.asym_cmj, eq: stats.cmj.mean,   c: '#3b82f6' },
                  { lbl: 'Broad m',  tot: jug.broad, der: jug.broad_de, izq: jug.broad_iz, asim: jug.asym_br,  eq: stats.broad.mean, c: '#f59e0b' },
                  { lbl: 'ABK cm',   tot: jug.abk,   der: '—',          izq: '—',          asim: null,         eq: stats.abk.mean,   c: '#8b5cf6' },
                ].map(r => (
                  <tr key={r.lbl}>
                    <td style={{ color: '#334155', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{r.lbl}</td>
                    <td style={{ textAlign: 'center', fontWeight: 900, color: r.c }}>{r.tot ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#475569' }}>{r.der ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#475569' }}>{r.izq ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.asim != null ? <span style={{ padding: '2px 6px', borderRadius: 3, background: asimColor(r.asim) + '22', color: asimColor(r.asim), fontWeight: 900, fontSize: '0.72rem' }}>{r.asim.toFixed(1)}%</span> : '—'}
                    </td>
                    <td style={{ textAlign: 'center', color: '#1e293b' }}>{fmtNum(r.eq)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, borderTop: '1px solid #0f172a', paddingTop: 12 }}>
            <div style={{ fontSize: '0.6rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Estado Kinésico</div>
            <div className="c2" style={{ gap: 6 }}>
              {[['🦶 Tob', jug.kin_t], ['🦴 Cad', jug.kin_c], ['⚖️ ZM', jug.kin_u], ['🏋️ Sent', jug.kin_s]].map(([l, v]) => {
                const ok = v && (v.toLowerCase().includes('optim') || v.toLowerCase().includes('sin obs'));
                return (
                  <div key={l} style={{ background: '#060a14', padding: '7px 9px', borderRadius: 6, borderLeft: `2px solid ${ok ? '#10b981' : v ? '#f59e0b' : '#1e293b'}` }}>
                    <div style={{ fontSize: '0.6rem', color: '#1e293b', fontWeight: 900 }}>{l}</div>
                    <div style={{ fontSize: '0.7rem', color: ok ? '#10b981' : v ? '#f59e0b' : '#334155', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v || 'S/D'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #f59e0b' }}>
        <SecTitle color="#f59e0b">🥗 Plan Nutricional</SecTitle>
        <div className="c2" style={{ alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Peso', `${jug.peso ?? '—'} kg`], ['∑ 6 Pliegues', `${jug.sum6 ?? '—'} mm`], ['Músculo', `${jug.musc ?? '—'} %`], ['Adiposidad', `${jug.adip ?? '—'} %`]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 11px', background: '#060a14', borderRadius: 6, border: '1px solid #0f172a' }}>
                <span style={{ color: '#1e293b', fontSize: '0.7rem' }}>{l}</span>
                <strong style={{ color: '#64748b', fontSize: '0.78rem' }}>{v}</strong>
              </div>
            ))}
          </div>
          <div style={{ background: '#060a14', borderRadius: 9, padding: 14, maxHeight: 180, overflowY: 'auto', border: '1px solid #0f172a' }}>
            {jug.plan_nutricional
              ? <div dangerouslySetInnerHTML={{ __html: jug.plan_nutricional }} style={{ fontSize: '0.78rem', lineHeight: 1.7, color: '#64748b' }} />
              : <div style={{ color: '#1e293b', fontStyle: 'italic', textAlign: 'center', marginTop: 25 }}>Sin plan cargado.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB FÍSICO
// ════════════════════════════════════════════════════════════════════════════
function TabFisico({ jug, stats, ultimosDatos, ultimosDatosGlobal, esJugador, selId }) {
  if (!jug) return <Empty />;
  const yoyo = jug.y26 || jug.y25;

  const radarData = [
    { m: 'CMJ',   J: jug.cmj ? (jug.cmj / ELITE.cmj) * 100 : 0,   E: 100 },
    { m: 'ABK',   J: jug.abk ? (jug.abk / ELITE.abk) * 100 : 0,   E: 100 },
    { m: 'Broad', J: jug.broad ? (jug.broad / ELITE.broad) * 100 : 0, E: 100 },
    { m: 'Yo-Yo', J: yoyo ? (yoyo / ELITE.yoyo) * 100 : 0,        E: 100 },
  ];
  
  const cmjRank = [...ultimosDatosGlobal].filter(d => d.cmj).sort((a, b) => b.cmj - a.cmj);
  const pos = cmjRank.findIndex(d => d.id_jugador === jug.id_jugador) + 1;

  return (
    <div className="rg">
      <div className="c4">
        {[
          { lbl: 'CMJ',   val: jug.cmj,   eq: stats.cmj,   unit: 'cm', color: '#3b82f6', elite: ELITE.cmj },
          { lbl: 'ABK',   val: jug.abk,   eq: stats.abk,   unit: 'cm', color: '#8b5cf6', elite: ELITE.abk },
          { lbl: 'Broad', val: jug.broad, eq: stats.broad, unit: 'm',  color: '#10b981', elite: ELITE.broad },
          { lbl: 'Yo-Yo', val: yoyo,      eq: stats.yoyo,  unit: '',   color: '#f59e0b', elite: ELITE.yoyo },
        ].map(({ lbl, val, eq, unit, color, elite }) => (
          <KpiCard key={lbl} label={lbl} value={val ?? '—'} unit={unit} color={color} accent={color}
            sub={`Eq: ${fmtNum(eq.mean)}${unit} · Él: ${elite}${unit}`} />
        ))}
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#3b82f6">Perfil Atlético vs Élite <Tip t="100% = Nivel Élite Mundial." /></SecTitle>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart cx="50%" cy="50%" outerRadius="62%" data={radarData}>
              <PolarGrid stroke="#0f172a" />
              <PolarAngleAxis dataKey="m" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }} />
              <PolarRadiusAxis domain={[0, 'auto']} tick={false} axisLine={false} />
              <Radar name={jug.jugadores?.apellido} dataKey="J" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.55} />
              <Radar name="Élite" dataKey="E" stroke="#ef4444" fill="transparent" strokeDasharray="4 3" />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} formatter={v => [`${v.toFixed(1)}%`, '% Élite']} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">🏆 Ranking CMJ Plantel</SecTitle>
          <div style={{ fontSize: '0.7rem', color: '#1e293b', marginBottom: 10 }}>
            {jug.jugadores?.apellido}: posición <strong style={{ color: '#f59e0b' }}>{pos}/{cmjRank.length}</strong>
          </div>
          
          <div className="scroll">
            {cmjRank.map((d, i) => {
              const isMe = d.id_jugador === jug.id_jugador;
              const pct = Math.min(100, (d.cmj / ELITE.cmj) * 100);
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, marginBottom: 3, background: isMe ? 'rgba(59,130,246,0.09)' : 'transparent', border: isMe ? '1px solid #3b82f622' : '1px solid transparent' }}>
                  <span style={{ color: i === 0 ? '#f59e0b' : '#1e293b', fontWeight: 900, fontSize: '0.72rem', minWidth: 20, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '0.76rem', fontWeight: isMe ? 900 : 600, color: isMe ? '#fff' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{esJugador && !isMe ? 'Compañero' : d.jugadores?.apellido}</span>
                  <div style={{ width: 55, background: '#0f172a', borderRadius: 2, height: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: isMe ? '#3b82f6' : '#1e293b', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: '0.76rem', fontWeight: 900, color: isMe ? '#3b82f6' : '#1e293b', minWidth: 38, textAlign: 'right' }}>{d.cmj}cm</span>
                </div>
              );
            })}
          </div>
          
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 20 }}>
        <SecTitle color="#ef4444">📊 Déficit Bilateral CMJ {esJugador ? '' : '— Plantel'} <Tip t=">10% = factor de riesgo lesional. Amarillo = jugador seleccionado." /></SecTitle>
        <div style={{ fontSize: '0.7rem', color: '#1e293b', marginBottom: 10 }}>
          {jug.jugadores?.apellido}: {jug.asym_cmj != null ? (
            <span style={{ color: asimColor(jug.asym_cmj), fontWeight: 900 }}>
              {jug.asym_cmj.toFixed(1)}% — {Math.abs(jug.asym_cmj) > 15 ? '🔴 RIESGO ALTO' : Math.abs(jug.asym_cmj) > 10 ? '🟡 ATENCIÓN' : '🟢 OK'}
            </span>
          ) : <span style={{ color: '#1e293b' }}>Sin datos unilaterales</span>}
        </div>
        
        <ResponsiveContainer width="100%" height={270}>
          <BarChart data={ultimosDatos.filter(d => d.asym_cmj != null).sort((a, b) => Math.abs(b.asym_cmj) - Math.abs(a.asym_cmj))} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" horizontal={false} />
            <XAxis type="number" domain={[-30, 30]} tick={{ fill: '#64748b', fontSize: 11 }} stroke="#0f172a" />
            <YAxis dataKey={d => esJugador && d.id_jugador !== selId ? '' : d.jugadores?.apellido} type="category" tick={{ fill: '#64748b', fontSize: 12 }} width={80} stroke="#0f172a" />
            <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} formatter={(v, n, p) => [`${v.toFixed(1)}%`, 'Asimetría']} />
            <ReferenceLine x={0} stroke="#1e293b" />
            <ReferenceLine x={-10} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
            <ReferenceLine x={10} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4} />
            <Bar dataKey="asym_cmj" barSize={11}>
              {ultimosDatos.filter(d => d.asym_cmj != null).sort((a, b) => Math.abs(b.asym_cmj) - Math.abs(a.asym_cmj)).map((d, i) => (
                <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : Math.abs(d.asym_cmj) > 10 ? '#ef4444' : '#1e3a5f'} opacity={d.id_jugador === selId ? 1 : 0.65} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        
      </div>

      <div className="glass-panel" style={{ padding: 20 }}>
        <SecTitle color="#3b82f6">📊 CMJ Plantel — {jug.jugadores?.apellido} destacado</SecTitle>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={cmjRank} margin={{ left: -20, right: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
            <XAxis dataKey={d => esJugador && d.id_jugador !== selId ? '' : d.jugadores?.apellido?.slice(0, 6)} tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis domain={[0, 70]} tick={{ fill: '#64748b', fontSize: 11 }} />
            <ReferenceLine y={ELITE.cmj} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Élite', fill: '#ef4444', fontSize: 8 }} />
            <ReferenceLine y={stats.cmj.mean} stroke="#3b82f633" strokeDasharray="2 4" label={{ value: `⌀${fmtNum(stats.cmj.mean)}`, fill: '#3b82f6', fontSize: 8 }} />
            <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [v + ' cm', esJugador && p.payload.id_jugador !== selId ? 'Jugador' : p.payload.jugadores?.apellido]} />
            <Bar dataKey="cmj" radius={[3, 3, 0, 0]} barSize={15}>
              {cmjRank.map((d, i) => (
                <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : d.cmj >= ELITE.cmj ? '#10b981' : '#1e3a5f'} opacity={d.id_jugador === selId ? 1 : 0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 14, borderTop: '1px solid #0f172a', paddingTop: 12 }}>
          <div style={{ fontSize: '0.62rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Top 5 Índice Reactivo (ABK − CMJ)</div>
          {ultimosDatos.filter(d => d.abk && d.cmj).sort((a, b) => (b.abk - b.cmj) - (a.abk - a.cmj)).slice(0, 5).map((d, i) => {
            const dif = (d.abk - d.cmj).toFixed(1);
            const isMe = d.id_jugador === selId;
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, marginBottom: 3, background: isMe ? 'rgba(245,158,11,0.07)' : '#060a14', border: isMe ? '1px solid #f59e0b33' : '1px solid #0f172a' }}>
                <span style={{ color: i === 0 ? '#f59e0b' : '#0f172a', fontWeight: 900, fontSize: '0.75rem', minWidth: 18 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: '0.76rem', fontWeight: isMe ? 900 : 600, color: isMe ? '#fff' : '#475569' }}>{esJugador && !isMe ? 'Compañero' : d.jugadores?.apellido}</span>
                <span style={{ fontSize: '0.66rem', color: '#1e293b' }}>+{dif}</span>
              </div>
            );
          })}
        </div>
      </div>
      
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB KINE
// ════════════════════════════════════════════════════════════════════════════
function TabKine({ jug, stats, ultimosDatos, ultimosDatosGlobal, esJugador, selId }) {
  if (!jug) return <Empty />;
  const obs = `${jug.kin_t || ''} ${jug.kin_c || ''} ${jug.kin_u || ''} ${jug.kin_s || ''}`.toLowerCase();
  const vids = (() => {
    const v = [];
    if (obs.includes('isquio')) v.push(...REHAB_LIB.isquiosural);
    if (obs.includes('movilidad')) v.push(...REHAB_LIB.movilidad);
    if (obs.includes('tobillo')) v.push(...REHAB_LIB.tobillo);
    if (obs.includes('pelvi') || obs.includes('estabilidad')) v.push(...REHAB_LIB.pelvica);
    if (obs.includes('cader')) v.push(...REHAB_LIB.cadera);
    if (obs.includes('escapul')) v.push(...REHAB_LIB.escapular);
    if (!v.length) v.push(...REHAB_LIB.pelvica);
    return [...new Map(v.map(x => [x.t, x])).values()].slice(0, 3);
  })();

  return (
    <div className="rg">
      <div className="c2">
        <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #10b981' }}>
          <SecTitle color="#10b981">🩺 Estado Kinésico — {jug.jugadores?.apellido}</SecTitle>
          <div className="c2" style={{ marginBottom: 16 }}>
            {[['🦶 Tobillo / Pie', jug.kin_t], ['🦴 Cadera (Jurdan)', jug.kin_c], ['⚖️ Zona Media', jug.kin_u], ['🏋️ Sentadilla', jug.kin_s]].map(([lbl, val]) => {
              const ok = val && (val.toLowerCase().includes('optim') || val.toLowerCase().includes('sin obs') || val.toLowerCase().includes('+90'));
              const color = ok ? '#10b981' : val ? '#f59e0b' : '#1e293b';
              return (
                <div key={lbl} style={{ background: '#060a14', border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: '0.62rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>{lbl}</div>
                  <div style={{ fontSize: '0.8rem', color, fontWeight: 700, lineHeight: 1.3 }}>{val || 'S/D'}</div>
                  <span style={{ fontSize: '0.58rem', padding: '2px 6px', background: color + '22', color, borderRadius: 3, fontWeight: 900, marginTop: 5, display: 'inline-block' }}>
                    {ok ? '✓ OK' : val ? '⚠ ATENCIÓN' : 'SIN DATOS'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid #0f172a', paddingTop: 13 }}>
            <div style={{ fontSize: '0.62rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 9 }}>Videos Prescritos</div>
            <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 4 }}>
              {vids.map((vid, i) => (
                <div key={i} style={{ minWidth: 165, flexShrink: 0 }}>
                  <iframe src={getEmbedUrl(vid.v)} style={{ width: '100%', height: 98, borderRadius: 7 }} frameBorder="0" allowFullScreen title={vid.t} />
                  <div style={{ fontSize: '0.66rem', color: '#475569', textAlign: 'center', marginTop: 3 }}>{vid.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#ef4444">📊 Asimetría — {jug.jugadores?.apellido} {esJugador ? '' : 'vs Plantel'}</SecTitle>
          {jug.asym_cmj != null ? (
            <>
              <div style={{ background: '#060a14', borderRadius: 9, padding: 14, marginBottom: 14, border: `1px solid ${asimColor(jug.asym_cmj)}33` }}>
                <div style={{ fontSize: '0.62rem', color: '#1e293b', textTransform: 'uppercase', fontWeight: 900 }}>Asimetría CMJ</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: asimColor(jug.asym_cmj), margin: '6px 0' }}>{jug.asym_cmj.toFixed(1)}%</div>
                <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                  {Math.abs(jug.asym_cmj) > 15 ? '🔴 RIESGO ALTO — Protocolo urgente'
                    : Math.abs(jug.asym_cmj) > 10 ? '🟡 ZONA ATENCIÓN — Seguimiento recomendado'
                      : '🟢 RANGO ACEPTABLE'}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: '0.72rem' }}>
                  <span>Der: <strong style={{ color: '#3b82f6' }}>{jug.cmj_de ?? '—'} cm</strong></span>
                  <span>Izq: <strong style={{ color: '#8b5cf6' }}>{jug.cmj_iz ?? '—'} cm</strong></span>
                </div>
              </div>
              
              <div style={{ fontSize: '0.62rem', color: '#1e293b', fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Comparación plantel</div>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={[...ultimosDatosGlobal].filter(d => d.asym_cmj != null).sort((a, b) => b.asym_cmj - a.asym_cmj)} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
                  <XAxis dataKey={d => esJugador && d.id_jugador !== selId ? '' : d.jugadores?.apellido?.slice(0, 5)} tick={{ fill: '#64748b', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="2 2" opacity={0.35} />
                  <ReferenceLine y={-10} stroke="#ef4444" strokeDasharray="2 2" opacity={0.35} />
                  <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [v.toFixed(1) + '%', esJugador && p.payload.id_jugador !== selId ? 'Jugador' : p.payload.jugadores?.apellido]} />
                  <Bar dataKey="asym_cmj" barSize={11}>
                    {[...ultimosDatosGlobal].filter(d => d.asym_cmj != null).sort((a, b) => b.asym_cmj - a.asym_cmj).map((d, i) => (
                      <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : Math.abs(d.asym_cmj) > 10 ? '#ef4444' : '#1e3a5f'} opacity={d.id_jugador === selId ? 1 : 0.6} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              
            </>
          ) : (
            <div style={{ color: '#0f172a', textAlign: 'center', marginTop: 60 }}>Sin datos unilaterales.</div>
          )}
        </div>
      </div>

      {!esJugador && (
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">📋 Gabinete Kinésico — Plantel Completo</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 9 }}>
            {ultimosDatosGlobal.filter(j => j.kin_t || j.kin_c || j.kin_u).map(j => {
              const isMe = j.id_jugador === selId;
              return (
                <div key={j.id} style={{ background: isMe ? 'rgba(16,185,129,0.07)' : '#060a14', padding: 11, borderRadius: 8, border: isMe ? '1px solid #10b98133' : '1px solid #0f172a' }}>
                  <strong style={{ color: isMe ? '#10b981' : '#475569', display: 'block', marginBottom: 5, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMe ? '👤 ' : ''}{j.jugadores?.apellido}</strong>
                  {[['Tob', j.kin_t], ['Cad', j.kin_c], ['ZM', j.kin_u]].map(([l, v]) => v ? (
                    <div key={l} style={{ fontSize: '0.66rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: '#0f172a' }}>{l}: </span>
                      <span style={{ color: v.includes('optim') || v.includes('óptim') ? '#10b981' : '#f59e0b' }}>{v}</span>
                    </div>
                  ) : null)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 20 }}>
        <SecTitle color="#8b5cf6">📚 Biblioteca Prevención & Rehab</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 13 }}>
          {Object.entries(REHAB_LIB).map(([cat, vs]) => (
            <div key={cat} style={{ background: '#060a14', padding: 13, borderRadius: 10, border: '1px solid #0f172a' }}>
              <h4 style={{ textTransform: 'uppercase', color: '#1e293b', margin: '0 0 9px', fontSize: '0.68rem', fontWeight: 900, letterSpacing: 1 }}>{cat}</h4>
              {vs.map((v, i) => (
                <div key={i} style={{ marginBottom: 9 }}>
                  <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.t}</div>
                  <iframe src={getEmbedUrl(v.v)} style={{ width: '100%', height: 112, borderRadius: 6 }} frameBorder="0" allowFullScreen title={v.t} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB NUTRI
// ════════════════════════════════════════════════════════════════════════════
function TabNutri({ jug, stats, ultimosDatos, esJugador, selId }) {
  if (!jug) return <Empty />;
  const tieneISAK = jug.pl_tri != null;
  const radarISAK = [
    { p: 'Tricipital',   J: jug.pl_tri || 0, Eq: stats.pl_tri.mean },
    { p: 'Subescap.',    J: jug.pl_sub || 0, Eq: stats.pl_sub.mean },
    { p: 'Bicipital',    J: jug.pl_bic || 0, Eq: stats.pl_bic.mean },
    { p: 'C. Ilíaca',    J: jug.pl_cre || 0, Eq: stats.pl_cre.mean },
    { p: 'Supraespinal', J: jug.pl_sup || 0, Eq: stats.pl_sup.mean },
    { p: 'Abdominal',    J: jug.pl_abd || 0, Eq: stats.pl_abd.mean },
  ];

  return (
    <div className="rg">
      <div className="c4">
        <KpiCard label="Músculo %"    value={jug.musc ?? '—'}  color="#3b82f6" accent="#3b82f6" sub={`Eq: ${fmtNum(stats.musc.mean)}% · Él: ${ELITE.musc}%`} />
        <KpiCard label="Adiposidad %" value={jug.adip ?? '—'}  color="#ef4444" accent="#ef4444" sub={`Eq: ${fmtNum(stats.adip.mean)}% · Él: ${ELITE.adip}%`} />
        <KpiCard label="∑ 6 Pliegues" value={jug.sum6 ?? '—'} unit=" mm" color="#f59e0b" accent="#f59e0b" sub={`Eq: ${fmtNum(stats.sum6.mean)}mm · Él: ${ELITE.sum6}mm`} />
        <KpiCard label="Peso"         value={jug.peso ?? '—'} unit=" kg" color="#fff"    accent="#334155" sub={jug.altura ? `Altura: ${jug.altura}cm` : 'Altura: —'} />
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #f59e0b' }}>
          <SecTitle color="#f59e0b">📐 Perfil ISAK — Pliegues vs Promedio Equipo</SecTitle>
          {tieneISAK ? (
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart cx="50%" cy="50%" outerRadius="62%" data={radarISAK}>
                <PolarGrid stroke="#0f172a" />
                <PolarAngleAxis dataKey="p" tick={{ fill: '#64748b', fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 'auto']} tick={false} axisLine={false} />
                <Radar name={jug.jugadores?.apellido} dataKey="J" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                <Radar name="Promedio Equipo" dataKey="Eq" stroke="#334155" fill="transparent" strokeDasharray="4 3" />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} formatter={v => [`${v.toFixed(1)} mm`]} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', color: '#0f172a', marginTop: 80 }}>Sin datos ISAK cargados.</div>
          )}
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#f59e0b">🥗 Plan Nutricional</SecTitle>
          {[['Peso', `${jug.peso ?? '—'} kg`], ['∑ 6 Pliegues', `${jug.sum6 ?? '—'} mm`], ['Altura', `${jug.altura ?? '—'} cm`], ['Adiposidad', `${jug.adip ?? '—'} %`]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: '#060a14', borderRadius: 6, marginBottom: 5, border: '1px solid #0f172a' }}>
              <span style={{ color: '#1e293b', fontSize: '0.7rem' }}>{l}</span>
              <strong style={{ color: '#64748b' }}>{v}</strong>
            </div>
          ))}
          <div style={{ background: '#060a14', borderRadius: 9, padding: 13, marginTop: 10, maxHeight: 240, overflowY: 'auto', border: '1px solid #0f172a' }}>
            {jug.plan_nutricional
              ? <div dangerouslySetInnerHTML={{ __html: jug.plan_nutricional }} style={{ fontSize: '0.76rem', lineHeight: 1.7, color: '#64748b' }} />
              : <div style={{ color: '#0f172a', fontStyle: 'italic', textAlign: 'center', marginTop: 30 }}>Sin plan cargado.</div>}
          </div>
        </div>
      </div>

      {!esJugador && (
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#ef4444">📊 Ranking Adiposidad Plantel (∑ 6 pliegues) — {jug.jugadores?.apellido} destacado</SecTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[...ultimosDatos].filter(d => d.sum6).sort((a, b) => b.sum6 - a.sum6)} margin={{ left: -20, right: 10 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey={d => esJugador && d.id_jugador !== selId ? '' : d.jugadores?.apellido?.slice(0, 7)} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [`${v} mm`, p.payload.jugadores?.apellido]} />
              <ReferenceLine y={ELITE.sum6} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Élite', fill: '#10b981', fontSize: 8 }} />
              <Bar dataKey="sum6" radius={[3, 3, 0, 0]} barSize={16}>
                {[...ultimosDatos].filter(d => d.sum6).sort((a, b) => b.sum6 - a.sum6).map((d, i) => (
                  <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : d.sum6 > 80 ? '#ef4444' : d.sum6 > 55 ? '#f59e0b55' : '#10b98155'} opacity={d.id_jugador === selId ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB EQUIPO — Solo visible para Staff
// ════════════════════════════════════════════════════════════════════════════
function TabEquipo({ stats, ultimosDatos, selId, historial }) {
  const posData = useMemo(() => {
    const g = { Arquero: [], Cierre: [], Ala: [], Pivot: [] };
    ultimosDatos.forEach(d => {
      const p = (d.jugadores?.posicion || '').toLowerCase();
      const k = p.includes('arquero') ? 'Arquero' : p.includes('cierre') || p.includes('defensa') ? 'Cierre' : p.includes('pivot') ? 'Pivot' : 'Ala';
      g[k].push(d);
    });
    return Object.entries(g).filter(([, v]) => v.length).map(([name, v]) => {
      const cmjs = v.filter(d => d.cmj).map(d => d.cmj);
      const yoys = v.filter(d => d.y26 || d.y25).map(d => d.y26 || d.y25);
      const musc = v.filter(d => d.musc).map(d => d.musc);
      const adip = v.filter(d => d.adip).map(d => d.adip);
      return {
        name, n: v.length,
        CMJ:   cmjs.length ? +(cmjs.reduce((a, b) => a + b, 0) / cmjs.length).toFixed(1) : 0,
        YoYo:  yoys.length ? +(yoys.reduce((a, b) => a + b, 0) / yoys.length).toFixed(1) : 0,
        Musc:  musc.length ? +(musc.reduce((a, b) => a + b, 0) / musc.length).toFixed(1) : 0,
        Adip:  adip.length ? +(adip.reduce((a, b) => a + b, 0) / adip.length).toFixed(1) : 0,
      };
    });
  }, [ultimosDatos]);

  const ranking = [...ultimosDatos].sort((a, b) => (b.cmj || 0) - (a.cmj || 0));

  const yoyoEvol = useMemo(() => {
    const byFecha = {};
    historial.forEach(r => {
      const f = r.fecha_medicion?.slice(0, 7);
      if (!f) return;
      if (!byFecha[f]) byFecha[f] = [];
      const v = r.y26 || r.y25;
      if (v) byFecha[f].push(Number(v));
    });
    return Object.entries(byFecha).sort().map(([f, vs]) => ({
      f,
      avg: +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2),
      n: vs.length,
    }));
  }, [historial]);

  return (
    <div className="rg">
      <div className="c4">
        <KpiCard label="CMJ Promedio"   value={fmtNum(stats.cmj.mean)}   unit=" cm" color="#3b82f6" accent="#3b82f6" sub={`SD: ${fmtNum(stats.cmj.sd)} · Élite: ${ELITE.cmj}cm`} />
        <KpiCard label="Yo-Yo Promedio" value={fmtNum(stats.yoyo.mean)}  unit=""    color="#10b981" accent="#10b981" sub={`VO₂ est: ${estimarVO2(stats.yoyo.mean)}`} />
        <KpiCard label="Músculo %"      value={fmtNum(stats.musc.mean)}  unit="%"   color="#f59e0b" accent="#f59e0b" sub={`SD: ${fmtNum(stats.musc.sd)} · Élite: ${ELITE.musc}%`} />
        <KpiCard label="Adiposidad %"   value={fmtNum(stats.adip.mean)}  unit="%"   color="#ef4444" accent="#ef4444" sub={`SD: ${fmtNum(stats.adip.sd)} · Élite: ${ELITE.adip}%`} />
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">🏃 Yo-Yo — Comparativa Plantel Completo</SecTitle>
          <div style={{ fontSize: '0.68rem', color: '#1e293b', marginBottom: 8 }}>
            {ultimosDatos.filter(d => d.y26 || d.y25).length} jugadores · Promedio: <strong style={{ color: '#10b981' }}>{fmtNum(stats.yoyo.mean)}</strong> · Élite: {ELITE.yoyo}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={[...ultimosDatos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25))}
              margin={{ left: -15, right: 5, bottom: 32 }}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey={d => d.jugadores?.apellido?.slice(0, 8)} tick={{ fill: '#64748b', fontSize: 12 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 12 }} />
              <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: `Élite ${ELITE.yoyo}`, fill: '#ef4444', fontSize: 8, position: 'insideTopRight' }} />
              <ReferenceLine y={stats.yoyo.mean} stroke="#33415566" strokeDasharray="2 4" label={{ value: `⌀${fmtNum(stats.yoyo.mean)}`, fill: '#64748b', fontSize: 12 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [`${v} — ${p.payload.jugadores?.apellido}`, 'Yo-Yo']} />
              <Bar dataKey={d => d.y26 || d.y25} name="Yo-Yo" radius={[3, 3, 0, 0]} barSize={17}>
                {[...ultimosDatos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25)).map((d, i) => (
                  <Cell key={i}
                    fill={d.id_jugador === selId ? '#f59e0b' : (d.y26 || d.y25) >= ELITE.yoyo ? '#10b981' : (d.y26 || d.y25) >= stats.yoyo.mean ? '#1e3a5f' : '#0f172a'}
                    stroke={d.id_jugador === selId ? '#f59e0b44' : 'transparent'}
                    opacity={(d.y26 || d.y25) < stats.yoyo.mean && d.id_jugador !== selId ? 0.5 : 0.9}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">📈 Evolución Yo-Yo — Promedio Equipo</SecTitle>
          {yoyoEvol.length > 1 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={yoyoEvol} margin={{ left: -10, right: 20 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" />
                <XAxis dataKey="f" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 12 }} />
                <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Élite', fill: '#ef4444', fontSize: 8 }} />
                <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [`${v} (n=${p.payload.n})`, 'Prom. equipo']} />
                <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', color: '#1e293b', marginTop: 80, fontSize: '0.8rem' }}>Se necesitan al menos 2 tomas históricas para mostrar la evolución.</div>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {yoyoEvol.map(d => (
              <div key={d.f} style={{ background: '#060a14', padding: '5px 10px', borderRadius: 5, border: '1px solid #0f172a', fontSize: '0.66rem' }}>
                <span style={{ color: '#1e293b' }}>{d.f}: </span>
                <strong style={{ color: '#10b981' }}>{d.avg}</strong>
                <span style={{ color: '#334155', marginLeft: 4 }}>n={d.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#8b5cf6">📍 Promedios por Posición Táctica</SecTitle>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={posData} margin={{ top: 10, left: -20, right: 5 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis yAxisId="l" domain={[0, 70]} tick={{ fontSize: 9, fill: '#1e293b' }} />
              <YAxis yAxisId="r" orientation="right" domain={[0, 25]} tick={{ fontSize: 9, fill: '#1e293b' }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="l" y={ELITE.cmj} stroke="#3b82f633" strokeDasharray="3 3" />
              <Bar yAxisId="l" dataKey="CMJ"  name="CMJ (cm)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} />
              <Bar yAxisId="r" dataKey="YoYo" name="Yo-Yo"    fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {posData.map(p => (
              <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#060a14', borderRadius: 6 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#475569' }}>{p.name}</span>
                <span style={{ fontSize: '0.68rem', color: '#1e293b' }}>n={p.n}</span>
                <span style={{ fontSize: '0.72rem' }}>CMJ <strong style={{ color: '#3b82f6' }}>{p.CMJ}</strong></span>
                <span style={{ fontSize: '0.72rem' }}>YoYo <strong style={{ color: '#10b981' }}>{p.YoYo}</strong></span>
                <span style={{ fontSize: '0.72rem' }}>💪 <strong style={{ color: '#f59e0b' }}>{p.Musc}%</strong></span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#3b82f6">📊 Distribución CMJ Plantel</SecTitle>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={[...ultimosDatos].filter(d => d.cmj).sort((a, b) => b.cmj - a.cmj)} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey={d => d.jugadores?.apellido?.slice(0, 6)} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis domain={[0, 70]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <ReferenceLine y={ELITE.cmj} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Élite', fill: '#ef4444', fontSize: 8 }} />
              <ReferenceLine y={stats.cmj.mean} stroke="#3b82f633" strokeDasharray="2 4" label={{ value: `⌀${fmtNum(stats.cmj.mean)}`, fill: '#3b82f6', fontSize: 8 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [v + ' cm', p.payload.jugadores?.apellido]} />
              <Bar dataKey="cmj" radius={[3, 3, 0, 0]} barSize={15}>
                {[...ultimosDatos].filter(d => d.cmj).sort((a, b) => b.cmj - a.cmj).map((d, i) => (
                  <Cell key={i} fill={d.id_jugador === selId ? '#f59e0b' : d.cmj >= ELITE.cmj ? '#10b981' : '#1e3a5f'} opacity={d.id_jugador === selId ? 1 : 0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 20 }}>
        <SecTitle>📋 Ranking General — Todos los Jugadores</SecTitle>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>#</th><th>Jugador</th><th>Pos</th>
                <th style={{ textAlign: 'center', color: '#3b82f6' }}>CMJ</th>
                <th style={{ textAlign: 'center', color: '#8b5cf6' }}>ABK</th>
                <th style={{ textAlign: 'center', color: '#10b981' }}>Broad</th>
                <th style={{ textAlign: 'center', color: '#f59e0b' }}>Yo-Yo</th>
                <th style={{ textAlign: 'center', color: '#3b82f6' }}>Musc%</th>
                <th style={{ textAlign: 'center', color: '#ef4444' }}>Adip%</th>
                <th style={{ textAlign: 'center' }}>Asim</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((d, i) => {
                const isMe = d.id_jugador === selId;
                const yy = d.y26 || d.y25;
                return (
                  <tr key={d.id} style={{ background: isMe ? 'rgba(59,130,246,0.07)' : 'transparent' }}>
                    <td style={{ color: i < 3 ? '#f59e0b' : '#1e293b', fontWeight: 900 }}>{i + 1}</td>
                    <td style={{ fontWeight: isMe ? 900 : 600, color: isMe ? '#fff' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMe ? '👤 ' : ''}{d.jugadores?.apellido}</td>
                    <td style={{ color: '#1e293b', fontSize: '0.68rem' }}>{d.jugadores?.posicion || '—'}</td>
                    <td style={{ textAlign: 'center', color: '#3b82f6', fontWeight: 700 }}>{d.cmj ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#8b5cf6' }}>{d.abk ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#10b981' }}>{d.broad ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#f59e0b' }}>{yy ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: '#3b82f6' }}>{d.musc ?? '—'}</td>
                    <td style={{ textAlign: 'center', color: d.adip > 20 ? '#ef4444' : '#64748b' }}>{d.adip ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {d.asym_cmj != null
                        ? <span style={{ color: asimColor(d.asym_cmj), fontWeight: 900, fontSize: '0.72rem' }}>{d.asym_cmj.toFixed(1)}%</span>
                        : <span style={{ color: '#0f172a' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TAB VS — Solo visible para Staff
// ════════════════════════════════════════════════════════════════════════════
function TabVS({ datos, stats, selId, historial }) {
  const [jugs, setJugs] = useState([null, null, null, null]);
  useEffect(() => {
    if (datos.length >= 2 && jugs[0] === null) {
      const otros = datos.filter(d => d.id_jugador !== selId);
      setJugs([selId || datos[0].id_jugador, otros[0]?.id_jugador || null, null, null]);
    }
  }, [datos, selId]);

  const setJug = (i, v) => { const n = [...jugs]; n[i] = v ? parseInt(v) : null; setJugs(n); };
  const getJug = id => datos.find(j => j.id_jugador === id);
  const COLS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];
  const active = jugs.filter(Boolean);

  const radarComp = useMemo(() => {
    const jd = jugs.map(id => getJug(id));
    const pct = (val, elite) => val ? (Number(val) / elite) * 100 : 0;
    return [
      { m: 'CMJ',     A: pct(jd[0]?.cmj, ELITE.cmj),   B: pct(jd[1]?.cmj, ELITE.cmj),   C: pct(jd[2]?.cmj, ELITE.cmj),   D: pct(jd[3]?.cmj, ELITE.cmj),   E: 100 },
      { m: 'ABK',     A: pct(jd[0]?.abk, ELITE.abk),   B: pct(jd[1]?.abk, ELITE.abk),   C: pct(jd[2]?.abk, ELITE.abk),   D: pct(jd[3]?.abk, ELITE.abk),   E: 100 },
      { m: 'Broad',   A: pct(jd[0]?.broad, ELITE.broad), B: pct(jd[1]?.broad, ELITE.broad), C: pct(jd[2]?.broad, ELITE.broad), D: pct(jd[3]?.broad, ELITE.broad), E: 100 },
      { m: 'Yo-Yo',   A: pct(jd[0]?.y26 || jd[0]?.y25, ELITE.yoyo), B: pct(jd[1]?.y26 || jd[1]?.y25, ELITE.yoyo), C: pct(jd[2]?.y26 || jd[2]?.y25, ELITE.yoyo), D: pct(jd[3]?.y26 || jd[3]?.y25, ELITE.yoyo), E: 100 },
      { m: 'Músculo', A: pct(jd[0]?.musc, ELITE.musc), B: pct(jd[1]?.musc, ELITE.musc), C: pct(jd[2]?.musc, ELITE.musc), D: pct(jd[3]?.musc, ELITE.musc), E: 100 },
    ];
  }, [jugs]);

  const yoyoHistComp = useMemo(() => {
    const fechas = [...new Set(historial.map(r => r.fecha_medicion?.slice(0, 7)).filter(Boolean))].sort();
    return fechas.map(f => {
      const row = { f };
      active.forEach((id, i) => {
        const reg = historial.find(r => r.id_jugador === id && r.fecha_medicion?.slice(0, 7) === f);
        row[`J${i}`] = reg ? (reg.y26 || reg.y25 || null) : null;
      });
      return row;
    }).filter(row => active.some((_, i) => row[`J${i}`] != null));
  }, [jugs, historial, active]);

  return (
    <div className="rg">
      <div className="glass-panel" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i}>
              <div style={{ fontSize: '0.58rem', color: COLS[i], fontWeight: 900, textTransform: 'uppercase', marginBottom: 5, letterSpacing: 1 }}>Jugador {i + 1}</div>
              <select className="select-dark" style={{ border: `1px solid ${COLS[i]}44`, fontSize: '0.8rem', padding: '8px 10px', color: jugs[i] ? '#fff' : '#334155' }}
                value={jugs[i] || ''} onChange={e => setJug(i, e.target.value)}>
                <option value="">— Vacío —</option>
                {datos.map(j => <option key={`${i}-${j.id}`} value={j.id_jugador}>{j.jugadores?.apellido}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="c2">
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle>⚖️ Perfil vs Élite Comparativo</SecTitle>
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart cx="50%" cy="50%" outerRadius="62%" data={radarComp}>
              <PolarGrid stroke="#0f172a" />
              <PolarAngleAxis dataKey="m" tick={{ fill: '#64748b', fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 'auto']} tick={false} axisLine={false} />
              <Radar name="ÉLITE" dataKey="E" stroke="#ef4444" fill="transparent" strokeDasharray="4 3" strokeWidth={1.5} />
              {jugs[0] && <Radar name={getJug(jugs[0])?.jugadores?.apellido} dataKey="A" stroke={COLS[0]} fill={COLS[0]} fillOpacity={0.3} />}
              {jugs[1] && <Radar name={getJug(jugs[1])?.jugadores?.apellido} dataKey="B" stroke={COLS[1]} fill={COLS[1]} fillOpacity={0.3} />}
              {jugs[2] && <Radar name={getJug(jugs[2])?.jugadores?.apellido} dataKey="C" stroke={COLS[2]} fill={COLS[2]} fillOpacity={0.3} />}
              {jugs[3] && <Radar name={getJug(jugs[3])?.jugadores?.apellido} dataKey="D" stroke={COLS[3]} fill={COLS[3]} fillOpacity={0.3} />}
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} formatter={v => [v ? `${v.toFixed(1)}%` : '0%', '% Élite']} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">🏃 Yo-Yo — Comparativa Directa</SecTitle>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={active.map(id => getJug(id)).filter(Boolean).map((d, i) => ({ name: d.jugadores?.apellido?.slice(0, 10), y25: d.y25 || null, y26: d.y26 || null, id: d.id_jugador, col: COLS[i] }))}
              margin={{ left: -15, right: 10 }}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 12 }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Élite', fill: '#ef4444', fontSize: 8 }} />
              <Bar dataKey="y25" name="2025" fill="#1e3a5f" radius={[2, 2, 0, 0]} barSize={20} />
              <Bar dataKey="y26" name="2026" radius={[2, 2, 0, 0]} barSize={20}>
                {active.map(id => getJug(id)).filter(Boolean).map((d, i) => <Cell key={i} fill={COLS[i % 4]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 14, borderTop: '1px solid #0f172a', paddingTop: 13, overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 350 }}>
              <thead><tr><th>Jugador</th><th style={{ textAlign: 'center' }}>CMJ</th><th style={{ textAlign: 'center' }}>ABK</th><th style={{ textAlign: 'center' }}>Broad</th><th style={{ textAlign: 'center' }}>Asim</th><th style={{ textAlign: 'center' }}>Músculo</th></tr></thead>
              <tbody>
                {active.map((id, i) => {
                  const d = getJug(id);
                  if (!d) return null;
                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 900, color: COLS[i % 4], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.jugadores?.apellido}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{d.cmj ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.abk ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.broad ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.asym_cmj != null ? <span style={{ color: asimColor(d.asym_cmj), fontWeight: 900 }}>{d.asym_cmj.toFixed(1)}%</span> : '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.musc ?? '—'}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: '1px solid #0f172a' }}>
                  <td style={{ color: '#ef4444', fontWeight: 900, fontSize: '0.68rem' }}>🔴 ÉLITE</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{ELITE.cmj}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{ELITE.abk}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{ELITE.broad}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>—</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{ELITE.musc}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {yoyoHistComp.length > 1 && (
        <div className="glass-panel" style={{ padding: 20 }}>
          <SecTitle color="#10b981">📈 Evolución Yo-Yo Histórica — Jugadores Seleccionados</SecTitle>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={yoyoHistComp} margin={{ left: -10, right: 20 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" />
              <XAxis dataKey="f" tick={{ fill: '#334155', fontSize: 12 }} />
              <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 12 }} />
              <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: `Élite ${ELITE.yoyo}`, fill: '#ef4444', fontSize: 8, position: 'insideTopRight' }} />
              <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              {active.map((id, i) => {
                const nombre = getJug(id)?.jugadores?.apellido;
                if (!nombre) return null;
                return (
                  <Line key={id} type="monotone" dataKey={`J${i}`} name={nombre} stroke={COLS[i]} strokeWidth={2.5}
                    dot={{ fill: COLS[i], r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 20, borderTop: '3px solid #10b981' }}>
        <SecTitle color="#10b981">🏟️ Yo-Yo — Plantel Completo (contexto)</SecTitle>
        <div style={{ fontSize: '0.68rem', color: '#1e293b', marginBottom: 8 }}>
          Jugadores seleccionados destacados en sus respectivos colores
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={[...datos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25))}
            margin={{ left: -15, right: 5, bottom: 28 }}
          >
            <CartesianGrid strokeDasharray="2 2" stroke="#0f172a" vertical={false} />
            <XAxis dataKey={d => d.jugadores?.apellido?.slice(0, 8)} tick={{ fill: '#334155', fontSize: 7 }} angle={-45} textAnchor="end" interval={0} />
            <YAxis domain={[14, 24]} tick={{ fill: '#64748b', fontSize: 11 }} />
            <ReferenceLine y={ELITE.yoyo} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.5} />
            <ReferenceLine y={stats.yoyo.mean} stroke="#33415566" strokeDasharray="2 4" />
            <RTooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12, color: '#f8fafc' }} formatter={(v, n, p) => [`${v} — ${p.payload.jugadores?.apellido}`, 'Yo-Yo']} />
            <Bar dataKey={d => d.y26 || d.y25} radius={[2, 2, 0, 0]} barSize={14}>
              {[...datos].filter(d => d.y26 || d.y25).sort((a, b) => (b.y26 || b.y25) - (a.y26 || a.y25)).map((d, i) => {
                const idx = active.indexOf(d.id_jugador);
                return (
                  <Cell key={i}
                    fill={idx >= 0 ? COLS[idx] : '#1e293b'}
                    opacity={idx >= 0 ? 1 : 0.35}
                    stroke={idx >= 0 ? COLS[idx] + '66' : 'transparent'}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL INGRESO
// ════════════════════════════════════════════════════════════════════════════
function ModalIngreso({ jugadores, clubId, onClose, onSuccess, showToast }) {
  const [tipo, setTipo] = useState('fisico');
  const [jugId, setJugId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [fF, setFF] = useState({ cmj: '', cmj_de: '', cmj_iz: '', broad: '', broad_de: '', broad_iz: '', y25: '', y26: '', abk: '' });
  
  // Se agregaron los campos faltantes en el estado
  const [fN, setFN] = useState({ 
    peso: '', talla: '', musc: '', adip: '', visc: '', imc: '', ed_met: '', sum6: '', plan_nutricional: '', 
    pl_tri: '', pl_sub: '', pl_bic: '', pl_cre: '', pl_sup: '', pl_abd: '',
    icc: '', pl_mus: '', pl_pan: '', per_bra_r: '', per_bra_f: '', per_cin: '', per_cad: '', per_pan: '', dia_hum: '', dia_fem: '' 
  });
  
  const [fK, setFK] = useState({ kin_t: '', kin_c: '', kin_u: '', kin_s: '', pierna: '' });

  const calcAsim = (a, b) => { if (!a || !b) return null; const mx = Math.max(+a, +b), mn = Math.min(+a, +b); return mx > 0 ? ((mx - mn) / mx) * 100 * (+a > +b ? 1 : -1) : 0; };

  const handleGuardar = async () => {
    if (!jugId) return showToast('Seleccioná un jugador', 'warning');
    setLoading(true);
    try {
      const payload = {
        club_id: clubId, id_jugador: jugId, fecha_medicion: fecha,
        cmj: fF.cmj || null, cmj_de: fF.cmj_de || null, cmj_iz: fF.cmj_iz || null, asym_cmj: calcAsim(fF.cmj_de, fF.cmj_iz),
        broad: fF.broad || null, broad_de: fF.broad_de || null, broad_iz: fF.broad_iz || null, asym_br: calcAsim(fF.broad_de, fF.broad_iz),
        y25: fF.y25 || null, y26: fF.y26 || null, abk: fF.abk || null,
        peso: fN.peso || null, altura: fN.talla || null, musc: fN.musc || null, adip: fN.adip || null, // Se corrigió mapeo a 'altura'
        visc: fN.visc || null, imc: fN.imc || null, ed_met: fN.ed_met || null,
        sum6: fN.sum6 || null, plan_nutricional: fN.plan_nutricional || null,
        icc: fN.icc || null,
        pl_tri: fN.pl_tri || null, pl_sub: fN.pl_sub || null, pl_bic: fN.pl_bic || null,
        pl_cre: fN.pl_cre || null, pl_sup: fN.pl_sup || null, pl_abd: fN.pl_abd || null,
        pl_mus: fN.pl_mus || null, pl_pan: fN.pl_pan || null,
        per_bra_r: fN.per_bra_r || null, per_bra_f: fN.per_bra_f || null,
        per_cin: fN.per_cin || null, per_cad: fN.per_cad || null, per_pan: fN.per_pan || null,
        dia_hum: fN.dia_hum || null, dia_fem: fN.dia_fem || null,
        kin_t: fK.kin_t || null, kin_c: fK.kin_c || null, kin_u: fK.kin_u || null, kin_s: fK.kin_s || null, pierna: fK.pierna || null,
      };
      const { error } = await supabase.from('rendimiento').insert([payload]);
      if (error) throw error;
      showToast('Evaluación registrada.', 'success');
      onSuccess();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };

  // Función de renderizado pura (NO COMPONENTE) para evitar pérdida de foco
  const renderField = (label, val, set, step = '0.1', type = 'number', ph = '') => (
    <div>
      <label style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 900, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{label}</label>
      <input type={type} step={step} value={val} onChange={e => set(e.target.value)} className="select-dark" placeholder={ph} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <div style={{ background: '#060a14', width: '100%', maxWidth: 650, padding: 24, maxHeight: '92vh', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid #0f172a', paddingBottom: 14 }}>
          <h2 style={{ margin: 0, color: 'var(--accent)', fontWeight: 900, fontSize: '1.05rem' }}>NUEVA TOMA DE DATOS</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#334155', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 15 }}>
          <div>
            <label style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 900, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Jugador</label>
            <select className="select-dark" value={jugId} onChange={e => setJugId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {jugadores.map(j => <option key={j.id} value={j.id}>{j.dorsal} — {j.apellido} {j.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 900, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="select-dark" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#000', padding: 4, borderRadius: 8 }}>
          {[{ id: 'fisico', lbl: 'Físico', c: '#3b82f6' }, { id: 'nutri', lbl: 'Nutrición', c: '#f59e0b' }, { id: 'kine', lbl: 'Kinesio', c: '#10b981' }].map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              style={{ flex: 1, padding: '8px', background: tipo === t.id ? t.c : 'transparent', color: tipo === t.id ? '#000' : '#334155', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 900, fontSize: '0.72rem', transition: '0.15s' }}>
              {t.lbl}
            </button>
          ))}
        </div>

        {tipo === 'fisico' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {renderField('CMJ (bi) cm', fF.cmj, v => setFF({ ...fF, cmj: v }))}
            {renderField('ABK cm', fF.abk, v => setFF({ ...fF, abk: v }))}
            <div />
            {renderField('CMJ Der', fF.cmj_de, v => setFF({ ...fF, cmj_de: v }))}
            {renderField('CMJ Izq', fF.cmj_iz, v => setFF({ ...fF, cmj_iz: v }))}
            <div />
            {renderField('Broad (bi) m', fF.broad, v => setFF({ ...fF, broad: v }), '0.01')}
            {renderField('Broad Der', fF.broad_de, v => setFF({ ...fF, broad_de: v }), '0.01')}
            {renderField('Broad Izq', fF.broad_iz, v => setFF({ ...fF, broad_iz: v }), '0.01')}
            {renderField('Yo-Yo 2025', fF.y25, v => setFF({ ...fF, y25: v }), '0.1', 'number', 'ej: 18.5')}
            <div style={{ gridColumn: 'span 2' }}>
              {renderField('Yo-Yo 2026 (actual)', fF.y26, v => setFF({ ...fF, y26: v }), '0.1', 'number', 'ej: 19.2')}
            </div>
          </div>
        )}

        {tipo === 'nutri' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {renderField('Peso (kg)', fN.peso, v => setFN({ ...fN, peso: v }))}
              {renderField('Altura (cm)', fN.talla, v => setFN({ ...fN, talla: v }))}
              {renderField('Músculo %', fN.musc, v => setFN({ ...fN, musc: v }))}
              {renderField('Adiposidad %', fN.adip, v => setFN({ ...fN, adip: v }))}
              {renderField('IMC', fN.imc, v => setFN({ ...fN, imc: v }))}
              {renderField('Visceral', fN.visc, v => setFN({ ...fN, visc: v }), '1')}
              {renderField('Edad Metabólica', fN.ed_met, v => setFN({ ...fN, ed_met: v }), '1')}
              {renderField('∑ 6 Pliegues mm', fN.sum6, v => setFN({ ...fN, sum6: v }))}
              {renderField('ICC', fN.icc, v => setFN({ ...fN, icc: v }))}
            </div>
            
            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 900, marginTop: 10, borderBottom: '1px solid #1e293b', paddingBottom: 5 }}>PLIEGUES (mm)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[['Tricipital', 'pl_tri'], ['Subescapular', 'pl_sub'], ['Bicipital', 'pl_bic'], ['C. Ilíaca', 'pl_cre'], ['Supraespinal', 'pl_sup'], ['Abdominal', 'pl_abd'], ['Muslo', 'pl_mus'], ['Pantorrilla', 'pl_pan']].map(([lbl, k]) => (
                <div key={k}>{renderField(lbl, fN[k], v => setFN({ ...fN, [k]: v }))}</div>
              ))}
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 900, marginTop: 10, borderBottom: '1px solid #1e293b', paddingBottom: 5 }}>PERÍMETROS (cm)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {[['Brazo Relaj.', 'per_bra_r'], ['Brazo Flex.', 'per_bra_f'], ['Cintura', 'per_cin'], ['Cadera', 'per_cad'], ['Pantorrilla', 'per_pan']].map(([lbl, k]) => (
                <div key={k}>{renderField(lbl, fN[k], v => setFN({ ...fN, [k]: v }))}</div>
              ))}
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 900, marginTop: 10, borderBottom: '1px solid #1e293b', paddingBottom: 5 }}>DIÁMETROS (cm)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['Húmero', 'dia_hum'], ['Fémur', 'dia_fem']].map(([lbl, k]) => (
                <div key={k}>{renderField(lbl, fN[k], v => setFN({ ...fN, [k]: v }))}</div>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 900, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Plan Nutricional</label>
              <textarea value={fN.plan_nutricional} onChange={e => setFN({ ...fN, plan_nutricional: e.target.value })} className="select-dark" rows="4" placeholder="Pegá acá la dieta..." style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {tipo === 'kine' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['Tobillo / Pie', 'kin_t', 'ej: movilidad'], ['Cadera (Jurdan)', 'kin_c', 'ej: isquio'], ['Zona Media', 'kin_u', 'ej: pelvica'], ['Sentadilla', 'kin_s', 'ej: optimo'], ['Pierna Hábil', 'pierna', 'Derecho / Izquierdo']].map(([lbl, k, ph]) => (
              <div key={k}>
                <label style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 900, display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>{lbl}</label>
                <input type="text" value={fK[k]} onChange={e => setFK({ ...fK, [k]: e.target.value })} className="select-dark" placeholder={ph} />
              </div>
            ))}
          </div>
        )}

        <button onClick={handleGuardar} disabled={loading} className="btn-action"
          style={{ width: '100%', padding: 13, marginTop: 18, background: '#3b82f6', color: '#fff', fontWeight: 900, opacity: loading ? 0.5 : 1, fontSize: '0.86rem', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {loading ? 'GUARDANDO...' : '💾 GUARDAR EN HISTORIAL'}
        </button>
      </div>
    </div>
  );
}

const Empty = () => (
  <div style={{ textAlign: 'center', color: '#0f172a', marginTop: 80, fontSize: '0.85rem' }}>
    Seleccioná un jugador en el panel izquierdo.
  </div>
);