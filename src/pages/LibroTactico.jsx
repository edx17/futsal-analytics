import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Stage, Layer, Circle, Rect, Text, Group, Line, Path } from 'react-konva';

// =======================================================
// REPRODUCTOR AUTOMÁTICO DE JUGADAS (MODO GIF)
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
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};

// =======================================================
// COMPONENTE PRINCIPAL: LIBRO TÁCTICO
// =======================================================
const SITUACIONES = ['Salida de Presión', "Saque Inicial", 'Laterales Bajos', 'Laterales Medios', 'Laterales Altos', 'Corners', 'Tiros Libres', '5v4'];

export default function LibroTactico() {
  const [tacticas, setTacticas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tabActivo, setTabActivo] = useState(SITUACIONES[0]);
  const [jugadaSeleccionada, setJugadaSeleccionada] = useState(null);
  
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { perfil } = useAuth();
  
  const rolUsuario = perfil?.rol ? String(perfil.rol).toLowerCase() : '';
  const esStaff = ['superuser', 'admin', 'ct'].includes(rolUsuario);

  useEffect(() => {
    cargarLibroTactico();
  }, []);

  const cargarLibroTactico = async () => {
    setCargando(true);
    try {
      const club_id = localStorage.getItem('club_id') || perfil?.club_id || 'club_default';
      
      const { data, error } = await supabase
        .from('tareas')
        .select('*')
        .eq('club_id', club_id)
        .eq('categoria_ejercicio', 'Libro Táctico') 
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTacticas(data || []);
    } catch (error) {
      console.error("Error al cargar libro táctico:", error.message);
    } finally {
      setCargando(false);
    }
  };

  const eliminarJugada = async (id) => {
    if (!window.confirm("⚠️ ¿Eliminar esta jugada del Libro Táctico?")) return;
    try {
      const { error } = await supabase.from('tareas').delete().eq('id', id);
      if (error) throw error;
      setTacticas(tacticas.filter(t => t.id !== id));
      setJugadaSeleccionada(null);
      showToast("Jugada eliminada", "success");
    } catch (error) {
      showToast("Error al eliminar: " + error.message, "error");
    }
  };

  const jugadasVisibles = tacticas.filter(t => t.fase_juego === tabActivo);

  return (
    <div className="fade-in" style={{ padding: '20px', paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* BOTÓN VOLVER ATRÁS */}
      <button 
        onClick={() => navigate(-1)} 
        style={{ 
          background: 'transparent', 
          border: 'none', 
          color: 'var(--text-dim)', 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          fontWeight: 'bold', 
          marginBottom: '15px', 
          padding: '5px 0', 
          fontSize: '0.9rem', 
          transition: 'color 0.2s' 
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
      >
        ⬅ Volver atrás
      </button>

      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '25px', background: 'var(--panel)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '2.5rem' }}>📘</div>
            <h1 className="stat-label" style={{ color: '#3b82f6', fontSize: '1.5rem', margin: 0 }}>LIBRO TÁCTICO</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)' }}>Playbook oficial del equipo: ABP, presiones y situaciones especiales.</p>
          </div>
          {esStaff && (
            <button onClick={() => navigate('/creador-tareas')} className="btn-action" style={{ background: '#3b82f6', color: '#fff', fontSize: '0.85rem' }}>
              + NUEVA JUGADA
            </button>
          )}
        </div>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN TÁCTICA MEJORADAS (CHIPS ENVOLVENTES) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '30px', justifyContent: 'flex-start' }}>
        {SITUACIONES.map(sit => {
          const count = tacticas.filter(t => t.fase_juego === sit).length;
          const activo = tabActivo === sit;
          return (
            <button 
              key={sit} 
              onClick={() => setTabActivo(sit)}
              style={{
                padding: '8px 14px', // Padding más compacto
                borderRadius: '20px', // Estilo píldora
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem', 
                transition: '0.2s',
                background: activo ? '#3b82f6' : '#111', 
                color: activo ? '#fff' : 'var(--text-dim)',
                border: activo ? '1px solid #60a5fa' : '1px solid #333',
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                flexGrow: 0 // Evita que se estiren de más
              }}
            >
              {sit}
              <span style={{ background: activo ? 'rgba(0,0,0,0.3)' : '#222', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#3b82f6' }}>Abriendo el Playbook... ⚽</div>
      ) : jugadasVisibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '15px', border: '1px dashed #3b82f6' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>❌</div>
          <h3 style={{ color: '#fff', margin: 0 }}>No hay jugadas diseñadas para esta situación.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Las jugadas guardadas en la categoría "Libro Táctico" aparecerán aquí.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
          {jugadasVisibles.map(jugada => (
            <div 
              key={jugada.id}
              onClick={() => setJugadaSeleccionada(jugada)}
              className="bento-card" 
              style={{ padding: '0', overflow: 'hidden', cursor: 'pointer', border: '1px solid #333', transition: '0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ height: '180px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {jugada.url_grafico ? (
                  <img src={jugada.url_grafico} alt="Táctica" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '3rem' }}>📋</span>
                )}
                {jugada.editor_data?.frames?.length > 1 && (
                  <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', color: '#fff', fontSize: '0.6rem', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>ANIMACIÓN</span>
                )}
              </div>
              <div style={{ padding: '15px', background: '#111' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', color: '#fff', textTransform: 'uppercase' }}>{jugada.titulo}</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {jugada.objetivo_principal || 'Sin descripción de objetivo'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DETALLE DE LA JUGADA (PLAYBOOK) MEJORADO PARA MÓVILES */}
      {jugadaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', boxSizing: 'border-box' }}>
          <div className="bento-card" style={{ background: '#0a0a0a', width: '100%', maxWidth: '900px', border: '2px solid #3b82f6', padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, paddingRight: '15px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {jugadaSeleccionada.fase_juego}
                </span>
                <h2 style={{ margin: '10px 0 5px 0', color: '#fff', fontSize: '1.5rem', textTransform: 'uppercase', fontWeight: '900', wordBreak: 'break-word' }}>
                  {jugadaSeleccionada.titulo}
                </h2>
                <span style={{ color: '#93c5fd', fontSize: '0.9rem', fontWeight: 'bold' }}>{jugadaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setJugadaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '15px', gap: '20px' }}>
              
              {/* CANVAS ADAPTATIVO AL 100% EN MÓVILES */}
              <div style={{ flex: '1 1 100%', minWidth: '0' }}>
                <div style={{ background: '#000', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {jugadaSeleccionada.editor_data?.frames?.length > 1 ? (
                    <ReproductorLoop editorData={jugadaSeleccionada.editor_data} />
                  ) : jugadaSeleccionada.url_grafico ? (
                    <img src={jugadaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#444' }}>Sin gráfico</span>
                  )}
                </div>
              </div>

              {/* TEXTO Y BOTONES ADAPTATIVOS */}
              <div style={{ flex: '1 1 100%', minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6', textTransform: 'uppercase', fontSize: '0.85rem' }}>Desarrollo / Movimientos:</h4>
                  <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '250px', overflowY: 'auto' }}>
                    {jugadaSeleccionada.descripcion || "El CT no agregó detalles escritos para esta jugada."}
                  </div>
                </div>

                {jugadaSeleccionada.video_url && (
                  <a href={jugadaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#ef4444', color: '#fff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                    ▶️ Video de Ejemplo
                  </a>
                )}

                {esStaff && (
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => eliminarJugada(jugadaSeleccionada.id)} style={{ flex: '1 1 100px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      ELIMINAR
                    </button>
                    <button onClick={() => navigate('/creador-tareas', { state: { editando: jugadaSeleccionada } })} style={{ flex: '2 1 150px', background: '#3b82f6', border: 'none', color: '#fff', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      EDITAR TÁCTICA
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}