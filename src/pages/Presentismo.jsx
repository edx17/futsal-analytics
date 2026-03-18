import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

function Presentismo() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  
  const clubId = perfil?.club_id || localStorage.getItem('club_id');
  const esJugador = perfil?.rol?.toLowerCase() === 'jugador';

  const obtenerFechaLocal = () => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  };

  const [vista, setVista] = useState('tomar'); 
  const [categoria, setCategoria] = useState('Primera');
  const [fecha, setFecha] = useState(obtenerFechaLocal());
  const [cargando, setCargando] = useState(false);

  const [jugadores, setJugadores] = useState([]);
  const [historial, setHistorial] = useState([]); 
  
  const [asistenciasHoy, setAsistenciasHoy] = useState({});
  const [notasHoy, setNotasHoy] = useState({});

  useEffect(() => {
    if (!esJugador && categoria && clubId) {
      cargarBaseDatos();
    }
  }, [categoria, clubId, esJugador]);

  useEffect(() => {
    if (jugadores.length > 0) {
      const asistFecha = historial.filter(h => h.fecha === fecha);
      const asisInit = {};
      const notasInit = {};
      
      jugadores.forEach(j => {
        const reg = asistFecha.find(a => String(a.jugador_id) === String(j.id));
        asisInit[j.id] = reg ? reg.estado : 'presente';
        notasInit[j.id] = reg ? (reg.notas || '') : '';
      });
      
      setAsistenciasHoy(asisInit);
      setNotasHoy(notasInit);
    }
  }, [fecha, historial, jugadores]);

  const cargarBaseDatos = async () => {
  setCargando(true);
  try {
    // 1) roster principal: jugadores cuya categoría coincide con la seleccionada
    const { data: jubs } = await supabase
      .from('jugadores')
      .select('*')
      .eq('club_id', clubId)
      .eq('categoria', categoria)
      .order('apellido');
    let jugadoresLista = jubs || [];

    // 2) historial completo para la categoría (para los reportes)
    const { data: histAll } = await supabase
      .from('asistencias')
      .select('*')
      .eq('club_id', clubId)
      .eq('categoria', categoria)
      .order('fecha', { ascending: true });
    setHistorial(histAll || []);

    // 3) asistencias del día/fecha actual para la categoría (para detectar jugadores de otras categorías que asistieron a esta sesión)
    const { data: histHoy } = await supabase
      .from('asistencias')
      .select('jugador_id')
      .eq('club_id', clubId)
      .eq('categoria', categoria)
      .eq('fecha', fecha);

    const idsHoy = (histHoy || []).map(h => String(h.jugador_id));
    const faltantes = idsHoy.filter(id => !jugadoresLista.some(j => String(j.id) === id));

    // 4) si hay jugadores que no pertenecen a la categoría pero aparecen en asistencias del día, traelos y agregalos al roster mostrado
    if (faltantes.length > 0) {
      const { data: extras } = await supabase
        .from('jugadores')
        .select('*')
        .in('id', faltantes)
        .order('apellido');

      jugadoresLista = jugadoresLista.concat(extras || []);
    }

    setJugadores(jugadoresLista);
  } catch (err) {
    showToast("Error al cargar datos", "error");
  } finally {
    setCargando(false);
  }
};

  // --- GUARDADO: UPSERT alineado con índice único (club_id, jugador_id, fecha) ---
  const guardarAsistencia = async () => {
  setCargando(true);
  try {
    const recordsToInsert = jugadores.map(j => ({
      club_id: clubId, // NO lo conviertas a string
      jugador_id: j.id,
      estado: asistenciasHoy[j.id] || 'presente',
      categoria: categoria,
      fecha: fecha,
      notas: notasHoy[j.id] || ''
    }));

    const { error } = await supabase
      .from('asistencias')
      .upsert(recordsToInsert, { 
        onConflict: 'club_id,jugador_id,fecha' 
      });

    if (error) throw error;

    showToast("Asistencia guardada correctamente.", "success");
    cargarBaseDatos();

  } catch (err) {
    console.error("Error completo:", err);
    showToast("Error al guardar: " + err.message, "error");
  } finally {
    setCargando(false);
  }
};

  const stats = useMemo(() => {
    if (historial.length === 0 || jugadores.length === 0) return null;

    const añoActual = fecha.substring(0, 4);
    const mesActual = fecha.substring(5, 7);

    const histAnual = historial.filter(h => h.fecha.startsWith(añoActual));
    const histMensual = historial.filter(h => h.fecha.startsWith(`${añoActual}-${mesActual}`));

    const diasUnicosMes = new Set(histMensual.map(h => h.fecha)).size;
    const rankingMensual = jugadores.map(j => {
      const asistJ = histMensual.filter(h => String(h.jugador_id) === String(j.id));
      const pres = asistJ.filter(a => a.estado === 'presente' || a.estado === 'tarde').length;
      return {
        id: j.id,
        nombre: `${j.apellido}, ${j.nombre}`,
        total: asistJ.length,
        presentes: pres,
        porc: asistJ.length > 0 ? Math.round((pres / asistJ.length) * 100) : 0,
        estadoGral: asistJ.slice(-3).every(a => a.estado === 'ausente') && asistJ.length >= 3 ? 'desertor' : 'ok'
      };
    }).sort((a, b) => b.nombre.localeCompare(a.nombre));

    const presentesMes = histMensual.filter(h => h.estado === 'presente' || h.estado === 'tarde').length;
    const promedioMensual = histMensual.length > 0 ? Math.round((presentesMes / histMensual.length) * 100) : 0;

    const presentesAnual = histAnual.filter(h => h.estado === 'presente' || h.estado === 'tarde').length;
    const promedioAnual = histAnual.length > 0 ? Math.round((presentesAnual / histAnual.length) * 100) : 0;

    const mesesMap = {};
    histAnual.forEach(h => {
      const objFecha = new Date(h.fecha + 'T12:00:00');
      const mesNombre = objFecha.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
      if (!mesesMap[mesNombre]) mesesMap[mesNombre] = { name: mesNombre, total: 0, presentes: 0 };
      mesesMap[mesNombre].total++;
      if (h.estado === 'presente' || h.estado === 'tarde') mesesMap[mesNombre].presentes++;
    });
    const dataMeses = Object.values(mesesMap).map(m => ({ ...m, porcentaje: Math.round((m.presentes / m.total) * 100) }));

    const top10Anual = jugadores.map(j => {
      const asistJ = histAnual.filter(h => String(h.jugador_id) === String(j.id));
      const pres = asistJ.filter(a => a.estado === 'presente' || a.estado === 'tarde').length;
      return {
        nombre: `${j.apellido}, ${j.nombre.substring(0,1)}.`,
        porc: asistJ.length > 0 ? Math.round((pres / asistJ.length) * 100) : 0
      };
    }).sort((a, b) => b.porc - a.porc).slice(0, 10);

    return { 
      mes: { promedio: promedioMensual, diasCargados: diasUnicosMes, ranking: rankingMensual },
      año: { promedio: promedioAnual, dataMeses, top10: top10Anual }
    };

  }, [historial, jugadores, fecha]);

  if (esJugador) return <div style={{ textAlign: 'center', padding: '50px' }}>🚫 ACCESO RESTRINGIDO</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      
      <div className="bento-card" style={{ marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div className="stat-label">OPERACIONES • PRESENTISMO</div>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--accent)' }}>{categoria.toUpperCase()}</h2>
          </div>
          
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>CATEGORÍA</span>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={selectStyle}>
                <option value="Primera">Primera</option>
                <option value="Reserva">Reserva</option>
                <option value="Tercera">Tercera</option>
                <option value="Cuarta">Cuarta</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>FECHA A GESTIONAR</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={selectStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', background: '#000', padding: '5px', borderRadius: '10px', border: '1px solid #333' }}>
          <button onClick={() => setVista('tomar')} style={{ ...tabBtn, background: vista === 'tomar' ? 'var(--accent)' : 'transparent', color: vista === 'tomar' ? '#000' : '#888' }}>📝 PASAR LISTA</button>
          <button onClick={() => setVista('mensual')} style={{ ...tabBtn, background: vista === 'mensual' ? '#3b82f6' : 'transparent', color: vista === 'mensual' ? '#fff' : '#888' }}>📅 RESUMEN DEL MES</button>
          <button onClick={() => setVista('anual')} style={{ ...tabBtn, background: vista === 'anual' ? '#a855f7' : 'transparent', color: vista === 'anual' ? '#fff' : '#888' }}>📊 DASHBOARD ANUAL</button>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Sincronizando datos... ⏳</div>
      ) : (
        <>
          {vista === 'tomar' && (
            <div className="bento-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                  Planilla del <strong>{fecha.split('-').reverse().join('/')}</strong>
                </span>
                <span style={{ background: '#222', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  {jugadores.length} JUGADORES
                </span>
              </div>
              
              <div className="table-wrapper">
                <table style={{ width: '100%', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-dim)', fontSize: '0.75rem', background: '#0a0a0a' }}>
                      <th style={{ padding: '10px' }}>JUGADOR</th>
                      <th style={{ padding: '10px' }}>ESTADO</th>
                      <th style={{ padding: '10px' }}>OBSERVACIONES PRIVADAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jugadores.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>{j.apellido}, {j.nombre}</td>
                        <td style={{ padding: '5px 10px' }}>
                          <select 
                            value={asistenciasHoy[j.id] || 'presente'} 
                            onChange={(e) => setAsistenciasHoy({...asistenciasHoy, [j.id]: e.target.value})} 
                            style={{ 
                              ...inputStyle, 
                              background: asistenciasHoy[j.id] === 'presente' ? '#064e3b' : asistenciasHoy[j.id] === 'ausente' ? '#7f1d1d' : asistenciasHoy[j.id] === 'tarde' ? '#854d0e' : '#1e3a8a' 
                            }}
                          >
                            <option value="presente">✅ PRESENTE</option>
                            <option value="ausente">❌ AUSENTE</option>
                            <option value="tarde">⏳ TARDE</option>
                            <option value="justificado">📝 JUSTIF.</option>
                          </select>
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <input 
                            type="text" 
                            value={notasHoy[j.id] || ''} 
                            onChange={(e) => setNotasHoy({...notasHoy, [j.id]: e.target.value})} 
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #333', borderRadius: '6px', padding: '8px', color: '#fff', fontSize: '0.8rem', width: '100%', outline: 'none' }} 
                            placeholder="Ej: Problemas familiares, estudio..." 
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={guardarAsistencia} className="btn-action" style={{ marginTop: '20px', width: '100%', padding: '15px', fontSize: '1.1rem' }}>
                💾 GUARDAR PLANILLA DEL DÍA
              </button>
            </div>
          )}

          {vista === 'mensual' && stats && (
            <div className="bento-card" style={{ borderTop: '3px solid #3b82f6' }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#3b82f6' }}>RESUMEN DEL MES ({fecha.substring(5,7)}/{fecha.substring(0,4)})</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
                <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#3b82f6' }}>{stats.mes.promedio}%</div>
                  <div className="stat-label">PROMEDIO MES</div>
                </div>
                <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900 }}>{stats.mes.diasCargados}</div>
                  <div className="stat-label">DÍAS COMPUTADOS</div>
                </div>
              </div>

              <div className="table-wrapper">
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr style={{ background: '#0a0a0a' }}>
                      <th style={{ padding: '10px', textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.75rem' }}>JUGADOR</th>
                      <th style={{ padding: '10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem' }}>% MES</th>
                      <th style={{ padding: '10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem' }}>ASISTENCIAS</th>
                      <th style={{ padding: '10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem' }}>ESTADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.mes.ranking.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold' }}>{j.nombre}</td>
                        <td style={{ textAlign: 'center', fontWeight: 900, color: j.porc < 70 && j.total > 0 ? '#ef4444' : '#fff' }}>
                          {j.total > 0 ? `${j.porc}%` : '-'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#aaa' }}>
                          {j.presentes} / {j.total}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {j.estadoGral === 'desertor' ? (
                            <span style={{ background: '#7f1d1d', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>🚩 DESERCIÓN (+3 FALTAS)</span>
                          ) : j.porc === 100 && j.total > 0 ? (
                            <span style={{ background: 'rgba(0, 255, 136, 0.1)', color: '#00ff88', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, border: '1px solid rgba(0, 255, 136, 0.3)' }}>⭐ PERFECTA</span>
                          ) : (
                            <span style={{ color: '#555', fontSize: '0.7rem' }}>Activo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vista === 'anual' && stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              
              <div className="bento-card" style={{ display: 'flex', justifyContent: 'space-around', gridColumn: '1 / -1', textAlign: 'center', borderTop: '3px solid #a855f7' }}>
                <div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#a855f7' }}>{stats.año.promedio}%</div>
                  <div className="stat-label">COMPROMISO ANUAL ({fecha.substring(0,4)})</div>
                </div>
              </div>

              <div className="bento-card" style={{ height: '300px' }}>
                 <div className="stat-label" style={{ marginBottom:'15px' }}>EVOLUCIÓN MES A MES</div>
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.año.dataMeses}>
                      <CartesianGrid stroke="#222" vertical={false}/>
                      <XAxis dataKey="name" stroke="#555" fontSize={10}/>
                      <YAxis hide domain={[0,100]}/>
                      <Tooltip contentStyle={{background:'#111', border:'#333', borderRadius:'8px'}}/>
                      <Line type="monotone" dataKey="porcentaje" stroke="#a855f7" strokeWidth={4} dot={{fill:'#a855f7', strokeWidth: 2}}/>
                    </LineChart>
                 </ResponsiveContainer>
              </div>

              <div className="bento-card" style={{ height: '300px' }}>
                 <div className="stat-label" style={{ marginBottom:'15px' }}>TOP 10 ASISTENCIA (AÑO)</div>
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.año.top10} layout="vertical" margin={{ left: 30 }}>
                      <XAxis type="number" hide domain={[0, 100]} />
                      <YAxis dataKey="nombre" type="category" stroke="#888" fontSize={10} width={80} />
                      <Tooltip cursor={{fill: '#222'}} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius:'8px' }} />
                      <Bar dataKey="porc" radius={[0, 4, 4, 0]} barSize={14}>
                         {stats.año.top10.map((entry, index) => (
                          <Cell key={index} fill={entry.porc >= 85 ? '#00ff88' : '#a855f7'} />
                         ))}
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>

            </div>
          )}
          
          {(vista === 'mensual' || vista === 'anual') && !stats && (
            <div className="bento-card" style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>
               No hay datos suficientes registrados para mostrar este reporte.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const tabBtn = { padding: '10px 15px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '900', transition: '0.2s', flex: 1 };
const selectStyle = { padding: '10px 15px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '8px', fontWeight: 'bold', outline: 'none' };
const inputStyle = { padding: '8px', borderRadius: '6px', border: 'none', fontWeight: 'bold', color: '#fff', outline: 'none', cursor: 'pointer' };

export default Presentismo;