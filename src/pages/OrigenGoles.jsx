import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// --- COMPONENTE TOOLTIP UX (CLICK/TOUCH) ---
const InfoBox = ({ texto }) => {
  const [abierto, setAbierto] = useState(false);

  return (
    <div 
      className="tooltip-container" 
      tabIndex="0" 
      onClick={() => setAbierto(!abierto)}
      onBlur={() => setAbierto(false)}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'pointer', verticalAlign: 'middle', outline: 'none' }}
    >
      <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
      <div className="tooltip-text" style={{ 
        visibility: abierto ? 'visible' : 'hidden', 
        opacity: abierto ? 1 : 0, 
        transition: 'all 0.2s ease-in-out',
        position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' 
      }}>
        {texto}
      </div>
    </div>
  );
};

function OrigenGoles() {
  const [eventos, setEventos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroEquipo, setFiltroEquipo] = useState('Propio');

  useEffect(() => {
    async function obtenerDatos() {
      const { data: p } = await supabase.from('partidos').select('id, rival, competicion, categoria');
      const { data: j } = await supabase.from('jugadores').select('id, nombre, apellido, dorsal');
      
      let todosLosGoles = [];
      let start = 0;
      const step = 1000;

      while (true) {
        // Solo traemos los eventos que son goles
        const { data: chunk, error } = await supabase
          .from('eventos')
          .select('*')
          .in('accion', ['Gol', 'Remate - Gol'])
          .range(start, start + step - 1);
        
        if (error) break;

        if (chunk && chunk.length > 0) {
          todosLosGoles = [...todosLosGoles, ...chunk];
          if (chunk.length < step) break; 
          start += step;
        } else {
          break;
        }
      }
      
      setPartidos(p || []);
      setJugadores(j || []);
      setEventos(todosLosGoles);
    }
    obtenerDatos();
  }, []);

  const categoriasUnicas = useMemo(() => [...new Set(partidos.map(p => p.categoria).filter(Boolean))], [partidos]);

  // --- MOTOR DE PROCESAMIENTO (DATA SCIENCE) ---
  const dataAnalizada = useMemo(() => {
    if (!eventos.length) return null;

    let golesFiltrados = eventos.filter(ev => {
      const partido = partidos.find(p => p.id === ev.id_partido);
      const pasaCat = filtroCategoria === 'Todas' || partido?.categoria === filtroCategoria;
      const pasaEq = ev.equipo === filtroEquipo;
      return pasaCat && pasaEq;
    });

    // 1. ORIGEN DEL GOL (Pie Chart)
    const conteoOrigen = {
      'Ataque Posicional': 0, 'Contraataque': 0, 'Recuperación Alta': 0, 'Error No Forzado': 0,
      'Córner': 0, 'Lateral': 0, 'Tiro Libre': 0, 'Penal / Sexta Falta': 0, 'No Especificado': 0
    };

    // 2. DISTRIBUCIÓN TEMPORAL (Histograma)
    const binsTiempo = {
      'PT 0-10': 0, 'PT 10-20': 0, 'PT 20+': 0,
      'ST 0-10': 0, 'ST 10-20': 0, 'ST 20+': 0
    };

    // 3. CONEXIONES LETALES (Red de Asistencias)
    const conexiones = {};

    // 4. METRICAS ESPACIALES Y AVANZADAS
    let golesAsistidos = 0;
    let sumaDistancia = 0;
    let golesConDistancia = 0;

    const mapaGoles = [];

    golesFiltrados.forEach(gol => {
      // Origen
      const origen = gol.origen_gol || 'No Especificado';
      if (conteoOrigen[origen] !== undefined) conteoOrigen[origen]++;
      else conteoOrigen['No Especificado']++;

      // Temporal
      if (gol.minuto !== null && gol.minuto !== undefined) {
        if (gol.periodo === 'PT') {
          if (gol.minuto <= 10) binsTiempo['PT 0-10']++;
          else if (gol.minuto <= 20) binsTiempo['PT 10-20']++;
          else binsTiempo['PT 20+']++;
        } else {
          if (gol.minuto <= 10) binsTiempo['ST 0-10']++;
          else if (gol.minuto <= 20) binsTiempo['ST 10-20']++;
          else binsTiempo['ST 20+']++;
        }
      }

      // Asistencias y Conexiones
      if (gol.id_asistencia) {
        golesAsistidos++;
        const key = `${gol.id_asistencia}-${gol.id_jugador}`;
        if (!conexiones[key]) conexiones[key] = { asistidor: gol.id_asistencia, definidor: gol.id_jugador, cantidad: 0 };
        conexiones[key].cantidad++;
      }

      // Espacial y Distancia
      let xNorm = gol.zona_x_norm !== undefined ? gol.zona_x_norm : gol.zona_x;
      let yNorm = gol.zona_y_norm !== undefined ? gol.zona_y_norm : gol.zona_y;
      
      if (xNorm != null && yNorm != null) {
        // --- FIX DE NORMALIZACIÓN ESPACIAL ---
        // Si el gol es del rival, invertimos la cancha para que la métrica de distancia 
        // y el dibujo en el mapa sean siempre hacia el arco derecho (x=100)
        if (gol.equipo === 'Rival') {
          xNorm = 100 - xNorm;
          yNorm = 100 - yNorm;
        }

        const dx = (100 - xNorm) * 0.4; // Estimación campo 40x20m
        const dy = Math.abs(50 - yNorm) * 0.2;
        const dist = Math.sqrt(dx*dx + dy*dy);
        sumaDistancia += dist;
        golesConDistancia++;
        
        mapaGoles.push({ ...gol, x: xNorm, y: yNorm, distancia: dist });
      } else {
        mapaGoles.push({ ...gol, x: null, y: null, distancia: null });
      }
    });

    const dataPieOrigen = Object.entries(conteoOrigen).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const dataBarTiempo = Object.entries(binsTiempo).map(([name, value]) => ({ name, Goles: value }));
    const topConexiones = Object.values(conexiones).sort((a,b) => b.cantidad - a.cantidad).slice(0, 5);

    const pctAsistidos = golesFiltrados.length > 0 ? ((golesAsistidos / golesFiltrados.length) * 100).toFixed(0) : 0;
    const distPromedio = golesConDistancia > 0 ? (sumaDistancia / golesConDistancia).toFixed(1) : 0;

    // Enriquecer detalle de goles para tabla
    const tablaGoles = mapaGoles.map(g => {
      const p = partidos.find(px => px.id === g.id_partido);
      const jAutor = jugadores.find(jx => jx.id === g.id_jugador);
      const jAsist = jugadores.find(jx => jx.id === g.id_asistencia);

      return {
        id: g.id,
        rival: p ? p.rival : 'Desconocido',
        competicion: p ? p.competicion : '',
        minuto: g.minuto,
        periodo: g.periodo,
        autor: jAutor ? (jAutor.apellido || jAutor.nombre).toUpperCase() : (g.equipo === 'Rival' ? 'RIVAL' : 'S/D'),
        asistidor: jAsist ? (jAsist.apellido || jAsist.nombre).toUpperCase() : '-',
        origen: g.origen_gol || 'No Esp.',
        distancia: g.distancia ? g.distancia.toFixed(1) + 'm' : '-'
      }
    }).sort((a,b) => b.id - a.id);

    return { total: golesFiltrados.length, dataPieOrigen, dataBarTiempo, topConexiones, pctAsistidos, distPromedio, tablaGoles, mapaGoles };
  }, [eventos, partidos, jugadores, filtroCategoria, filtroEquipo]);

  const COLORS_ORIGEN = {
    'Ataque Posicional': '#3b82f6', 'Contraataque': '#f59e0b', 'Recuperación Alta': '#10b981', 'Error No Forzado': '#ef4444', 
    'Córner': '#a855f7', 'Lateral': '#06b6d4', 'Tiro Libre': '#f472b6', 'Penal / Sexta Falta': '#ffffff', 'No Especificado': '#4b5563' 
  };

  const getNombre = (id) => {
    const j = jugadores.find(x => x.id === id);
    return j ? (j.apellido || j.nombre).toUpperCase() : 'DESCONOCIDO';
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">ORIGEN DE LOS GOLES</div>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={selectStyle}>
              <option value="Todas">TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <div className="stat-label">EQUIPO</div>
            <select value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)} style={selectStyle}>
              <option value="Propio">NUESTROS GOLES (A FAVOR)</option>
              <option value="Rival">GOLES RECIBIDOS (EN CONTRA)</option>
            </select>
          </div>
        </div>
      </div>

      {!dataAnalizada ? (
        <div style={{ textAlign: 'center', marginTop: '50px', color: 'var(--text-dim)' }}>PROCESANDO DATOS...</div>
      ) : dataAnalizada.total === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '50px', color: 'var(--text-dim)' }}>NO HAY GOLES REGISTRADOS CON ESTOS FILTROS.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* KPIs SUPERIORES */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px', borderTop: '2px solid var(--accent)' }}>
                <div className="stat-label">GOLES TOTALES</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff' }}>{dataAnalizada.total}</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">ASISTIDOS vs SOLOS <InfoBox texto="Porcentaje de goles que provinieron de una asistencia directa." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: dataAnalizada.pctAsistidos > 50 ? '#00ff88' : '#fbbf24' }}>
                  {dataAnalizada.pctAsistidos}%
                </div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">DISTANCIA PROMEDIO <InfoBox texto="Distancia media estimada desde donde se efectuó el remate goleador." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0ea5e9' }}>{dataAnalizada.distPromedio}m</div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* ORIGEN DEL GOL - DONA */}
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                ADN DE ANOTACIÓN <InfoBox texto="Distribución táctica de cómo se gestaron los goles." />
              </div>
              <div style={{ flex: 1, minHeight: '250px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dataAnalizada.dataPieOrigen} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                      {dataAnalizada.dataPieOrigen.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_ORIGEN[entry.name] || '#8884d8'} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} itemStyle={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }} />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem' }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DISTRIBUCIÓN TEMPORAL - HISTOGRAMA */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
                DISTRIBUCIÓN TEMPORAL <InfoBox texto="En qué momento de los tiempos marcamos más goles. Ayuda a ver si somos un equipo de reacción o de impacto inicial." />
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dataAnalizada.dataBarTiempo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 10, fontWeight: 700 }} />
                  <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#222' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                  <Bar dataKey="Goles" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={35} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* MAPA DE DISPERSIÓN DE GOLES */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>MAPA DE DISPERSIÓN <InfoBox texto="Punto exacto desde donde se pateó para convertir." /></div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0' }}>
                <div className="pitch-container" style={{ width: '100%', maxWidth: '500px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative', background: '#111', border: '2px solid rgba(255,255,255,0.1)' }}>
                  
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: 'rgba(255,255,255,0.1)', transform: 'translateX(-50%)' }}></div>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '2px solid rgba(255,255,255,0.1)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }}></div>
                  <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.1)', borderLeft: 'none', borderRadius: '0 100px 100px 0' }}></div>
                  <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.1)', borderRight: 'none', borderRadius: '100px 0 0 100px' }}></div>

                  {dataAnalizada.mapaGoles.map((g, i) => {
                    if (g.x == null || g.y == null) return null;
                    return (
                      <div 
                        key={i} 
                        title={`Gol vs ${partidos.find(p=>p.id===g.id_partido)?.rival} - ${g.distancia?.toFixed(1)}m`}
                        style={{ 
                          position: 'absolute', left: `${g.x}%`, top: `${g.y}%`, width: '10px', height: '10px', 
                          backgroundColor: filtroEquipo === 'Rival' ? '#ef4444' : '#00ff88', border: '1px solid #000', borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.9, zIndex: 2, boxShadow: filtroEquipo === 'Rival' ? '0 0 8px rgba(239,68,68,0.8)' : '0 0 8px rgba(0,255,136,0.8)'
                        }} 
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* CONEXIONES LETALES */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '20px', color: '#c084fc', display: 'flex', alignItems: 'center' }}>CONEXIONES LETALES <InfoBox texto="Las duplas Asistidor ➔ Goleador más efectivas del equipo." /></div>
              {dataAnalizada.topConexiones.length === 0 ? (
                 <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', marginTop: '30px' }}>No hay goles asistidos registrados.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dataAnalizada.topConexiones.map((con, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(192, 132, 252, 0.05)', border: '1px solid rgba(192, 132, 252, 0.2)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                        <div style={{ flex: 1, textAlign: 'right', fontWeight: 800, fontSize: '0.8rem', color: '#fff' }}>{getNombre(con.asistidor)}</div>
                        <div style={{ color: '#c084fc', fontSize: '1rem' }}>➔</div>
                        <div style={{ flex: 1, textAlign: 'left', fontWeight: 800, fontSize: '0.8rem', color: '#00ff88' }}>{getNombre(con.definidor)}</div>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginLeft: '20px', background: '#000', padding: '2px 10px', borderRadius: '4px', border: '1px solid #333' }}>
                        {con.cantidad}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* TABLA DE DESGLOSE */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px' }}>REGISTRO DETALLADO DE GOLES</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>PARTIDO</th>
                    <th>MINUTO</th>
                    <th>AUTOR</th>
                    <th>ASISTENCIA</th>
                    <th>ORIGEN TÁCTICO</th>
                    <th>DISTANCIA</th>
                  </tr>
                </thead>
                <tbody>
                  {dataAnalizada.tablaGoles.map(g => (
                    <tr key={g.id} style={{ borderBottom: '1px solid #222', fontSize: '0.85rem' }}>
                      <td style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 700 }}>vs {g.rival.toUpperCase()} <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem', display: 'block' }}>{g.competicion}</span></td>
                      <td style={{ color: 'var(--accent)' }}>{g.minuto !== null ? `${g.minuto}' ${g.periodo}` : '-'}</td>
                      <td style={{ fontWeight: 800, color: filtroEquipo === 'Rival' ? '#ef4444' : '#00ff88' }}>{g.autor}</td>
                      <td style={{ color: '#c084fc', fontWeight: 700 }}>{g.asistidor}</td>
                      <td>
                        <span style={{ background: COLORS_ORIGEN[g.origen] || '#4b5563', color: g.origen === 'Penal / Sexta Falta' ? '#000' : '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                          {g.origen.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-dim)' }}>{g.distancia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const selectStyle = { 
  padding: '8px 15px', 
  fontSize: '0.85rem', 
  background: '#111', 
  color: 'var(--accent)', 
  border: '1px solid var(--border)', 
  borderRadius: '4px', 
  outline: 'none',
  fontWeight: 800,
  cursor: 'pointer'
};

export default OrigenGoles;