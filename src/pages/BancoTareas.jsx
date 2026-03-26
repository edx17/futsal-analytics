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

const BancoTareas = () => {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroFase, setFiltroFase] = useState('Todas');
  
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

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

  const eliminarTarea = async (id) => {
    const confirmar = window.confirm("⚠️ ¿Estás seguro de que querés eliminar esta tarea definitivamente? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    try {
      const { error } = await supabase.from('tareas').delete().eq('id', id);
      if (error) throw error;
      
      setTareas(tareas.filter(t => t.id !== id));
      setTareaSeleccionada(null);
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
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Biblioteca de ejercicios</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="🔍 Buscar tarea..." 
              value={busqueda} 
              onChange={e => setBusqueda(e.target.value)}
              style={inputFiltro}
            />
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectFiltro}>
              <option value="Todas">Enfoque Teórico</option>
              <option value="Táctico">Táctico</option>
              <option value="Técnico">Técnico</option>
              <option value="Físico">Físico</option>
              <option value="ABP">ABP (Acción a Balón Parado)</option>
              <option value="Cognitivo">Cognitivo</option>
            </select>
            <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} style={selectFiltro}>
              <option value="Todas">Objetivo Principal</option>
              <option value="Ataque Posicional">Ataque</option>
              <option value="Defensa Posicional">Defensa</option>
              <option value="Transición Ofensiva">Transiciones</option>
              <option value="Transición Defensiva">Situación Especial</option>
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
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  
                  {/* SI TIENE ANIMACIÓN (MÁS DE 1 FRAME), MOSTRAMOS EL REPRODUCTOR. SI NO, LA FOTO ESTÁTICA */}
                  {tareaSeleccionada.editor_data?.frames?.length > 1 ? (
                    <ReproductorLoop editorData={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.url_grafico ? (
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