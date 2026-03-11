import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const CargaWellness = () => {
  const [jugadores, setJugadores] = useState([]);
  const [cargando, setCargando] = useState(false);
  
  // --- NUEVO: FUNCIÓN PARA OBTENER FECHA LOCAL EXACTA ---
  const obtenerFechaLocal = () => {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Estado del formulario
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState('');
  const [fecha, setFecha] = useState(obtenerFechaLocal()); // <-- ARREGLADO ACÁ
  const [modo, setModo] = useState('pre'); // 'pre' (Readiness) o 'post' (Carga sRPE)

  // Valores Readiness (1 al 5)
  const [readiness, setReadiness] = useState({
    sueno: 3,
    estres: 3,
    fatiga: 3,
    dolor_muscular: 3
  });

  // Valores Carga Post (RPE 1-10 y Minutos)
  const [cargaPost, setCargaPost] = useState({
    tipo_sesion: 'Entrenamiento',
    rpe: 5,
    minutos_actividad: 90
  });

  useEffect(() => {
    cargarJugadores();
  }, []);

  // Cuando cambia el jugador o la fecha, buscamos si ya cargó algo hoy para no pisárselo
  useEffect(() => {
    if (jugadorSeleccionado && fecha) {
      verificarDatosDelDia();
    }
  }, [jugadorSeleccionado, fecha]);

  const cargarJugadores = async () => {
    const club_id = localStorage.getItem('club_id') || 'club_default';
    const { data, error } = await supabase
      .from('jugadores')
      .select('id, nombre, apellido, posicion, categoria')
      .eq('club_id', club_id)
      .order('apellido', { ascending: true });

    if (!error && data) {
      setJugadores(data);
      if (data.length > 0) setJugadorSeleccionado(data[0].id);
    }
  };

  const verificarDatosDelDia = async () => {
    const { data, error } = await supabase
      .from('wellness')
      .select('*')
      .eq('jugador_id', jugadorSeleccionado)
      .eq('fecha', fecha)
      .single();

    if (data) {
      // Si ya cargó, pre-llenamos para que actualice
      setReadiness({
        sueno: data.sueno || 3,
        estres: data.estres || 3,
        fatiga: data.fatiga || 3,
        dolor_muscular: data.dolor_muscular || 3
      });
      setCargaPost({
        tipo_sesion: data.tipo_sesion || 'Entrenamiento',
        rpe: data.rpe || 5,
        minutos_actividad: data.minutos_actividad || 90
      });
    } else {
      // Reseteamos a default si es un día nuevo
      setReadiness({ sueno: 3, estres: 3, fatiga: 3, dolor_muscular: 3 });
      setCargaPost({ tipo_sesion: 'Entrenamiento', rpe: 5, minutos_actividad: 90 });
    }
  };

  const guardarWellness = async () => {
    if (!jugadorSeleccionado) return alert("Seleccioná un jugador");
    setCargando(true);

    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      
      const payload = {
        club_id,
        jugador_id: jugadorSeleccionado,
        fecha,
        sueno: readiness.sueno,
        estres: readiness.estres,
        fatiga: readiness.fatiga,
        dolor_muscular: readiness.dolor_muscular,
        tipo_sesion: cargaPost.tipo_sesion,
        rpe: parseInt(cargaPost.rpe),
        minutos_actividad: parseInt(cargaPost.minutos_actividad)
      };

      // UPSERT: Si existe la combinación (jugador_id + fecha), actualiza. Si no, inserta.
      const { error } = await supabase
        .from('wellness')
        .upsert(payload, { onConflict: 'jugador_id, fecha' });

      if (error) throw error;
      
      alert("✅ Datos guardados con éxito.");
    } catch (error) {
      alert("Error al guardar: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  // --- LÓGICA DE FILTRADO DINÁMICO ---
  // Obtenemos las categorías únicas de los jugadores cargados (limpiando nulos)
  const categoriasUnicas = ['Todas', ...new Set(jugadores.map(j => j.categoria).filter(Boolean))];
  
  // Filtramos la lista de jugadores a mostrar
  const jugadoresFiltrados = filtroCategoria === 'Todas' 
    ? jugadores 
    : jugadores.filter(j => j.categoria === filtroCategoria);

  // --- COMPONENTES UI AUXILIARES ---
  const EscalaBotones = ({ label, icon, valor, setValor, invertido = false }) => {
    const colores = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
    // Si es invertido (ej. Estrés), 1 es Verde (Muy bajo) y 5 es Rojo (Muy alto)
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
          <span>{invertido ? 'Muy Bajo' : 'Muy Malo'}</span>
          <span>{invertido ? 'Muy Alto' : 'Excelente'}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '80px', animation: 'fadeIn 0.3s' }}>
      
      <div className="bento-card" style={{ marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <h1 style={{ fontSize: '1.5rem', color: 'var(--accent)', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '2rem' }}>🌡️</span> CONTROL WELLNESS
        </h1>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          
          {/* NUEVO FILTRO DE CATEGORÍA */}
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

          <div style={{ flex: 1, minWidth: '130px' }}>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
          </div>

        </div>
      </div>

      {/* TABS DE MODO */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setModo('pre')} 
          style={{ ...tabBtn, background: modo === 'pre' ? 'var(--accent)' : '#111', color: modo === 'pre' ? '#000' : '#888' }}
        >
          🌞 PRE (Readiness)
        </button>
        <button 
          onClick={() => setModo('post')} 
          style={{ ...tabBtn, background: modo === 'post' ? '#3b82f6' : '#111', color: modo === 'post' ? '#fff' : '#888' }}
        >
          🔋 POST (Carga sRPE)
        </button>
      </div>

      {/* CONTENIDO PRE-ENTRENO (READINESS) */}
      {modo === 'pre' && (
        <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #222' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
            ¿Cómo te levantaste hoy? Evalúa tu estado antes de iniciar la actividad.
          </p>
          <EscalaBotones label="Calidad de Sueño" icon="😴" valor={readiness.sueno} setValor={(v) => setReadiness({...readiness, sueno: v})} />
          <EscalaBotones label="Nivel de Estrés" icon="🧠" valor={readiness.estres} setValor={(v) => setReadiness({...readiness, estres: v})} invertido={true} />
          <EscalaBotones label="Fatiga General" icon="🥱" valor={readiness.fatiga} setValor={(v) => setReadiness({...readiness, fatiga: v})} invertido={true} />
          <EscalaBotones label="Dolor Muscular (DOMS)" icon="🦵" valor={readiness.dolor_muscular} setValor={(v) => setReadiness({...readiness, dolor_muscular: v})} invertido={true} />
        </div>
      )}

      {/* CONTENIDO POST-ENTRENO (CARGA) */}
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
        {cargando ? 'GUARDANDO...' : '💾 GUARDAR DATOS'}
      </button>

    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.75rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '1rem', outline: 'none', fontWeight: 'bold' };
const tabBtn = { flex: 1, padding: '15px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' };

export default CargaWellness;