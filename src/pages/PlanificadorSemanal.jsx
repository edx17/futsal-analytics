import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { Stage, Layer, Circle, Rect, Text, Group, Line, Path } from 'react-konva';

// =======================================================
// COMPONENTE INTERNO: Reproductor Automático ("Modo GIF")
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const containerRef = useRef(null);
  const [stageSize, setStageSize] = useState({ w: 500, h: 281, scale: 1 });
  
  const frames = editorData?.frames || [];
  const cancha = editorData?.cancha || { tamaño: '40x20', color: '#064e3b' };
  
  const [animElements, setAnimElements] = useState(frames[0]?.elementos || []);
  const [currentLineas, setCurrentLineas] = useState(frames[0]?.lineas || []);

  const getDimensionesLógicas = () => {
    switch (cancha.tamaño) {
      case '20x20_mitad': case '20x20_central': return { w: 500, h: 500 };
      case '28x20': return { w: 700, h: 500 };
      default: return { w: 900, h: 500 }; 
    }
  };
  const logicalSize = getDimensionesLógicas();

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const scale = Math.min(cw / logicalSize.w, ch / logicalSize.h) * 0.95;
        setStageSize({ w: cw, h: ch, scale });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cancha.tamaño, logicalSize.w, logicalSize.h]);

  useEffect(() => {
    let isMounted = true;
    if (frames.length < 2) return;

    const DURATION = 800;
    const PAUSE = 500;

    const playLoop = async () => {
      while (isMounted) {
        for (let i = 0; i < frames.length - 1; i++) {
          if (!isMounted) break;
          const frameA = frames[i];
          const frameB = frames[i + 1];
          setCurrentLineas(frameA.lineas || []);

          await new Promise(resolve => {
            let startTime = null;
            const animate = (timestamp) => {
              if (!isMounted) return resolve();
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / DURATION, 1);
              const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              const interpolated = (frameA.elementos || []).map(elA => {
                const elB = (frameB.elementos || []).find(b => b.id === elA.id);
                if (!elB) return elA;
                return {
                  ...elA,
                  x: elA.x + (elB.x - elA.x) * ease,
                  y: elA.y + (elB.y - elA.y) * ease,
                  rotation: elA.rotation + (elB.rotation - elA.rotation) * ease,
                };
              });

              setAnimElements(interpolated);
              if (progress < 1) requestAnimationFrame(animate);
              else resolve();
            };
            requestAnimationFrame(animate);
          });

          if (!isMounted) break;
          setCurrentLineas(frameB.lineas || []);
          setAnimElements(frameB.elementos || []);
          await new Promise(res => setTimeout(res, PAUSE));
        }
        // Pausa al final de la jugada antes de reiniciar el bucle
        await new Promise(res => setTimeout(res, 1000));
        if (isMounted) {
          setAnimElements(frames[0].elementos || []);
          setCurrentLineas(frames[0].lineas || []);
        }
      }
    };

    playLoop();
    return () => { isMounted = false; };
  }, [frames]);

  const RenderElemento = ({ el }) => {
    const scaleFactor = el.radio / 35; 
    switch(el.tipo) {
      case 'jugador': case 'arquero': case 'staff':
        return (
          <Group scaleX={scaleFactor} scaleY={scaleFactor}>
            <Group x={-67} y={-40}>
                <Path data="M 80 10 A 40 40 0 0 0 80 70 L 65 65 A 25 25 0 0 1 65 15 Z M 84 40 A 10 10 0 1 1 50 40 A 10 10 0 1 1 84 40" fill={el.color} stroke="black" strokeWidth={2} />
            </Group>
            <Text text={el.texto} fontSize={22} fontStyle="bold" fill={el.color === '#fff' || el.color === '#eab308' ? '#000' : '#fff'} x={-15} y={-11} width={30} align="center" />
          </Group>
        );
      case 'pelota': return (<Group><Circle radius={el.radio} fill="#fff" stroke="#000" strokeWidth={1.5} /><Circle radius={el.radio * 0.4} fill="#000" /></Group>);
      case 'cono_alto': return (<Group><Circle radius={el.radio} fill={el.color} stroke="#c2410c" strokeWidth={1} /><Circle radius={el.radio * 0.4} fill="#fff" opacity={0.8} /></Group>);
      case 'cono_plato': return (<Group><Circle radius={el.radio} fill={el.color} stroke="#ca8a04" strokeWidth={1} /><Circle radius={el.radio * 0.3} fill={cancha.color} stroke="rgba(0,0,0,0.2)" strokeWidth={1} /></Group>);
      case 'valla': return (<Group x={-el.w/2} y={-el.h/2}><Rect x={0} y={el.h/2 - 2} width={el.w} height={4} fill={el.color} stroke="#000" strokeWidth={0.5} /></Group>);
      case 'escalera': return (<Group x={-el.w/2} y={-el.h/2}><Rect x={0} y={0} width={el.w} height={el.h} fill="rgba(250, 204, 21, 0.3)" stroke="#facc15" strokeWidth={1} /></Group>);
      case 'arco': case 'mini_arco': return (<Group x={-el.w/2} y={-el.h/2}><Rect x={0} y={0} width={el.w} height={el.h} fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth={1.5} /></Group>);
      default: return <Rect width={el.w} height={el.h} fill={el.color} stroke="#000" strokeWidth={1} x={-el.w/2} y={-el.h/2} />;
    }
  };

  const DibujoCancha = () => {
    const stroke = "rgba(255,255,255,0.7)"; const sw = 3; const midX = logicalSize.w / 2; const midY = logicalSize.h / 2; const padding = 20; const t = cancha.tamaño;
    return (<Group><Rect width={logicalSize.w} height={logicalSize.h} fill={cancha.color} /><Rect x={padding} y={padding} width={logicalSize.w - padding * 2} height={logicalSize.h - padding * 2} stroke={stroke} strokeWidth={sw} cornerRadius={5} />{(t === '40x20' || t === '28x20' || t === '20x20_central') && (<Group><Line points={[midX, padding, midX, logicalSize.h - padding]} stroke={stroke} strokeWidth={sw} /><Circle x={midX} y={midY} radius={70} stroke={stroke} strokeWidth={sw} /><Circle x={midX} y={midY} radius={4} fill={stroke} /></Group>)}{t !== '20x20_central' && (<Group><Rect x={padding} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[0, 70, 70, 0]} />{(t === '40x20' || t === '28x20') && (<Rect x={logicalSize.w - padding - 100} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[70, 0, 0, 70]} />)}</Group>)}</Group>);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Stage width={stageSize.w} height={stageSize.h} scaleX={stageSize.scale} scaleY={stageSize.scale} x={(stageSize.w - logicalSize.w * stageSize.scale) / 2 || 0} y={(stageSize.h - logicalSize.h * stageSize.scale) / 2 || 0}>
        <Layer>
          <DibujoCancha />
          {currentLineas.map(li => {
            const isRecta = li.tipoTool === 'dibujar_pase';
            const dashPattern = li.tipoTrazo === 'punteada' ? [12, 6] : [];
            let endX = li.puntos[li.puntos.length-2], endY = li.puntos[li.puntos.length-1];
            let angleRad = li.puntos.length >= 4 ? Math.atan2(endY - li.puntos[li.puntos.length-3], endX - li.puntos[li.puntos.length-4]) : 0;
            return (
              <Group key={li.id}>
                <Line points={li.puntos} stroke={li.color} strokeWidth={li.grosor} opacity={li.transparencia} dash={dashPattern} lineCap="round" lineJoin="round" tension={isRecta ? 0 : 0.5} />
                <Group x={endX} y={endY} rotation={angleRad * 180 / Math.PI} opacity={li.transparencia}>
                  {li.topeFinal === 'triangulo' && (<Path data={`M 0 0 L -${li.grosor * 3} -${li.grosor * 1.5} L -${li.grosor * 3} ${li.grosor * 1.5} Z`} fill={li.color} stroke="#000" strokeWidth={0.5} />)}
                </Group>
              </Group>
            );
          })}
          {animElements.map(el => (
            <Group key={el.id} x={el.x} y={el.y} rotation={el.rotation} scaleX={el.scaleX} scaleY={el.scaleY}>
              <RenderElemento el={el} />
            </Group>
          ))}
        </Layer>
      </Stage>
      {/* Etiqueta flotante de animación */}
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};
// =======================================================


const PlanificadorSemanal = () => {
  const navigate = useNavigate(); 
  const [fechaReferencia, setFechaReferencia] = useState(new Date());
  const [modoVista, setModoVista] = useState('semanal'); 
  const [diasCalendario, setDiasCalendario] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [partidosOficiales, setPartidosOficiales] = useState([]);
  const [tareasBanco, setTareasBanco] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [filtroCategoria, setFiltroCategoria] = useState('Primera'); 
  const [categoriasGuardadas, setCategoriasGuardadas] = useState(['Primera', 'Tercera']);

  // Modal State
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modoModal, setModoModal] = useState('crear'); // 'crear', 'ver', 'editar'
  const [tareaSeleccionadaDetalle, setTareaSeleccionadaDetalle] = useState(null); // Tarea a visualizar
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [busquedaTarea, setBusquedaTarea] = useState('');
  
  const { showToast } = useToast(); 

  const [nuevaSesion, setNuevaSesion] = useState({
    id: null,
    tipo_sesion: 'Entrenamiento',
    objetivo: '',
    nivel_carga: 'Media', 
    categoria_equipo: filtroCategoria,
    tareas_ids: [],
    comentarios: '',
    bloque_fisico: false,
    enfoque_fisico: 'Activación / Core / Prevención',
    duracion_fisico: ''
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

  // 1. Motor del Calendario
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

  // 2. Traer Datos (Sesiones Y Partidos)
  useEffect(() => {
    if (diasCalendario.length > 0) {
      cargarDatos();
    }
  }, [diasCalendario, filtroCategoria]);

  // 3. RECUPERAR SESIÓN EN BORRADOR
  useEffect(() => {
    const borradorStr = sessionStorage.getItem('borradorSesion');
    if (borradorStr && diasCalendario.length > 0) {
      try {
        const borrador = JSON.parse(borradorStr);
        const diaTarget = diasCalendario.find(d => d.fechaStr === borrador.fechaStr);
        if (diaTarget) {
          abrirModal(diaTarget, borrador, true); // true = abrir en modo edición
          sessionStorage.removeItem('borradorSesion');
        }
      } catch (e) {
        console.error("Error leyendo borrador", e);
      }
    }
  }, [diasCalendario]);

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

      let queryPartidos = supabase.from('partidos').select('*').eq('club_id', club_id).gte('fecha', inicio).lte('fecha', fin);
      if (filtroCategoria !== 'Todas') queryPartidos = queryPartidos.eq('categoria', filtroCategoria);
      const { data: dataPartidos, error: errPartidos } = await queryPartidos;
      if (errPartidos) throw errPartidos;
      
      // TRAEMOS TAMBIÉN LA DATA DEL EDITOR, FASES Y VIDEOS
      const { data: dataTareas, error: errTareas } = await supabase
        .from('tareas')
        .select('id, titulo, descripcion, categoria_ejercicio, duracion_estimada, intensidad_rpe, espacio, jugadores_involucrados, url_grafico, editor_data, video_url, fase_juego, objetivo_principal')
        .eq('club_id', club_id)
        .order('created_at', { ascending: false });
        
      if (errTareas) throw errTareas;

      setSesiones(dataSesiones || []);
      setPartidosOficiales(dataPartidos || []); 
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

  const abrirModal = (dia, sesionExistente = null, forzarEdicion = false) => {
    setDiaSeleccionado(dia);
    setBusquedaTarea(''); 
    setTareaSeleccionadaDetalle(null);
    
    if (sesionExistente) {
      setModoModal(forzarEdicion ? 'editar' : 'ver');
      setNuevaSesion({
        id: sesionExistente.id || null,
        tipo_sesion: sesionExistente.tipo_sesion,
        objetivo: sesionExistente.objetivo || '',
        nivel_carga: sesionExistente.nivel_carga || 'Media',
        categoria_equipo: sesionExistente.categoria_equipo || filtroCategoria,
        tareas_ids: sesionExistente.tareas_ids || [],
        comentarios: sesionExistente.comentarios || '',
        bloque_fisico: sesionExistente.bloque_fisico || false,
        enfoque_fisico: sesionExistente.enfoque_fisico || 'Activación / Core / Prevención',
        duracion_fisico: sesionExistente.duracion_fisico || ''
      });
    } else {
      setModoModal('crear');
      setNuevaSesion({ 
        id: null,
        tipo_sesion: 'Entrenamiento', 
        objetivo: '', 
        nivel_carga: 'Media',
        categoria_equipo: filtroCategoria === 'Todas' ? 'Primera' : filtroCategoria,
        tareas_ids: [],
        comentarios: '',
        bloque_fisico: false,
        enfoque_fisico: 'Activación / Core / Prevención',
        duracion_fisico: ''
      });
    }
    setMostrarModal(true);
  };

  const toggleTarea = (tareaId) => {
    setNuevaSesion(prev => {
      const ids = prev.tareas_ids || [];
      const nuevasTareas = ids.includes(tareaId) ? ids.filter(id => id !== tareaId) : [...ids, tareaId];
      return { ...prev, tareas_ids: nuevasTareas };
    });
  };

  const irACreadorYGuardarBorrador = () => {
    const borrador = { ...nuevaSesion, fechaStr: diaSeleccionado.fechaStr };
    sessionStorage.setItem('borradorSesion', JSON.stringify(borrador));
    navigate('/creador-tareas');
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
        comentarios: nuevaSesion.comentarios,
        bloque_fisico: nuevaSesion.bloque_fisico,
        enfoque_fisico: nuevaSesion.bloque_fisico ? nuevaSesion.enfoque_fisico : null,
        duracion_fisico: nuevaSesion.bloque_fisico ? Number(nuevaSesion.duracion_fisico) : null,
      };

      if (nuevaSesion.id) {
        const { error } = await supabase.from('sesiones').update(payload).eq('id', nuevaSesion.id);
        if (error) throw error;
        showToast('¡Sesión actualizada correctamente!', 'success');
      } else {
        const { error } = await supabase.from('sesiones').insert([payload]);
        if (error) throw error;
        showToast('¡Sesión planificada con éxito!', 'success');
      }

      setMostrarModal(false);
      cargarDatos();
    } catch (error) {
      showToast("Error al guardar la sesión: " + error.message, "error");
    }
  };

  const eliminarSesion = async (id, e) => {
    if(e) e.stopPropagation(); 
    if (!window.confirm("¿Eliminar esta sesión del calendario?")) return;
    try {
      const { error } = await supabase.from('sesiones').delete().eq('id', id);
      if (error) throw error;
      setSesiones(sesiones.filter(s => s.id !== id));
      showToast("Sesión eliminada", "info");
      
      if (mostrarModal && nuevaSesion.id === id) {
        setMostrarModal(false);
      }
    } catch (error) {
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const tareasFiltradas = tareasBanco.filter(t => {
    const termino = busquedaTarea.toLowerCase();
    return t.titulo.toLowerCase().includes(termino) || t.categoria_ejercicio.toLowerCase().includes(termino);
  }).sort((a, b) => {
    const aSel = nuevaSesion.tareas_ids?.includes(a.id);
    const bSel = nuevaSesion.tareas_ids?.includes(b.id);
    if (aSel && !bSel) return -1;
    if (!aSel && bSel) return 1;
    return 0;
  });

  const tiempoEstimadoTotal = (nuevaSesion.tareas_ids || []).reduce((acc, id) => {
    const t = tareasBanco.find(tb => tb.id === id);
    return acc + (t && t.duracion_estimada ? Number(t.duracion_estimada) : 0);
  }, 0);

  const tiempoFisico = nuevaSesion.bloque_fisico ? Number(nuevaSesion.duracion_fisico || 0) : 0;
  const tiempoTotalSesion = tiempoEstimadoTotal + tiempoFisico;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      {/* HEADER CONTROLES */}
      <div className="bento-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'var(--panel)', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.5rem', margin: 0 }}>PLANIFICADOR DE SESIONES</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Micro y Macrociclos de tu plantel.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', border: '1px solid #333' }}>
            <button onClick={() => setModoVista('semanal')} style={{ ...toggleBtn, background: modoVista === 'semanal' ? 'var(--accent)' : 'transparent', color: modoVista === 'semanal' ? '#000' : 'var(--text-dim)' }}>
              Semana
            </button>
            <button onClick={() => setModoVista('mensual')} style={{ ...toggleBtn, background: modoVista === 'mensual' ? 'var(--accent)' : 'transparent', color: modoVista === 'mensual' ? '#000' : 'var(--text-dim)' }}>
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
          
          {modoVista === 'mensual' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', textAlign: 'center' }}>
              {diasNombres.map((d, i) => (
                <div key={i} style={{ fontSize: '0.8rem', fontWeight: '900', color: 'var(--text-dim)' }}>{d}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: modoVista === 'semanal' ? '10px' : '5px', alignItems: 'stretch' }}>
            {diasCalendario.map((dia, idx) => {
              const sesionesDia = sesiones.filter(s => s.fecha === dia.fechaStr);
              const partidosDia = partidosOficiales.filter(p => p.fecha === dia.fechaStr);
              const opacidadMes = dia.isMesActual ? 1 : 0.4;

              if (modoVista === 'semanal') {
                return (
                  <div key={idx} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '2px solid var(--accent)' : '1px solid #222', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '400px' }}>
                    <div style={{ background: dia.isHoy ? 'var(--accent)' : '#111', padding: '10px', textAlign: 'center', borderBottom: '1px solid #222' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '900', color: dia.isHoy ? '#000' : 'var(--text-dim)' }}>{dia.diaNombre}</span>
                      <span style={{ fontSize: '1.8rem', fontWeight: '900', color: dia.isHoy ? '#000' : '#fff' }}>{dia.numero}</span>
                    </div>

                    <div style={{ padding: '10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      
                      {partidosDia.map(partido => (
                        <div key={`partido-${partido.id}`} style={{ background: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', padding: '10px', borderRadius: '6px', position: 'relative' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#3b82f6', marginBottom: '2px' }}>PARTIDO OFICIAL</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#fff', marginBottom: '5px' }}>vs {partido.rival?.toUpperCase()}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                            {partido.competicion} - {partido.condicion}
                          </div>
                        </div>
                      ))}

                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        const tareasIds = sesion.tareas_ids || [];
                        
                        return (
                          <div 
                            key={sesion.id} 
                            onClick={() => abrirModal(dia, sesion)} 
                            style={{ background: '#000', borderLeft: `4px solid ${colorNivel}`, padding: '10px', borderRadius: '6px', position: 'relative', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                          >
                            <button onClick={(e) => eliminarSesion(sesion.id, e)} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', zIndex: 2 }} title="Eliminar">✖</button>
                            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#fff', marginBottom: '2px', paddingRight: '15px' }}>{sesion.tipo_sesion.toUpperCase()}</div>
                            <div style={{ fontSize: '0.65rem', color: colorNivel, fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' }}>CARGA: {sesion.nivel_carga || 'MEDIA'}</div>
                            
                            {sesion.bloque_fisico && (
                              <div style={{ background: '#f59e0b20', border: '1px solid #f59e0b50', padding: '3px 6px', borderRadius: '4px', fontSize: '0.6rem', color: '#fcd34d', fontWeight: 'bold', display: 'inline-block', marginBottom: '8px' }}>
                                🏃‍♂️ {sesion.duracion_fisico}' - {sesion.enfoque_fisico?.split('/')[0]}
                              </div>
                            )}

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
                              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px', marginTop: '8px', fontSize: '0.65rem', color: 'var(--accent)', border: '1px solid #333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <strong>💬</strong> {sesion.comentarios}
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
                return (
                  <div key={idx} onClick={() => abrirModal(dia)} style={{ background: dia.isHoy ? '#111827' : '#0a0a0a', border: dia.isHoy ? '1px solid var(--accent)' : '1px solid #222', borderRadius: '8px', display: 'flex', flexDirection: 'column', minHeight: '100px', padding: '5px', opacity: opacidadMes, cursor: 'pointer', transition: '0.2s', overflow: 'hidden' }} className="mes-card">
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: '900', color: dia.isHoy ? 'var(--accent)' : (dia.isMesActual ? '#fff' : '#666'), marginBottom: '5px' }}>
                      {dia.numero}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {partidosDia.map(partido => (
                        <div key={`partido-${partido.id}`} style={{ background: 'rgba(59, 130, 246, 0.2)', borderLeft: '2px solid #3b82f6', padding: '4px', borderRadius: '3px', fontSize: '0.6rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', color: '#93c5fd' }}>vs {partido.rival?.substring(0,4).toUpperCase()}</span>
                        </div>
                      ))}

                      {sesionesDia.map(sesion => {
                        const colorNivel = nivelesCarga[sesion.nivel_carga]?.color || '#888';
                        return (
                          <div 
                            key={sesion.id} 
                            onClick={(e) => { e.stopPropagation(); abrirModal(dia, sesion); }}
                            style={{ background: `${colorNivel}20`, borderLeft: `2px solid ${colorNivel}`, padding: '4px', borderRadius: '3px', fontSize: '0.6rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                            title={sesion.objetivo || 'Ver Sesión'}
                          >
                            <span style={{ fontWeight: 'bold' }}>
                              {sesion.tipo_sesion.substring(0,3).toUpperCase()} {sesion.bloque_fisico && '🏃‍♂️'}
                            </span>
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

      {/* MODAL PRINCIPAL */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '950px', border: '2px solid var(--accent)', maxHeight: '95vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            
            {/* --- VISOR DE DETALLES DE TAREA (OVERLAY) --- */}
            {tareaSeleccionadaDetalle && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#111', zIndex: 10, display: 'flex', flexDirection: 'column', overflowY: 'auto', animation: 'fadeIn 0.2s' }}>
                
                {/* HEADER DE LA TAREA */}
                <div style={{ padding: '20px', background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {tareaSeleccionadaDetalle.categoria_ejercicio} • {tareaSeleccionadaDetalle.fase_juego}
                    </span>
                    <h2 style={{ margin: '10px 0 0 0', color: '#fff', fontSize: '1.8rem', textTransform: 'uppercase', fontWeight: '900' }}>
                      {tareaSeleccionadaDetalle.titulo}
                    </h2>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 'bold' }}>{tareaSeleccionadaDetalle.objetivo_principal}</span>
                  </div>
                  <button onClick={() => setTareaSeleccionadaDetalle(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', padding: '20px' }}>
                  {/* VISUAL Y MULTIMEDIA */}
                  <div style={{ flex: '1 1 500px', padding: '10px', borderRight: '1px solid #222' }}>
                    <div style={{ background: '#000', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {/* LÓGICA DE ANIMACIÓN VS IMAGEN ESTÁTICA */}
                      {tareaSeleccionadaDetalle.editor_data?.frames?.length > 1 ? (
                        <ReproductorLoop editorData={tareaSeleccionadaDetalle.editor_data} />
                      ) : tareaSeleccionadaDetalle.url_grafico ? (
                        <img src={tareaSeleccionadaDetalle.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ color: '#444' }}>Sin gráfico</span>
                      )}
                    </div>
                    {tareaSeleccionadaDetalle.video_url && (
                      <div style={{ marginTop: '15px' }}>
                        <a href={tareaSeleccionadaDetalle.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#2563eb', color: '#fff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                          ▶️ VER VIDEO DE REFERENCIA
                        </a>
                      </div>
                    )}
                  </div>

                  {/* BLOQUE DE DATOS Y REGLAS */}
                  <div style={{ flex: '1 1 300px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>DURACIÓN</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionadaDetalle.duracion_estimada}'</span>
                      </div>
                      <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: '900', color: tareaSeleccionadaDetalle.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionadaDetalle.intensidad_rpe}/10</span>
                      </div>
                      <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>CARGA (UC)</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionadaDetalle.duracion_estimada || 0) * (tareaSeleccionadaDetalle.intensidad_rpe || 0)}</span>
                      </div>
                      <div style={{ background: '#1a1a1a', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '0.7rem', color: '#888', fontWeight: 'bold' }}>JUGADORES</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{tareaSeleccionadaDetalle.jugadores_involucrados}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.85rem' }}>Reglas y Desarrollo:</h4>
                      <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto' }}>
                        {tareaSeleccionadaDetalle.descripcion || "Sin descripción detallada."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* HEADER DEL MODAL PRINCIPAL */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>
                {modoModal === 'ver' ? '👁️ Detalles de la Sesión' : (nuevaSesion.id ? '✏️ Editar Sesión' : '➕ Planificar Nueva Sesión')} - {diaSeleccionado?.diaNombre} {diaSeleccionado?.numero}
              </h3>
              <div style={{ display: 'flex', gap: '15px' }}>
                {modoModal === 'ver' && (
                  <button onClick={() => setModoModal('editar')} style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', padding: '5px 15px', borderRadius: '4px', fontWeight: 'bold' }}>
                    ✏️ MODO EDICIÓN
                  </button>
                )}
                {modoModal === 'editar' && (
                  <button onClick={(e) => eliminarSesion(nuevaSesion.id, e)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold' }}>
                    🗑️ ELIMINAR
                  </button>
                )}
                <button onClick={() => setMostrarModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>✖</button>
              </div>
            </div>

            {/* CONTENIDO DEL MODAL: CONDICIONAL SEGÚN EL MODO */}
            {modoModal === 'ver' ? (
              // ==========================================
              // MODO VISTA (SÓLO LECTURA)
              // ==========================================
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '25px', animation: 'fadeIn 0.2s' }}>
                
                {/* COLUMNA IZQUIERDA: INFO GENERAL */}
                <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                    <h4 style={{ color: 'var(--accent)', margin: '0 0 15px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>Datos de la Sesión</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Categoría:</span> <strong style={{color: '#fff'}}>{nuevaSesion.categoria_equipo}</strong></div>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Tipo:</span> <strong style={{color: '#fff'}}>{nuevaSesion.tipo_sesion}</strong></div>
                      <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Carga General:</span> <strong style={{color: nivelesCarga[nuevaSesion.nivel_carga]?.color || '#fff'}}>{nuevaSesion.nivel_carga}</strong></div>
                    </div>
                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #222' }}>
                      <span style={{color: '#888', display: 'block', marginBottom: '5px', fontSize: '0.8rem'}}>Objetivo Principal:</span>
                      <strong style={{color: '#fff', fontSize: '0.95rem'}}>{nuevaSesion.objetivo || 'Sin definir'}</strong>
                    </div>
                  </div>
                  
                  {nuevaSesion.bloque_fisico && (
                    <div style={{ background: '#f59e0b20', padding: '15px', borderRadius: '8px', border: '1px solid #f59e0b50' }}>
                      <h4 style={{ color: '#f59e0b', margin: '0 0 10px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>🏃‍♂️ Bloque de Preparación Física</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#fcd34d'}}>Enfoque:</span> <strong style={{color: '#fff'}}>{nuevaSesion.enfoque_fisico}</strong></div>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#fcd34d'}}>Duración:</span> <strong style={{color: '#fff'}}>{nuevaSesion.duracion_fisico} min</strong></div>
                      </div>
                    </div>
                  )}

                  {nuevaSesion.comentarios && (
                    <div style={{ background: '#0a0a0a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <h4 style={{ color: '#aaa', margin: '0 0 10px 0', fontSize: '0.8rem', textTransform: 'uppercase' }}>Comentarios / Novedades</h4>
                      <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap' }}>{nuevaSesion.comentarios}</p>
                    </div>
                  )}
                </div>

                {/* COLUMNA DERECHA: TAREAS (VISOR) */}
                <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '10px', borderRadius: '8px', border: '1px solid #333' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TAREAS ASIGNADAS</span>
                      <span style={{ fontSize: '1.2rem', color: 'var(--accent)', fontWeight: '900' }}>{nuevaSesion.tareas_ids?.length || 0}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TIEMPO TOTAL</span>
                      <span style={{ fontSize: '1.2rem', color: '#fff', fontWeight: '900' }}>⏱️ {tiempoTotalSesion}' min</span>
                    </div>
                  </div>

                  <div style={{ background: '#000', border: '1px solid #333', borderRadius: '8px', flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(!nuevaSesion.tareas_ids || nuevaSesion.tareas_ids.length === 0) && (
                      <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>No hay tareas asignadas en esta sesión.</span>
                    )}
                    
                    {nuevaSesion.tareas_ids?.map(id => {
                      const t = tareasBanco.find(tb => tb.id === id);
                      if (!t) return null;
                      return (
                        <div 
                          key={t.id} 
                          onClick={() => setTareaSeleccionadaDetalle(t)} 
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', background: '#111', border: '1px solid #333' }}
                          onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = '#1a1a1a'; }}
                          onMouseOut={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#111'; }}
                        >
                          <div style={{ width: '60px', height: '45px', borderRadius: '4px', background: '#000', border: '1px solid #222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {t.url_grafico ? <img src={t.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '1.2rem', color: '#444' }}>⚽</span>}
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <span style={{ display: 'block', fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titulo}</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase' }}>{t.categoria_ejercicio}</span>
                              <span style={{ fontSize: '0.65rem', color: '#aaa' }}>• ⏱️ {t.duracion_estimada}'</span>
                            </div>
                          </div>
                          <div style={{ color: 'var(--accent)', fontSize: '1.2rem', paddingRight: '10px' }}>👁️</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            ) : (

              // ==========================================
              // MODO CREACIÓN / EDICIÓN
              // ==========================================
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '25px' }}>
                  {/* COLUMNA IZQUIERDA: DATOS GENERALES Y PF */}
                  <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Categoría</label>
                        <input type="text" value={nuevaSesion.categoria_equipo} onChange={e => setNuevaSesion({...nuevaSesion, categoria_equipo: e.target.value})} style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Tipo de Sesión</label>
                        <select value={nuevaSesion.tipo_sesion} onChange={e => setNuevaSesion({...nuevaSesion, tipo_sesion: e.target.value})} style={inputStyle}>
                          <option value="Entrenamiento">Entrenamiento</option>
                          <option value="Gimnasio">Gimnasio</option>
                          <option value="Amistoso">Amistoso (No Oficial)</option>
                          <option value="Descanso">Sesión Especial</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={labelStyle}>Objetivo Principal Táctico/Técnico</label>
                      <input type="text" value={nuevaSesion.objetivo} onChange={e => setNuevaSesion({...nuevaSesion, objetivo: e.target.value})} style={inputStyle} placeholder="Ej: Transiciones Ofensivas y Superioridad 3v2" />
                    </div>

                    <div style={{ background: '#000', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <label style={labelStyle}>Carga Subjetiva Esperada (RPE / UC)</label>
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

                    {/* SECCIÓN PREPARADOR FÍSICO */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: nuevaSesion.bloque_fisico ? '15px' : '0' }}>
                        <label style={{ ...labelStyle, color: '#f59e0b', margin: 0 }}>🏃‍♂️ BLOQUE PREPARACIÓN FÍSICA</label>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={nuevaSesion.bloque_fisico} 
                            onChange={(e) => setNuevaSesion({...nuevaSesion, bloque_fisico: e.target.checked})} 
                            style={{ marginRight: '8px', accentColor: '#f59e0b', width: '16px', height: '16px' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold' }}>Incluir</span>
                        </label>
                      </div>

                      {nuevaSesion.bloque_fisico && (
                        <div style={{ display: 'flex', gap: '10px', animation: 'fadeIn 0.3s' }}>
                          <div style={{ flex: 2 }}>
                            <label style={{...labelStyle, color: '#fcd34d'}}>Enfoque Fisiológico / Motor</label>
                            <select value={nuevaSesion.enfoque_fisico} onChange={e => setNuevaSesion({...nuevaSesion, enfoque_fisico: e.target.value})} style={{...inputStyle, borderColor: '#f59e0b80'}}>
                              <option value="Activación / Core / Prevención">🛡️ Activación / Prevención / Core</option>
                              <option value="Fuerza Máxima / Estructural">🏋️‍♂️ Fuerza Máxima / Estructural</option>
                              <option value="Potencia / Pliometría">🚀 Potencia / Pliometría</option>
                              <option value="RSA (Repeated Sprint Ability)">🔥 RSA (Capacidad de Sprints Repetidos)</option>
                              <option value="Velocidad y Agilidad (COD)">⚡ Velocidad / Agilidad / COD</option>
                              <option value="Resistencia Intermitente">🏃‍♂️ Resistencia Intermitente / Aeróbico</option>
                              <option value="Recuperación Activa">🧘‍♂️ Recuperación Activa</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{...labelStyle, color: '#fcd34d'}}>Duración (min)</label>
                            <input type="number" placeholder="Ej: 20" value={nuevaSesion.duracion_fisico} onChange={e => setNuevaSesion({...nuevaSesion, duracion_fisico: e.target.value})} style={{...inputStyle, borderColor: '#f59e0b80', textAlign: 'center'}} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={labelStyle}>Comentarios / Novedades</label>
                      <textarea 
                        value={nuevaSesion.comentarios} 
                        onChange={e => setNuevaSesion({...nuevaSesion, comentarios: e.target.value})} 
                        style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} 
                        placeholder="Ej: Faltó Martínez por fiebre. Rodríguez entrenó diferenciado con el Kinesiólogo."
                      />
                    </div>
                  </div>

                  {/* COLUMNA DERECHA: TAREAS EN CANCHA */}
                  <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '10px', borderRadius: '8px', border: '1px solid #333' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TAREAS SELECCIONADAS</span>
                        <span style={{ fontSize: '1.2rem', color: 'var(--accent)', fontWeight: '900' }}>{nuevaSesion.tareas_ids?.length || 0}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold', display: 'block' }}>TIEMPO TOTAL</span>
                        <span style={{ fontSize: '1.2rem', color: '#fff', fontWeight: '900' }}>⏱️ {tiempoTotalSesion}' min</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={irACreadorYGuardarBorrador} 
                      style={{ background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{fontSize: '1.2rem'}}>➕</span> ¿No encontrás la tarea? Creala ahora y volvé acá
                    </button>

                    <input type="text" placeholder="🔍 Buscar tareas por nombre o tipo..." value={busquedaTarea} onChange={(e) => setBusquedaTarea(e.target.value)} style={{...inputStyle, padding: '8px 12px', background: '#222'}} />

                    <div style={{ background: '#000', border: '1px solid #333', borderRadius: '8px', flex: 1, minHeight: '300px', maxHeight: '450px', overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {tareasFiltradas.length === 0 && <span style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>No se encontraron tareas en el banco.</span>}
                      
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
                    {nuevaSesion.id ? '💾 GUARDAR CAMBIOS DE LA SESIÓN' : '💾 PLANIFICAR SESIÓN COMPLETA'}
                  </button>
                </div>
              </>
            )}

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