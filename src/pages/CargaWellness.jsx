import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const CargaWellness = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { perfil } = useAuth();

  // --- LÓGICA DE ROLES ---
  const esJugador = perfil?.rol?.toLowerCase() === 'jugador';

  const [jugadores, setJugadores] = useState([]);
  const [cargando, setCargando] = useState(false);
  
  // ESTADOS DE NAVEGACIÓN
  const [vistaActiva, setVistaActiva] = useState(esJugador ? 'carga' : 'reporte');
  const [modoVistaReporte, setModoVistaReporte] = useState('semana'); // 'dia', 'semana', 'mes'
  
  const obtenerFechaLocal = (fechaBase = new Date()) => {
    const yyyy = fechaBase.getFullYear();
    const mm = String(fechaBase.getMonth() + 1).padStart(2, '0');
    const dd = String(fechaBase.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [fecha, setFecha] = useState(obtenerFechaLocal()); 
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  const [modo, setModo] = useState('pre'); 

  const [readiness, setReadiness] = useState({ sueno: 3, estres: 3, fatiga: 3, dolor_muscular: 3 });
  const [cargaPost, setCargaPost] = useState({ tipo_sesion: 'Entrenamiento', rpe: 5, minutos_actividad: 90 });
  const [mental, setMental] = useState({ animo: 3, motivacion: 3, ansiedad: 3, confianza: 3, notas: '' });

  const [fechaReferenciaReporte, setFechaReferenciaReporte] = useState(new Date());
  const [diasReporte, setDiasReporte] = useState([]);
  const [datosReporte, setDatosReporte] = useState([]);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [detalleRegistro, setDetalleRegistro] = useState(null);

  useEffect(() => {
    const inicializarJugador = async () => {
      if (esJugador) {
        if (perfil?.jugador_id) {
          setJugadorSeleccionado(perfil.jugador_id);
        } else {
          const kioscoUid = localStorage.getItem('kiosco_user_id');
          if (kioscoUid) {
            const { data } = await supabase.from('jugadores').select('id').eq('user_id', kioscoUid).single();
            if (data) setJugadorSeleccionado(data.id);
          }
        }
      } else {
        cargarJugadores();
      }
    };
    inicializarJugador();
  }, [esJugador, perfil]);

  useEffect(() => {
    if (jugadorSeleccionado && fecha && vistaActiva === 'carga') {
      verificarDatosDelDia();
    }
  }, [jugadorSeleccionado, fecha, vistaActiva]);

  useEffect(() => {
    if (vistaActiva === 'reporte') {
      calcularPeriodoYTraerDatos();
    }
  }, [fechaReferenciaReporte, filtroCategoria, vistaActiva, modoVistaReporte]);

  const cargarJugadores = async () => {
    const club_id = localStorage.getItem('club_id') || 'club_default';
    let query = supabase.from('jugadores').select('id, nombre, apellido, posicion, categoria').eq('club_id', club_id).order('apellido', { ascending: true });
    
    const { data, error } = await query;
    if (!error && data) {
      setJugadores(data);
      if (data.length > 0 && !esJugador) setJugadorSeleccionado(data[0].id);
    }
  };

  const verificarDatosDelDia = async () => {
    const { data } = await supabase.from('wellness').select('*').eq('jugador_id', jugadorSeleccionado).eq('fecha', fecha).single();
    if (data) {
      setReadiness({ sueno: data.sueno || 3, estres: data.estres || 3, fatiga: data.fatiga || 3, dolor_muscular: data.dolor_muscular || 3 });
      setCargaPost({ tipo_sesion: data.tipo_sesion || 'Entrenamiento', rpe: data.rpe || 5, minutos_actividad: data.minutos_actividad || 90 });
      setMental({ animo: data.animo || 3, motivacion: data.motivacion || 3, ansiedad: data.ansiedad || 3, confianza: data.confianza || 3, notas: data.notas_mentales || '' });
    } else {
      setReadiness({ sueno: 3, estres: 3, fatiga: 3, dolor_muscular: 3 });
      setCargaPost({ tipo_sesion: 'Entrenamiento', rpe: 5, minutos_actividad: 90 });
      setMental({ animo: 3, motivacion: 3, ansiedad: 3, confianza: 3, notas: '' });
    }
  };

  const guardarWellness = async () => {
    if (!jugadorSeleccionado) return showToast("Aguardá un segundo, vinculando perfil...", "warning");
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || localStorage.getItem('kiosco_club_id') || 'club_default';
      const payload = {
        club_id, jugador_id: jugadorSeleccionado, fecha,
        sueno: readiness.sueno, estres: readiness.estres, fatiga: readiness.fatiga, dolor_muscular: readiness.dolor_muscular,
        tipo_sesion: cargaPost.tipo_sesion, rpe: parseInt(cargaPost.rpe), minutos_actividad: parseInt(cargaPost.minutos_actividad),
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

  // --- NUEVO: CÁLCULO DINÁMICO DE PERIODOS (Día / Semana / Mes) ---
  const calcularPeriodoYTraerDatos = async () => {
    setCargandoReporte(true);
    // Usamos hora 12:00 segura para evitar saltos de zona horaria al manipular días
    const date = new Date(fechaReferenciaReporte.getFullYear(), fechaReferenciaReporte.getMonth(), fechaReferenciaReporte.getDate(), 12, 0, 0);
    let diasArray = [];
    const nombresDias = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    
    if (modoVistaReporte === 'dia') {
      diasArray.push({ nombre: nombresDias[date.getDay()], numero: date.getDate(), fechaStr: obtenerFechaLocal(date) });
    } 
    else if (modoVistaReporte === 'semana') {
      const day = date.getDay();
      const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
      const lunes = new Date(date.getTime());
      lunes.setDate(diffToMonday);
      for (let i = 0; i < 7; i++) {
        const d = new Date(lunes.getTime());
        d.setDate(lunes.getDate() + i);
        diasArray.push({ nombre: nombresDias[d.getDay()], numero: d.getDate(), fechaStr: obtenerFechaLocal(d) });
      }
    } 
    else if (modoVistaReporte === 'mes') {
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0);
      for (let d = new Date(firstDay.getTime()); d <= lastDay; d.setDate(d.getDate() + 1)) {
        diasArray.push({ nombre: nombresDias[d.getDay()], numero: d.getDate(), fechaStr: obtenerFechaLocal(d) });
      }
    }

    setDiasReporte(diasArray);

    const fechaInicio = diasArray[0].fechaStr;
    const fechaFin = diasArray[diasArray.length - 1].fechaStr;

    const { data, error } = await supabase
      .from('wellness')
      .select('*')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin);

    if (!error && data) {
      setDatosReporte(data);
    }
    setCargandoReporte(false);
  };

  const navegarPeriodo = (direccion) => {
    const nuevaFecha = new Date(fechaReferenciaReporte);
    if (modoVistaReporte === 'dia') {
      nuevaFecha.setDate(nuevaFecha.getDate() + direccion);
    } else if (modoVistaReporte === 'semana') {
      nuevaFecha.setDate(nuevaFecha.getDate() + (direccion * 7));
    } else if (modoVistaReporte === 'mes') {
      nuevaFecha.setMonth(nuevaFecha.getMonth() + direccion);
    }
    setFechaReferenciaReporte(nuevaFecha);
  };

  const getTextoPeriodo = () => {
    if (diasReporte.length === 0) return '';
    if (modoVistaReporte === 'dia') {
      const d = new Date(diasReporte[0].fechaStr + 'T12:00:00');
      return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
    }
    if (modoVistaReporte === 'semana') {
      return `${diasReporte[0].numero}/${diasReporte[0].fechaStr.split('-')[1]} al ${diasReporte[diasReporte.length-1].numero}/${diasReporte[diasReporte.length-1].fechaStr.split('-')[1]}`;
    }
    if (modoVistaReporte === 'mes') {
      const d = new Date(diasReporte[0].fechaStr + 'T12:00:00');
      return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
    }
  };

  const categoriasUnicas = ['Todas', ...new Set(jugadores.map(j => j.categoria).filter(Boolean))];
  const jugadoresFiltrados = filtroCategoria === 'Todas' ? jugadores : jugadores.filter(j => j.categoria === filtroCategoria);

  // --- LÓGICA DE ANALÍTICA ---
  const calcularScoreReadiness = (reg) => {
    if (!reg) return null;
    let suma = 0, max = 0;
    if (reg.sueno) { suma += reg.sueno + (6 - reg.estres) + (6 - reg.fatiga) + (6 - reg.dolor_muscular); max += 20; }
    if (reg.animo) { suma += reg.animo + reg.motivacion + (6 - reg.ansiedad) + reg.confianza; max += 20; }
    return max === 0 ? null : Math.round((suma / max) * 100);
  };

  const getColorPorPuntos = (score) => {
    if (score >= 80) return { bg: '#10b98120', text: '#10b981', border: '#10b98150' }; 
    if (score >= 60) return { bg: '#eab30820', text: '#eab308', border: '#eab30850' }; 
    return { bg: '#ef444420', text: '#ef4444', border: '#ef444450' }; 
  };

  const getColorPorRPE = (rpe) => {
    if (rpe <= 4) return { bg: '#10b98120', text: '#10b981', border: '#10b98150' }; 
    if (rpe <= 7) return { bg: '#eab30820', text: '#eab308', border: '#eab30850' }; 
    return { bg: '#ef444420', text: '#ef4444', border: '#ef444450' }; 
  };

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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
          {[1, 2, 3, 4, 5].map(num => (
            <button
              key={num}
              onClick={() => setValor(num)}
              style={{
                flex: 1, height: '45px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '1.1rem',
                background: valor === num ? renderColores[num - 1] : '#222', color: valor === num ? '#000' : '#888',
                transition: 'all 0.2s', cursor: 'pointer', boxShadow: valor === num ? `0 0 10px ${renderColores[num - 1]}80` : 'none', minWidth: 0
              }}
            >{num}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '0.65rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold' }}>
          <span>{labelBajo}</span><span>{labelAlto}</span>
        </div>
      </div>
    );
  };

  const RenderMetricaDetalle = ({ label, valor, invertido = false }) => {
    const paleta = invertido ? ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'] : ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
    const color = paleta[valor - 1] || '#888';
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.85rem' }}>
        <span style={{ color: '#ccc' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {[1, 2, 3, 4, 5].map(v => <div key={v} style={{ width: '15px', height: '6px', borderRadius: '2px', background: v <= valor ? color : '#222' }} />)}
          </div>
          <span style={{ fontWeight: 'bold', color: color, width: '20px', textAlign: 'right' }}>{valor}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: vistaActiva === 'reporte' ? '1200px' : '600px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
      
      {/* --- BOTÓN VOLVER --- */}
      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '8px 15px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}>
          ← VOLVER
        </button>
      </div>

      {!esJugador && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setVistaActiva('reporte')} style={{ ...mainTabBtn, background: vistaActiva === 'reporte' ? 'var(--accent)' : '#111', color: vistaActiva === 'reporte' ? '#000' : '#888' }}>
            📊 REPORTE DEL PLANTEL
          </button>
          <button onClick={() => setVistaActiva('carga')} style={{ ...mainTabBtn, background: vistaActiva === 'carga' ? 'var(--accent)' : '#111', color: vistaActiva === 'carga' ? '#000' : '#888' }}>
            📝 INGRESAR DATOS MANUAL
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* VISTA: REPORTE DT (GRILLAS DINÁMICAS)      */}
      {/* ========================================== */}
      {vistaActiva === 'reporte' && (
        <div className="bento-card" style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', color: 'var(--accent)', margin: '0 0 5px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '2rem' }}>📈</span> MONITOREO
              </h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Análisis de Readiness y Cargas por Jugador.</p>
            </div>

            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              
              <div style={{ flex: '1 1 120px' }}>
                <label style={labelStyle}>Categoría</label>
                <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{...inputStyle, padding: '8px'}}>
                  {categoriasUnicas.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              {/* SELECTOR DE MODO DE VISTA (DÍA / SEMANA / MES) */}
              <div>
                <label style={labelStyle}>Vista</label>
                <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
                  <button onClick={() => setModoVistaReporte('dia')} style={{...toggleBtnStyle, background: modoVistaReporte === 'dia' ? '#333' : 'transparent', color: modoVistaReporte === 'dia' ? '#fff' : '#888'}}>Día</button>
                  <button onClick={() => setModoVistaReporte('semana')} style={{...toggleBtnStyle, background: modoVistaReporte === 'semana' ? '#333' : 'transparent', color: modoVistaReporte === 'semana' ? '#fff' : '#888'}}>Sem.</button>
                  <button onClick={() => setModoVistaReporte('mes')} style={{...toggleBtnStyle, background: modoVistaReporte === 'mes' ? '#333' : 'transparent', color: modoVistaReporte === 'mes' ? '#fff' : '#888'}}>Mes</button>
                </div>
              </div>

              {/* NAVEGADOR DE FECHAS */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#000', padding: '5px', borderRadius: '8px', border: '1px solid #333', height: '37px', boxSizing: 'border-box' }}>
                <button onClick={() => navegarPeriodo(-1)} style={navBtn}>⬅</button>
                <span style={{ fontWeight: '900', color: '#fff', fontSize: '0.75rem', minWidth: '110px', textAlign: 'center' }}>
                  {getTextoPeriodo()}
                </span>
                <button onClick={() => navegarPeriodo(1)} style={navBtn}>➡</button>
                <button onClick={() => setFechaReferenciaReporte(new Date())} style={{...navBtn, fontSize: '0.6rem', width: 'auto', padding: '0 8px', background: '#3b82f6'}}>HOY</button>
              </div>

            </div>
          </div>

          {cargandoReporte ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent)' }}>Analizando datos... ⏳</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
              {jugadoresFiltrados.map((j) => (
                <div key={j.id} style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '12px', padding: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #1a1a1a', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.05rem' }}>{j.apellido}, {j.nombre}</span>
                    {j.posicion && <span style={{ fontSize: '0.65rem', color: '#888', background: '#1a1a1a', padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>{j.posicion}</span>}
                  </div>
                  
                  {/* --- RENDER DINÁMICO SEGÚN LA VISTA --- */}
                  
                  {/* VISTA DÍA (Detallada) */}
                  {modoVistaReporte === 'dia' && (() => {
                    const dia = diasReporte[0];
                    const registro = datosReporte.find(d => d.jugador_id === j.id && d.fecha === dia.fechaStr);
                    const score = calcularScoreReadiness(registro);
                    
                    if (!registro || (score === null && !registro.rpe)) {
                      return <div style={{ color: '#444', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', padding: '15px 0' }}>Sin datos cargados hoy</div>;
                    }

                    return (
                      <div 
                        onClick={() => setDetalleRegistro({ jugador: j, registro, dia: dia.fechaStr })}
                        style={{ display: 'flex', gap: '15px', cursor: 'pointer', transition: 'transform 0.2s', padding: '5px' }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        {score !== null && (
                           <div style={{ flex: 1, background: getColorPorPuntos(score).bg, border: `1px solid ${getColorPorPuntos(score).border}`, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                             <div style={{ fontSize: '0.65rem', color: getColorPorPuntos(score).text, textTransform: 'uppercase', fontWeight: 'bold' }}>Readiness</div>
                             <div style={{ fontSize: '1.8rem', fontWeight: '900', color: getColorPorPuntos(score).text, lineHeight: '1' }}>{score}%</div>
                             <div style={{ fontSize: '0.7rem', color: getColorPorPuntos(score).text, marginTop: '5px' }}>{registro.sueno ? 'Fís. + Men.' : 'Sólo Fís.'}</div>
                           </div>
                        )}
                        {registro.rpe && (
                          <div style={{ flex: 1, background: getColorPorRPE(registro.rpe).bg, border: `1px solid ${getColorPorRPE(registro.rpe).border}`, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', color: getColorPorRPE(registro.rpe).text, textTransform: 'uppercase', fontWeight: 'bold' }}>Carga RPE</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: '900', color: getColorPorRPE(registro.rpe).text, lineHeight: '1' }}>{registro.rpe}</div>
                            <div style={{ fontSize: '0.7rem', color: getColorPorRPE(registro.rpe).text, marginTop: '5px' }}>{registro.minutos_actividad} min</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* VISTA SEMANA (Grilla de 7 días) */}
                  {modoVistaReporte === 'semana' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                      {diasReporte.map((dia, i) => {
                        const registro = datosReporte.find(d => d.jugador_id === j.id && d.fecha === dia.fechaStr);
                        const score = calcularScoreReadiness(registro);
                        const esHoy = dia.fechaStr === obtenerFechaLocal();
                        return (
                          <div 
                            key={i} 
                            onClick={() => registro && (score !== null || registro.rpe) ? setDetalleRegistro({ jugador: j, registro, dia: dia.fechaStr }) : null}
                            style={{ 
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: registro && (score !== null || registro.rpe) ? 'pointer' : 'default', 
                              background: esHoy ? 'rgba(59, 130, 246, 0.05)' : 'transparent', padding: '4px 2px', borderRadius: '6px', 
                              border: esHoy ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent', transition: 'transform 0.1s'
                            }}
                            onMouseEnter={(e) => registro && (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={(e) => registro && (e.currentTarget.style.transform = 'scale(1)')}
                          >
                            <span style={{ fontSize: '0.55rem', color: esHoy ? '#3b82f6' : '#666', fontWeight: 'bold' }}>{dia.nombre}</span>
                            <span style={{ fontSize: '0.75rem', color: esHoy ? '#fff' : '#aaa', fontWeight: '900', marginBottom: '4px' }}>{dia.numero}</span>
                            {score !== null ? (
                              <div style={{ width: '100%', height: '22px', background: getColorPorPuntos(score).bg, color: getColorPorPuntos(score).text, border: `1px solid ${getColorPorPuntos(score).border}`, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '900', position: 'relative' }}>
                                {score}% {registro.notas_mentales && <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', background: '#a855f7', borderRadius: '50%', border: '1px solid #000' }} />}
                              </div>
                            ) : <div style={{ width: '100%', height: '22px', background: '#111', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#444' }}>-</div>}
                            {registro?.rpe ? (
                              <div style={{ width: '100%', height: '22px', background: getColorPorRPE(registro.rpe).bg, color: getColorPorRPE(registro.rpe).text, border: `1px solid ${getColorPorRPE(registro.rpe).border}`, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '900' }}>R{registro.rpe}</div>
                            ) : <div style={{ width: '100%', height: '22px', background: '#111', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#444' }}>-</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* VISTA MES (Calendario Compacto) */}
                  {modoVistaReporte === 'mes' && (() => {
                    const primerDiaMes = new Date(diasReporte[0].fechaStr + 'T12:00:00').getDay();
                    const offset = primerDiaMes === 0 ? 6 : primerDiaMes - 1; // 0=Lunes, 6=Domingo
                    return (
                      <div>
                        {/* Cabecera L M M J V S D */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                          {['L','M','M','J','V','S','D'].map((d,i) => <div key={i} style={{ textAlign: 'center', fontSize: '0.55rem', color: '#666', fontWeight: 'bold' }}>{d}</div>)}
                        </div>
                        {/* Grilla de días */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                          {Array.from({ length: offset }).map((_, i) => <div key={`empty-${i}`} />)}
                          {diasReporte.map((dia, i) => {
                            const registro = datosReporte.find(d => d.jugador_id === j.id && d.fecha === dia.fechaStr);
                            const score = calcularScoreReadiness(registro);
                            const tieneData = registro && (score !== null || registro.rpe);
                            let bg = '#111'; let border = '1px solid #1a1a1a';
                            if (tieneData) {
                              if (score !== null) { bg = getColorPorPuntos(score).bg; border = `1px solid ${getColorPorPuntos(score).text}`; }
                              else { bg = getColorPorRPE(registro.rpe).bg; border = `1px solid ${getColorPorRPE(registro.rpe).text}`; }
                            }
                            const esHoy = dia.fechaStr === obtenerFechaLocal();

                            return (
                              <div 
                                key={i} title={dia.fechaStr}
                                onClick={() => tieneData ? setDetalleRegistro({ jugador: j, registro, dia: dia.fechaStr }) : null}
                                style={{
                                  aspectRatio: '1', borderRadius: '4px', background: bg, border: esHoy ? '2px solid #3b82f6' : border,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tieneData ? 'pointer' : 'default',
                                  fontSize: '0.6rem', color: tieneData ? '#fff' : '#444', fontWeight: 'bold', position: 'relative'
                                }}
                              >
                                {dia.numero}
                                {registro?.notas_mentales && <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '6px', height: '6px', background: '#a855f7', borderRadius: '50%' }} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                </div>
              ))}
              
              {jugadoresFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', gridColumn: '1 / -1' }}>No hay jugadores en esta categoría.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL FLOTANTE DE DETALLE                  */}
      {/* ========================================== */}
      {detalleRegistro && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '700px', border: '1px solid #333', position: 'relative', animation: 'fadeIn 0.2s', padding: 0, overflow: 'hidden' }}>
            
            <div style={{ background: '#0a0a0a', padding: '20px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.3rem', textTransform: 'uppercase' }}>{detalleRegistro.jugador.apellido}, {detalleRegistro.jugador.nombre}</h3>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 'bold' }}>🗓️ Reporte del día: {detalleRegistro.dia}</span>
              </div>
              <button onClick={() => setDetalleRegistro(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.5rem' }}>✖</button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: '#000', padding: '15px', borderRadius: '12px', border: '1px solid #222' }}>
                {(() => {
                  const score = calcularScoreReadiness(detalleRegistro.registro);
                  if(score === null) return <div style={{color: '#888', fontStyle: 'italic'}}>No hay datos de preparación (Pre/Mental) ingresados este día.</div>;
                  
                  const colorConfig = getColorPorPuntos(score);
                  return (
                    <>
                      <div style={{ 
                        background: colorConfig.bg, color: colorConfig.text, border: `3px solid ${colorConfig.border}`,
                        width: '80px', height: '80px', borderRadius: '50%',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        fontWeight: '900', fontSize: '1.8rem', flexShrink: 0
                      }}>
                        {score}%
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 5px 0', color: colorConfig.text, fontSize: '1.1rem', textTransform: 'uppercase' }}>
                          {score >= 80 ? 'Óptimo para entrenar' : score >= 60 ? 'Alerta / Monitorear' : 'Bandera Roja / Adaptar'}
                        </h4>
                        <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>Índice Readiness calculado en base al bienestar físico y la predisposición mental.</p>
                      </div>
                    </>
                  )
                })()}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                {detalleRegistro.registro.sueno && (
                  <div style={{ flex: '1 1 300px', background: '#0a0a0a', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
                    <h4 style={{ color: 'var(--accent)', margin: '0 0 15px 0', fontSize: '0.85rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      🌞 Pre-Físico
                    </h4>
                    <RenderMetricaDetalle label="Calidad de Sueño" valor={detalleRegistro.registro.sueno} />
                    <RenderMetricaDetalle label="Nivel de Estrés" valor={detalleRegistro.registro.estres} invertido />
                    <RenderMetricaDetalle label="Fatiga Muscular" valor={detalleRegistro.registro.fatiga} invertido />
                    <RenderMetricaDetalle label="Dolor Muscular (DOMS)" valor={detalleRegistro.registro.dolor_muscular} invertido />
                  </div>
                )}

                {detalleRegistro.registro.animo && (
                  <div style={{ flex: '1 1 300px', background: '#0a0a0a', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
                    <h4 style={{ color: '#c084fc', margin: '0 0 15px 0', fontSize: '0.85rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      🧠 Mindset
                    </h4>
                    <RenderMetricaDetalle label="Estado de Ánimo" valor={detalleRegistro.registro.animo} />
                    <RenderMetricaDetalle label="Motivación" valor={detalleRegistro.registro.motivacion} />
                    <RenderMetricaDetalle label="Nivel de Ansiedad" valor={detalleRegistro.registro.ansiedad} invertido />
                    <RenderMetricaDetalle label="Confianza" valor={detalleRegistro.registro.confianza} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                {detalleRegistro.registro.notas_mentales && (
                  <div style={{ flex: 2, background: 'rgba(168, 85, 247, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#c084fc', fontSize: '0.8rem', textTransform: 'uppercase' }}>💬 Notas / Novedades</h4>
                    <p style={{ margin: 0, color: '#e9d5ff', fontSize: '0.9rem', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>"{detalleRegistro.registro.notas_mentales}"</p>
                  </div>
                )}

                {detalleRegistro.registro.minutos_actividad && detalleRegistro.registro.rpe ? (
                  <div style={{ flex: 1, minWidth: '200px', background: getColorPorRPE(detalleRegistro.registro.rpe).bg, padding: '15px', borderRadius: '12px', border: `1px solid ${getColorPorRPE(detalleRegistro.registro.rpe).border}`, textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: getColorPorRPE(detalleRegistro.registro.rpe).text, fontSize: '0.8rem', textTransform: 'uppercase' }}>🔋 Post-Entrenamiento</h4>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: getColorPorRPE(detalleRegistro.registro.rpe).text, lineHeight: '1' }}>
                      RPE {detalleRegistro.registro.rpe}/10
                    </div>
                    <div style={{ fontSize: '0.75rem', color: getColorPorRPE(detalleRegistro.registro.rpe).text, marginTop: '5px', opacity: 0.8 }}>
                      Duración: {detalleRegistro.registro.minutos_actividad} mins • Carga UC: {detalleRegistro.registro.rpe * detalleRegistro.registro.minutos_actividad}
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* VISTA: FORMULARIO DE CARGA                  */}
      {/* ========================================== */}
      {vistaActiva === 'carga' && (
        <>
          <div className="bento-card" style={{ marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
            <h1 style={{ fontSize: '1.5rem', color: 'var(--accent)', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '2rem' }}></span> CONTROL WELLNESS
            </h1>
            
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
              
              {!esJugador && (
                <>
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

                  <div style={{ flex: 2, minWidth: '200px' }}>
                    <label style={labelStyle}>Jugador</label>
                    <select value={jugadorSeleccionado} onChange={e => setJugadorSeleccionado(e.target.value)} style={inputStyle}>
                      {jugadoresFiltrados.map(j => (
                        <option key={j.id} value={j.id}>{j.apellido}, {j.nombre}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {esJugador && (
                <div style={{ flex: 2, padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                    {jugadorSeleccionado ? '✅ Tu perfil está vinculado y listo para cargar' : '🔄 Conectando con tu ficha...'}
                  </span>
                </div>
              )}

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

          {modo === 'pre' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                ¿Cómo te levantaste hoy? Evalúa tu cuerpo antes de iniciar la actividad.
              </p>
              <EscalaBotones label="Calidad de Sueño" icon="😴" valor={readiness.sueno} setValor={(v) => setReadiness({...readiness, sueno: v})} labelBajo="Mala" labelAlto="Excelente" />
              <EscalaBotones label="Nivel de Estrés" icon="💆‍♂️" valor={readiness.estres} setValor={(v) => setReadiness({...readiness, estres: v})} invertido={true} labelBajo="Poco / Nada" labelAlto="Mucho Estrés" />
              <EscalaBotones label="Fatiga General" icon="🥱" valor={readiness.fatiga} setValor={(v) => setReadiness({...readiness, fatiga: v})} invertido={true} labelBajo="Fresco / Nada" labelAlto="Mucha Fatiga" />
              <EscalaBotones label="Dolor Muscular (DOMS)" icon="🦵" valor={readiness.dolor_muscular} setValor={(v) => setReadiness({...readiness, dolor_muscular: v})} invertido={true} labelBajo="Sin Dolor" labelAlto="Mucho Dolor" />
            </div>
          )}

          {modo === 'mental' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #a855f7' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                ¿Cómo está tu cabeza hoy? Recordá que esta info es confidencial para el Cuerpo Técnico.
              </p>
              <EscalaBotones label="Estado de Ánimo (Mood)" icon="🎭" valor={mental.animo} setValor={(v) => setMental({...mental, animo: v})} labelBajo="Triste / Apagado" labelAlto="Feliz / Positivo" />
              <EscalaBotones label="Motivación y Ganas" icon="🔥" valor={mental.motivacion} setValor={(v) => setMental({...mental, motivacion: v})} labelBajo="Desganado / Apatía" labelAlto="A Tope / Entusiasmado" />
              <EscalaBotones label="Nivel de Ansiedad" icon="🌬️" valor={mental.ansiedad} setValor={(v) => setMental({...mental, ansiedad: v})} invertido={true} labelBajo="Relajado / Nada" labelAlto="Nervioso / Presionado" />
              <EscalaBotones label="Confianza y Foco" icon="🎯" valor={mental.confianza} setValor={(v) => setMental({...mental, confianza: v})} labelBajo="Dudoso / Distraído" labelAlto="Confiado / 100% Foco" />
              
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

          {modo === 'post' && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #1e3a8a' }}>
               <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                A los 30 min de terminar, evaluá la sesión completa.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Tipo de Sesión</label>
                <select value={cargaPost.tipo_sesion} onChange={e => setCargaPost({...cargaPost, tipo_sesion: e.target.value})} style={inputStyle}>
                  <option value="Entrenamiento">Entrenamiento</option>
                  <option value="Gimnasio">Gimnasio</option>
                  <option value="Partido">Partido</option>
                  <option value="Recuperación">Kinesio / Fisioterapia</option>
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
            disabled={cargando || !jugadorSeleccionado}
            style={{ width: '100%', padding: '15px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: '900', cursor: 'pointer', marginTop: '20px', transition: '0.2s', opacity: (cargando || !jugadorSeleccionado) ? 0.5 : 1 }}
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
const mainTabBtn = { flex: 1, minWidth: '150px', padding: '15px', border: '1px solid #333', borderRadius: '8px', fontWeight: '900', fontSize: '0.85rem', cursor: 'pointer', transition: '0.2s' };
const navBtn = { background: '#222', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' };
const toggleBtnStyle = { border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' };

export default CargaWellness;