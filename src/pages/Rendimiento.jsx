import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import Chart from 'chart.js/auto';

// --- BIBLIOTECA KINÉSICA ---
const REHAB_LIB = {
  "isquiosural": [{ t: "Dead Bugs", v: "https://youtube.com/shorts/vn72PVWnu14?si=C9T2vir-Y8jEgnaq" }, { t: "Puente glúteo unilateral", v: "https://youtube.com/shorts/Y-N53Q6XxiI?si=Sk3iLRYCAQVPlD2Z" }, { t: "Peso muerto rumano uni", v: "https://youtu.be/YXjc7TURwfE?si=o36r4eyuHhHHya2D" }],
  "movilidad": [{ t: "Dorsiflexión c/ banda", v: "https://youtube.com/shorts/Re7XMKgAti8?si=mNm9ZWNQYnsRpOUO" }, { t: "Obelisco", v: "https://youtube.com/shorts/dWLrnRwY41c?si=qSBKdIW4-a8_YsL-" }, { t: "Movilidad Toráxica", v: "https://youtube.com/shorts/2et2ZXUk6co?si=FnRuSPQI139KEDzA" }],
  "tobillo": [{ t: "Mov. Articular Rodilla/Tobillo", v: "https://youtube.com/shorts/dYS9cgYk2lY?si=-piVl3JfK_dp0DWn" }, { t: "Salto Alternado", v: "https://youtube.com/shorts/b5qmCWB8cpo?si=j1bZM645_6gVmSGv" }, { t: "Dorsiflexión c/ carga", v: "https://youtube.com/shorts/tXVq7MAOAVY?si=VU33wQ1dUapayBd_" }],
  "pelvica": [{ t: "Bird-dog", v: "https://youtube.com/shorts/Tjo5oYHoS8M?si=GBghefTkKhePUDmt" }, { t: "Puente almeja c/ banda", v: "https://youtube.com/shorts/9vWRjF08xiQ?feature=shared" }, { t: "Isométricos glúteo medio", v: "https://youtube.com/shorts/oxouNCjxHWw?si=Vn2rU2hhv9rL3XA2" }],
  "cadera": [{ t: "90-90 Rotación interna", v: "https://youtube.com/shorts/p2NUakSyUcE?si=N_8SVkOBYFFqFxWp" }, { t: "Ranita", v: "https://youtube.com/shorts/cvgsb7xCgN4?si=5Wx1vtE2clpfyODa" }, { t: "Curl Nórdico invertido", v: "https://youtube.com/shorts/UZf6CbQR8_s?si=2ow191xDGdTTwZdQ" }],
  "escapular": [{ t: "Movilidad Escapular", v: "https://youtube.com/shorts/5j4inxyq-MA?si=TfzdpSnAjLYWkqnZ" }, { t: "Halo Split KB", v: "https://youtube.com/shorts/UARPXzqDNhM?si=j8Ug-37tK0ka8g2v" }, { t: "Pájaros con poleas", v: "https://youtu.be/ki6gkb_mJr0?si=hDASv1MqaavNI3_O" }]
};

// --- ESTÁNDARES ÉLITE FUTSAL ---
const ELITE = {
  musc: 48.5, adip: 9.0, cmj: 55, broad: 2.60, yoyo: 21.0
};

function getEmbedUrl(url) {
  let videoId = '';
  if (url.includes('youtube.com/shorts/')) videoId = url.split('shorts/')[1].split('?')[0];
  else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
  else if (url.includes('youtube.com/watch?v=')) videoId = url.split('v=')[1].split('&')[0];
  return `https://www.youtube.com/embed/${videoId}?autoplay=0`;
}

export default function Rendimiento() {
  const [tabActiva, setTabActiva] = useState('global');
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('rendimiento')
        .select('*, jugadores(nombre, apellido, posicion, dorsal)')
        .order('cmj', { ascending: false });
      if (data) setDatos(data);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <div style={{ padding: '40px', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'JetBrains Mono' }}>CARGANDO DATOS MÉDICOS Y FÍSICOS...</div>;

  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '25px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '-1px', margin: 0 }}>
            Área Física y Médica
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>
            Análisis de rendimiento, composición corporal y prevención de lesiones.
          </p>
        </div>
        
        {/* TABS DE NAVEGACIÓN ESTILO APP */}
        <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button className={`nav-tab ${tabActiva === 'global' ? 'active' : ''}`} onClick={() => setTabActiva('global')}>
            GLOBAL
          </button>
          <button className={`nav-tab ${tabActiva === 'comparativa' ? 'active' : ''}`} onClick={() => setTabActiva('comparativa')}>
            COMPARATIVA
          </button>
          <button className={`nav-tab ${tabActiva === 'individual' ? 'active' : ''}`} onClick={() => setTabActiva('individual')}>
            FICHA INDIVIDUAL
          </button>
        </div>
      </div>

      {tabActiva === 'global' && <TabGlobal datos={datos} />}
      {tabActiva === 'comparativa' && <TabComparativa datos={datos} />}
      {tabActiva === 'individual' && <TabIndividual datos={datos} />}

      {/* ESTILOS INTERNOS PARA UI LIMPIA */}
      <style>{`
        .nav-tab {
          background: transparent; border: none; color: var(--text-dim); padding: 8px 16px; border-radius: 6px;
          font-size: 0.8rem; font-weight: 700; letter-spacing: 1px; cursor: pointer; transition: all 0.2s;
        }
        .nav-tab:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .nav-tab.active { background: var(--accent); color: #000; }
        
        .kpi-title { color: var(--text-dim); font-size: 0.75rem; font-weight: 800; letter-spacing: 1px; margin-bottom: 5px; text-transform: uppercase; }
        .kpi-value { font-family: 'JetBrains Mono', monospace; font-size: 2.2rem; font-weight: 900; line-height: 1; margin-bottom: 5px; }
        .kpi-sub { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: #666; }
        
        .select-dark {
          width: 100%; padding: 12px 15px; background: rgba(0,0,0,0.3); border: 1px solid var(--border);
          color: #fff; border-radius: 6px; font-size: 1rem; outline: none; transition: border-color 0.2s;
          font-family: 'Inter', sans-serif;
        }
        .select-dark:focus { border-color: var(--accent); }
        
        .section-header {
          font-size: 0.9rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
          border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
}

// -------------------------------------------------------------
// TAB 1: DETALLE GLOBAL
// -------------------------------------------------------------
function TabGlobal({ datos }) {
  const radarRef = useRef(null);
  const compRef = useRef(null);
  
  const promCMJ = (datos.reduce((acc, d) => acc + (d.cmj || 0), 0) / (datos.length || 1)).toFixed(1);
  const promMusc = (datos.reduce((acc, d) => acc + (d.musc || 0), 0) / (datos.length || 1)).toFixed(1);
  const promAdip = (datos.reduce((acc, d) => acc + (d.adip || 0), 0) / (datos.length || 1)).toFixed(1);
  const promYoyo = (datos.reduce((acc, d) => acc + (d.y26 || d.y25 || 0), 0) / (datos.length || 1)).toFixed(1);
  const promBroad = (datos.reduce((acc, d) => acc + (d.broad || 0), 0) / (datos.length || 1)).toFixed(2);

  const riesgoAsimetria = datos.filter(d => Math.abs(d.asym_cmj) > 10 || Math.abs(d.asym_br) > 10);

  useEffect(() => {
    let radarChart, compChart;
    
    if (radarRef.current) {
      radarChart = new Chart(radarRef.current, {
        type: 'radar',
        data: {
          labels: ['CMJ (cm)', 'Masa Muscular (%)', 'Yo-Yo Test', 'Broad Jump (m x 10)', 'Adiposidad (Inverso)'],
          datasets: [
            {
              label: 'Promedio Equipo',
              data: [promCMJ, promMusc, promYoyo, promBroad * 10, 30 - promAdip],
              backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: '#3b82f6', borderWidth: 2, pointBackgroundColor: '#3b82f6'
            },
            {
              label: 'Élite Internacional',
              data: [ELITE.cmj, ELITE.musc, ELITE.yoyo, ELITE.broad * 10, 30 - ELITE.adip],
              backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981', borderDash: [5, 5], borderWidth: 2, pointBackgroundColor: '#10b981'
            }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { angleLines: { color: 'rgba(255,255,255,0.05)' }, grid: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: 'var(--text-dim)', font: { family: 'Inter', size: 11 } }, ticks: { display: false } } }, plugins: { legend: { labels: { color: '#fff', font: { family: 'Inter' } } } } }
      });
    }

    if (compRef.current) {
      compChart = new Chart(compRef.current, {
        type: 'scatter',
        data: {
          datasets: [
            { label: 'Jugadores', data: datos.map(d => ({ x: d.adip, y: d.musc, nombre: d.jugadores?.apellido })), backgroundColor: '#3b82f6', pointRadius: 5 },
            { label: 'Zona Élite', data: [{x: ELITE.adip, y: ELITE.musc, nombre: 'Estándar Élite'}], backgroundColor: '#10b981', pointRadius: 8, pointStyle: 'rectRot' }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.raw.nombre}: Músc. ${ctx.raw.y}%, Adip. ${ctx.raw.x}%` } }, legend: { labels: { color: '#fff', font: { family: 'Inter' } } } }, scales: { x: { title: { display: true, text: 'Adiposidad (%)', color:'var(--text-dim)' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { title: { display: true, text: 'Masa Muscular (%)', color:'var(--text-dim)' }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
      });
    }
    return () => { if (radarChart) radarChart.destroy(); if (compChart) compChart.destroy(); };
  }, [datos, promCMJ, promMusc, promAdip, promYoyo, promBroad]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">PROMEDIO CMJ</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{promCMJ}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>cm</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.cmj}cm</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">YO-YO TEST</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{promYoyo}</div>
          <div className="kpi-sub">ÉLITE: {ELITE.yoyo}</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">MASA MUSCULAR</div>
          <div className="kpi-value" style={{ color: '#3b82f6' }}>{promMusc}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>%</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.musc}%</div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="kpi-title">MASA ADIPOSA</div>
          <div className="kpi-value" style={{ color: '#ef4444' }}>{promAdip}<span style={{fontSize:'1rem', color:'var(--text-dim)'}}>%</span></div>
          <div className="kpi-sub">ÉLITE: {ELITE.adip}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px', height: '380px' }}>
          <h3 className="section-header" style={{ color: 'var(--text-main)' }}>RENDIMIENTO GLOBAL VS ÉLITE</h3>
          <div style={{ height: '300px', position: 'relative' }}><canvas ref={radarRef}></canvas></div>
        </div>
        <div className="glass-panel" style={{ padding: '20px', height: '380px' }}>
          <h3 className="section-header" style={{ color: 'var(--text-main)' }}>DISPERSIÓN DE COMPOSICIÓN CORPORAL</h3>
          <div style={{ height: '300px', position: 'relative' }}><canvas ref={compRef}></canvas></div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #ef4444' }}>
        <h3 className="section-header" style={{ color: '#ef4444', borderBottom: 'none', paddingBottom: 0, marginBottom: '15px' }}>ALERTAS DE ASIMETRÍA CRÍTICA {'>'}10%</h3>
        {riesgoAsimetria.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {riesgoAsimetria.map(j => (
              <div key={j.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <strong style={{ color: '#fff', fontSize: '1rem', display: 'block', marginBottom: '8px' }}>{j.jugadores?.nombre} {j.jugadores?.apellido}</strong>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                  {Math.abs(j.asym_cmj) > 10 && <div style={{ color: '#ffbaba', marginBottom: '4px' }}>CMJ: {j.asym_cmj}% (Der {j.cmj_de} / Izq {j.cmj_iz})</div>}
                  {Math.abs(j.asym_br) > 10 && <div style={{ color: '#ffbaba' }}>BROAD: {j.asym_br}% (Der {j.broad_de} / Izq {j.broad_iz})</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', margin: 0 }}>El plantel no presenta asimetrías superiores al 10% en testeos de salto.</p>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// TAB 2: COMPARATIVA AVANZADA
// -------------------------------------------------------------
function TabComparativa({ datos }) {
  const [jugadoresSeleccionados, setJugadoresSeleccionados] = useState(['', '', '', '']);
  const cmjRef = useRef(null);
  const broadRef = useRef(null);
  const yoyoRef = useRef(null);

  const promEquipo = {
    cmj_de: datos.reduce((a, b) => a + (b.cmj_de || 0), 0) / datos.length,
    cmj_iz: datos.reduce((a, b) => a + (b.cmj_iz || 0), 0) / datos.length,
    broad_de: datos.reduce((a, b) => a + (b.broad_de || 0), 0) / datos.length,
    broad_iz: datos.reduce((a, b) => a + (b.broad_iz || 0), 0) / datos.length,
    yoyo: datos.reduce((a, b) => a + (b.y26 || b.y25 || 0), 0) / datos.length,
  };

  const setJugador = (index, val) => {
    const nuevos = [...jugadoresSeleccionados];
    nuevos[index] = val;
    setJugadoresSeleccionados(nuevos);
  };

  useEffect(() => {
    const activos = jugadoresSeleccionados.filter(id => id !== '').map(id => datos.find(d => d.id_jugador === parseInt(id)));
    if (activos.length === 0) return;

    let cmjChart, broadChart, yoyoChart;
    const labels = [...activos.map(a => a.jugadores?.apellido), 'PROMEDIO', 'ÉLITE'];
    
    // Configuraciones de fuentes corregidas
    const fontText = { family: "'Inter', sans-serif", size: 12 };
    const fontNumbers = { family: "'JetBrains Mono', monospace", size: 11 };

    if (cmjRef.current) {
      cmjChart = new Chart(cmjRef.current, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: 'Pierna Derecha', data: [...activos.map(a => a.cmj_de), promEquipo.cmj_de, 27.5], backgroundColor: '#3b82f6', borderRadius: 4 },
            { label: 'Pierna Izquierda', data: [...activos.map(a => a.cmj_iz), promEquipo.cmj_iz, 27.5], backgroundColor: '#10b981', borderRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { font: fontText, color: '#aaa' }, grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: fontNumbers, color: '#aaa' } } }, plugins: { legend: { labels: { color: '#fff', font: fontText } } } }
      });
    }

    if (broadRef.current) {
      broadChart = new Chart(broadRef.current, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            { label: 'Pierna Derecha', data: [...activos.map(a => a.broad_de), promEquipo.broad_de, 1.3], backgroundColor: '#f59e0b', borderRadius: 4 },
            { label: 'Pierna Izquierda', data: [...activos.map(a => a.broad_iz), promEquipo.broad_iz, 1.3], backgroundColor: '#ef4444', borderRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { font: fontText, color: '#aaa' }, grid: { display: false } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: fontNumbers, color: '#aaa' } } }, plugins: { legend: { labels: { color: '#fff', font: fontText } } } }
      });
    }

    if (yoyoRef.current) {
      yoyoChart = new Chart(yoyoRef.current, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Nivel Alcanzado',
            data: [...activos.map(a => a.y26 || a.y25), promEquipo.yoyo, 21.0],
            backgroundColor: [...activos.map(() => 'rgba(139, 92, 246, 0.8)'), 'rgba(255,255,255,0.2)', 'rgba(16, 185, 129, 0.8)'],
            borderRadius: 4
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { font: fontText, color: '#aaa' }, grid: { display: false } }, y: { min: 15, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: fontNumbers, color: '#aaa' } } }, plugins: { legend: { display: false } } }
      });
    }

    return () => { if (cmjChart) cmjChart.destroy(); if (broadChart) broadChart.destroy(); if (yoyoChart) yoyoChart.destroy(); };
  }, [jugadoresSeleccionados, datos]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
        {[0, 1, 2, 3].map(i => (
          <select key={i} className="select-dark" value={jugadoresSeleccionados[i]} onChange={(e) => setJugador(i, e.target.value)}>
            <option value="">Seleccionar Jugador {i + 1}</option>
            {datos.map(d => <option key={d.id} value={d.id_jugador}>{d.jugadores?.apellido} {d.jugadores?.nombre}</option>)}
          </select>
        ))}
      </div>

      {jugadoresSeleccionados.some(id => id !== '') ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
              <h3 className="section-header" style={{ color: 'var(--text-main)' }}>SALTO CMJ: DER VS IZQ (CM)</h3>
              <div style={{ height: '240px', position: 'relative' }}><canvas ref={cmjRef}></canvas></div>
            </div>
            
            <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
              <h3 className="section-header" style={{ color: 'var(--text-main)' }}>BROAD JUMP: DER VS IZQ (M)</h3>
              <div style={{ height: '240px', position: 'relative' }}><canvas ref={broadRef}></canvas></div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px', height: '320px' }}>
            <h3 className="section-header" style={{ color: 'var(--text-main)' }}>YO-YO TEST (CAPACIDAD AERÓBICA)</h3>
            <div style={{ height: '240px', position: 'relative' }}><canvas ref={yoyoRef}></canvas></div>
          </div>

        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', border: '1px dashed var(--border)', fontFamily: 'Inter' }}>
          SELECCIONÁ AL MENOS UN JUGADOR PARA DESPLEGAR LOS GRÁFICOS COMPARATIVOS.
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// TAB 3: FICHA INDIVIDUAL
// -------------------------------------------------------------
function TabIndividual({ datos }) {
  const [seleccionadoId, setSeleccionadoId] = useState('');
  
  const jugador = datos.find(d => d.id_jugador === parseInt(seleccionadoId));
  const videosRecomendados = [];
  if (jugador) {
    const notasKine = `${jugador.kin_t || ''} ${jugador.kin_c || ''} ${jugador.kin_u || ''} ${jugador.kin_s || ''}`.toLowerCase();
    Object.keys(REHAB_LIB).forEach(key => {
      if (notasKine.includes(key)) videosRecomendados.push(...REHAB_LIB[key]);
    });
  }

  const KpiRow = ({ label, value, highlightColor = '#fff' }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono', color: highlightColor, fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <div>
      <select className="select-dark" style={{ marginBottom: '25px' }} value={seleccionadoId} onChange={(e) => setSeleccionadoId(e.target.value)}>
        <option value="">-- Buscar Ficha de Jugador --</option>
        {datos.map(d => <option key={d.id} value={d.id_jugador}>{d.jugadores?.apellido}, {d.jugadores?.nombre}</option>)}
      </select>

      {jugador && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '25px', alignItems: 'start' }}>
          
          {/* PANEL IZQUIERDO: MÉTRICAS FÍSICAS */}
          <div className="glass-panel" style={{ padding: '25px' }}>
            <h3 className="section-header" style={{ color: 'var(--accent)' }}>ESTADO FÍSICO</h3>
            <div style={{ fontSize: '0.9rem' }}>
              <KpiRow label="Peso" value={`${jugador.peso} kg`} />
              <KpiRow label="Masa Muscular" value={`${jugador.musc}%`} highlightColor="#3b82f6" />
              <KpiRow label="Masa Adiposa" value={`${jugador.adip}%`} highlightColor="#ef4444" />
              <KpiRow label="CMJ (Salto Máx)" value={`${jugador.cmj} cm`} highlightColor="#10b981" />
              <KpiRow label="Asimetría CMJ" value={`${jugador.asym_cmj}%`} />
              <KpiRow label="Broad Jump" value={`${jugador.broad} m`} />
              <KpiRow label="Asimetría Broad" value={`${jugador.asym_br}%`} />
              <KpiRow label="Yo-Yo Test" value={jugador.y26 || jugador.y25 || 'S/D'} highlightColor="#f59e0b" />
            </div>
          </div>

          {/* PANEL DERECHO: DIETA Y KINE */}
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
                        <iframe src={getEmbedUrl(vid.v)} style={{ width: '100%', height: '140px', borderRadius: '4px' }} frameBorder="0" allowFullScreen></iframe>
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