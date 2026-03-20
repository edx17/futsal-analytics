import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { 
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, ReferenceLine, ReferenceArea, LineChart, Line
} from 'recharts';

// --- BIBLIOTECA KINÉSICA ---
const REHAB_LIB = {
  "isquiosural": [{ t: "Dead Bugs", v: "https://youtube.com/shorts/vn72PVWnu14" }, { t: "Puente glúteo unilateral", v: "https://youtube.com/shorts/Y-N53Q6XxiI" }, { t: "Peso muerto rumano uni", v: "https://youtu.be/YXjc7TURwfE" }],
  "movilidad": [{ t: "Dorsiflexión c/ banda", v: "https://youtube.com/shorts/Re7XMKgAti8" }, { t: "Obelisco", v: "https://youtube.com/shorts/dWLrnRwY41c" }, { t: "Movilidad Toráxica", v: "https://youtube.com/shorts/2et2ZXUk6co" }],
  "tobillo": [{ t: "Mov. Articular", v: "https://youtube.com/shorts/dYS9cgYk2lY" }, { t: "Salto Alternado", v: "https://youtube.com/shorts/b5qmCWB8cpo" }, { t: "Dorsiflexión c/ carga", v: "https://youtube.com/shorts/tXVq7MAOAVY" }],
  "pelvica": [{ t: "Bird-dog", v: "https://youtube.com/shorts/Tjo5oYHoS8M" }, { t: "Puente almeja c/ banda", v: "https://youtube.com/shorts/9vWRjF08xiQ" }, { t: "Isométricos glúteo", v: "https://youtube.com/shorts/oxouNCjxHWw" }],
  "cadera": [{ t: "90-90 Rotación interna", v: "https://youtube.com/shorts/p2NUakSyUcE" }, { t: "Ranita", v: "https://youtube.com/shorts/cvgsb7xCgN4" }, { t: "Curl Nórdico invertido", v: "https://youtube.com/shorts/UZf6CbQR8_s" }],
  "escapular": [{ t: "Movilidad Escapular", v: "https://youtube.com/shorts/5j4inxyq-MA" }, { t: "Halo Split KB", v: "https://youtube.com/shorts/UARPXzqDNhM" }, { t: "Pájaros con poleas", v: "https://youtu.be/ki6gkb_mJr0" }]
};

// VALORES ÉLITE DE REFERENCIA (Agregado ABK para completar perfiles)
const ELITE = { musc: 48.5, adip: 9.0, sum6: 45.0, cmj: 55, abk: 62, broad: 2.60, yoyo: 21.0 };

function getEmbedUrl(url) {
  if (!url) return '';
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=))([^"&?\/\s]{11})/i);
  const videoId = match ? match[1] : '';
  return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1` : url;
}

const calcularEstadisticasPlantel = (datos, key) => {
  const validos = datos.map(d => d[key]).filter(v => v != null && !isNaN(v));
  if (!validos.length) return { mean: 0, sd: 0 };
  const mean = validos.reduce((a, b) => a + Number(b), 0) / validos.length;
  const variance = validos.reduce((a, b) => a + Math.pow(Number(b) - mean, 2), 0) / validos.length;
  return { mean, sd: Math.sqrt(variance) };
};

const calcZScore = (val, mean, sd) => (val == null || sd === 0) ? 0 : (val - mean) / sd;
const estimarVO2Max = (nivelYoyo) => (!nivelYoyo) ? 'S/D' : ((nivelYoyo * 0.84) + 36.4).toFixed(1);

const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
    <div className="tooltip-text">{texto}</div>
  </div>
);

export default function Rendimiento() {
  const [tabActiva, setTabActiva] = useState('individual'); // Arrancamos en Resumen por defecto
  const [jugadoresBD, setJugadoresBD] = useState([]);
  const [historialRendimiento, setHistorialRendimiento] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  
  const { showToast } = useToast();
  const { perfil } = useAuth();
  
  const esJugador = perfil?.rol === 'jugador';
  const esStaff = !esJugador;
  const clubId = localStorage.getItem('club_id');

  const cargarDatos = async () => {
    setLoading(true);
    const { data: j } = await supabase.from('jugadores').select('id, nombre, apellido, dorsal, posicion').eq('club_id', clubId).order('dorsal');
    setJugadoresBD(j || []);

    const { data: r } = await supabase.from('rendimiento').select('*, jugadores(nombre, apellido, posicion, dorsal)').eq('club_id', clubId).order('fecha_medicion', { ascending: false }); 
    const filtrado = esJugador ? (r || []).filter(x => x.id_jugador === perfil?.jugador_id) : (r || []);
    setHistorialRendimiento(filtrado);

    setLoading(false);
  };

  useEffect(() => { if (clubId) cargarDatos(); }, [clubId]);

  const ultimosDatos = useMemo(() => {
    const mapa = {};
    historialRendimiento.forEach(reg => {
      if (!mapa[reg.id_jugador]) mapa[reg.id_jugador] = reg;
    });
    return Object.values(mapa);
  }, [historialRendimiento]);

  const stats = useMemo(() => ({
    cmj: calcularEstadisticasPlantel(ultimosDatos, 'cmj'),
    abk: calcularEstadisticasPlantel(ultimosDatos, 'abk'),
    broad: calcularEstadisticasPlantel(ultimosDatos, 'broad'),
    musc: calcularEstadisticasPlantel(ultimosDatos, 'musc'),
    adip: calcularEstadisticasPlantel(ultimosDatos, 'adip'),
    sum6: calcularEstadisticasPlantel(ultimosDatos, 'sum6'),
    yoyo: calcularEstadisticasPlantel(ultimosDatos.map(d => ({ ...d, yoyoReal: d.y26 || d.y25 })), 'yoyoReal'),
    pl_tri: calcularEstadisticasPlantel(ultimosDatos, 'pl_tri'),
    pl_sub: calcularEstadisticasPlantel(ultimosDatos, 'pl_sub'),
    pl_bic: calcularEstadisticasPlantel(ultimosDatos, 'pl_bic'),
    pl_cre: calcularEstadisticasPlantel(ultimosDatos, 'pl_cre'),
    pl_sup: calcularEstadisticasPlantel(ultimosDatos, 'pl_sup'),
    pl_abd: calcularEstadisticasPlantel(ultimosDatos, 'pl_abd')
  }), [ultimosDatos]);

  if (loading) return <div style={{ padding: '40px', color: 'var(--text-dim)', textAlign: 'center' }}>ANALIZANDO BIOMECÁNICA Y KINANTROPOMETRÍA... 🧬</div>;

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff', paddingBottom: '80px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>
            Sports Science
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>
            Análisis de Rendimiento, Biomecánica y Antropometría.
          </p>
        </div>
        
        {esStaff && (
          <button onClick={() => setModalAbierto(true)} className="btn-action" style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', fontWeight: 'bold' }}>
            + NUEVA TOMA DE DATOS
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '10px' }}>
        <button className={`nav-tab ${tabActiva === 'individual' ? 'active' : ''}`} onClick={() => setTabActiva('individual')}>👤 RESUMEN INDIVIDUAL</button>
        <button className={`nav-tab ${tabActiva === 'fisico' ? 'active' : ''}`} onClick={() => setTabActiva('fisico')}>🏃‍♂️ P. FÍSICA</button>
        <button className={`nav-tab ${tabActiva === 'kinesiologia' ? 'active' : ''}`} onClick={() => setTabActiva('kinesiologia')} style={{ borderBottom: tabActiva==='kinesiologia' ? '3px solid #10b981' : 'none'}}>🩺 KINESIOLOGÍA</button>
        <button className={`nav-tab ${tabActiva === 'nutricion' ? 'active' : ''}`} onClick={() => setTabActiva('nutricion')} style={{ borderBottom: tabActiva==='nutricion' ? '3px solid #f59e0b' : 'none'}}>🥗 NUTRICIÓN</button>
        {!esJugador && <button className={`nav-tab ${tabActiva === 'comparativa' ? 'active' : ''}`} onClick={() => setTabActiva('comparativa')}>⚖️ COMPARATIVA (VS)</button>}
      </div>

      {tabActiva === 'individual' && <TabIndividual datos={ultimosDatos} stats={stats} esJugador={esJugador} />}
      {tabActiva === 'fisico' && <TabFisico datos={ultimosDatos} stats={stats} historial={historialRendimiento} esJugador={esJugador} />}
      {tabActiva === 'kinesiologia' && <TabKinesiologia datos={ultimosDatos} esJugador={esJugador} />}
      {tabActiva === 'nutricion' && <TabNutricion datos={ultimosDatos} stats={stats} esJugador={esJugador} />}
      {tabActiva === 'comparativa' && !esJugador && <TabComparativa datos={ultimosDatos} stats={stats} />}

      {modalAbierto && esStaff && (
        <ModalIngresoDatos 
          jugadores={jugadoresBD}
          clubId={clubId}
          onClose={() => setModalAbierto(false)} 
          onSuccess={() => { setModalAbierto(false); cargarDatos(); }} 
          showToast={showToast} 
        />
      )}

      <style>{`
        .nav-tab { background: #111; border: 1px solid #333; color: var(--text-dim); padding: 12px 20px; border-radius: 6px; font-size: 0.85rem; font-weight: 800; cursor: pointer; transition: 0.2s; white-space: nowrap; }
        .nav-tab:hover { background: #222; color: #fff; }
        .nav-tab.active { background: var(--accent); color: #000; border-color: var(--accent); }
        .kpi-title { color: var(--text-dim); font-size: 0.75rem; font-weight: 800; letter-spacing: 1px; margin-bottom: 5px; text-transform: uppercase; }
        .kpi-value { font-size: 2.2rem; font-weight: 900; line-height: 1; margin-bottom: 5px; }
        .kpi-sub { font-size: 0.75rem; color: #666; }
        .select-dark { width: 100%; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: #fff; border-radius: 6px; font-size: 1rem; outline: none; }
        .section-header { font-size: 0.9rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 20px; }
        
        .tooltip-text { visibility: hidden; opacity: 0; position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%); background: #111; color: #fff; padding: 10px; border-radius: 6px; font-size: 0.75rem; width: 220px; text-align: center; border: 1px solid #333; z-index: 100; pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.8); transition: visibility 0.2s, opacity 0.2s; }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text, .tooltip-container:focus-within .tooltip-text { visibility: visible; opacity: 1; }
      `}</style>
    </div>
  );
}

// =======================================================
// NUEVO: RESUMEN INDIVIDUAL COMPLETO
// =======================================================
function TabIndividual({ datos, stats, esJugador }) {
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  useEffect(() => { if (datos.length > 0 && !jugadorSeleccionado) setJugadorSeleccionado(datos[0].id_jugador.toString()); }, [datos, jugadorSeleccionado]);

  const jugador = datos.find(j => j.id_jugador === parseInt(jugadorSeleccionado));

  // Preparar Radar vs Elite
  const radarZScore = useMemo(() => {
    if (!jugador) return [];
    const norm = (val, statKey) => Math.max(0, Math.min(100, 50 + (calcZScore(val, stats[statKey].mean, stats[statKey].sd) * 20)));
    return [
      { metrica: 'Explosión (CMJ)', Valor: norm(jugador.cmj, 'cmj'), Elite: norm(ELITE.cmj, 'cmj') },
      { metrica: 'Elástica (ABK)', Valor: norm(jugador.abk, 'abk'), Elite: norm(ELITE.abk, 'abk') },
      { metrica: 'Horizontal (Broad)', Valor: norm(jugador.broad, 'broad'), Elite: norm(ELITE.broad, 'broad') },
      { metrica: 'Aeróbico (YoYo)', Valor: norm(jugador.y26 || jugador.y25, 'yoyo'), Elite: norm(ELITE.yoyo, 'yoyo') }
    ];
  }, [jugador, stats]);

  // Lógica inteligente para sugerir videos según lo que el kine anotó
  const videosRecomendados = useMemo(() => {
    if (!jugador) return [];
    const observaciones = `${jugador.kin_t || ''} ${jugador.kin_c || ''} ${jugador.kin_u || ''} ${jugador.kin_s || ''}`.toLowerCase();
    const vids = [];
    if (observaciones.includes('isquio')) vids.push(...REHAB_LIB.isquiosural);
    if (observaciones.includes('movilidad')) vids.push(...REHAB_LIB.movilidad);
    if (observaciones.includes('tobillo')) vids.push(...REHAB_LIB.tobillo);
    if (observaciones.includes('pelvi') || observaciones.includes('estabilidad')) vids.push(...REHAB_LIB.pelvica);
    if (observaciones.includes('cader')) vids.push(...REHAB_LIB.cadera);
    if (observaciones.includes('escapul')) vids.push(...REHAB_LIB.escapular);
    
    // Si está todo perfecto y no matcheó nada, le tiramos zona media general (pelvica)
    if (vids.length === 0) vids.push(...REHAB_LIB.pelvica);
    
    return [...new Set(vids)].slice(0, 3); // Devolvemos max 3 videos para no saturar
  }, [jugador]);

  if (!jugador) return <div style={{ textAlign: 'center', color: '#666', marginTop: '50px' }}>Sin datos.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {!esJugador && (
        <div style={{ marginBottom: '10px' }}>
          <select className="select-dark" style={{ width: '100%', maxWidth: '400px', fontSize: '1.2rem', fontWeight: 'bold' }} value={jugadorSeleccionado} onChange={e => setJugadorSeleccionado(e.target.value)}>
            {datos.map(j => <option key={j.id} value={j.id_jugador}>#{j.jugadores?.dorsal} - {j.jugadores?.apellido} {j.jugadores?.nombre}</option>)}
          </select>
        </div>
      )}

      {/* BLOQUE FÍSICO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 className="section-header" style={{ color: '#3b82f6' }}>⚡ HUELLA ATLÉTICA VS ÉLITE</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarZScore}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="metrica" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Jugador" dataKey="Valor" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Radar name="Referencia Élite" dataKey="Elite" stroke="#ef4444" fill="transparent" strokeDasharray="3 3" />
              <Legend wrapperStyle={{ fontSize: '12px' }}/>
              <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} formatter={(v) => [v.toFixed(0), 'Score']} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '10px', borderTop: '1px solid #222', paddingTop: '15px' }}>
             <div style={{ textAlign: 'center' }}><span style={{ color: '#888', fontSize: '0.8rem', display: 'block' }}>CMJ</span><strong style={{ fontSize: '1.2rem', color: '#fff' }}>{jugador.cmj || '-'}</strong><span style={{color:'#666', fontSize:'0.7rem'}}>/ {ELITE.cmj}</span></div>
             <div style={{ textAlign: 'center' }}><span style={{ color: '#888', fontSize: '0.8rem', display: 'block' }}>Broad</span><strong style={{ fontSize: '1.2rem', color: '#fff' }}>{jugador.broad || '-'}</strong><span style={{color:'#666', fontSize:'0.7rem'}}>/ {ELITE.broad}</span></div>
             <div style={{ textAlign: 'center' }}><span style={{ color: '#888', fontSize: '0.8rem', display: 'block' }}>Yo-Yo</span><strong style={{ fontSize: '1.2rem', color: '#fff' }}>{jugador.y26 || jugador.y25 || '-'}</strong><span style={{color:'#666', fontSize:'0.7rem'}}>/ {ELITE.yoyo}</span></div>
          </div>
        </div>

        {/* BLOQUE KINE Y RUTINA INDICADA */}
        <div className="glass-panel" style={{ padding: '20px', borderTop: '4px solid #10b981' }}>
          <h3 className="section-header" style={{ color: '#10b981' }}>🩺 ESTADO KINÉSICO Y TRABAJO RECOMENDADO</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <div style={{ background: '#111', padding: '10px', borderRadius: '6px' }}><strong style={{ color: '#888', fontSize: '0.75rem', display:'block' }}>TOBILLO</strong> {jugador.kin_t || 'S/D'}</div>
            <div style={{ background: '#111', padding: '10px', borderRadius: '6px' }}><strong style={{ color: '#888', fontSize: '0.75rem', display:'block' }}>CADERA</strong> {jugador.kin_c || 'S/D'}</div>
            <div style={{ background: '#111', padding: '10px', borderRadius: '6px' }}><strong style={{ color: '#888', fontSize: '0.75rem', display:'block' }}>ZONA MEDIA</strong> {jugador.kin_u || 'S/D'}</div>
            <div style={{ background: '#111', padding: '10px', borderRadius: '6px' }}><strong style={{ color: '#888', fontSize: '0.75rem', display:'block' }}>SENTADILLA</strong> {jugador.kin_s || 'S/D'}</div>
          </div>

          <h4 style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '10px' }}>Videos Asignados (Basado en observaciones)</h4>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
            {videosRecomendados.map((vid, idx) => (
              <div key={idx} style={{ minWidth: '160px' }}>
                <iframe src={getEmbedUrl(vid.v)} style={{ width: '100%', height: '100px', borderRadius: '6px' }} frameBorder="0" allowFullScreen title={vid.t}></iframe>
                <div style={{ fontSize: '0.75rem', color: '#ccc', textAlign: 'center', marginTop: '4px' }}>{vid.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BLOQUE NUTRICIÓN Y DIETA */}
      <div className="glass-panel" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
        <h3 className="section-header" style={{ color: '#f59e0b' }}>🥗 PERFIL NUTRICIONAL Y DIETA ASIGNADA</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
          <div>
            <div style={{ background: '#111', padding: '15px', borderRadius: '6px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Peso Actual:</span> <strong style={{ color: '#fff' }}>{jugador.peso || 'S/D'} kg</strong>
            </div>
            <div style={{ background: '#111', padding: '15px', borderRadius: '6px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Músculo (vs {ELITE.musc}%):</span> <strong style={{ color: '#3b82f6' }}>{jugador.musc || '-'} %</strong>
            </div>
            <div style={{ background: '#111', padding: '15px', borderRadius: '6px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Adiposidad (vs {ELITE.adip}%):</span> <strong style={{ color: '#ef4444' }}>{jugador.adip || '-'} %</strong>
            </div>
            <div style={{ background: '#111', padding: '15px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>∑ 6 Pliegues (vs {ELITE.sum6}):</span> <strong style={{ color: '#f59e0b' }}>{jugador.sum6 || '-'} mm</strong>
            </div>
          </div>
          <div style={{ background: '#000', padding: '15px', borderRadius: '6px', maxHeight: '250px', overflowY: 'auto' }}>
            <span style={{ color: '#666', fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>Pautas / Menú</span>
            {jugador.plan_nutricional ? (
              <div dangerouslySetInnerHTML={{ __html: jugador.plan_nutricional }} style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#ddd' }} />
            ) : <div style={{ color: '#666', fontStyle: 'italic' }}>Sin plan cargado.</div>}
          </div>
        </div>
      </div>

    </div>
  );
}

// =======================================================
// DEPARTAMENTO FÍSICO (HUELLA ATLÉTICA GENERAL)
// =======================================================
function TabFisico({ datos, stats, historial, esJugador }) {
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  useEffect(() => { if (datos.length > 0 && !jugadorSeleccionado) setJugadorSeleccionado(datos[0].id_jugador.toString()); }, [datos, jugadorSeleccionado]);

  const jugador = datos.find(j => j.id_jugador === parseInt(jugadorSeleccionado));

  const radarZScore = useMemo(() => {
    if (!jugador) return [];
    const norm = (val, statKey) => Math.max(0, Math.min(100, 50 + (calcZScore(val, stats[statKey].mean, stats[statKey].sd) * 20)));
    return [
      { metrica: 'Fuerza Explosiva (CMJ)', Valor: norm(jugador.cmj, 'cmj'), Elite: norm(ELITE.cmj, 'cmj') },
      { metrica: 'Fuerza Elástica (ABK)', Valor: norm(jugador.abk, 'abk'), Elite: norm(ELITE.abk, 'abk') },
      { metrica: 'Fuerza Horizontal (Broad)', Valor: norm(jugador.broad, 'broad'), Elite: norm(ELITE.broad, 'broad') },
      { metrica: 'Capacidad Aeróbica (YoYo)', Valor: norm(jugador.y26 || jugador.y25, 'yoyo'), Elite: norm(ELITE.yoyo, 'yoyo') }
    ];
  }, [jugador, stats]);

  return (
    <div>
      {!esJugador && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="kpi-title">CMJ EQUIPO</div>
            <div className="kpi-value" style={{ color: '#3b82f6' }}>{stats.cmj.mean.toFixed(1)}<span style={{fontSize:'1rem'}}>cm</span></div>
            <div className="kpi-sub">ÉLITE: {ELITE.cmj}cm</div>
          </div>
          <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="kpi-title">ABALAKOV EQUIPO</div>
            <div className="kpi-value" style={{ color: '#8b5cf6' }}>{stats.abk.mean.toFixed(1)}<span style={{fontSize:'1rem'}}>cm</span></div>
            <div className="kpi-sub">ÉLITE: {ELITE.abk}cm</div>
          </div>
          <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
            <div className="kpi-title">YO-YO TEST</div>
            <div className="kpi-value" style={{ color: '#f59e0b' }}>{stats.yoyo.mean.toFixed(1)}</div>
            <div className="kpi-sub">VO2 Máx: {estimarVO2Max(stats.yoyo.mean)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: esJugador ? '1fr' : '1fr 350px', gap: '20px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', height: '450px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 className="section-header" style={{ color: '#3b82f6', margin: 0 }}>HUELLA ATLÉTICA (PERFIL Z-SCORE) <InfoBox texto="El centro (50) representa el promedio exacto del plantel. La línea roja es el nivel de élite mundial." /></h3>
            {!esJugador && (
              <select className="select-dark" style={{ width: '200px', padding: '8px' }} value={jugadorSeleccionado} onChange={e => setJugadorSeleccionado(e.target.value)}>
                {datos.map(j => <option key={j.id} value={j.id_jugador}>{j.jugadores?.apellido}</option>)}
              </select>
            )}
          </div>
          
          {jugador ? (
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarZScore}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="metrica" tick={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name={jugador.jugadores?.apellido} dataKey="Valor" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                <Radar name="Referencia Élite" dataKey="Elite" stroke="#ef4444" fill="transparent" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: '12px' }}/>
                <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} formatter={(v) => [v.toFixed(0), 'Score']} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '100px' }}>Seleccioná un jugador.</div>
          )}
        </div>

        {!esJugador && (
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 className="section-header" style={{ color: '#10b981' }}>🏆 TOP 5: ÍNDICE REACTIVO (ABK - CMJ)</h3>
            {datos.filter(d => d.abk && d.cmj).sort((a,b) => (b.abk - b.cmj) - (a.abk - a.cmj)).slice(0,5).map((j, i) => {
              const dif = (j.abk - j.cmj).toFixed(1);
              return (
                <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222' }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{i+1}. {j.jugadores?.apellido}</span>
                  <span style={{ color: '#10b981', fontWeight: 900 }}>+{dif} cm</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =======================================================
// DEPARTAMENTO KINESIOLOGÍA (ASIMETRÍAS Y VIDEOS)
// =======================================================
function TabKinesiologia({ datos, esJugador }) {
  const asimetriasCMJ = datos.filter(d => d.cmj_de && d.cmj_iz).map(d => {
    return {
      nombre: d.jugadores?.apellido,
      Deficit: Number(d.asym_cmj?.toFixed(1) || 0),
      esRiesgo: Math.abs(d.asym_cmj) > 10
    };
  }).sort((a, b) => Math.abs(b.Deficit) - Math.abs(a.Deficit)).slice(0, 10);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: esJugador ? '1fr' : '2fr 1fr', gap: '20px', marginBottom: '25px' }}>
        
        {!esJugador && (
          <div className="glass-panel" style={{ padding: '20px', borderTop: '4px solid #ef4444', height: '400px' }}>
            <h3 className="section-header" style={{ color: '#ef4444', borderBottom: 'none' }}>🚨 DÉFICIT BILATERAL DE POTENCIA (CMJ) <InfoBox texto="Barras a la izquierda indican déficit en la pierna izquierda. Más de 10% es factor de riesgo de lesión (Rojo)." /></h3>
            {asimetriasCMJ.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={asimetriasCMJ} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={true} vertical={false} />
                  <XAxis type="number" domain={[-25, 25]} tick={{ fill: '#888' }} stroke="#555" />
                  <YAxis dataKey="nombre" type="category" tick={{ fill: '#ccc', fontSize: 11 }} width={80} stroke="#555" />
                  <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} formatter={(val) => [`${val}%`, 'Desbalance']} />
                  <ReferenceLine x={0} stroke="#fff" />
                  <ReferenceLine x={-10} stroke="#ef4444" strokeDasharray="3 3" />
                  <ReferenceLine x={10} stroke="#ef4444" strokeDasharray="3 3" />
                  <Bar dataKey="Deficit" barSize={15}>
                    {asimetriasCMJ.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.esRiesgo ? '#ef4444' : (entry.Deficit > 0 ? '#3b82f6' : '#10b981')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
               <div style={{ textAlign: 'center', color: '#666', marginTop: '100px' }}>Sin datos suficientes de salto unilateral.</div>
            )}
          </div>
        )}

        <div className="glass-panel" style={{ padding: '20px', borderTop: '4px solid #10b981', height: '400px' }}>
          <h3 className="section-header" style={{ color: '#10b981', borderBottom: 'none' }}>📋 GABINETE KINÉSICO</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '320px', overflowY: 'auto', paddingRight: '10px' }}>
            {datos.filter(j => j.kin_t || j.kin_c || j.kin_u || j.kin_s).map(j => (
              <div key={j.id} style={{ background: '#111', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>{j.jugadores?.apellido}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {j.kin_t && <div><span style={{color:'#666'}}>Tobillo:</span> <span style={{color: j.kin_t.includes('optimo') || j.kin_t.includes('óptimo') ? '#10b981' : '#f59e0b'}}>{j.kin_t}</span></div>}
                  {j.kin_c && <div><span style={{color:'#666'}}>Cadera:</span> <span style={{color: j.kin_c.includes('optimo') || j.kin_c.includes('óptimo') ? '#10b981' : '#f59e0b'}}>{j.kin_c}</span></div>}
                  {j.kin_u && <div><span style={{color:'#666'}}>Z.Media:</span> <span style={{color: j.kin_u.includes('Sin obs') ? '#10b981' : '#f59e0b'}}>{j.kin_u}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bento-card">
        <h3 className="section-header" style={{ color: '#10b981' }}>📚 BIBLIOTECA DE PREVENCIÓN Y REHAB</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          {Object.entries(REHAB_LIB).map(([cat, videos]) => (
            <div key={cat} style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222' }}>
              <h4 style={{ textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 10px 0' }}>{cat}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {videos.map((vid, idx) => (
                  <div key={idx}>
                    <div style={{ fontSize: '0.8rem', color: '#fff', marginBottom: '4px' }}>{vid.t}</div>
                    <iframe src={getEmbedUrl(vid.v)} style={{ width: '100%', height: '120px', borderRadius: '4px' }} frameBorder="0" allowFullScreen title={vid.t}></iframe>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =======================================================
// DEPARTAMENTO NUTRICIÓN
// =======================================================
function TabNutricion({ datos, stats, esJugador }) {
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  useEffect(() => { if (datos.length > 0 && !jugadorSeleccionado) setJugadorSeleccionado(datos[0].id_jugador.toString()); }, [datos, jugadorSeleccionado]);

  const infoNutriJugador = datos.find(j => j.id_jugador === parseInt(jugadorSeleccionado));
  
  const radarPliegues = useMemo(() => {
    if (!infoNutriJugador) return [];
    return [
      { pliegue: 'Tricipital', Jugador: infoNutriJugador.pl_tri || 0, Promedio: stats.pl_tri.mean },
      { pliegue: 'Subescapular', Jugador: infoNutriJugador.pl_sub || 0, Promedio: stats.pl_sub.mean },
      { pliegue: 'Bicipital', Jugador: infoNutriJugador.pl_bic || 0, Promedio: stats.pl_bic.mean },
      { pliegue: 'Cresta Ilíaca', Jugador: infoNutriJugador.pl_cre || 0, Promedio: stats.pl_cre.mean },
      { pliegue: 'Supraespinal', Jugador: infoNutriJugador.pl_sup || 0, Promedio: stats.pl_sup.mean },
      { pliegue: 'Abdominal', Jugador: infoNutriJugador.pl_abd || 0, Promedio: stats.pl_abd.mean }
    ];
  }, [infoNutriJugador, stats]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: esJugador ? '1fr' : '1fr 400px', gap: '20px' }}>
      
      {!esJugador && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div className="kpi-title">MASA MUSCULAR</div>
              <div className="kpi-value" style={{ color: '#3b82f6' }}>{stats.musc.mean.toFixed(1)}<span style={{fontSize:'1rem'}}>%</span></div>
              <div className="kpi-sub">Élite: {ELITE.musc}%</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <div className="kpi-title">MASA ADIPOSA</div>
              <div className="kpi-value" style={{ color: '#ef4444' }}>{stats.adip.mean.toFixed(1)}<span style={{fontSize:'1rem'}}>%</span></div>
              <div className="kpi-sub">Élite: {ELITE.adip}%</div>
            </div>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', borderBottom: '4px solid #f59e0b' }}>
              <div className="kpi-title">∑ 6 PLIEGUES</div>
              <div className="kpi-value" style={{ color: '#f59e0b' }}>{stats.sum6.mean.toFixed(1)}<span style={{fontSize:'1rem'}}>mm</span></div>
              <div className="kpi-sub">Élite: ~{ELITE.sum6}mm</div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px', height: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h3 className="section-header" style={{ color: '#f59e0b', margin: 0 }}>PERFIL ISAK: PLIEGUES VS PROMEDIO PLANTEL</h3>
               <select className="select-dark" style={{ width: '200px', padding: '8px' }} value={jugadorSeleccionado} onChange={e => setJugadorSeleccionado(e.target.value)}>
                  {datos.map(j => <option key={j.id} value={j.id_jugador}>{j.jugadores?.apellido}</option>)}
               </select>
            </div>
            {radarPliegues.length > 0 && infoNutriJugador.pl_tri ? (
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarPliegues}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="pliegue" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 'auto']} tick={false} axisLine={false} />
                  <Radar name={infoNutriJugador.jugadores?.apellido} dataKey="Jugador" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} />
                  <Radar name="Promedio Equipo" dataKey="Promedio" stroke="#555" fill="transparent" strokeDasharray="3 3" />
                  <Legend wrapperStyle={{ fontSize: '12px' }}/>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} formatter={(val) => [`${val.toFixed(1)} mm`]} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '100px' }}>Sin datos de pliegues (ISAK) cargados para este jugador.</div>
            )}
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '20px', background: '#111' }}>
        <h3 className="section-header" style={{ color: 'var(--accent)' }}>PLAN NUTRICIONAL</h3>
        {infoNutriJugador ? (
          <div style={{ animation: 'fadeIn 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #333', paddingBottom: '10px', marginBottom: '10px' }}>
              <span style={{ color: 'var(--text-dim)' }}>Peso Actual:</span>
              <strong style={{ color: '#fff' }}>{infoNutriJugador.peso || 'S/D'} kg</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #333', paddingBottom: '10px', marginBottom: '10px' }}>
              <span style={{ color: 'var(--text-dim)' }}>∑ 6 Pliegues:</span>
              <strong style={{ color: '#f59e0b' }}>{infoNutriJugador.sum6 || 'S/D'} mm</strong>
            </div>
            
            <div style={{ background: '#000', padding: '15px', borderRadius: '6px', marginTop: '15px', overflowY: 'auto', maxHeight: '450px' }}>
              {infoNutriJugador.plan_nutricional ? (
                <div dangerouslySetInnerHTML={{ __html: infoNutriJugador.plan_nutricional }} style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#ddd' }} />
              ) : <div style={{ color: '#666', fontStyle: 'italic' }}>Sin plan cargado.</div>}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#666', marginTop: '50px' }}>Seleccioná un jugador.</div>
        )}
      </div>

    </div>
  );
}

// =======================================================
// TAB 4: COMPARATIVA AVANZADA (HASTA 4 JUGADORES + PUESTOS)
// =======================================================
function TabComparativa({ datos, stats }) {
  const [jugs, setJugs] = useState([null, null, null, null]);

  useEffect(() => {
    if (datos.length >= 2 && jugs[0] === null) {
      setJugs([datos[0].id_jugador, datos[1].id_jugador, null, null]);
    }
  }, [datos]);

  const setJugador = (index, value) => {
    const newJugs = [...jugs];
    newJugs[index] = value ? parseInt(value) : null;
    setJugs(newJugs);
  };

  const getJugadorData = (id) => datos.find(j => j.id_jugador === id);
  const colores = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];

  const radarComparativo = useMemo(() => {
    const norm = (val, statKey) => Math.max(0, Math.min(100, 50 + (calcZScore(val, stats[statKey].mean, stats[statKey].sd) * 20)));
    return [
      { 
        metrica: 'Explosión (CMJ)', 
        A: norm(getJugadorData(jugs[0])?.cmj, 'cmj'), 
        B: norm(getJugadorData(jugs[1])?.cmj, 'cmj'),
        C: norm(getJugadorData(jugs[2])?.cmj, 'cmj'),
        D: norm(getJugadorData(jugs[3])?.cmj, 'cmj'),
        Elite: norm(ELITE.cmj, 'cmj')
      },
      { 
        metrica: 'Elástica (ABK)', 
        A: norm(getJugadorData(jugs[0])?.abk, 'abk'), 
        B: norm(getJugadorData(jugs[1])?.abk, 'abk'),
        C: norm(getJugadorData(jugs[2])?.abk, 'abk'),
        D: norm(getJugadorData(jugs[3])?.abk, 'abk'),
        Elite: norm(ELITE.abk, 'abk')
      },
      { 
        metrica: 'Horizontal (Broad)', 
        A: norm(getJugadorData(jugs[0])?.broad, 'broad'), 
        B: norm(getJugadorData(jugs[1])?.broad, 'broad'),
        C: norm(getJugadorData(jugs[2])?.broad, 'broad'),
        D: norm(getJugadorData(jugs[3])?.broad, 'broad'),
        Elite: norm(ELITE.broad, 'broad')
      },
      { 
        metrica: 'Aeróbico (YoYo)', 
        A: norm(getJugadorData(jugs[0])?.y26 || getJugadorData(jugs[0])?.y25, 'yoyo'), 
        B: norm(getJugadorData(jugs[1])?.y26 || getJugadorData(jugs[1])?.y25, 'yoyo'),
        C: norm(getJugadorData(jugs[2])?.y26 || getJugadorData(jugs[2])?.y25, 'yoyo'),
        D: norm(getJugadorData(jugs[3])?.y26 || getJugadorData(jugs[3])?.y25, 'yoyo'),
        Elite: norm(ELITE.yoyo, 'yoyo')
      }
    ];
  }, [jugs, stats]);

  // Posiciones estandarizadas Futsal/Fútbol
  const posAgrupadas = useMemo(() => {
    const orden = ['Arquero', 'Cierre', 'Ala', 'Pivot'];
    const grupos = { 'Arquero': { pos: 'Arquero', cmjTot: 0, yoyoTot: 0, count: 0 }, 'Cierre': { pos: 'Cierre', cmjTot: 0, yoyoTot: 0, count: 0 }, 'Ala': { pos: 'Ala', cmjTot: 0, yoyoTot: 0, count: 0 }, 'Pivot': { pos: 'Pivot', cmjTot: 0, yoyoTot: 0, count: 0 }};
    
    datos.forEach(d => {
      let pos = d.jugadores?.posicion || '';
      // Normalizamos el string a la posición más parecida
      let posKey = 'Ala'; 
      if (pos.toLowerCase().includes('arquero')) posKey = 'Arquero';
      else if (pos.toLowerCase().includes('cierre') || pos.toLowerCase().includes('defensa')) posKey = 'Cierre';
      else if (pos.toLowerCase().includes('pivot') || pos.toLowerCase().includes('delantero')) posKey = 'Pivot';
      
      grupos[posKey].cmjTot += d.cmj || 0;
      grupos[posKey].yoyoTot += (d.y26 || d.y25 || 0);
      grupos[posKey].count += 1;
    });

    return orden.map(k => ({
      name: k,
      CMJ: grupos[k].count > 0 ? Number((grupos[k].cmjTot / grupos[k].count).toFixed(1)) : 0,
      YoYo: grupos[k].count > 0 ? Number((grupos[k].yoyoTot / grupos[k].count).toFixed(1)) : 0,
    })).filter(g => g.CMJ > 0 || g.YoYo > 0);
  }, [datos]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      
      {/* COMPARATIVA HASTA 4 JUGADORES */}
      <div className="glass-panel" style={{ padding: '20px', height: '480px' }}>
        <h3 className="section-header" style={{ color: 'var(--text-main)' }}>HEAD TO HEAD: PERFIL Z-SCORE (VS ÉLITE)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {[0, 1, 2, 3].map(i => (
            <select key={i} className="select-dark" style={{ border: `1px solid ${colores[i]}`, padding: '6px', fontSize: '0.85rem' }} value={jugs[i] || ''} onChange={e => setJugador(i, e.target.value)}>
              <option value="">-- Vacío --</option>
              {datos.map(j => <option key={`${i}-${j.id}`} value={j.id_jugador}>{j.jugadores?.apellido}</option>)}
            </select>
          ))}
        </div>
        
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarComparativo}>
            <PolarGrid stroke="rgba(255,255,255,0.1)" />
            <PolarAngleAxis dataKey="metrica" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="ÉLITE MUNDIAL" dataKey="Elite" stroke="#ef4444" fill="transparent" strokeDasharray="3 3" strokeWidth={2} />
            {jugs[0] && <Radar name={getJugadorData(jugs[0])?.jugadores?.apellido} dataKey="A" stroke={colores[0]} fill={colores[0]} fillOpacity={0.3} />}
            {jugs[1] && <Radar name={getJugadorData(jugs[1])?.jugadores?.apellido} dataKey="B" stroke={colores[1]} fill={colores[1]} fillOpacity={0.3} />}
            {jugs[2] && <Radar name={getJugadorData(jugs[2])?.jugadores?.apellido} dataKey="C" stroke={colores[2]} fill={colores[2]} fillOpacity={0.3} />}
            {jugs[3] && <Radar name={getJugadorData(jugs[3])?.jugadores?.apellido} dataKey="D" stroke={colores[3]} fill={colores[3]} fillOpacity={0.3} />}
            <Legend wrapperStyle={{ fontSize: '11px' }}/>
            <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} formatter={(v) => [v ? v.toFixed(0) : 0, 'Score']} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* COMPARATIVA POR PUESTOS */}
      <div className="glass-panel" style={{ padding: '20px', height: '480px' }}>
        <h3 className="section-header" style={{ color: 'var(--text-main)' }}>PROMEDIOS POR POSICIÓN TÁCTICA</h3>
        {posAgrupadas.length > 0 ? (
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={posAgrupadas} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="#3b82f6" tick={{ fontSize: 11 }} domain={[0, 70]} />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 11 }} domain={[0, 30]} />
              <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }}/>
              
              <ReferenceLine y={ELITE.cmj} yAxisId="left" stroke="#3b82f6" strokeDasharray="3 3" label={{ position: 'top', value: 'Élite CMJ', fill: '#3b82f6', fontSize: 10 }} />
              <ReferenceLine y={ELITE.yoyo} yAxisId="right" stroke="#10b981" strokeDasharray="3 3" label={{ position: 'top', value: 'Élite YoYo', fill: '#10b981', fontSize: 10 }} />
              
              <Bar yAxisId="left" name="Potencia CMJ (cm)" dataKey="CMJ" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={35} />
              <Bar yAxisId="right" name="Aeróbico YoYo (lvl)" dataKey="YoYo" fill="#10b981" radius={[4, 4, 0, 0]} barSize={35} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', color: '#666', marginTop: '100px' }}>Sin datos suficientes por posición.</div>
        )}
      </div>
    </div>
  );
}

// =======================================================
// MODAL: INGRESO DE DATOS (ESPECIALISTAS Y CT)
// =======================================================
function ModalIngresoDatos({ jugadores, clubId, onClose, onSuccess, showToast }) {
  const [tipoEvaluacion, setTipoEvaluacion] = useState('fisico');
  const [jugadorId, setJugadorId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const [fFisico, setFFisico] = useState({ cmj: '', cmj_de: '', cmj_iz: '', broad: '', broad_de: '', broad_iz: '', y25: '', abk: '' });
  const [fNutri, setFNutri] = useState({ peso: '', musc: '', adip: '', sum6: '', plan_nutricional: '' });
  const [fKine, setFKine] = useState({ kin_t: '', kin_c: '', kin_u: '', kin_s: '' });

  const handleGuardar = async () => {
    if (!jugadorId) return showToast("Seleccioná un jugador", "warning");
    setLoading(true);

    try {
      let asym_cmj = null; let asym_br = null;
      if (fFisico.cmj_de && fFisico.cmj_iz) {
        const max = Math.max(fFisico.cmj_de, fFisico.cmj_iz);
        const min = Math.min(fFisico.cmj_de, fFisico.cmj_iz);
        asym_cmj = max > 0 ? ((max - min) / max) * 100 * (fFisico.cmj_de > fFisico.cmj_iz ? 1 : -1) : 0;
      }
      if (fFisico.broad_de && fFisico.broad_iz) {
        const max = Math.max(fFisico.broad_de, fFisico.broad_iz);
        const min = Math.min(fFisico.broad_de, fFisico.broad_iz);
        asym_br = max > 0 ? ((max - min) / max) * 100 * (fFisico.broad_de > fFisico.broad_iz ? 1 : -1) : 0;
      }

      const payload = {
        club_id: clubId, id_jugador: jugadorId, fecha_medicion: fecha,
        cmj: fFisico.cmj || null, cmj_de: fFisico.cmj_de || null, cmj_iz: fFisico.cmj_iz || null, asym_cmj,
        broad: fFisico.broad || null, broad_de: fFisico.broad_de || null, broad_iz: fFisico.broad_iz || null, asym_br,
        y25: fFisico.y25 || null, abk: fFisico.abk || null,
        peso: fNutri.peso || null, adip: fNutri.adip || null, musc: fNutri.musc || null, sum6: fNutri.sum6 || null,
        plan_nutricional: fNutri.plan_nutricional || null,
        kin_t: fKine.kin_t || null, kin_c: fKine.kin_c || null, kin_u: fKine.kin_u || null, kin_s: fKine.kin_s || null
      };

      const { error } = await supabase.from('rendimiento').insert([payload]);
      if (error) throw error;

      showToast("Evaluación registrada correctamente.", "success");
      onSuccess();
    } catch (err) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '600px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
          <h2 style={{ margin: 0, color: 'var(--accent)' }}>NUEVA TOMA DE DATOS</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✖</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
          <div>
            <label style={lStyle}>JUGADOR</label>
            <select className="select-dark" value={jugadorId} onChange={e => setJugadorId(e.target.value)} style={{ padding: '10px' }}>
              <option value="">Seleccionar...</option>
              {jugadores.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido} {j.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lStyle}>FECHA DE EVALUACIÓN</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="select-dark" style={{ padding: '10px' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', background: '#000', padding: '5px', borderRadius: '8px' }}>
          <button onClick={() => setTipoEvaluacion('fisico')} style={{ flex: 1, padding: '10px', background: tipoEvaluacion === 'fisico' ? '#3b82f6' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>FÍSICO</button>
          <button onClick={() => setTipoEvaluacion('nutri')} style={{ flex: 1, padding: '10px', background: tipoEvaluacion === 'nutri' ? '#f59e0b' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>NUTRICIÓN</button>
          <button onClick={() => setTipoEvaluacion('kine')} style={{ flex: 1, padding: '10px', background: tipoEvaluacion === 'kine' ? '#10b981' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>KINESIO</button>
        </div>

        {tipoEvaluacion === 'fisico' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
            <div><label style={lStyle}>CMJ (Bi) cm</label><input type="number" step="0.1" value={fFisico.cmj} onChange={e => setFFisico({...fFisico, cmj: e.target.value})} className="select-dark" /></div>
            <div><label style={lStyle}>ABK (Brazos)</label><input type="number" step="0.1" value={fFisico.abk} onChange={e => setFFisico({...fFisico, abk: e.target.value})} className="select-dark" /></div>
            <div style={{gridColumn: 'span 1'}}></div>
            <div><label style={lStyle}>CMJ Der cm</label><input type="number" step="0.1" value={fFisico.cmj_de} onChange={e => setFFisico({...fFisico, cmj_de: e.target.value})} className="select-dark" /></div>
            <div><label style={lStyle}>CMJ Izq cm</label><input type="number" step="0.1" value={fFisico.cmj_iz} onChange={e => setFFisico({...fFisico, cmj_iz: e.target.value})} className="select-dark" /></div>
            <div style={{gridColumn: 'span 1'}}></div>
            <div><label style={lStyle}>Broad (Bi) m</label><input type="number" step="0.01" value={fFisico.broad} onChange={e => setFFisico({...fFisico, broad: e.target.value})} className="select-dark" /></div>
            <div><label style={lStyle}>Broad Der m</label><input type="number" step="0.01" value={fFisico.broad_de} onChange={e => setFFisico({...fFisico, broad_de: e.target.value})} className="select-dark" /></div>
            <div><label style={lStyle}>Broad Izq m</label><input type="number" step="0.01" value={fFisico.broad_iz} onChange={e => setFFisico({...fFisico, broad_iz: e.target.value})} className="select-dark" /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={lStyle}>Yo-Yo Test Nivel</label><input type="number" step="0.1" value={fFisico.y25} onChange={e => setFFisico({...fFisico, y25: e.target.value})} className="select-dark" placeholder="Ej: 18.2"/></div>
          </div>
        )}

        {tipoEvaluacion === 'nutri' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div><label style={lStyle}>Peso (kg)</label><input type="number" step="0.1" value={fNutri.peso} onChange={e => setFNutri({...fNutri, peso: e.target.value})} className="select-dark" /></div>
              <div><label style={lStyle}>∑ 6 Pliegues (mm)</label><input type="number" step="0.1" value={fNutri.sum6} onChange={e => setFNutri({...fNutri, sum6: e.target.value})} className="select-dark" /></div>
              <div><label style={lStyle}>Músculo %</label><input type="number" step="0.1" value={fNutri.musc} onChange={e => setFNutri({...fNutri, musc: e.target.value})} className="select-dark" /></div>
              <div><label style={lStyle}>Adiposidad %</label><input type="number" step="0.1" value={fNutri.adip} onChange={e => setFNutri({...fNutri, adip: e.target.value})} className="select-dark" /></div>
            </div>
            <div>
              <label style={lStyle}>Plan Nutricional (Texto o HTML)</label>
              <textarea value={fNutri.plan_nutricional} onChange={e => setFNutri({...fNutri, plan_nutricional: e.target.value})} className="select-dark" rows="5" placeholder="Pegá acá la dieta..."></textarea>
            </div>
          </div>
        )}

        {tipoEvaluacion === 'kine' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div><label style={lStyle}>Tobillo/Pie (kin_t)</label><input type="text" value={fKine.kin_t} onChange={e => setFKine({...fKine, kin_t: e.target.value})} className="select-dark" placeholder="Ej: movilidad" /></div>
            <div><label style={lStyle}>Cadera (kin_c)</label><input type="text" value={fKine.kin_c} onChange={e => setFKine({...fKine, kin_c: e.target.value})} className="select-dark" placeholder="Ej: isquio"/></div>
            <div><label style={lStyle}>Zona Media (kin_u)</label><input type="text" value={fKine.kin_u} onChange={e => setFKine({...fKine, kin_u: e.target.value})} className="select-dark" placeholder="Ej: pelvica"/></div>
            <div><label style={lStyle}>Sentadilla (kin_s)</label><input type="text" value={fKine.kin_s} onChange={e => setFKine({...fKine, kin_s: e.target.value})} className="select-dark" placeholder="Ej: optimo"/></div>
          </div>
        )}

        <button onClick={handleGuardar} disabled={loading} className="btn-action" style={{ width: '100%', padding: '15px', marginTop: '25px', opacity: loading ? 0.5 : 1 }}>
          {loading ? 'GUARDANDO...' : '💾 GUARDAR EN HISTORIAL'}
        </button>
      </div>
    </div>
  );
}
const lStyle = { fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block', marginBottom: '5px' };