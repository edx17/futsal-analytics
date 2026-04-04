import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

const CreadorFisico = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const tareaAEditar = location.state?.editando;
  const [tareaIdEditando, setTareaIdEditando] = useState(tareaAEditar?.id || null);

  // --- RESPONSIVE STATE ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- ESTADO GENERAL DE LA FICHA ---
  const [fichaTecnica, setFichaTecnica] = useState({
    titulo: '',
    objetivo_principal: '',
    duracion_estimada: 45,
    intensidad_rpe: 8,
    descripcion: '',
    video_url: '',
    espacio: 'Gimnasio'
  });

  // --- MODO DE CONSTRUCCIÓN ---
  // 'gimnasio' = Fuerza, Pesas, Preventivo | 'cancha' = Pasadas, Intermitentes, RSA
  const [modoFisico, setModoFisico] = useState('gimnasio');

  // --- BLOQUES DE GIMNASIO ---
  const [bloquesGimnasio, setBloquesGimnasio] = useState([
    { id: Date.now(), nombre: '', series: '', reps: '', rir: '', pausa: '', notas: '' }
  ]);

  // --- BLOQUES DE CANCHA (METABÓLICO) ---
  const [bloquesCancha, setBloquesCancha] = useState([
    { id: Date.now(), nombreBloque: 'Bloque 1', distancia: '', tiempoTrabajo: '', micropausa: '', macropausa: '', pasadas: '', series: '' }
  ]);

  // Cargar datos si estamos editando
  useEffect(() => {
    if (tareaAEditar) {
      setFichaTecnica({
        titulo: tareaAEditar.titulo || '',
        objetivo_principal: tareaAEditar.objetivo_principal || '',
        duracion_estimada: tareaAEditar.duracion_estimada || 45,
        intensidad_rpe: tareaAEditar.intensidad_rpe || 8,
        descripcion: tareaAEditar.descripcion || '',
        video_url: tareaAEditar.video_url || '',
        espacio: tareaAEditar.espacio || 'Gimnasio'
      });

      const datosFisicos = tareaAEditar.editor_data;
      if (datosFisicos && datosFisicos.tipo === 'rutina_fisica') {
        setModoFisico(datosFisicos.sub_modo || 'gimnasio');
        if (datosFisicos.sub_modo === 'gimnasio' && datosFisicos.bloques) {
          setBloquesGimnasio(datosFisicos.bloques);
        } else if (datosFisicos.sub_modo === 'cancha' && datosFisicos.bloques) {
          setBloquesCancha(datosFisicos.bloques);
        }
      }
    }
  }, [tareaAEditar]);

  // --- FUNCIONES GIMNASIO ---
  const agregarEjercicioGimnasio = () => {
    setBloquesGimnasio([...bloquesGimnasio, { id: Date.now(), nombre: '', series: '', reps: '', rir: '', pausa: '', notas: '' }]);
  };

  const actualizarEjercicio = (id, campo, valor) => {
    setBloquesGimnasio(bloquesGimnasio.map(b => b.id === id ? { ...b, [campo]: valor } : b));
  };

  const eliminarEjercicio = (id) => {
    if (bloquesGimnasio.length > 1) {
      setBloquesGimnasio(bloquesGimnasio.filter(b => b.id !== id));
    } else {
      showToast("La rutina debe tener al menos un ejercicio.", "warning");
    }
  };

  // --- FUNCIONES CANCHA ---
  const agregarBloqueCancha = () => {
    setBloquesCancha([...bloquesCancha, { id: Date.now(), nombreBloque: `Bloque ${bloquesCancha.length + 1}`, distancia: '', tiempoTrabajo: '', micropausa: '', macropausa: '', pasadas: '', series: '' }]);
  };

  const actualizarBloqueCancha = (id, campo, valor) => {
    setBloquesCancha(bloquesCancha.map(b => b.id === id ? { ...b, [campo]: valor } : b));
  };

  const eliminarBloqueCancha = (id) => {
    if (bloquesCancha.length > 1) {
      setBloquesCancha(bloquesCancha.filter(b => b.id !== id));
    } else {
      showToast("Debe haber al menos un bloque de trabajo.", "warning");
    }
  };

  // --- GUARDAR EN SUPABASE ---
  const confirmarGuardado = async () => {
    if (!fichaTecnica.titulo.trim()) {
      return showToast("Por favor, ingresá un nombre para la rutina.", "warning");
    }

    // Armamos el JSON que va a la columna editor_data
    const dataFisica = {
      tipo: 'rutina_fisica',
      sub_modo: modoFisico,
      bloques: modoFisico === 'gimnasio' ? bloquesGimnasio : bloquesCancha
    };

    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';

      const payload = {
        club_id: club_id,
        titulo: fichaTecnica.titulo,
        espacio: fichaTecnica.espacio,
        url_grafico: null, // No hay canvas
        editor_data: dataFisica, // Acá viaja la magia del profe
        categoria_ejercicio: 'Físico', // Fijo para el filtro del Banco
        fase_juego: modoFisico === 'gimnasio' ? 'Fuerza / Prevención' : 'Acondicionamiento Metabólico',
        duracion_estimada: parseInt(fichaTecnica.duracion_estimada) || 0,
        intensidad_rpe: parseInt(fichaTecnica.intensidad_rpe) || 0,
        jugadores_involucrados: 'Individual/Grupal',
        objetivo_principal: fichaTecnica.objetivo_principal,
        descripcion: fichaTecnica.descripcion,
        video_url: fichaTecnica.video_url,
      };

      if (tareaIdEditando) {
        const { error } = await supabase.from('tareas').update(payload).eq('id', tareaIdEditando);
        if (error) throw error;
        showToast("¡Rutina FÍSICA actualizada con éxito!", "success");
      } else {
        const { error } = await supabase.from('tareas').insert([payload]);
        if (error) throw error;
        showToast("¡Nueva Rutina FÍSICA guardada en el Banco!", "success");
      }
      
      navigate('/banco-tareas');

    } catch (err) {
      showToast("Error al guardar: " + err.message, "error");
    }
  };

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      {/* HEADER DE LA PANTALLA */}
      <div className="bento-card" style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'center', gap: '15px', marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)', padding: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '2rem' }}>🏋️‍♂️</span>
            <div>
              <h1 className="stat-label" style={{ color: '#f59e0b', fontSize: '1.5rem', margin: 0, textTransform: 'uppercase' }}>CREADOR FÍSICO</h1>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Planificador de Cargas y Rutinas</p>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', width: esMovil ? '100%' : 'auto' }}>
          <button onClick={() => navigate(-1)} style={{ ...btnSecundario, flex: esMovil ? 1 : 'none', textAlign: 'center' }}>⬅ Volver</button>
          <button onClick={confirmarGuardado} className="btn-action" style={{ background: '#f59e0b', color: '#000', flex: esMovil ? 1 : 'none', padding: '10px 20px', fontWeight: '900' }}>
            {tareaIdEditando ? '💾 ACTUALIZAR' : '💾 GUARDAR RUTINA'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: '20px' }}>
        
        {/* COLUMNA IZQUIERDA: DATOS GENERALES */}
        <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div className="bento-card" style={{ background: '#111', border: '1px solid #333', padding: '20px' }}>
            <h3 style={{ color: '#f59e0b', margin: '0 0 15px 0', textTransform: 'uppercase', fontSize: '1.1rem', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Ficha de la Rutina</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Nombre de la Sesión/Rutina *</label>
              <input type="text" placeholder="Ej: Fuerza Máxima - Tren Inferior" style={{ ...inputStyle, border: '1px solid #f59e0b' }} value={fichaTecnica.titulo} onChange={e => setFichaTecnica({ ...fichaTecnica, titulo: e.target.value })} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Objetivo Principal</label>
              <input type="text" placeholder="Ej: Mejorar curva Fuerza-Velocidad" style={inputStyle} value={fichaTecnica.objetivo_principal} onChange={e => setFichaTecnica({ ...fichaTecnica, objetivo_principal: e.target.value })} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={labelStyle}>Duración Total (min)</label>
                <input type="number" style={inputStyle} value={fichaTecnica.duracion_estimada} onChange={e => setFichaTecnica({ ...fichaTecnica, duracion_estimada: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>RPE Global (1-10)</label>
                <input type="number" min="1" max="10" style={inputStyle} value={fichaTecnica.intensidad_rpe} onChange={e => setFichaTecnica({ ...fichaTecnica, intensidad_rpe: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Espacio de Trabajo</label>
              <select style={inputStyle} value={fichaTecnica.espacio} onChange={e => setFichaTecnica({ ...fichaTecnica, espacio: e.target.value })}>
                <option value="Gimnasio">Gimnasio</option>
                <option value="Cancha Principal">Cancha Principal</option>
                <option value="Pista/Arena">Otro</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={labelStyle}>Descripción / Notas del Profe</label>
              <textarea rows="4" style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} placeholder="Detalles extra, calentamiento sugerido, etc..." value={fichaTecnica.descripcion} onChange={e => setFichaTecnica({ ...fichaTecnica, descripcion: e.target.value })}></textarea>
            </div>

            <div>
              <label style={labelStyle}>Link Video Demostrativo</label>
              <input type="text" placeholder="https://youtube.com/..." style={inputStyle} value={fichaTecnica.video_url} onChange={e => setFichaTecnica({ ...fichaTecnica, video_url: e.target.value })} />
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: CONSTRUCTOR DINÁMICO */}
        <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          {/* TOGGLE MODO */}
          <div className="bento-card" style={{ background: '#111', border: '1px solid #333', padding: '10px', display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setModoFisico('gimnasio')} 
              style={{ ...toggleBtnMode, background: modoFisico === 'gimnasio' ? '#f59e0b' : '#222', color: modoFisico === 'gimnasio' ? '#000' : '#888' }}
            >
              🏋️‍♂️ GIMNASIO / FUERZA
            </button>
            <button 
              onClick={() => setModoFisico('cancha')} 
              style={{ ...toggleBtnMode, background: modoFisico === 'cancha' ? '#f59e0b' : '#222', color: modoFisico === 'cancha' ? '#000' : '#888' }}
            >
              🏃‍♂️ CANCHA / METABÓLICO
            </button>
          </div>

          {/* ÁREA DE CONSTRUCCIÓN */}
          <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #222', padding: esMovil ? '15px' : '25px', minHeight: '400px' }}>
            
            {/* ==================================================== */}
            {/* MODO GIMNASIO */}
            {/* ==================================================== */}
            {modoFisico === 'gimnasio' && (
              <div style={{ animation: 'fadeIn 0.3s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Lista de Ejercicios</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Volumen total: {bloquesGimnasio.length} ej.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {bloquesGimnasio.map((ej, index) => (
                    <div key={ej.id} style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '15px', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '-10px', left: '-10px', background: '#f59e0b', color: '#000', width: '25px', height: '25px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.8rem' }}>{index + 1}</div>
                      <button onClick={() => eliminarEjercicio(ej.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '2fr 1fr 1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
                        <div>
                          <label style={miniLabel}>Ejercicio</label>
                          <input type="text" placeholder="Ej: Sentadilla Búlgara" style={miniInput} value={ej.nombre} onChange={e => actualizarEjercicio(ej.id, 'nombre', e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <div style={{flex: 1}}>
                            <label style={miniLabel}>Series</label>
                            <input type="number" placeholder="Ej: 4" style={miniInput} value={ej.series} onChange={e => actualizarEjercicio(ej.id, 'series', e.target.value)} />
                          </div>
                          <div style={{flex: 1}}>
                            <label style={miniLabel}>Reps</label>
                            <input type="text" placeholder="Ej: 8-10" style={miniInput} value={ej.reps} onChange={e => actualizarEjercicio(ej.id, 'reps', e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label style={miniLabel}>Int. (RIR / %RM)</label>
                          <input type="text" placeholder="Ej: RIR 2" style={miniInput} value={ej.rir} onChange={e => actualizarEjercicio(ej.id, 'rir', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Pausa</label>
                          <input type="text" placeholder="Ej: 90s" style={miniInput} value={ej.pausa} onChange={e => actualizarEjercicio(ej.id, 'pausa', e.target.value)} />
                        </div>
                      </div>
                      
                      <div style={{ marginTop: '10px' }}>
                        <input type="text" placeholder="Notas (Ej: Carga excéntrica lenta...)" style={{ ...miniInput, width: '100%', background: '#0a0a0a' }} value={ej.notas} onChange={e => actualizarEjercicio(ej.id, 'notas', e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={agregarEjercicioGimnasio} style={{ marginTop: '20px', width: '100%', background: 'rgba(245, 158, 11, 0.1)', border: '1px dashed #f59e0b', color: '#f59e0b', padding: '15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>
                  + AGREGAR EJERCICIO
                </button>
              </div>
            )}

            {/* ==================================================== */}
            {/* MODO CANCHA / METABÓLICO */}
            {/* ==================================================== */}
            {modoFisico === 'cancha' && (
              <div style={{ animation: 'fadeIn 0.3s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ color: '#fff', margin: 0 }}>Bloques de Acondicionamiento</h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {bloquesCancha.map((bloque, index) => (
                    <div key={bloque.id} style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '20px', position: 'relative' }}>
                      <button onClick={() => eliminarBloqueCancha(bloque.id)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
                      
                      <input 
                        type="text" 
                        value={bloque.nombreBloque} 
                        onChange={e => actualizarBloqueCancha(bloque.id, 'nombreBloque', e.target.value)}
                        style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed #555', color: '#f59e0b', fontSize: '1.2rem', fontWeight: '900', marginBottom: '15px', outline: 'none', width: '80%' }}
                      />

                      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : 'repeat(6, 1fr)', gap: '12px' }}>
                        <div>
                          <label style={miniLabel}>Distancia (m)</label>
                          <input type="number" placeholder="Ej: 100" style={miniInput} value={bloque.distancia} onChange={e => actualizarBloqueCancha(bloque.id, 'distancia', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>T. Trabajo (s)</label>
                          <input type="number" placeholder="Ej: 15" style={miniInput} value={bloque.tiempoTrabajo} onChange={e => actualizarBloqueCancha(bloque.id, 'tiempoTrabajo', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Micropausa (s)</label>
                          <input type="number" placeholder="Ej: 15" style={miniInput} value={bloque.micropausa} onChange={e => actualizarBloqueCancha(bloque.id, 'micropausa', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Pasadas</label>
                          <input type="number" placeholder="Ej: 10" style={miniInput} value={bloque.pasadas} onChange={e => actualizarBloqueCancha(bloque.id, 'pasadas', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Series</label>
                          <input type="number" placeholder="Ej: 3" style={miniInput} value={bloque.series} onChange={e => actualizarBloqueCancha(bloque.id, 'series', e.target.value)} />
                        </div>
                        <div>
                          <label style={miniLabel}>Macropausa (m)</label>
                          <input type="number" placeholder="Ej: 3" style={miniInput} value={bloque.macropausa} onChange={e => actualizarBloqueCancha(bloque.id, 'macropausa', e.target.value)} />
                        </div>
                      </div>

                      {/* Info calculada en vivo */}
                      <div style={{ marginTop: '15px', padding: '10px', background: '#000', borderRadius: '6px', border: '1px solid #222', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>
                          Volumen Bloque: <strong style={{color: '#fff'}}>{(Number(bloque.distancia) * Number(bloque.pasadas) * Number(bloque.series)) || 0} mts</strong>
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>
                          Pasadas Totales: <strong style={{color: '#fff'}}>{(Number(bloque.pasadas) * Number(bloque.series)) || 0}</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={agregarBloqueCancha} style={{ marginTop: '20px', width: '100%', background: 'rgba(245, 158, 11, 0.1)', border: '1px dashed #f59e0b', color: '#f59e0b', padding: '15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.2s' }}>
                  + AGREGAR BLOQUE METABÓLICO
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- ESTILOS ---
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '5px' };
const inputStyle = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

const miniLabel = { display: 'block', fontSize: '0.65rem', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' };
const miniInput = { width: '100%', padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };

const btnSecundario = { background: '#222', border: '1px solid #444', color: '#fff', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const toggleBtnMode = { flex: 1, padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '900', fontSize: '0.85rem', transition: '0.2s' };

export default CreadorFisico;