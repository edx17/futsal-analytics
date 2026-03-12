import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

const BancoTareas = () => {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroFase, setFiltroFase] = useState('Todas');
  
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const navigate = useNavigate();
  
  const { showToast } = useToast(); // INICIALIZAMOS TOAST

  useEffect(() => {
    cargarTareas();
  }, []);

  const cargarTareas = async () => {
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const { data, error } = await supabase
        .from('tareas')
        .select('*')
        .eq('club_id', club_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTareas(data || []);
    } catch (error) {
      console.error("Error al cargar tareas:", error.message);
    } finally {
      setCargando(false);
    }
  };

  // --- NUEVA FUNCIÓN: ELIMINAR TAREA ---
  const eliminarTarea = async (id) => {
    const confirmar = window.confirm("⚠️ ¿Estás seguro de que querés eliminar esta tarea definitivamente? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    try {
      const { error } = await supabase.from('tareas').delete().eq('id', id);
      if (error) throw error;
      
      // Actualizamos el estado para que desaparezca de la pantalla sin recargar
      setTareas(tareas.filter(t => t.id !== id));
      setTareaSeleccionada(null); // Cerramos el modal
      showToast("Tarea eliminada con éxito", "success");
    } catch (error) {
      showToast("Error al eliminar la tarea: " + error.message, "error");
    }
  };

  const getColoresCategoria = (categoria) => {
    switch (categoria) {
      case 'Táctico': return { bg: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', border: '#3b82f6', text: '#bfdbfe' };
      case 'Físico': return { bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)', border: '#ef4444', text: '#fecaca' };
      case 'Técnico': return { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '#10b981', text: '#a7f3d0' };
      case 'Cognitivo': return { bg: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 100%)', border: '#8b5cf6', text: '#ddd6fe' };
      case 'ABP': return { bg: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)', border: '#f59e0b', text: '#fde68a' };
      default: return { bg: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', border: '#4b5563', text: '#d1d5db' };
    }
  };

  const tareasFiltradas = tareas.filter(t => {
    const coincideBusqueda = t.titulo.toLowerCase().includes(busqueda.toLowerCase()) || (t.objetivo_principal || '').toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria = filtroCategoria === 'Todas' || t.categoria_ejercicio === filtroCategoria;
    const coincideFase = filtroFase === 'Todas' || t.fase_juego === filtroFase;
    return coincideBusqueda && coincideCategoria && coincideFase;
  });

  const CartaFUT = ({ tarea }) => {
    const colores = getColoresCategoria(tarea.categoria_ejercicio);
    const carga = (tarea.duracion_estimada || 0) * (tarea.intensidad_rpe || 0);

    return (
      <div 
        onClick={() => setTareaSeleccionada(tarea)}
        style={{
          background: colores.bg,
          border: `2px solid ${colores.border}`,
          borderRadius: '16px',
          width: '260px',
          height: '380px',
          padding: '15px',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          position: 'relative',
          boxShadow: `0 8px 25px rgba(0,0,0,0.6), inset 0 0 15px rgba(255,255,255,0.1)`,
          transition: 'transform 0.2s, box-shadow 0.2s',
          animation: 'fadeIn 0.4s ease-out'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 15px 35px rgba(0,0,0,0.8), 0 0 20px ${colores.border}40`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = `0 8px 25px rgba(0,0,0,0.6), inset 0 0 15px rgba(255,255,255,0.1)`; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>{carga}</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: colores.text, textTransform: 'uppercase', letterSpacing: '1px' }}>Carga UC</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '900', color: colores.border, textTransform: 'uppercase', display: 'block' }}>{tarea.categoria_ejercicio}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text }}>{tarea.fase_juego}</span>
          </div>
        </div>

        <div style={{ flex: 1, background: '#000', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${colores.border}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {tarea.url_grafico ? (
            <img src={tarea.url_grafico} alt="Gráfico Tarea" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ color: '#555', fontSize: '2rem' }}>⚽</span>
          )}
          <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${colores.border}`, color: '#fff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px' }}>
            {tarea.jugadores_involucrados || 'Grupal'}
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '12px 0', borderBottom: `1px solid ${colores.border}40`, paddingBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tarea.titulo}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', textAlign: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>{tarea.duracion_estimada}'</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>MINS</span>
          </div>
          <div style={{ borderLeft: `1px solid ${colores.border}40`, borderRight: `1px solid ${colores.border}40` }}>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>{tarea.intensidad_rpe}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>RPE</span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '900', color: '#fff', marginTop: '3px' }}>{tarea.espacio?.replace('_', ' ')}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>ZONA</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '2.5rem' }}>🗃️</div>
            <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.5rem', margin: 0 }}>BANCO DE TAREAS</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Tu biblioteca personal de ejercicios tácticos.</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Buscar tarea o táctica..." 
              value={busqueda} 
              onChange={e => setBusqueda(e.target.value)}
              style={inputFiltro}
            />
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectFiltro}>
              <option value="Todas">Todas las Categorías</option>
              <option value="Táctico">Táctico</option>
              <option value="Técnico">Técnico</option>
              <option value="Físico">Físico</option>
              <option value="ABP">Pelota Parada (ABP)</option>
              <option value="Cognitivo">Cognitivo</option>
            </select>
            <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} style={selectFiltro}>
              <option value="Todas">Todas las Fases</option>
              <option value="Ataque Posicional">Ataque</option>
              <option value="Defensa Posicional">Defensa</option>
              <option value="Transición Ofensiva">Transición Ofensiva</option>
              <option value="Transición Defensiva">Transición Defensiva</option>
            </select>
          </div>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando el playbook... ⚽</div>
      ) : tareasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(255,255,255,0.02)', borderRadius: '15px', border: '1px dashed #333' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
          <h3 style={{ color: '#fff', margin: 0 }}>No hay tareas aún.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Creá tu primer ejercicio en el Creador Táctico para empezar a llenar tu biblioteca.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '25px', justifyContent: 'center' }}>
          {tareasFiltradas.map(tarea => (
            <CartaFUT key={tarea.id} tarea={tarea} />
          ))}
        </div>
      )}

      {/* MODAL DE DETALLE DE LA TAREA */}
      {tareaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '900px', border: `2px solid ${getColoresCategoria(tareaSeleccionada.categoria_ejercicio).border}`, padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: getColoresCategoria(tareaSeleccionada.categoria_ejercicio).bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {tareaSeleccionada.categoria_ejercicio} • {tareaSeleccionada.fase_juego}
                </span>
                <h2 style={{ margin: '10px 0 0 0', color: '#fff', fontSize: '1.8rem', textTransform: 'uppercase', fontWeight: '900' }}>
                  {tareaSeleccionada.titulo}
                </h2>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 'bold' }}>{tareaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setTareaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '20px' }}>
              <div style={{ flex: '1 1 500px', padding: '20px', borderRight: '1px solid #222' }}>
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {tareaSeleccionada.url_grafico ? (
                    <img src={tareaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#444' }}>Sin gráfico</span>
                  )}
                </div>
                {tareaSeleccionada.video_url && (
                  <div style={{ marginTop: '15px' }}>
                    <a href={tareaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#2563eb', color: '#fff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                      ▶️ VER VIDEO DE REFERENCIA
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 300px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>DURACIÓN</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionada.duracion_estimada}'</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: tareaSeleccionada.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionada.intensidad_rpe}/10</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>CARGA (UC)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionada.duracion_estimada || 0) * (tareaSeleccionada.intensidad_rpe || 0)}</span>
                  </div>
                  <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>JUGADORES</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionada.jugadores_involucrados}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.85rem' }}>Reglas y Desarrollo:</h4>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                    {tareaSeleccionada.descripcion || "Sin descripción detallada."}
                  </div>
                </div>

                {/* BOTONERA DE ACCIONES (EDITAR / ELIMINAR) */}
                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => eliminarTarea(tareaSeleccionada.id)}
                    style={{ flex: 1, background: '#ef4444', border: 'none', color: '#fff', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    🗑️ ELIMINAR
                  </button>

                  <button 
                    onClick={() => navigate('/creador-tareas', { state: { editando: tareaSeleccionada } })}
                    style={{ flex: 2, background: 'var(--accent)', border: 'none', color: '#000', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    ✏️ Editar en Pizarra
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const inputFiltro = { padding: '12px 15px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', minWidth: '250px', outline: 'none' };
const selectFiltro = { padding: '12px 15px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' };

export default BancoTareas;