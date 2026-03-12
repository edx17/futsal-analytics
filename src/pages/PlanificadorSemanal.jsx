import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

const PlanificadorSemanal = () => {
  const [fechaReferencia, setFechaReferencia] = useState(new Date());
  const [modoVista, setModoVista] = useState('semanal'); // 'semanal' o 'mensual'
  const [diasCalendario, setDiasCalendario] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [tareasBanco, setTareasBanco] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [filtroCategoria, setFiltroCategoria] = useState('Primera'); 
  const [categoriasGuardadas, setCategoriasGuardadas] = useState(['Primera', 'Reserva', 'Tercera', 'Cuarta']);

  // Modal State
  const [mostrarModal, setMostrarModal] = useState(false);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [busquedaTarea, setBusquedaTarea] = useState('');
  
  const { showToast } = useToast(); // INICIALIZAMOS TOAST

  const [nuevaSesion, setNuevaSesion] = useState({
    tipo_sesion: 'Entrenamiento',
    objetivo: '',
    nivel_carga: 'Media', 
    categoria_equipo: filtroCategoria,
    tareas_ids: [],
    comentarios: ''
  });

  const nivelesCarga = {
    'Baja': { color: '#10b981', label: 'Baja' },
    'Media-Baja': { color: '#84cc16', label: 'Med-Baja' },
    'Media': { color: '#eab308', label: 'Media' },
    'Media-Alta': { color: '#f97316', label: 'Med-Alta' },
    'Alta': { color: '#ef4444', label: 'Alta' }
  };

  const mesesNombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const diasNombres = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

  // 1. Motor del Calendario (Semanal o Mensual)
  useEffect(() => {
    const calcularCalendario = () => {
      const year = fechaReferencia.getFullYear();
      const month = fechaReferencia.getMonth();
      const date = fechaReferencia.getDate();
      
      let grid = [];

      if (modoVista === 'semanal') {
        const day = fechaReferencia.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const lunes = new Date(year, month, date + diffToMonday);
        
        for (let i = 0; i < 7; i++) {
          const dia = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
          grid.push({
            fechaStr: `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`,
            diaNombre: diasNombres[dia.getDay()],
            numero: dia.getDate(),
            isHoy: dia.toDateString() === new Date().toDateString(),
            isMesActual: true
          });
        }
      } else {
        // Vista Mensual (42 días para cubrir el mes completo y huecos)
        const primerDiaDelMes = new Date(year, month, 1);
        const day = primerDiaDelMes.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const startGridDate = new Date(year, month, 1 + diffToMonday);

        for (let i = 0; i < 42; i++) {
          const dia = new Date(startGridDate.getFullYear(), startGridDate.getMonth(), startGridDate.getDate() + i);
          grid.push({
            fechaStr: `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`,
            diaNombre: diasNombres[dia.getDay()],
            numero: dia.getDate(),
            isHoy: dia.toDateString() === new Date().toDateString(),
            isMesActual: dia.getMonth() === month
          });
        }
      }
      setDiasCalendario(grid);
    };
    
    calcularCalendario();
  }, [fechaReferencia, modoVista]);

  // 2. Traer Datos
  useEffect(() => {
    if (diasCalendario.length > 0) {
      cargarDatos();
    }
  }, [diasCalendario, filtroCategoria]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const inicio = diasCalendario[0].fechaStr;
      const fin = diasCalendario[diasCalendario.length - 1].fechaStr;

      let querySesiones = supabase.from('sesiones').select('*').eq('club_id', club_id).gte('fecha', inicio).lte('fecha', fin);
      if (filtroCategoria !== 'Todas') querySesiones = querySesiones.eq('categoria_equipo', filtroCategoria);
      const { data: dataSesiones, error: errSesiones } = await querySesiones;
      if (errSesiones) throw errSesiones;
      
      const { data: dataTareas, error: errTareas } = await supabase
        .from('tareas')
        .select('id, titulo, categoria_ejercicio, duracion_estimada, intensidad_rpe, espacio, jugadores_involucrados, url_grafico')
        .eq('club_id', club_id)
        .order('created_at', { ascending: false });
        
      if (errTareas) throw errTareas;

      setSesiones(dataSesiones || []);
      setTareasBanco(dataTareas || []);

      const categoriasUnicas = [...new Set((dataSesiones || []).map(s => s.categoria_equipo).filter(Boolean))];
      if (categoriasUnicas.length > 0) {
        setCategoriasGuardadas(prev => [...new Set([...prev, ...categoriasUnicas])]);
      }

    } catch (error) {
      console.error("Error cargando datos:", error.message);
    } finally {
      setCargando(false);
    }
  };

  const navegarTiempo = (direccion) => {
    const nuevaFecha = new Date(fechaReferencia);
    if (modoVista === 'semanal') {
      nuevaFecha.setDate(nuevaFecha.getDate() + (direccion * 7));
    } else {
      nuevaFecha.setMonth(nuevaFecha.getMonth() + direccion);
    }
    setFechaReferencia(nuevaFecha);
  };

  const abrirModal = (dia) => {
    setDiaSeleccionado(dia);
    setBusquedaTarea(''); 
    setNuevaSesion({ 
      tipo_sesion: 'Entrenamiento', 
      objetivo: '', 
      nivel_carga: 'Media',
      categoria_equipo: filtroCategoria === 'Todas' ? 'Primera' : filtroCategoria,
      tareas_ids: [],
      comentarios: ''
    });
    setMostrarModal(true);
  };

  const toggleTarea = (tareaId) => {
    setNuevaSesion(prev => {
      const ids = prev.tareas_ids || [];
      const nuevasTareas = ids.includes(tareaId) ? ids.filter(id => id !== tareaId) : [...ids, tareaId];
      return { ...prev, tareas_ids: nuevasTareas };
    });
  };

  const guardarSesion = async () => {
    if (!nuevaSesion.categoria_equipo) {
        showToast("Por favor, ingresá una categoría.", "warning");
        return;
    }

    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      const payload = {
        club_id,
        fecha: diaSeleccionado.fechaStr,
        tipo_sesion: nuevaSesion.tipo_sesion,
        objetivo: nuevaSesion.objetivo,
        categoria_equipo: nuevaSesion.categoria_equipo,
        nivel_carga: nuevaSesion.nivel_carga,
        tareas_ids: nuevaSesion.tareas_ids,
        comentarios: nuevaSesion.comentarios
      };

      const { error } = await supabase.from('sesiones').insert([payload]);
      if (error) throw error;

      showToast('¡Sesión planificada con éxito!', 'success');
      setMostrarModal(false);
      cargarDatos();
    } catch (error) {
      showToast("Error al guardar la sesión: " + error.message, "error");
    }
  };

  const eliminarSesion = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta sesión del calendario?")) return;
    try {
      const { error } = await supabase.from('sesiones').delete().eq('id', id);
      if (error) throw error;
      setSesiones(sesiones.filter(s => s.id !== id));
      showToast("Sesión eliminada", "info");
    } catch (error) {
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const tareasFiltradas = tareasBanco.filter(t => {
    const termino = busquedaTarea.toLowerCase();
    return t.titulo.toLowerCase().includes(termino) || t.categoria_ejercicio.toLowerCase().includes(termino);
  });

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      {/* HEADER CONTROLES */}
      <div className="bento-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.5rem', margin: 0 }}>🗓️ CALENDARIO DE PLANIFICACIÓN</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Control de microciclos y cargas mensuales.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* TOGGLE VISTA SEMANA/MES */}
          <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
            <button 
              onClick={() => setModoVista('semanal')} 
              style={{ ...toggleBtn, background: modoVista === 'semanal' ? 'var(--accent)' : 'transparent', color: modoVista === 'semanal' ? '#000' : 'var(--text-dim)' }}
            >
              Semana
            </button>
            <button 
              onClick={() => setModoVista('mensual')} 
              style={{ ...toggleBtn, background: modoVista === 'mensual' ? 'var(--accent)' : 'transparent', color: modoVista === 'mensual' ? '#000' : 'var(--text-dim)' }}
            >
              Mes
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase' }}>Categoría:</span>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ padding: '8px', background: '#111', color: '#fff', border: '1px solid var(--accent)', borderRadius: '6px', outline: 'none', fontWeight: 'bold' }}>
              <option value="Todas">TODAS</option>
              {categoriasGuardadas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#000', padding: '5px', borderRadius: '8px', border: '1px solid #333' }}>
            <button onClick={() => navegarTiempo(-1)} style={navBtn}>⬅</button>
            <span style={{ fontWeight: '900', color: '#fff', fontSize: '0.9rem', minWidth: modoVista === 'semanal' ? '180px' : '150px', textAlign: 'center', textTransform: 'uppercase' }}>
              {diasCalendario.length > 0 && modoVista === 'semanal' && `Semana ${diasCalendario[0].numero}/${String(diasCalendario[0].fechaStr).split('-')[1]} al ${diasCalendario[6].numero}/${String(diasCalendario[6].fechaStr).split('-')[1]}`}
              {diasCalendario.length > 0 && modoVista === 'mensual' && `${mesesNombres[fechaReferencia.getMonth()]} ${fechaReferencia.getFullYear()}`}
            </span>
            <button onClick={() => navegarTiempo(1)} style={navBtn}>➡</button>
            <button onClick={() => setFechaReferencia(new Date())} style={{...navBtn, fontSize: '0.7rem', width: 'auto', padding: '0 10px', background: '#333'}}>HOY</button>
          </div>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando agenda... ⏳</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* NOMBRES DE LOS DÍAS (Solo se ven fijos arriba en vista mensual, en la semanal van adentro de la tarjeta) */}
          {modoVista === 'mensual' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', textAlign: 'center' }}>
              {diasNombres.map((d, i) => (
                <div key={i} style={{ fontSize: '0.8rem', fontWeight: '900', color: 'var(--text-dim)' }}>{d}</div>
              ))}
            </div>
          )}

          {/* GRILLA DEL CALENDARIO */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: modoVista === 'semanal' ? '10px' : '5px', 
            alignItems: 'stretch' 
          }}>
            {diasCalendario.map((dia, idx) => {
              const sesionesDia = sesiones.filter(s => s.fecha === dia.fechaStr);
              const opacidadMes = dia.isMesActual ? 1 : 0.4; // Apaga los días que no son del mes actual

              if (modoVista === 'semanal') {
                // VISTA SEMANAL DETALLADA
                return (
                  <div key={idx} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '2px solid var(--accent)' : '1px solid #222', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '400px' }}>
                    <div style={{ background: dia.isHoy ? 'var(--accent)' : '#111', padding: '10px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '900', color: dia.isHoy ? '#000' : 'var(--text-dim)' }}>{dia.diaNombre}</span>
                      <span style={{ fontSize: '1.8rem', fontWeight: '900', color: dia.isHoy ? '#000' : '#fff' }}>{dia.numero}</span>
                    </div>

                    <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        const tareasIds = sesion.tareas_ids || [];
                        
                        return (
                          <div key={sesion.id} style={{ background: '#000', borderLeft: `4px solid ${colorNivel}`, padding: '10px', borderRadius: '6px', position: 'relative' }}>
                            <button onClick={(e) => eliminarSesion(sesion.id, e)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}>✖</button>
                            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#fff', marginBottom: '2px', paddingRight: '15px' }}>{sesion.tipo_sesion.toUpperCase()}</div>
                            <div style={{ fontSize: '0.65rem', color: colorNivel, fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>CARGA: {sesion.nivel_carga || 'MEDIA'}</div>
                            
                            {sesion.objetivo && <div style={{ fontSize: '0.75rem', color: '#aaa', fontStyle: 'italic', marginBottom: '8px', lineHeight: '1.2' }}>"{sesion.objetivo}"</div>}

                            {tareasIds.length > 0 && (
                              <div style={{ borderTop: '1px solid #222', paddingTop: '8px', marginTop: '8px' }}>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>TAREAS:</span>
                                <ul style={{ margin: 0, paddingLeft: '15px', color: '#fff', fontSize: '0.7rem', lineHeight: '1.4' }}>
                                  {tareasIds.map(id => {
                                    const t = tareasBanco.find(tb => tb.id === id);
                                    return t ? <li key={id}>{t.titulo}</li> : null;
                                  })}
                                </ul>
                              </div>
                            )}
                            
                            {sesion.comentarios && (
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px', marginTop: '8px', fontSize: '0.65rem', color: 'var(--accent)', border: '1px solid #333' }}>
                                <strong>💬 NOTA:</strong> {sesion.comentarios}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button onClick={() => abrirModal(dia)} style={{ marginTop: 'auto', background: 'transparent', border: '1px dashed #444', color: 'var(--text-dim)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s', width: '100%' }}>
                        + AGREGAR
                      </button>
                    </div>
                  </div>
                );
              } else {
                // VISTA MENSUAL COMPACTA
                return (
                  <div key={idx} onClick={() => abrirModal(dia)} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '1px solid var(--accent)' : '1px solid #222', borderRadius: '8px', display: 'flex', flexDirection: 'column', minHeight: '100px', padding: '5px', opacity: opacidadMes, cursor: 'pointer', transition: '0.2s', overflow: 'hidden' }} className="mes-card">
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: '900', color: dia.isHoy ? 'var(--accent)' : (dia.isMesActual ? '#fff' : '#666'), marginBottom: '5px' }}>
                      {dia.numero}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        return (
                          <div key={sesion.id} style={{ background: `${colorNivel}20`, borderLeft: `2px solid ${colorNivel}`, padding: '4px', borderRadius: '3px', fontSize: '0.6rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold' }}>{sesion.tipo_sesion.substring(0,3).toUpperCase()}</span>
                            {sesion.tareas_ids?.length > 0 && <span style={{ color: colorNivel }}>{sesion.tareas_ids.length}T</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            })}
          </div>
          <style>{`.mes-card:hover { border-color: #555 !important; background: #111 !important; }`}</style>
        </div>
      )}

      {/* MODAL PARA CREAR SESIÓN (Mismo que ya pulimos) */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '900px', border: '2px solid var(--accent)', maxHeight: '95vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>Planificar: {diaSeleccionado?.diaNombre} {diaSeleccionado?.numero}</h3>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Categoría</label>
                    <input type="text" value={nuevaSesion.categoria_equipo} onChange={e => setNuevaSesion({...nuevaSesion, categoria_equipo: e.target.value})} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Tipo de Sesión</label>
                    <select value={nuevaSesion.tipo_sesion} onChange={e => setNuevaSesion({...nuevaSesion, tipo_sesion: e.target.value})} style={inputStyle}>
                      <option value="Entrenamiento">Entrenamiento</option>
                      <option value="Gimnasio">Gimnasio / Fuerza</option>
                      <option value="Partido">Partido</option>
                      <option value="Descanso">Descanso Activo</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Objetivo Principal</label>
                  <input type="text" value={nuevaSesion.objetivo} onChange={e => setNuevaSesion({...nuevaSesion, objetivo: e.target.value})} style={inputStyle} placeholder="Ej: Transiciones Ofensivas" />
                </div>

                <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                  <label style={labelStyle}>Nivel de Carga General (UC)</label>
                  <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                    {Object.entries(nivelesCarga).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => setNuevaSesion({...nuevaSesion, nivel_carga: key})}
                        style={{
                          flex: 1, padding: '10px 5px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase',
                          background: nuevaSesion.nivel_carga === key ? val.color : '#222',
                          color: nuevaSesion.nivel_carga === key ? '#000' : '#888',
                          boxShadow: nuevaSesion.nivel_carga === key ? `0 0 10px ${val.color}60` : 'none',
                          transition: '0.2s'
                        }}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Comentarios / Novedades</label>
                  <textarea 
                    value={nuevaSesion.comentarios} 
                    onChange={e => setNuevaSesion({...nuevaSesion, comentarios: e.target.value})} 
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
                    placeholder="Ej: Faltó Martínez por fiebre. Rodríguez entrenó diferenciado."
                  />
                </div>
              </div>

              <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{...labelStyle, margin: 0}}>Asignar Tareas del Banco</label>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>
                    Seleccionadas: <span style={{ color: 'var(--accent)' }}>{nuevaSesion.tareas_ids?.length || 0}</span>
                  </span>
                </div>
                
                <input type="text" placeholder="🔍 Buscar por nombre o tipo..." value={busquedaTarea} onChange={(e) => setBusquedaTarea(e.target.value)} style={{...inputStyle, padding: '8px 12px', background: '#222'}} />

                <div style={{ background: '#000', border: '1px solid #333', borderRadius: '8px', flex: 1, minHeight: '300px', maxHeight: '400px', overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tareasFiltradas.length === 0 && <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>No se encontraron tareas.</span>}
                  
                  {tareasFiltradas.map(t => {
                    const isSelected = nuevaSesion.tareas_ids?.includes(t.id);
                    return (
                      <div key={t.id} onClick={() => toggleTarea(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', background: isSelected ? 'rgba(0, 255, 136, 0.1)' : '#111', border: isSelected ? '1px solid var(--accent)' : '1px solid #222' }}>
                        <div style={{ width: '60px', height: '45px', borderRadius: '4px', background: '#000', border: '1px solid #333', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {t.url_grafico ? <img src={t.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem', color: '#444' }}>⚽</span>}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <span style={{ display: 'block', fontSize: '0.85rem', color: isSelected ? '#fff' : '#ccc', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase' }}>{t.categoria_ejercicio}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            <span style={pillStyle}>⏱️ {t.duracion_estimada}'</span>
                            <span style={pillStyle}>⚡ RPE {t.intensidad_rpe}</span>
                            <span style={pillStyle}>👥 {t.jugadores_involucrados || 'Grupal'}</span>
                            <span style={pillStyle}>📍 {t.espacio?.replace('_', ' ') || 'Cancha'}</span>
                          </div>
                        </div>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid', borderColor: isSelected ? 'var(--accent)' : '#555', background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSelected && <span style={{ color: '#000', fontSize: '0.9rem', fontWeight: '900' }}>✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '20px' }}>
              <button onClick={guardarSesion} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>
                💾 GUARDAR SESIÓN
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

const toggleBtn = { padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', transition: '0.2s', flex: 1 };
const navBtn = { background: '#222', border: 'none', color: '#fff', width: '35px', height: '35px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' };
const labelStyle = { display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', outline: 'none' };
const pillStyle = { fontSize: '0.6rem', background: '#222', color: '#aaa', padding: '2px 6px', borderRadius: '4px', border: '1px solid #333' };

export default PlanificadorSemanal;