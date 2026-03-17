import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';

const CargaWellness = () => {
  const { showToast } = useToast();
  const { perfil } = useAuth();

  // --- LÓGICA DE ROLES ---
  const esJugador = perfil?.rol?.toLowerCase() === 'jugador';

  const [jugadores, setJugadores] = useState([]);
  const [cargando, setCargando] = useState(false);
  
  // ESTADOS DE NAVEGACIÓN
  const [vistaActiva, setVistaActiva] = useState(esJugador ? 'carga' : 'reporte');
  
  // --- FUNCIONES DE FECHA ---
  const obtenerFechaLocal = (fechaBase = new Date()) => {
    const yyyy = fechaBase.getFullYear();
    const mm = String(fechaBase.getMonth() + 1).padStart(2, '0');
    const dd = String(fechaBase.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [fecha, setFecha] = useState(obtenerFechaLocal()); 
  
  // Estado del formulario de Carga
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  const [modo, setModo] = useState('pre'); // 'pre', 'mental' o 'post'

  const [readiness, setReadiness] = useState({ sueno: 3, estres: 3, fatiga: 3, dolor_muscular: 3 });
  const [cargaPost, setCargaPost] = useState({ tipo_sesion: 'Entrenamiento', rpe: 5, minutos_actividad: 90 });
  
  // NUEVO: ESTADO MENTAL
  const [mental, setMental] = useState({ animo: 3, motivacion: 3, ansiedad: 3, confianza: 3, notas: '' });

  // --- ESTADOS PARA EL REPORTE DEL DT ---
  const [fechaReferenciaReporte, setFechaReferenciaReporte] = useState(new Date());
  const [diasSemanaReporte, setDiasSemanaReporte] = useState([]);
  const [datosSemana, setDatosSemana] = useState([]);
  const [cargandoReporte, setCargandoReporte] = useState(false);

  useEffect(() => {
    cargarJugadores();
  }, []);

  useEffect(() => {
    if (jugadorSeleccionado && fecha && vistaActiva === 'carga') {
      verificarDatosDelDia();
    }
  }, [jugadorSeleccionado, fecha, vistaActiva]);

  useEffect(() => {
    if (vistaActiva === 'reporte') {
      calcularSemanaYTraerDatos();
    }
  }, [fechaReferenciaReporte, filtroCategoria, vistaActiva]);

  const cargarJugadores = async () => {
    const club_id = localStorage.getItem('club_id') || 'club_default';
    let query = supabase.from('jugadores').select('id, nombre, apellido, posicion, categoria').eq('club_id', club_id).order('apellido', { ascending: true });
    
    const { data, error } = await query;
    if (!error && data) {
      setJugadores(data);
      if (data.length > 0) setJugadorSeleccionado(data[0].id);
    }
  };

  const verificarDatosDelDia = async () => {
    const { data } = await supabase.from('wellness').select('*').eq('jugador_id', jugadorSeleccionado).eq('fecha', fecha).single();
    if (data) {
      setReadiness({ sueno: data.sueno || 3, estres: data.estres || 3, fatiga: data.fatiga || 3, dolor_muscular: data.dolor_muscular || 3 });
      setCargaPost({ tipo_sesion: data.tipo_sesion || 'Entrenamiento', rpe: data.rpe || 5, minutos_actividad: data.minutos_actividad || 90 });
      setMental({ 
        animo: data.animo || 3, 
        motivacion: data.motivacion || 3, 
        ansiedad: data.ansiedad || 3, 
        confianza: data.confianza || 3, 
        notas: data.notas_mentales || '' 
      });
    } else {
      setReadiness({ sueno: 3, estres: 3, fatiga: 3, dolor_muscular: 3 });
      setCargaPost({ tipo_sesion: 'Entrenamiento', rpe: 5, minutos_actividad: 90 });
      setMental({ animo: 3, motivacion: 3, ansiedad: 3, confianza: 3, notas: '' });
    }
  };

  const guardarWellness = async () => {
    if (!jugadorSeleccionado) return showToast("Seleccioná un jugador", "warning");
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const payload = {
        club_id, jugador_id: jugadorSeleccionado, fecha,
        sueno: readiness.sueno, estres: readiness.estres, fatiga: readiness.fatiga, dolor_muscular: readiness.dolor_muscular,
        tipo_sesion: cargaPost.tipo_sesion, rpe: parseInt(cargaPost.rpe), minutos_actividad: parseInt(cargaPost.minutos_actividad),
        // AGREGAMOS LOS DATOS MENTALES
        animo: mental.animo, motivacion: mental.motivacion, ansiedad: mental.ansiedad, confianza: mental.confianza, notas_mentales: mental.notas
      };
      const { error } = await supabase.from('wellness').upsert(payload, { onConflict: 'jugador_id, fecha' });
      if (error) throw error;
      showToast("Datos guardados con éxito", "success");
    } catch (error) {
      showToast("Error al guardar: " + error.message, "error");
    } finally {
      setCargando(false);
    }
  };

  const calcularSemanaYTraerDatos = async () => {
    setCargandoReporte(true);
    const date = new Date(fechaReferenciaReporte);
    const day = date.getDay();
    const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
    const lunes = new Date(date.setDate(diffToMonday));
    
    let diasArray = [];
    const nombresDias = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      diasArray.push({
        nombre: nombresDias[i],
        numero: d.getDate(),
        fechaStr: obtenerFechaLocal(d)
      });
    }
    setDiasSemanaReporte(diasArray);

    const fechaInicio = diasArray[0].fechaStr;
    const fechaFin = diasArray[6].fechaStr;

    const { data, error } = await supabase
      .from('wellness')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin);

    if (!error && data) {
      setDatosSemana(data);
    }
    setCargandoReporte(false);
  };

  const navegarSemana = (direccion) => {
    const nuevaFecha = new Date(fechaReferenciaReporte);
    nuevaFecha.setDate(nuevaFecha.getDate() + (direccion * 7));
    setFechaReferenciaReporte(nuevaFecha);
  };

  const categoriasUnicas = ['Todas', ...new Set(jugadores.map(j => j.categoria).filter(Boolean))];
  const jugadoresFiltrados = filtroCategoria === 'Todas' ? jugadores : jugadores.filter(j => j.categoria === filtroCategoria);

  // --- COMPONENTES UI AUXILIARES ---
  const EscalaBotones = ({ label, icon, valor, setValor, invertido = false, labelBajo = 'Muy Malo', labelAlto = 'Excelente' }) => {
    const colores = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
    const renderColores = invertido ? [...colores].reverse() : colores;

    return (
      <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{icon} {label}</span>
          <span style={{ fontWeight: '900', color: renderColores[valor - 1] }}>{valor}/5</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '5px' }}>
          {[1, 2, 3, 4, 5].map(num => (
            <button
              key={num}
              onClick={() => setValor(num)}
              style={{
                flex: 1, height: '45px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '1.1rem',
                background: valor === num ? renderColores[num - 1] : '#222',
                color: valor === num ? '#000' : '#888',
                transition: 'all 0.2s', cursor: 'pointer',
                boxShadow: valor === num ? `0 0 10px ${renderColores[num - 1]}80` : 'none'
              }}
            >
              {num}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>
          <span>{labelBajo}</span>
          <span>{labelAlto}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: vistaActiva === 'reporte' ? '1200px' : '600px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
      
      {!esJugador && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setVistaActiva('reporte')} style={{ ...mainTabBtn, background: vistaActiva === 'reporte' ? 'var(--accent)' : '#111', color: vistaActiva === 'reporte' ? '#000' : '#888' }}>
            📊 REPORTE DEL PLANTEL
          </button>
          <button onClick={() => setVistaActiva('carga')} style={{ ...mainTabBtn, background: vistaActiva === 'carga' ? 'var(--accent)' : '#111', color: vistaActiva === 'carga' ? '#000' : '#888' }}>
            📝 INGRESAR DATOS MANUAL
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* VISTA: REPORTE DT             */}
      {/* ========================================== */}
      {vistaActiva === 'reporte' && (
        <div className="bento-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', color: 'var(--accent)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '2rem' }}>📈</span> MONITOREO 360° DEL PLANTEL
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Control general de Readiness, Mindset y Carga Interna (UC) de la semana.</p>
            </div>

            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
              <div style={{ width: '150px' }}>
                <label style={labelStyle}>Categoría</label>
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{...inputStyle, padding: '8px'}}>
                  {categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#000', padding: '5px', borderRadius: '8px', border: '1px solid #333' }}>
                <button onClick={() => navegarSemana(-1)} style={navBtn}>⬅</button>
                <span style={{ fontWeight: '900', color: '#fff', fontSize: '0.8rem', minWidth: '130px', textAlign: 'center' }}>
                  {diasSemanaReporte.length > 0 && `${diasSemanaReporte[0].numero}/${diasSemanaReporte[0].fechaStr.split('-')[1]} al ${diasSemanaReporte[6].numero}/${diasSemanaReporte[6].fechaStr.split('-')[1]}`}
                </span>
                <button onClick={() => navegarSemana(1)} style={navBtn}>➡</button>
                <button onClick={() => setFechaReferenciaReporte(new Date())} style={{...navBtn, fontSize: '0.65rem', width: 'auto', padding: '0 10px', background: '#333'}}>HOY</button>
              </div>
            </div>
          </div>

          {cargandoReporte ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent)' }}>Cargando datos de la semana... ⏳</div>
          ) : (
            <div className="table-wrapper" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #333', background: '#0a0a0a' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-dim)', width: '200px' }}>JUGADOR</th>
                    {diasSemanaReporte.map((dia, i) => (
                      <th key={i} style={{ padding: '12px', textAlign: 'center', color: dia.fechaStr === obtenerFechaLocal() ? 'var(--accent)' : 'var(--text-dim)' }}>
                        <div style={{ fontWeight: 900 }}>{dia.nombre}</div>
                        <div style={{ fontSize: '0.7rem' }}>{dia.numero}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jugadoresFiltrados.map((j, idx) => (
                    <tr key={j.id} style={{ borderBottom: '1px solid #1a1a1a', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#fff' }}>
                        {j.apellido}, {j.nombre}
                      </td>
                      {diasSemanaReporte.map((dia, i) => {
                        const registro = datosSemana.find(d => d.jugador_id === j.id && d.fecha === dia.fechaStr);
                        
                        // Lógica de alerta emocional
                        const alertaEmocional = registro && (registro.notas_mentales || registro.ansiedad <= 2 || registro.animo <= 2);

                        return (
                          <td key={i} style={{ padding: '8px', textAlign: 'center', borderLeft: '1px solid #222' }}>
                            {registro ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                {/* PRE (Físico) */}
                                {registro.sueno ? (
                                  <div style={{ background: 'rgba(0, 255, 136, 0.1)', color: 'var(--accent)', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 255, 136, 0.3)', fontWeight: 'bold', width: 'fit-content' }}>
                                    🌞 PRE: OK
                                  </div>
                                ) : null}

{/* MENTAL */}
{registro.animo ? (
  <div style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.3)', fontWeight: 'bold', width: 'fit-content', display: 'flex', gap: '4px', alignItems: 'center' }}>
    🧠 {registro.animo + registro.motivacion + registro.ansiedad + registro.confianza}/20
    {alertaEmocional && (
      <span 
        onClick={() => {
          const msj = registro.notas_mentales || "Niveles de bienestar bajos detectados (sin nota escrita).";
          showToast(`${j.apellido}: ${msj}`, 'info');
        }} 
        style={{ fontSize: '0.9rem', cursor: 'pointer', marginLeft: '2px', filter: 'drop-shadow(0 0 2px yellow)' }}
      >
        ⚠️
      </span>
    )}
  </div>
) : null}
                                
                                {/* POST (Carga UC) */}
                                {registro.minutos_actividad && registro.rpe ? (
                                  <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', fontWeight: 'bold', width: 'fit-content' }}>
                                    🔋 UC: {registro.rpe * registro.minutos_actividad}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span style={{ color: '#333', fontSize: '1.2rem' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {jugadoresFiltrados.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>No hay jugadores en esta categoría.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* VISTA: FORMULARIO DE CARGA          */}
      {/* ========================================== */}
      {vistaActiva === 'carga' && (
        <>
          <div className="bento-card" style={{ marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <h1 style={{ fontSize: '1.5rem', color: 'var(--accent)', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '2rem' }}>🌡️</span> CONTROL WELLNESS 360°
            </h1>
            
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              {!esJugador && (
                <div style={{ flex: 1, minWidth: '130px' }}>
                  <label style={labelStyle}>Categoría</label>
                  <select 
                    value={filtroCategoria} 
                    onChange={e => {
                      const nuevaCat = e.target.value;
                      setFiltroCategoria(nuevaCat);
                      const listaNueva = nuevaCat === 'Todas' ? jugadores : jugadores.filter(j => j.categoria === nuevaCat);
                      setJugadorSeleccionado(listaNueva.length > 0 ? listaNueva[0].id : '');
                    }} 
                    style={inputStyle}
                  >
                    {categoriasUnicas.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ flex: 2, minWidth: '200px' }}>
                <label style={labelStyle}>Jugador</label>
                <select value={jugadorSeleccionado} onChange={e => setJugadorSeleccionado(e.target.value)} style={inputStyle}>
                  {jugadoresFiltrados.map(j => (
                    <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '130px' }}>
                <label style={labelStyle}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button onClick={() => setModo('pre')} style={{ ...tabBtn, background: modo === 'pre' ? 'var(--accent)' : '#111', color: modo === 'pre' ? '#000' : '#888' }}>
              🌞 PRE (Físico)
            </button>
            <button onClick={() => setModo('mental')} style={{ ...tabBtn, background: modo === 'mental' ? '#a855f7' : '#111', color: modo === 'mental' ? '#fff' : '#888' }}>
              🧠 MENTAL (Mindset)
            </button>
            <button onClick={() => setModo('post')} style={{ ...tabBtn, background: modo === 'post' ? '#3b82f6' : '#111', color: modo === 'post' ? '#fff' : '#888' }}>
              🔋 POST (Carga)
            </button>
          </div>

          {/* TAB 1: PRE FÍSICO */}
          {modo === 'pre' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                ¿Cómo te levantaste hoy? Evalúa tu cuerpo antes de iniciar la actividad.
              </p>
              <EscalaBotones label="Calidad de Sueño" icon="😴" valor={readiness.sueno} setValor={(v) => setReadiness({...readiness, sueno: v})} />
              <EscalaBotones label="Nivel de Estrés" icon="💆‍♂️" valor={readiness.estres} setValor={(v) => setReadiness({...readiness, estres: v})} invertido={true} labelBajo="Muy Alto (Mal)" labelAlto="Relajado (Bien)" />
              <EscalaBotones label="Fatiga General" icon="🥱" valor={readiness.fatiga} setValor={(v) => setReadiness({...readiness, fatiga: v})} invertido={true} labelBajo="Mucha Fatiga" labelAlto="Fresco" />
              <EscalaBotones label="Dolor Muscular (DOMS)" icon="🦵" valor={readiness.dolor_muscular} setValor={(v) => setReadiness({...readiness, dolor_muscular: v})} invertido={true} labelBajo="Mucho Dolor" labelAlto="Sin Dolor" />
            </div>
          )}

          {/* TAB 2: MENTAL */}
          {modo === 'mental' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #a855f7' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                ¿Cómo está tu cabeza hoy? Recordá que esta info es confidencial para el Cuerpo Técnico.
              </p>
              <EscalaBotones label="Estado de Ánimo (Mood)" icon="🎭" valor={mental.animo} setValor={(v) => setMental({...mental, animo: v})} labelBajo="Triste / Apagado" labelAlto="Feliz / Positivo" />
              <EscalaBotones label="Motivación y Ganas" icon="🔥" valor={mental.motivacion} setValor={(v) => setMental({...mental, motivacion: v})} labelBajo="Desganado / Apatía" labelAlto="A Tope / Entusiasmado" />
              <EscalaBotones label="Control de Ansiedad" icon="🌬️" valor={mental.ansiedad} setValor={(v) => setMental({...mental, ansiedad: v})} labelBajo="Nervioso / Presionado" labelAlto="Tranquilo / Relajado" />
              <EscalaBotones label="Confianza y Foco" icon="🎯" valor={mental.confianza} setValor={(v) => setMental({...mental, confianza: v})} labelBajo="Dudoso / Distraído" labelAlto="Confiado / 100% Enfocado" />
              
              <div style={{ marginTop: '20px' }}>
                <label style={{...labelStyle, color: '#c084fc'}}>¿Algo externo que te esté afectando? (Opcional)</label>
                <textarea 
                  value={mental.notas} 
                  onChange={e => setMental({...mental, notas: e.target.value})} 
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', border: '1px solid rgba(168, 85, 247, 0.4)' }} 
                  placeholder="Ej: Problemas en casa, estrés por exámenes, dormí mal por ruidos, etc."
                />
              </div>
            </div>
          )}

          {/* TAB 3: POST CARGA */}
          {modo === 'post' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #1e3a8a' }}>
               <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                A los 30 min de terminar, evaluá la sesión completa.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Tipo de Sesión</label>
                <select value={cargaPost.tipo_sesion} onChange={e => setCargaPost({...cargaPost, tipo_sesion: e.target.value})} style={inputStyle}>
                  <option value="Entrenamiento">Entrenamiento (Cancha)</option>
                  <option value="Gimnasio">Fuerza / Gimnasio</option>
                  <option value="Partido">Partido Oficial / Amistoso</option>
                  <option value="Recuperación">Recuperación / Fisioterapia</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Minutos de Actividad</label>
                  <input type="number" min="0" value={cargaPost.minutos_actividad} onChange={e => setCargaPost({...cargaPost, minutos_actividad: e.target.value})} style={{...inputStyle, fontSize: '1.5rem', textAlign: 'center', fontWeight: '900'}} />
                </div>
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <label style={{...labelStyle, margin: 0}}>Intensidad de la Sesión (RPE)</label>
                  <span style={{ fontSize: '2rem', fontWeight: '900', color: cargaPost.rpe > 7 ? '#ef4444' : cargaPost.rpe > 4 ? '#eab308' : '#10b981' }}>
                    {cargaPost.rpe}/10
                  </span>
                </div>
                
                <input 
                  type="range" min="1" max="10" 
                  value={cargaPost.rpe} 
                  onChange={e => setCargaPost({...cargaPost, rpe: e.target.value})} 
                  style={{ width: '100%', accentColor: cargaPost.rpe > 7 ? '#ef4444' : cargaPost.rpe > 4 ? '#eab308' : '#10b981', height: '8px' }} 
                />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '0.7rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  <span>1 - Muy Suave</span>
                  <span>5 - Moderado</span>
                  <span>10 - Máximo</span>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px dashed #333', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>CARGA DE LA SESIÓN (UC)</span>
                  <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', letterSpacing: '-1px' }}>
                    {cargaPost.rpe * cargaPost.minutos_actividad}
                  </div>
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={guardarWellness} 
            disabled={cargando}
            style={{ width: '100%', padding: '15px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: '900', cursor: 'pointer', marginTop: '20px', transition: '0.2s', opacity: cargando ? 0.7 : 1 }}
          >
            {cargando ? 'GUARDANDO...' : '💾 GUARDAR DATOS COMPLETOS'}
          </button>
        </>
      )}

    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '1rem', outline: 'none', fontWeight: 'bold' };
const tabBtn = { flex: 1, minWidth: '120px', padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' };
const mainTabBtn = { flex: 1, padding: '15px', border: '1px solid #333', borderRadius: '8px', fontWeight: '900', fontSize: '0.85rem', cursor: 'pointer', transition: '0.2s' };
const navBtn = { background: '#222', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' };

export default CargaWellness;