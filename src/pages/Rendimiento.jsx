import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, ReferenceLine, ReferenceArea, LineChart, Line
} from 'recharts';

// --- BIBLIOTECA KINÉSICA (NO TOCAR) ---
const REHAB_LIB = {
  "isquiosural": [{ t: "Dead Bugs", v: "https://youtube.com/shorts/vn72PVWnu14?si=C9T2vir-Y8jEgnaq" }, { t: "Puente glúteo unilateral", v: "https://youtube.com/shorts/Y-N53Q6XxiI?si=Sk3iLRYCAQVPlD2Z" }, { t: "Peso muerto rumano uni", v: "https://youtu.be/YXjc7TURwfE?si=o36r4eyuHhHHya2D" }],
  "movilidad": [{ t: "Dorsiflexión c/ banda", v: "https://youtube.com/shorts/Re7XMKgAti8?si=mNm9ZWNQYnsRpOUO" }, { t: "Obelisco", v: "https://youtube.com/shorts/dWLrnRwY41c?si=qSBKdIW4-a8_YsL-" }, { t: "Movilidad Toráxica", v: "https://youtube.com/shorts/2et2ZXUk6co?si=FnRuSPQI139KEDzA" }],
  "tobillo": [{ t: "Mov. Articular Rodilla/Tobillo", v: "https://youtube.com/shorts/dYS9cgYk2lY?si=-piVl3JfK_dp0DWn" }, { t: "Salto Alternado", v: "https://youtube.com/shorts/b5qmCWB8cpo?si=j1bZM645_6gVmSGv" }, { t: "Dorsiflexión c/ carga", v: "https://youtube.com/shorts/tXVq7MAOAVY?si=VU33wQ1dUapayBd_" }],
  "pelvica": [{ t: "Bird-dog", v: "https://youtube.com/shorts/Tjo5oYHoS8M?si=GBghefTkKhePUDmt" }, { t: "Puente almeja c/ banda", v: "https://youtube.com/shorts/9vWRjF08xiQ?feature=shared" }, { t: "Isométricos glúteo medio", v: "https://youtube.com/shorts/oxouNCjxHWw?si=Vn2rU2hhv9rL3XA2" }],
  "cadera": [{ t: "90-90 Rotación interna", v: "https://youtube.com/shorts/p2NUakSyUcE?si=N_8SVkOBYFFqFxWp" }, { t: "Ranita", v: "https://youtube.com/shorts/cvgsb7xCgN4?si=5Wx1vtE2clpfyODa" }, { t: "Curl Nórdico invertido", v: "https://youtube.com/shorts/UZf6CbQR8_s?si=2ow191xDGdTTwZdQ" }],
  "escapular": [{ t: "Movilidad Escapular", v: "https://youtube.com/shorts/5j4inxyq-MA?si=TfzdpSnAjLYWkqnZ" }, { t: "Halo Split KB", v: "https://youtube.com/shorts/UARPXzqDNhM?si=j8Ug-37tK0ka8g2v" }, { t: "Pájaros con poleas", v: "https://youtu.be/ki6gkb_mJr0?si=hDASv1MqaavNI3_O" }]
};

const ELITE = { musc: 48.5, adip: 9.0, cmj: 55, broad: 2.60, yoyo: 21.0 };

function getEmbedUrl(url) {
  let videoId = '';
  if (url.includes('youtube.com/shorts/')) videoId = url.split('shorts/')[1].split('?')[0];
  else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
  else if (url.includes('youtube.com/watch?v=')) videoId = url.split('v=')[1].split('&')[0];
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;
}

const calcularEstadisticasPlantel = (datos, key) => {
  const validos = datos.map(d => d[key]).filter(v => v != null);
  if (!validos.length) return { mean: 0, sd: 0 };
  const mean = validos.reduce((a, b) => a + b, 0) / validos.length;
  const variance = validos.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / validos.length;
  return { mean, sd: Math.sqrt(variance) };
};

const calcZScore = (val, mean, sd) => {
  if (val == null || sd === 0) return 0;
  return (val - mean) / sd;
};

const estimarVO2Max = (nivelYoyo) => {
  if (!nivelYoyo) return 'S/D';
  return ((nivelYoyo * 0.84) + 36.4).toFixed(1);
};

const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', verticalAlign: 'middle', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
    <div className="tooltip-text" style={{ position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' }}>
      {texto}
    </div>
  </div>
);

export default function Rendimiento() {
  const [tabActiva, setTabActiva] = useState('global');
  const [datos, setDatos] = useState([]);
  const [wellnessData, setWellnessData] = useState([]); // NUEVO
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const club_id = localStorage.getItem('club_id') || 'club_default';

      // 1. Datos Físicos Base
      const { data } = await supabase
        .from('rendimiento')
        .select('*, jugadores(nombre, apellido, posicion, dorsal)')
        .order('cmj', { ascending: false });
      if (data) setDatos(data);

      // 2. Datos de Wellness de los últimos 14 días
      const d14 = new Date(); d14.setDate(d14.getDate() - 14);
      const fechaCorte = d14.toISOString().split('T')[0];
      const { data: well } = await supabase
        .from('wellness')
        .select('*, jugadores(nombre, apellido, dorsal)')
        .eq('club_id', club_id)
        .gte('fecha', fechaCorte)
        .order('fecha', { ascending: true });
      if (well) setWellnessData(well);

      setLoading(false);
    }
    fetchData();
  }, []);

  const statsPoblacion = useMemo(() => {
    return {
      cmj: calcularEstadisticasPlantel(datos, 'cmj'),
      broad: calcularEstadisticasPlantel(datos, 'broad'),
      musc: calcularEstadisticasPlantel(datos, 'musc'),
      adip: calcularEstadisticasPlantel(datos, 'adip'),
      yoyo: calcularEstadisticasPlantel(datos.map(d => ({ ...d, yoyoReal: d.y26 || d.y25 })), 'yoyoReal')
    };
  }, [datos]);

  if (loading) return <div style={{ padding: '40px', color: 'var(--text-dim)', textAlign: 'center' }}>CARGANDO DATOS MÉDICOS Y FÍSICOS...</div>;

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>
            Área Física y Médica
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>
            Análisis de rendimiento, composición corporal Z-Score y control de cargas.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '8px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button className={`nav-tab ${tabActiva === 'global' ? 'active' : ''}`} onClick={() => setTabActiva('global')}>GLOBAL</button>
          <button className={`nav-tab ${tabActiva === 'comparativa' ? 'active' : ''}`} onClick={() => setTabActiva('comparativa')}>COMPARATIVA</button>
          {/* NUEVO BOTÓN WELLNESS */}
          <button className={`nav-tab ${tabActiva === 'wellness' ? 'active' : ''}`} onClick={() => setTabActiva('wellness')} style={{ color: tabActiva === 'wellness' ? '#000' : '#3b82f6', background: tabActiva === 'wellness' ? '#3b82f6' : 'transparent' }}>📊 WELLNESS</button>
          <button className={`nav-tab ${tabActiva === 'individual' ? 'active' : ''}`} onClick={() => setTabActiva('individual')}>FICHA INDIVIDUAL</button>
        </div>
      </div>

      {tabActiva === 'global' && <TabGlobal datos={datos} stats={statsPoblacion} />}
      {tabActiva === 'comparativa' && <TabComparativa datos={datos} stats={statsPoblacion} />}
      {tabActiva === 'wellness' && <TabWellness wellnessData={wellnessData} />}
      {tabActiva === 'individual' && <TabIndividual datos={datos} stats={statsPoblacion} />}

      <style>{`
        .nav-tab { background: transparent; border: none; color: var(--text-dim); padding: 8px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; }
        .nav-tab:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .nav-tab.active { background: var(--accent); color: #000; }
        .kpi-title { color: var(--text-dim); font-size: 0.75rem; font-weight: 800; letter-spacing: 1px; margin-bottom: 5px; text-transform: uppercase; }
        .kpi-value { font-size: 2.2rem; font-weight: 900; line-height: 1; margin-bottom: 5px; }
        .kpi-sub { font-size: 0.75rem; color: #666; }
        .select-dark { width: 100%; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: #fff; border-radius: 6px; font-size: 1rem; outline: none; transition: border-color 0.2s; }
        .select-dark:focus { border-color: var(--accent); }
        .section-header { font-size: 0.9rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 20px; }
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------
// NUEVA PESTAÑA: TAB WELLNESS GLOBALES
// -------------------------------------------------------------
function TabWellness({ wellnessData }) {
  // Procesamos los datos para armar la línea de tendencia de los últimos 14 días
  const trendData = useMemo(() => {
    const byDate = {};
    wellnessData.forEach(w => {
      if(!byDate[w.fecha]) byDate[w.fecha] = { fecha: w.fecha, readTotal: 0, count: 0, rpeTotal: 0, rpeCount: 0 };
      if(w.readiness_score) { byDate[w.fecha].readTotal += w.readiness_score; byDate[w.fecha].count++; }
      if(w.rpe) { byDate[w.fecha].rpeTotal += w.rpe; byDate[w.fecha].rpeCount++; }
    });
    return Object.values(byDate).map(d => ({
      fecha: d.fecha.substring(5), // Mostrar solo MM-DD
      Readiness: d.count ? Math.round(d.readTotal / d.count) : null,
      RPE: d.rpeCount ? Number((d.rpeTotal / d.rpeCount).toFixed(1)) : null
    })).sort((a,b) => a.fecha.localeCompare(b.fecha));
  }, [wellnessData]);

  // Filtramos a los que tienen números rojos hoy o ayer
  const alertas = wellnessData
    .filter(w => w.readiness_score <= 60 || w.rpe >= 8)
    .sort((a,b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 8); 

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', alignItems: 'start' }}>
      
      <div className="glass-panel" style={{ padding: '20px', height: '400px' }}>
        <h3 className="section-header" style={{ color: '#3b82f6' }}>CURVA DE FATIGA Y RECUPERACIÓN (ÚLT 14 DÍAS)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
            <XAxis dataKey="fecha" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
            <YAxis yAxisId="left" domain={[0, 100]} stroke="#3b82f6" tick={{ fill: '#3b82f6', fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 10]} stroke="#ef4444" tick={{ fill: '#ef4444', fontSize: 11 }} />
            <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#fff' }} />
            <Line yAxisId="left" type="monotone" dataKey="Readiness" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Readiness (0-100)" />
            <Line yAxisId="right" type="monotone" dataKey="RPE" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} name="Esfuerzo RPE (0-10)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderTop: '4px solid #ef4444', minHeight: '400px' }}>
        <h3 className="section-header" style={{ color: '#ef4444', borderBottom: 'none' }}>🚨 ALERTAS ROJAS RECIENTES</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '-10px', marginBottom: '15px' }}>Jugadores con RPE muy alto ({'>'}8) o bajo Readiness ({'<'}60).</p>
        
        {alertas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '10px' }}>✅</span>
            Plantel en óptimas condiciones de recuperación.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '5px' }}>
            {alertas.map(a => (
              <div key={a.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', borderLeft: `3px solid ${a.readiness_score <= 50 ? '#ef4444' : '#f59e0b'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{a.jugadores?.apellido} {a.jugadores?.nombre}</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{a.fecha.substring(5)}</span>
                </div>
                <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem' }}>
                  {a.readiness_score && <span style={{ color: a.readiness_score <= 60 ? '#ef4444' : '#aaa' }}>Readiness: {a.readiness_score}</span>}
                  {a.rpe && <span style={{ color: a.rpe >= 8 ? '#ef4444' : '#aaa' }}>RPE: {a.rpe}/10</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// -------------------------------------------------------------
// TAB 1: DETALLE GLOBAL
// -------------------------------------------------------------
function TabGlobal({ datos, stats }) {
  const riesgoAsimetria = datos.filter(d => Math.abs(d.asym_cmj) > 10 || Math.abs(d.asym_br) > 10);

  const radarData = [
    { subject: 'CMJ', Equipo: stats.cmj.mean, Elite: ELITE.cmj },
    { subject: 'Masa Muscular', Equipo: stats.musc.mean, Elite: ELITE.musc },
    { subject: 'Yo-Yo Test', Equipo: stats.yoyo.mean, Elite: ELITE.yoyo },
    { subject: 'Broad (x10)', Equipo: stats.broad.mean * 10, Elite: ELITE.broad * 10 },
    { subject: 'Adiposidad Inversa', Equipo: 30 - stats.adip.mean, Elite: 30 - ELITE.adip }
  ];

  const cuadranteData = datos.filter(d => d.cmj != null).map(d => ({
    x: d.cmj,
    y: Math.max(Math.abs(d.asym_cmj || 0), Math.abs(d.asym_br || 0)),
    name: d.jugadores?.apellido || 'N/A'
  }));

  const umbralCMJ = stats.cmj.mean; 
  const umbralRiesgo = 10;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">PROMEDIO CMJ</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{stats.cmj.mean.toFixed(1)}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>cm</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.cmj}cm | SD: ±{stats.cmj.sd.toFixed(1)}</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">YO-YO TEST</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{stats.yoyo.mean.toFixed(1)}</div>
          <div className="kpi-sub">VO2 Máx Est.: {estimarVO2Max(stats.yoyo.mean)}</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">MASA MUSCULAR</div>
          <div className="kpi-value" style={{ color: '#3b82f6' }}>{stats.musc.mean.toFixed(1)}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>%</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.musc}%</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">MASA ADIPOSA</div>
          <div className="kpi-value" style={{ color: '#ef4444' }}>{stats.adip.mean.toFixed(1)}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>%</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.adip}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px', height: '380px' }}>
          <h3 className="section-header" style={{ color: 'var(--text-main)' }}>RENDIMIENTO GLOBAL VS ÉLITE</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-dim)', fontSize: 11, fontWeight: 700 }} />
              <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
              <Radar name="Equipo" dataKey="Equipo" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
              <Radar name="Élite" dataKey="Elite" stroke="#10b981" fill="transparent" strokeDasharray="5 5" strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#fff' }} />
              <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff', fontSize: '12px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel" style={{ padding: '20px', height: '380px' }}>
          <h3 className="section-header" style={{ color: 'var(--text-main)' }}>CUADRANTE: RIESGO VS POTENCIA</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis type="number" dataKey="x" name="Potencia (CMJ)" unit="cm" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="Asimetría Máxima" unit="%" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
              <ReferenceArea x1={umbralCMJ} y1={0} y2={umbralRiesgo} fill="#10b981" fillOpacity={0.05} />
              <ReferenceArea x1={0} x2={umbralCMJ} y1={umbralRiesgo} fill="#ef4444" fillOpacity={0.05} />
              <ReferenceLine x={umbralCMJ} stroke="#555" strokeDasharray="3 3" />
              <ReferenceLine y={umbralRiesgo} stroke="#ef4444" strokeDasharray="3 3" />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} formatter={(value, name) => [value, name === 'x' ? 'CMJ (cm)' : 'Asimetría (%)']} labelFormatter={() => ''} />
              <Scatter name="Jugadores" data={cuadranteData} fill="#3b82f6">
                {cuadranteData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.y >= umbralRiesgo ? '#ef4444' : (entry.x >= umbralCMJ ? '#10b981' : '#f59e0b')} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
        <h3 className="section-header" style={{ color: '#ef4444', borderBottom: 'none', paddingBottom: 0, marginBottom: '15px' }}>ALERTAS DE ASIMETRÍA CRÍTICA {'>'}10%</h3>
        {riesgoAsimetria.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {riesgoAsimetria.map(j => (
              <div key={j.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <strong style={{ color: '#fff', fontSize: '1rem', display: 'block', marginBottom: '8px' }}>{j.jugadores?.nombre} {j.jugadores?.apellido}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  {Math.abs(j.asym_cmj) > 10 && <div style={{ color: '#ffbaba', marginBottom: '4px' }}>CMJ: {j.asym_cmj}% (Der {j.cmj_de} / Izq {j.cmj_iz})</div>}
                  {Math.abs(j.asym_br) > 10 && <div style={{ color: '#ffbaba' }}>BROAD: {j.asym_br}% (Der {j.broad_de} / Izq {j.broad_iz})</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', margin: 0 }}>El plantel no presenta asimetrías estructurales superiores al 10%.</p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// TAB 2: COMPARATIVA AVANZADA
// -------------------------------------------------------------
function TabComparativa({ datos, stats }) {
  const [modo, setModo] = useState('jugadores'); 
  const [jugadoresSeleccionados, setJugadoresSeleccionados] = useState(['', '', '', '']);

  const setJugador = (index, val) => {
    const nuevos = [...jugadoresSeleccionados];
    nuevos[index] = val;
    setJugadoresSeleccionados(nuevos);
  };

  const activos = jugadoresSeleccionados.filter(id => id !== '').map(id => datos.find(d => d.id_jugador === parseInt(id))).filter(Boolean);

  const dataCmj = activos.map(a => ({ name: a.jugadores?.apellido, Derecha: a.cmj_de || 0, Izquierda: a.cmj_iz || 0 }));
  const dataBroad = activos.map(a => ({ name: a.jugadores?.apellido, Derecha: a.broad_de || 0, Izquierda: a.broad_iz || 0 }));
  const dataYoyo = activos.map(a => ({ name: a.jugadores?.apellido, Nivel: a.y26 || a.y25 || 0 }));

  const posAgrupadas = useMemo(() => {
    const grupos = {};
    datos.forEach(d => {
      const pos = d.jugadores?.posicion || 'Sin Pos';
      if (!grupos[pos]) grupos[pos] = { pos, cmjTot: 0, broadTot: 0, yoyoTot: 0, muscTot: 0, count: 0 };
      grupos[pos].cmjTot += d.cmj || 0;
      grupos[pos].broadTot += d.broad || 0;
      grupos[pos].yoyoTot += (d.y26 || d.y25 || 0);
      grupos[pos].muscTot += d.musc || 0;
      grupos[pos].count += 1;
    });
    return Object.values(grupos).map(g => ({
      name: g.pos,
      CMJ: Number((g.cmjTot / g.count).toFixed(1)),
      Broad: Number((g.broadTot / g.count).toFixed(2)),
      YoYo: Number((g.yoyoTot / g.count).toFixed(1)),
      Musculo: Number((g.muscTot / g.count).toFixed(1)),
    }));
  }, [datos]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button className={`btn-action ${modo === 'jugadores' ? 'active' : ''}`} style={{ background: modo === 'jugadores' ? 'var(--accent)' : '#222', color: modo === 'jugadores' ? '#000' : '#fff' }} onClick={() => setModo('jugadores')}>COMPARAR JUGADORES</button>
        <button className={`btn-action ${modo === 'posicion' ? 'active' : ''}`} style={{ background: modo === 'posicion' ? 'var(--accent)' : '#222', color: modo === 'posicion' ? '#000' : '#fff' }} onClick={() => setModo('posicion')}>PROMEDIOS POR POSICIÓN</button>
      </div>

      {modo === 'jugadores' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
            {[0, 1, 2, 3].map(i => (
              <select key={i} className="select-dark" value={jugadoresSeleccionados[i]} onChange={(e) => setJugador(i, e.target.value)}>
                <option value="">Seleccionar Jugador {i + 1}</option>
                {datos.map(d => <option key={d.id} value={d.id_jugador}>{d.jugadores?.apellido} {d.jugadores?.nombre}</option>)}
              </select>
            ))}
          </div>

          {activos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
                  <h3 className="section-header" style={{ color: 'var(--text-main)' }}>SALTO CMJ: DER VS IZQ (CM)</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dataCmj} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                      <YAxis stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                      <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#fff' }} />
                      <Bar dataKey="Derecha" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Izquierda" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
                  <h3 className="section-header" style={{ color: 'var(--text-main)' }}>BROAD JUMP: DER VS IZQ (M)</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dataBroad} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                      <YAxis stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                      <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#fff' }} />
                      <Bar dataKey="Derecha" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Izquierda" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
                <h3 className="section-header" style={{ color: 'var(--text-main)' }}>YO-YO TEST (CAPACIDAD AERÓBICA)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dataYoyo} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                    <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                    <ReferenceLine y={ELITE.yoyo} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'top', value: 'Élite', fill: '#10b981', fontSize: 10 }} />
                    <Bar dataKey="Nivel" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={50}>
                      {dataYoyo.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.Nivel >= ELITE.yoyo ? '#10b981' : '#8b5cf6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', border: '1px dashed var(--border)' }}>
              SELECCIONÁ AL MENOS UN JUGADOR PARA DESPLEGAR LOS GRÁFICOS COMPARATIVOS.
            </div>
          )}
        </>
      )}

      {modo === 'posicion' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
            <h3 className="section-header" style={{ color: 'var(--text-main)' }}>FUERZA EXPLOSIVA (CMJ) POR POSICIÓN</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={posAgrupadas} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} domain={['dataMin - 5', 'dataMax + 5']} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                <Bar dataKey="CMJ" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
            <h3 className="section-header" style={{ color: 'var(--text-main)' }}>CAPACIDAD AERÓBICA (YO-YO) POR POSICIÓN</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={posAgrupadas} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} />
                <YAxis stroke="#555" tick={{ fill: '#aaa', fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                <Bar dataKey="YoYo" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// TAB 3: FICHA INDIVIDUAL
// -------------------------------------------------------------
function TabIndividual({ datos, stats }) {
  const [seleccionadoId, setSeleccionadoId] = useState('');
  
  const jugador = datos.find(d => d.id_jugador === parseInt(seleccionadoId));
  const videosRecomendados = [];
  if (jugador) {
    const notasKine = `${jugador.kin_t || ''} ${jugador.kin_c || ''} ${jugador.kin_u || ''} ${jugador.kin_s || ''}`.toLowerCase();
    Object.keys(REHAB_LIB).forEach(key => {
      if (notasKine.includes(key)) videosRecomendados.push(...REHAB_LIB[key]);
    });
  }

  const ZScoreRow = ({ label, value, valRaw, statType, inverseRisk = false, extraInfo = null }) => {
    if (!statType || !stats[statType]) return <KpiRow label={label} value={value} />;
    const z = calcZScore(valRaw, stats[statType].mean, stats[statType].sd);
    let colorZ = '#aaa';
    let labelZ = 'Promedio';

    const normalizedZ = inverseRisk ? -z : z;
    if (normalizedZ > 1) { colorZ = '#10b981'; labelZ = 'Alto'; }
    else if (normalizedZ < -1) { colorZ = '#ef4444'; labelZ = 'Riesgo / Bajo'; }

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: 'var(--text-dim)' }}>{label}</span>
          {extraInfo && <span style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>{extraInfo}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontSize: '0.7rem', color: colorZ, background: `${colorZ}22`, padding: '2px 6px', borderRadius: '4px' }}>
            Z: {z > 0 ? '+' : ''}{z.toFixed(2)} ({labelZ})
          </span>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{value}</span>
        </div>
      </div>
    );
  };

  const KpiRow = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 700 }}>{value}</span>
    </div>
  );

  const radarNormalizado = useMemo(() => {
    if (!jugador) return [];
    const norm = (z, invert = false) => {
      let finalZ = invert ? -z : z;
      return Math.max(0, Math.min(100, 50 + (finalZ * 20))); 
    };
    
    const asymMax = Math.max(Math.abs(jugador.asym_cmj || 0), Math.abs(jugador.asym_br || 0));
    const simetriaScore = Math.max(0, 100 - (asymMax * 5));

    return [
      { subject: 'Potencia', A: norm(calcZScore(jugador.cmj, stats.cmj.mean, stats.cmj.sd)) },
      { subject: 'Aeróbico', A: norm(calcZScore(jugador.y26 || jugador.y25, stats.yoyo.mean, stats.yoyo.sd)) },
      { subject: 'Composición', A: norm(calcZScore(jugador.adip, stats.adip.mean, stats.adip.sd), true) }, 
      { subject: 'Simetría', A: simetriaScore }
    ];
  }, [jugador, stats]);

  return (
    <div>
      <select className="select-dark" style={{ marginBottom: '25px' }} value={seleccionadoId} onChange={(e) => setSeleccionadoId(e.target.value)}>
        <option value="">-- Buscar Ficha de Jugador --</option>
        {datos.map(d => <option key={d.id} value={d.id_jugador}>{d.jugadores?.apellido}, {d.jugadores?.nombre}</option>)}
      </select>

      {jugador && (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '25px', alignItems: 'start' }}>
          
          <div className="glass-panel" style={{ padding: '25px' }}>
            <h3 className="section-header" style={{ color: 'var(--accent)' }}>ESTADO FÍSICO</h3>
            <div style={{ fontSize: '0.9rem' }}>
              <KpiRow label="Peso" value={`${jugador.peso} kg`} />
              <ZScoreRow label="Masa Muscular" value={`${jugador.musc}%`} valRaw={jugador.musc} statType="musc" />
              <ZScoreRow label="Masa Adiposa" value={`${jugador.adip}%`} valRaw={jugador.adip} statType="adip" inverseRisk={true} />
              <ZScoreRow label="CMJ (Salto Máx)" value={`${jugador.cmj} cm`} valRaw={jugador.cmj} statType="cmj" />
              <KpiRow label="Asimetría CMJ" value={`${jugador.asym_cmj}%`} />
              <ZScoreRow label="Broad Jump" value={`${jugador.broad} m`} valRaw={jugador.broad} statType="broad" />
              <KpiRow label="Asimetría Broad" value={`${jugador.asym_br}%`} />
              <ZScoreRow label="Yo-Yo Test" value={jugador.y26 || jugador.y25 || 'S/D'} valRaw={jugador.y26 || jugador.y25} statType="yoyo" extraInfo={`VO2 Máx Estimado: ${estimarVO2Max(jugador.y26 || jugador.y25)} ml/kg/min`} />
            </div>

            <h3 className="section-header" style={{ color: 'var(--text-main)', marginTop: '30px' }}>HUELLA ATLÉTICA</h3>
            <div style={{ height: '220px', marginLeft: '-20px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarNormalizado}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Jugador" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.4} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff', fontSize: '11px' }} formatter={(value) => [value.toFixed(0), 'Score Global']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#666', textAlign: 'center', marginTop: '-10px' }}>
              El hexágono central (50) representa el promedio del plantel.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            <div className="glass-panel" style={{ padding: '25px', borderLeft: '4px solid #f59e0b' }}>
              <h3 className="section-header" style={{ color: '#f59e0b' }}>PLAN NUTRICIONAL</h3>
              {jugador.plan_nutricional ? (
                <div dangerouslySetInnerHTML={{ __html: jugador.plan_nutricional }} style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-main)' }} />
              ) : ( 
                <p style={{ color: 'var(--text-dim)', fontStyle: 'italic', margin: 0 }}>Plan no asignado en la base de datos.</p> 
              )}
            </div>

            <div className="glass-panel" style={{ padding: '25px', borderLeft: '4px solid #10b981' }}>
              <h3 className="section-header" style={{ color: '#10b981' }}>KINESIOLOGÍA Y PREVENCIÓN</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px', fontSize: '0.9rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>Tobillo/Pie</div>
                  <div>{jugador.kin_t || 'Óptimo'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>Cadera/Pelvis</div>
                  <div>{jugador.kin_c || 'Óptimo'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>Zona Media</div>
                  <div>{jugador.kin_u || 'Sin observaciones'}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}>Sentadilla</div>
                  <div>{jugador.kin_s || 'Buena profundidad'}</div>
                </div>
              </div>
              
              {videosRecomendados.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--accent)', marginBottom: '15px', fontWeight: 700, textTransform: 'uppercase' }}>RUTINA DE REHABILITACIÓN ASIGNADA</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                    {videosRecomendados.map((vid, idx) => (
                      <div key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.8rem', marginBottom: '8px', color: '#fff', fontWeight: 600 }}>{vid.t}</div>
                        <iframe src={getEmbedUrl(vid.v)} style={{ width: '100%', height: '140px', borderRadius: '4px' }} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title={vid.t}></iframe>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}