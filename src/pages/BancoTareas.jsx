import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import FiltrosTareas from '../components/FiltrosTareas';
import { puntoEnTrayecto } from '../utils/trayectoria';
import { BASE_W, getBaseH, renderPitch, renderElements } from '../tactica/pizarra';
import { etiquetaFase, etiquetaFormato, pasaFiltros, colorFase, leerFase, FILTROS_VACIOS,
         NATURALEZAS, FASES, FORMATOS, subfasesDe } from '../utils/taxonomiaTareas';

// =======================================================
// UTILIDADES PARA TAREAS FÍSICAS Y CÁLCULOS
// =======================================================
const getIconoTarea = (tarea) => {
  if (tarea.categoria_ejercicio === 'Físico') {
    return tarea.espacio === 'Gimnasio' ? '🏋️‍♂️' : '🏃‍♂️';
  }
  return '⚽';
};

const RenderRutinaFisica = ({ data }) => {
  if (!data || !data.bloques) return <div style={{padding: '20px', color: 'var(--text-dim)'}}>Sin detalles físicos cargados.</div>;

  return (
    <div style={{ padding: '15px', width: '100%', height: '100%', overflowY: 'auto', background: 'var(--panel)', boxSizing: 'border-box', textAlign: 'left' }}>
      <h4 style={{ color: 'var(--aviso)', marginTop: 0, marginBottom: '15px', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {data.sub_modo === 'gimnasio' ? '🏋️‍♂️ Circuito de Gimnasio / Fuerza' : '🏃‍♂️ Bloques de Acondicionamiento en Cancha'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.bloques.map((b, i) => (
          <div key={b.id || i} style={{ background: 'var(--panel)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--aviso)' }}>
            {data.sub_modo === 'gimnasio' ? (
              <>
                <div style={{ fontWeight: '900', color: 'var(--text)', fontSize: '1.1rem' }}>{i + 1}. {b.nombre}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: '10px', marginTop: '10px' }}>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>SERIES</span><strong style={{ color: 'var(--text)' }}>{b.series || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>REPS</span><strong style={{ color: 'var(--text)' }}>{b.reps || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>INTENSIDAD</span><strong style={{ color: 'var(--text)' }}>{b.rir || '-'}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '8px', borderRadius: '4px', textAlign: 'center' }}><span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-dim)' }}>PAUSA</span><strong style={{ color: 'var(--text)' }}>{b.pausa || '-'}</strong></div>
                </div>
                {b.notas && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '10px', fontStyle: 'italic' }}>📌 {b.notas}</div>}
              </>
            ) : (
              <>
                <div style={{ fontWeight: '900', color: 'var(--text)', fontSize: '1.1rem' }}>{b.nombreBloque}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginTop: '10px' }}>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Dist:</span> <strong style={{ color: 'var(--text)' }}>{b.distancia}m</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Trabajo:</span> <strong style={{ color: 'var(--text)' }}>{b.tiempoTrabajo}s</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Pausa:</span> <strong style={{ color: 'var(--text)' }}>{b.micropausa}s</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Pasadas:</span> <strong style={{ color: 'var(--text)' }}>{b.pasadas}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Series:</span> <strong style={{ color: 'var(--text)' }}>{b.series}</strong></div>
                  <div style={{ background: 'var(--bg)', padding: '6px', borderRadius: '4px', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-dim)' }}>Macro:</span> <strong style={{ color: 'var(--text)' }}>{b.macropausa}m</strong></div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// =======================================================
// COMPONENTE INTERNO: Reproductor Automático ("Modo GIF" Nativo)
// =======================================================
const ReproductorLoop = ({ editorData }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [cvSize, setCvSize] = useState({ w: 0, h: 0 });
  const isMountedRef = useRef(true);

  const frames = editorData?.frames || [];
  const pitchCfg = editorData?.cancha || { variant: '40x20', material: 'azul' };

  /* El motor de dibujo es el mismo que usa el creador: antes había acá una
     copia con sus propias constantes, que se iba despegando de la original. */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
    const baseH = getBaseH(variant);
    const ratio = BASE_W / baseH;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      
      const cw = entry.contentRect.width;
      const ch = entry.contentRect.height;
      if (cw === 0 || ch === 0) return;

      let w = Math.min(cw, ch * ratio);
      let h = w / ratio;
      
      if (h > ch) { h = ch; w = h * ratio; }
      
      w = Math.floor(w);
      h = Math.floor(h);

      setCvSize(prev => {
        if (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) {
          return { w, h };
        }
        return prev;
      });
    });
    
    observer.observe(container);
    return () => observer.disconnect();
  }, [pitchCfg.variant, pitchCfg.tamaño]);


  useEffect(() => {
    isMountedRef.current = true;
    const cv = canvasRef.current;
    if (!cv || cvSize.w === 0) return;
    const ctx = cv.getContext('2d');

    const DURATION = 800;
    const PAUSE = 500;
    let animId;

    const variant = pitchCfg.variant || pitchCfg.tamaño || '40x20';
    const baseH = getBaseH(variant);

    const playLoop = async () => {
      while (isMountedRef.current) {
        if (frames.length < 2) {
          const f0 = frames[0] || {};
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, cvSize.w, cvSize.h);
          ctx.scale(cvSize.w / BASE_W, cvSize.h / baseH);
          
          renderPitch(ctx, BASE_W, baseH, pitchCfg);
          renderElements(ctx, f0.elements || f0.elementos || [], f0.arrows || f0.lineas || [], BASE_W);
          break; 
        }

        for (let i = 0; i < frames.length - 1; i++) {
          if (!isMountedRef.current) break;
          const fA = frames[i];
          const fB = frames[i + 1];
          const elsA = fA.elements || fA.elementos || [];
          const elsB = fB.elements || fB.elementos || [];
          const arrsA = fA.arrows || fA.lineas || [];

          await new Promise(resolve => {
            let startTime = null;
            const animate = (timestamp) => {
              if (!isMountedRef.current) return resolve();
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / DURATION, 1);
              const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              const interpolated = elsA.map(elA => {
                const elB = elsB.find(b => b.id === elA.id);
                if (!elB) return elA;
                /* El recorrido curvo lo lleva la ficha en el fotograma de
                   destino. Sin él, la recta de siempre. */
                const q = puntoEnTrayecto(elA, elB, elB.bow, ease);
                return {
                  ...elA,
                  x: q.x,
                  y: q.y,
                  rotation: (elA.rotation||0) + ((elB.rotation||0) - (elA.rotation||0)) * ease,
                };
              });
              
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.clearRect(0, 0, cvSize.w, cvSize.h);
              ctx.scale(cvSize.w / BASE_W, cvSize.h / baseH);
              
              renderPitch(ctx, BASE_W, baseH, pitchCfg);
              renderElements(ctx, interpolated, arrsA, BASE_W);

              if (progress < 1) animId = requestAnimationFrame(animate);
              else resolve();
            };
            animId = requestAnimationFrame(animate);
          });

          if (!isMountedRef.current) break;
          await new Promise(res => setTimeout(res, PAUSE));
        }
        await new Promise(res => setTimeout(res, 1000));
      }
    };

    playLoop();
    return () => { isMountedRef.current = false; cancelAnimationFrame(animId); };
  }, [frames, cvSize, pitchCfg]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#0a0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <canvas 
        ref={canvasRef} 
        width={cvSize.w} 
        height={cvSize.h} 
        style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
      />
      {frames.length > 1 && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
          ▶ ANIMACIÓN
        </div>
      )}
    </div>
  );
};

// =======================================================
// COMPONENTE PRINCIPAL BANCO DE TAREAS
// =======================================================
const BancoTareas = () => {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  const esMovil = useEsMovil();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  
  const [tareaSeleccionada, setTareaSeleccionada] = useState(null);
  
  // MODAL CREAR TAREA
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  
  const [categoriasClub, setCategoriasClub] = useState([]);
  const { perfil } = useAuth();
  
  const [nuevaTarea, setNuevaTarea] = useState({
    titulo: '',
    categoria_recomendada: 'Todas',
    categoria_ejercicio: 'Táctico',
    fase_juego: 'Ataque',
    subfase_juego: '',
    formato_tarea: 'Reducido',
    duracion_estimada: 15,
    intensidad_rpe: 6,
    jugadores_involucrados: '',
    objetivo_principal: '',
    descripcion: '',
    video_url: '',
  });

  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    cargarTareas();
    cargarCategoriasClub();
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

  const cargarCategoriasClub = async () => {
    try {
      const club_id = localStorage.getItem('club_id') || 'club_default';
      if (club_id === 'club_default') return;
      const { data } = await supabase.from('jugadores').select('categoria').eq('club_id', club_id);
      if (data) {
        const unicas = [...new Set(data.map(j => j.categoria).filter(Boolean))].sort();
        setCategoriasClub(unicas);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const misCategorias = perfil?.categorias_asignadas || [];
  const categoriasDisponibles = [...new Set([...misCategorias, ...categoriasClub])].sort();

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

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'video/mp4' && file.type !== 'video/webm') {
        showToast("Solo se permiten archivos MP4 o WebM cortos.", "warning");
        return;
      }
      if (file.size > 20 * 1024 * 1024) { // 20 MB max
        showToast("El video es muy pesado. Máximo 20MB.", "warning");
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const guardarNuevaTarea = async () => {
    if (!nuevaTarea.titulo.trim()) { showToast("Poné un nombre a la tarea antes de guardar.", "warning"); return; }
    
    setIsUploading(true);
    const club_id = localStorage.getItem('club_id') || 'club_default';
    let url_video_mp4 = null;

    try {
      if (videoFile) {
        const fileExt = videoFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        // Asume que tenés un bucket público llamado 'videos_tareas'
        const { error: uploadError } = await supabase.storage.from('videos_tareas').upload(fileName, videoFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('videos_tareas').getPublicUrl(fileName);
        url_video_mp4 = publicUrl;
      }

      const payload = {
        club_id,
        titulo: nuevaTarea.titulo,
        categoria_recomendada: nuevaTarea.categoria_recomendada,
        categoria_ejercicio: nuevaTarea.categoria_ejercicio,
        fase_juego: nuevaTarea.fase_juego,
        subfase_juego: nuevaTarea.subfase_juego || null,
        formato_tarea: nuevaTarea.formato_tarea,
        duracion_estimada: parseInt(nuevaTarea.duracion_estimada) || 0,
        intensidad_rpe: parseInt(nuevaTarea.intensidad_rpe) || 0,
        jugadores_involucrados: nuevaTarea.jugadores_involucrados,
        objetivo_principal: nuevaTarea.objetivo_principal,
        descripcion: nuevaTarea.descripcion,
        video_url: nuevaTarea.video_url, // Link externo de Youtube
        video_mp4_url: url_video_mp4, // El video nativo subido
      };

      const { data, error } = await supabase.from('tareas').insert([payload]).select().single();
      if (error) throw error;

      showToast("¡Tarea guardada exitosamente!", "success");
      setTareas([data, ...tareas]);
      setShowCrearModal(false);
      setVideoFile(null);
      setVideoPreview(null);
      setNuevaTarea({ ...nuevaTarea, titulo: '', descripcion: '', objetivo_principal: '' });
      
    } catch (err) {
      showToast("Error al guardar: " + err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const getColoresCategoria = (categoria) => {
    switch (categoria) {
      case 'Táctico': return { bg: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', border: '#3b82f6', text: '#bfdbfe' };
      case 'Físico': return { bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)', border: '#ef4444', text: '#fecaca' };
      case 'Técnico': return { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', border: '#10b981', text: '#a7f3d0' };
      case 'Cognitivo': return { bg: 'linear-gradient(135deg, #4c1d95 0%, #2e1065 100%)', border: '#8b5cf6', text: '#ddd6fe' };
      case 'Libro Táctico': return { bg: 'linear-gradient(135deg, #164e63 0%, #083344 100%)', border: '#22d3ee', text: '#a5f3fc' };
      case 'ABP': return { bg: 'linear-gradient(135deg, #78350f 0%, #451a03 100%)', border: '#f59e0b', text: '#fde68a' };
      default: return { bg: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', border: '#4b5563', text: '#d1d5db' };
    }
  };

  const tareasFiltradas = tareas.filter(t => pasaFiltros(t, filtros));

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
          /* Antes eran 260px clavados y en el celular quedaban cortadas.
             Ahora la carta se estira hasta el ancho disponible. */
          width: '100%',
          maxWidth: '280px',
          height: esMovil ? '340px' : '380px',
          padding: esMovil ? '12px' : '15px',
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
            <span style={{ fontSize: '1.8rem', fontWeight: '900', color: '#ffffff', lineHeight: '1' }}>{carga}</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: colores.text, textTransform: 'uppercase', letterSpacing: '1px' }}>Carga UC</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '900', color: colores.border, textTransform: 'uppercase', display: 'block' }}>{tarea.categoria_ejercicio}</span>
            <span style={{ fontSize: '0.6rem', color: colorFase(leerFase(tarea).fase) }}>{etiquetaFase(tarea) || '—'}</span>
          </div>
        </div>

        <div style={{ flex: 1, background: '#0a0b0f', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${colores.border}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {tarea.video_mp4_url ? (
            <video src={tarea.video_mp4_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline autoPlay />
          ) : tarea.url_grafico ? (
            <img src={tarea.url_grafico} alt="Gráfico Tarea" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '3rem' }}>{getIconoTarea(tarea)}</span>
          )}
          {tarea.formato_tarea && (
            <div style={{ position: 'absolute', top: '5px', left: '5px', background: 'rgba(8,145,178,0.85)', border: '1px solid #22d3ee', color: '#ffffff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
              {etiquetaFormato(tarea.formato_tarea)}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: '5px', right: '5px', background: 'rgba(0,0,0,0.8)', border: `1px solid ${colores.border}`, color: '#ffffff', fontSize: '0.6rem', fontWeight: '900', padding: '3px 6px', borderRadius: '4px' }}>
            {tarea.jugadores_involucrados || 'Grupal'}
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '12px 0', borderBottom: `1px solid ${colores.border}40`, paddingBottom: '8px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tarea.titulo}
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px', textAlign: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }}>{tarea.duracion_estimada}'</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>MINS</span>
          </div>
          <div style={{ borderLeft: `1px solid ${colores.border}40`, borderRight: `1px solid ${colores.border}40` }}>
            <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '900', color: '#ffffff' }}>{tarea.intensidad_rpe}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>RPE</span>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: '900', color: '#ffffff', marginTop: '3px' }}>{tarea.espacio?.replace('_', ' ')}</span>
            <span style={{ fontSize: '0.6rem', color: colores.text, fontWeight: 'bold' }}>ZONA</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1200px', margin: '0 auto', padding: esMovil ? '0 10px 80px' : undefined, animation: 'fadeIn 0.3s' }}>
      
      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', background: 'var(--panel)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="stat-label" style={{ color: 'var(--accent)', fontSize: esMovil ? '1.15rem' : '1.5rem', margin: 0 }}>
              🗃️ BANCO DE TAREAS
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {tareasFiltradas.length} de {tareas.length} ejercicios
            </p>
          </div>

          <button onClick={() => setShowCrearModal(true)} style={{
            background: 'var(--accent)', color: '#000', padding: esMovil ? '12px 16px' : '12px 20px',
            borderRadius: '8px', border: 'none', fontWeight: '900', cursor: 'pointer',
            fontSize: '0.85rem', boxShadow: '0 4px 15px rgba(0,255,136,0.3)',
            flex: esMovil ? '1 1 100%' : '0 0 auto',
          }}>
            + NUEVA TAREA
          </button>
        </div>

        <FiltrosTareas valores={filtros} onCambiar={setFiltros} compacto={esMovil} />
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--accent)' }}>Cargando el playbook... ⚽</div>
      ) : tareasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', background: 'var(--hover)', borderRadius: '15px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
          <h3 style={{ color: 'var(--text)', margin: 0 }}>No hay tareas aún.</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Creá tu primer ejercicio en el Creador o subí un video para empezar.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))',
          gap: esMovil ? '14px' : '25px',
          justifyItems: 'center',
        }}>
          {tareasFiltradas.map(tarea => (
            <CartaFUT key={tarea.id} tarea={tarea} />
          ))}
        </div>
      )}

      {/* MODAL: CREAR TAREA (VIDEO O CREADOR) */}
      {showCrearModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--panel)', width: '100%', maxWidth: '800px', borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--accent)', borderRadius: '12px', padding: esMovil ? '18px' : '28px', maxHeight: '95vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '15px' }}>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.4rem', textTransform: 'uppercase' }}>Subir Nueva Tarea Rápida</h2>
              <button onClick={() => {setShowCrearModal(false); setVideoFile(null); setVideoPreview(null);}} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '1.5rem', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>✖</button>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
              <button onClick={() => navigate('/creador-tareas')} style={{ flex: 1, padding: '15px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--info)', borderRadius: '8px', color: 'var(--info)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '5px' }}>🎨</span>
                Abrir Creador Táctico
              </button>
              
              <label style={{ flex: 1, padding: '15px', background: 'rgba(0, 255, 136, 0.1)', border: '1px dashed var(--accent)', borderRadius: '8px', color: 'var(--accent)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '5px' }}>📁</span>
                {videoFile ? 'Cambiar Video MP4' : 'Subir Video MP4 (Corto)'}
                <input type="file" accept="video/mp4,video/webm" style={{ display: 'none' }} onChange={handleVideoChange} />
              </label>
            </div>

            {videoPreview && (
              <div style={{ marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border)', width: '100%', aspectRatio: '16/9', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
                <video src={videoPreview} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label className="campo-rotulo" style={{ color: 'var(--accent)' }}>Nombre de la Tarea *</label>
              <input type="text" className="campo" style={{ borderColor: 'var(--accent)' }} placeholder="Ej: Rondo 4v2 con finalización..." value={nuevaTarea.titulo} onChange={e => setNuevaTarea({...nuevaTarea, titulo: e.target.value})} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
              <div>
                <label className="campo-rotulo" style={{ color: 'var(--amarillo)' }}>Categoría Recomendada</label>
                <select className="campo" style={{ borderColor: '#ca8a04' }} value={nuevaTarea.categoria_recomendada} onChange={e => setNuevaTarea({...nuevaTarea, categoria_recomendada: e.target.value})}>
                  <option value="Todas">Todas las Categorías</option>
                  {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Naturaleza · Contenido</label>
                <select className="campo" value={nuevaTarea.categoria_ejercicio} onChange={e => setNuevaTarea({...nuevaTarea, categoria_ejercicio: e.target.value})}>
                  {NATURALEZAS.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Fase del Juego</label>
                <select className="campo" value={nuevaTarea.fase_juego} onChange={e => setNuevaTarea({...nuevaTarea, fase_juego: e.target.value, subfase_juego: ''})}>
                  {FASES.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Situación</label>
                <select className="campo"
                        value={nuevaTarea.subfase_juego}
                        onChange={e => setNuevaTarea({...nuevaTarea, subfase_juego: e.target.value})}>
                  <option value="">— sin especificar —</option>
                  {subfasesDe(nuevaTarea.fase_juego).map(v=><option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo" style={{ color: 'var(--frio)' }}>Formato de Tarea</label>
                <select className="campo campo-frio" value={nuevaTarea.formato_tarea} onChange={e => setNuevaTarea({...nuevaTarea, formato_tarea: e.target.value})}>
                  {FORMATOS.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="campo-rotulo">Duración (min)</label>
                <input type="number" className="campo" value={nuevaTarea.duracion_estimada} onChange={e => setNuevaTarea({...nuevaTarea, duracion_estimada: e.target.value})} />
              </div>
              <div>
                <label className="campo-rotulo">Intensidad RPE</label>
                <input type="number" min="1" max="10" className="campo" value={nuevaTarea.intensidad_rpe} onChange={e => setNuevaTarea({...nuevaTarea, intensidad_rpe: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="campo-rotulo">Objetivo Principal</label>
                <input type="text" className="campo" value={nuevaTarea.objetivo_principal} onChange={e => setNuevaTarea({...nuevaTarea, objetivo_principal: e.target.value})} />
              </div>
            </div>

            <div style={{ marginBottom: 15 }}>
              <label className="campo-rotulo">Reglas y Desarrollo</label>
              <textarea rows={3} className="campo" value={nuevaTarea.descripcion} onChange={e => setNuevaTarea({...nuevaTarea, descripcion: e.target.value})}/>
            </div>

            <button onClick={guardarNuevaTarea} disabled={isUploading} style={{ width: '100%', padding: 15, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontSize: '1.1rem', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.7 : 1 }}>
              {isUploading ? '⏳ SUBIENDO VIDEO Y GUARDANDO...' : '💾 GUARDAR EN EL BANCO'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE DE LA TAREA */}
      {tareaSeleccionada && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: 'var(--panel)', width: '100%', maxWidth: '900px', border: `2px solid ${getColoresCategoria(tareaSeleccionada.categoria_ejercicio).border}`, padding: '0', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px', background: getColoresCategoria(tareaSeleccionada.categoria_ejercicio).bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text)', background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {tareaSeleccionada.categoria_ejercicio} • {tareaSeleccionada.fase_juego}{tareaSeleccionada.formato_tarea ? ` • ${tareaSeleccionada.formato_tarea}` : ''}
                </span>
                <h2 style={{ margin: '10px 0 0 0', color: 'var(--text)', fontSize: '1.8rem', textTransform: 'uppercase', fontWeight: '900' }}>
                  {tareaSeleccionada.titulo}
                </h2>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 'bold' }}>{tareaSeleccionada.objetivo_principal}</span>
              </div>
              <button onClick={() => setTareaSeleccionada(null)} style={{ background: 'rgba(0,0,0,0.5)', border: 'none', color: 'var(--text)', width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✖</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '20px' }}>
              <div style={{ flex: '1 1 500px', padding: '20px', borderRight: '1px solid var(--border)' }}>
                
                <div style={{ background: '#000', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {tareaSeleccionada.video_mp4_url ? (
                    <video src={tareaSeleccionada.video_mp4_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : tareaSeleccionada.categoria_ejercicio === 'Físico' && tareaSeleccionada.editor_data?.tipo === 'rutina_fisica' ? (
                    <RenderRutinaFisica data={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.editor_data?.frames?.length > 0 ? (
                    <ReproductorLoop editorData={tareaSeleccionada.editor_data} />
                  ) : tareaSeleccionada.url_grafico ? (
                    <img src={tareaSeleccionada.url_grafico} alt="Gráfico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: '4rem' }}>{getIconoTarea(tareaSeleccionada)}</span>
                  )}
                </div>
                {tareaSeleccionada.video_url && (
                  <div style={{ marginTop: '15px' }}>
                    <a href={tareaSeleccionada.video_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#2563eb', color: '#ffffff', textAlign: 'center', padding: '12px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
                      ▶️ VER VIDEO DE REFERENCIA
                    </a>
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 300px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>DURACIÓN</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text)' }}>{tareaSeleccionada.duracion_estimada}'</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>RPE (INTENSIDAD)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: tareaSeleccionada.intensidad_rpe > 7 ? '#ef4444' : '#eab308' }}>{tareaSeleccionada.intensidad_rpe}/10</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>CARGA (UC)</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{(tareaSeleccionada.duracion_estimada || 0) * (tareaSeleccionada.intensidad_rpe || 0)}</span>
                  </div>
                  <div style={{ background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>JUGADORES</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text)' }}>{tareaSeleccionada.jugadores_involucrados}</span>
                  </div>
                </div>

                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.85rem' }}>Reglas y Desarrollo:</h4>
                  <div style={{ background: 'var(--bg)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                    {tareaSeleccionada.descripcion || "Sin descripción detallada."}
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => eliminarTarea(tareaSeleccionada.id)}
                    style={{ flex: 1, background: 'var(--peligro)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    🗑️ ELIMINAR
                  </button>

                  <button
                    onClick={() => navigate(tareaSeleccionada.categoria_ejercicio === 'Físico' ? '/creador-fisico' : '/creador-tareas', { state: { editando: tareaSeleccionada } })}
                    style={{ flex: 2, background: 'var(--accent)', border: 'none', color: '#000', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: '10px' }}
                  >
                    ✏️ Editar {tareaSeleccionada.categoria_ejercicio === 'Físico' ? 'Rutina' : 'en Pizarra'}
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

export default BancoTareas;