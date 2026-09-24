import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { leerFase, subfasesDe } from '../utils/taxonomiaTareas';
import { BASE_W, getBaseH, renderBoard, getDPR, convertOldEl, convertOldLine } from '../tactica/pizarra';
import { puntoEnTrayecto } from '../utils/trayectoria';
import { volverDesde, esModoKiosco } from '../utils/kiosco';
import { mismaCategoria } from '../utils/categorias';

// =======================================================
// REPRODUCTOR DE JUGADAS
//
// Dibuja con el MISMO motor que el creador (src/tactica/pizarra.js). Antes
// era un reproductor aparte hecho en Konva que leía el formato viejo
// (`elementos`, `lineas`), así que toda jugada guardada por el creador
// actual se veía acá como una cancha vacía. Sigue entendiendo el formato
// viejo, ahora convirtiéndolo, para que las jugadas históricas no se
// pierdan.
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const contenedorRef = useRef(null);
  const canvasRef = useRef(null);
  const vivoRef = useRef(true);
  const [tam, setTam] = useState({ w: 0, h: 0 });

  /* Normaliza los dos formatos a uno solo, una vez. */
  const { frames, pitchCfg } = useMemo(() => {
    const crudos = editorData?.frames?.length
      ? editorData.frames
      : [{ elements: editorData?.elements, elementos: editorData?.elementos,
           arrows: editorData?.arrows, lineas: editorData?.lineas }];
    const normalizados = crudos.map((f, i) => ({
      id: f.id || `f${i}`,
      elements: f.elements || (f.elementos || []).map(convertOldEl),
      arrows:   f.arrows   || (f.lineas   || []).map(convertOldLine),
      duracion: f.duracion,
    }));
    const cancha = editorData?.cancha || {};
    return {
      frames: normalizados,
      pitchCfg: {
        variant: cancha.tamaño || cancha.variant || '40x20',
        material: cancha.material || 'azul',
        showZones: true, showGrid: false, goals: 'both', lineColor: '#ffffff',
      },
    };
  }, [editorData]);

  const baseH = getBaseH(pitchCfg.variant);

  useEffect(() => {
    const medir = () => {
      const c = contenedorRef.current;
      if (!c) return;
      const dispo = { w: c.clientWidth, h: c.clientHeight };
      if (!dispo.w || !dispo.h) return;
      const razon = BASE_W / baseH;
      let w = Math.min(dispo.w, dispo.h * razon);
      let h = w / razon;
      if (h > dispo.h) { h = dispo.h; w = h * razon; }
      setTam({ w: Math.round(w), h: Math.round(h) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (contenedorRef.current) ro.observe(contenedorRef.current);
    return () => ro.disconnect();
  }, [baseH]);

  useEffect(() => {
    vivoRef.current = true;
    const cv = canvasRef.current;
    if (!cv || !tam.w) return;
    const ctx = cv.getContext('2d');
    const dpr = getDPR();

    const pintar = (elements, arrows) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, tam.w, tam.h);
      ctx.scale(tam.w / BASE_W, tam.h / baseH);
      renderBoard(ctx, { elements, arrows, selected: null, pitchCfg,
                         tempArrow: null, tempZone: null, isMobile: false });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    if (frames.length < 2) {
      pintar(frames[0]?.elements || [], frames[0]?.arrows || []);
      return;
    }

    const PAUSA = 450;
    const reproducir = async () => {
      while (vivoRef.current) {
        for (let i = 0; i < frames.length - 1 && vivoRef.current; i++) {
          const a = frames[i], b = frames[i + 1];
          /* Cada tramo dura lo que diga el fotograma de destino. */
          const dur = Number(b.duracion) > 0 ? Number(b.duracion) : 800;
          await new Promise(listo => {
            let t0 = null;
            const paso = (ts) => {
              if (!vivoRef.current) return listo();
              if (!t0) t0 = ts;
              const p = Math.min((ts - t0) / dur, 1);
              const ease = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
              const interpolados = a.elements.map(elA => {
                const elB = b.elements.find(x => x.id === elA.id);
                if (!elB) return elA;
                const q = puntoEnTrayecto(elA, elB, elB.bow, ease);
                return { ...elA, x: q.x, y: q.y,
                         rotation: (elA.rotation || 0) + ((elB.rotation || 0) - (elA.rotation || 0)) * ease };
              });
              const nuevos = b.elements.filter(x => !a.elements.find(y => y.id === x.id));
              pintar([...interpolados, ...(p > .8 ? nuevos : [])], a.arrows);
              if (p < 1) requestAnimationFrame(paso); else listo();
            };
            requestAnimationFrame(paso);
          });
          if (!vivoRef.current) break;
          pintar(b.elements, b.arrows);
          await new Promise(r => setTimeout(r, PAUSA));
        }
        if (!vivoRef.current) break;
        await new Promise(r => setTimeout(r, 700));
        pintar(frames[0].elements, frames[0].arrows);
      }
    };
    reproducir();
    return () => { vivoRef.current = false; };
  }, [frames, pitchCfg, baseH, tam]);

  return (
    <div ref={contenedorRef} style={{ width: '100%', height: '100%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={Math.round(tam.w * getDPR())} height={Math.round(tam.h * getDPR())}
        style={{ width: tam.w + 'px', height: tam.h + 'px', borderRadius: '4px' }}
      />
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};

// =======================================================
// COMPONENTE PRINCIPAL: LIBRO TÁCTICO
// =======================================================
/* Las pestañas son SITUACIONES (subfases), no fases. Antes esta lista era el
   vocabulario viejo que vivía en `fase_juego`; ahora sale de la taxonomía:
   todo lo de balón parado, más la salida de presión y el power play, que
   pertenecen a otras fases pero son jugadas de pizarrón igual. */
const SITUACIONES = [...subfasesDe('Balón Parado'), 'Salida de presión', '5v4'];

/* Qué situación tiene una jugada, esté migrada o no. */
const situacionDe = (t) => leerFase(t).subfase;

export default function LibroTactico() {
  const [tacticas, setTacticas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [tabActivo, setTabActivo] = useState(SITUACIONES[0]);
  const [jugadaSeleccionada, setJugadaSeleccionada] = useState(null);
  
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { perfil } = useAuth();
  
  const rolUsuario = perfil?.rol ? String(perfil.rol).toLowerCase() : '';
  /* En el kiosco nunca hay staff (la sesión es del club, no de una persona),
     y el jugador ve sólo las jugadas de su categoría o las de todas. */
  const isKiosco = esModoKiosco();
  const catKiosco = isKiosco ? localStorage.getItem('kiosco_categoria') : null;
  const esStaff = !isKiosco && ['superuser', 'admin', 'ct'].includes(rolUsuario);

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
      const paraMi = (t) => !t.categoria_recomendada || t.categoria_recomendada === 'Todas'
        || mismaCategoria(t.categoria_recomendada, catKiosco);
      setTacticas(isKiosco && catKiosco ? (data || []).filter(paraMi) : (data || []));
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

  const jugadasVisibles = tacticas.filter(t => situacionDe(t) === tabActivo);

  return (
    <div className="fade-in" style={{ padding: '20px', paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
      
      {/* BOTÓN VOLVER ATRÁS */}
      <button 
        onClick={() => volverDesde(navigate)} 
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
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
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
            <button onClick={() => navigate('/banco-tareas')} className="btn-action" style={{ background: '#3b82f6', color: '#ffffff', fontSize: '0.85rem' }}>
              + AGREGAR DESDE BANCO
            </button>
          )}
        </div>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN TÁCTICA */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '30px', justifyContent: 'flex-start' }}>
        {SITUACIONES.map(sit => {
          const count = tacticas.filter(t => situacionDe(t) === sit).length;
          const activo = tabActivo === sit;
          return (
            <button 
              key={sit} 
              onClick={() => setTabActivo(sit)}
              style={{
                padding: '8px 14px', 
                borderRadius: '20px', 
                cursor: 'pointer', 
                fontWeight: 'bold', 
                fontSize: '0.8rem', 
                transition: '0.2s',
                background: activo ? '#3b82f6' : 'var(--panel)', 
                color: activo ? '#fff' : 'var(--text-dim)',
                border: activo ? '1px solid #60a5fa' : '1px solid var(--border)',
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                flexGrow: 0 
              }}
            >
              {sit}
              <span style={{ background: activo ? 'rgba(0,0,0,0.3)' : 'var(--panel)', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#3b82f6' }}>Abriendo el Playbook... ⚽</div>
      ) : jugadasVisibles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '15px', border: '1px dashed #3b82f6' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>❌</div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>No hay jugadas diseñadas para esta situación.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Las jugadas guardadas en la categoría "Libro Táctico" aparecerán aquí.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '15px' }}>
          {jugadasVisibles.map(jugada => (
            <div 
              key={jugada.id}
              onClick={() => setJugadaSeleccionada(jugada)}
              className="bento-card" 
              style={{ padding: '0', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)', transition: '0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ height: '180px', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {jugada.video_mp4_url ? (
                  <video src={jugada.video_mp4_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline autoPlay />
                ) : jugada.url_grafico ? (
                  <img src={jugada.url_grafico} alt="Táctica" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '3rem' }}>📋</span>
                )}
                {jugada.editor_data?.frames?.length > 1 && !jugada.video_mp4_url && (
                  <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#ef4444', color: '#ffffff', fontSize: '0.6rem', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>ANIMACIÓN</span>
                )}
              </div>
              <div style={{ padding: '15px', background: 'var(--panel)' }}>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem', color: 'var(--text)', textTransform: 'uppercase' }}>{jugada.titulo}</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {jugada.objetivo_principal || 'Sin descripción de objetivo'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DETALLE DE LA JUGADA (PLAYBOOK) */}
      {jugadaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px', boxSizing: 'border-box' }}>
          <div className="bento-card" style={{ background: 'var(--panel)', width: '100%', maxWidth: '900px', border: '2px solid #3b82f6', padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, paddingRight: '15px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text)', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {situacionDe(jugadaSeleccionada) || jugadaSeleccionada.fase_juego}
                </span>
                <h2 style={{ margin: '10px 0 5px 0', color: 'var(--text)', fontSize: '1.5rem', textTransform: 'uppercase', fontWeight: '900', wordBreak: 'break-word' }}>
                  {jugadaSeleccionada.titulo}
                </h2>
                <span style={{ color: '#93c5fd', fontSize: '0.9rem', fontWeight: 'bold' }}>{jugadaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setJugadaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'var(--text)', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '15px', gap: '20px' }}>
              
              <div style={{ flex: '1 1 100%', minWidth: '0' }}>
                <div style={{ background: '#000', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {jugadaSeleccionada.video_mp4_url ? (
                    <video src={jugadaSeleccionada.video_mp4_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : jugadaSeleccionada.editor_data?.frames?.length > 1 ? (
                    <ReproductorLoop editorData={jugadaSeleccionada.editor_data} />
                  ) : jugadaSeleccionada.url_grafico ? (
                    <img src={jugadaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>Sin gráfico</span>
                  )}
                </div>
              </div>

              <div style={{ flex: '1 1 100%', minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#3b82f6', textTransform: 'uppercase', fontSize: '0.85rem' }}>Desarrollo / Movimientos:</h4>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '250px', overflowY: 'auto' }}>
                    {jugadaSeleccionada.descripcion || "El CT no agregó detalles escritos para esta jugada."}
                  </div>
                </div>

                {jugadaSeleccionada.video_url && (
                  <a href={jugadaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#ef4444', color: '#ffffff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.85rem' }}>
                    ▶️ Video de Ejemplo Externo
                  </a>
                )}

                {esStaff && (
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => eliminarJugada(jugadaSeleccionada.id)} style={{ flex: '1 1 100px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      ELIMINAR
                    </button>
                    <button onClick={() => navigate('/creador-tareas', { state: { editando: jugadaSeleccionada } })} style={{ flex: '2 1 150px', background: '#3b82f6', border: 'none', color: '#ffffff', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
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