import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group, Line, Transformer, Path } from 'react-konva';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

const CreadorTareas = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const tareaAEditar = location.state?.editando;
  const [tareaIdEditando, setTareaIdEditando] = useState(tareaAEditar?.id || null);

  const [frames, setFrames] = useState([
    { id: 'frame-0', elementos: [], lineas: [] }
  ]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  const isPlayingRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animElements, setAnimElements] = useState(null);

  const [elementos, setElementos] = useState([]);
  const [lineas, setLineas] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [herramientaSeleccionada, setHerramientaSeleccionada] = useState(null);
  const [modoAccion, setModoAccion] = useState('mover');
  
  const [dibujoConfig, setDibujoConfig] = useState({
    color: '#ffffff', tipoTrazo: 'continua', grosor: 3, transparencia: 1.0, topeFinal: 'triangulo'
  });

  const [canchaConfig, setCanchaConfig] = useState({ tamaño: '40x20', color: '#064e3b' });
  const [nombreTarea, setNombreTarea] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  
  // --- ESTADO DE LA FICHA TÉCNICA ---
  const [fichaTecnica, setFichaTecnica] = useState({
    categoria_ejercicio: 'Táctico', fase_juego: 'Ataque Posicional', duracion_estimada: 15,
    intensidad_rpe: 6, jugadores_involucrados: '4v4', objetivo_principal: '', descripcion: '', video_url: ''
  });

  const stageRef = useRef(null);
  const trRef = useRef(null);
  const isDrawing = useRef(false);

  const containerRef = useRef(null);
  const [stageSize, setStageSize] = useState({ containerW: 900, containerH: 500, scale: 1 });

  const getDimensionesLógicas = () => {
    switch (canchaConfig.tamaño) {
      case '20x20_mitad': return { w: 500, h: 500 };
      case '20x20_central': return { w: 500, h: 500 };
      case '28x20': return { w: 700, h: 500 };
      default: return { w: 900, h: 500 }; 
    }
  };
  const logicalSize = getDimensionesLógicas();

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerW = containerRef.current.clientWidth;
        const containerH = containerRef.current.clientHeight;
        const scale = Math.min(containerW / logicalSize.w, containerH / logicalSize.h) * 0.95;
        setStageSize({ containerW, containerH, scale });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [canchaConfig.tamaño, logicalSize.w, logicalSize.h]);

  useEffect(() => {
    if (tareaAEditar) {
      setNombreTarea(tareaAEditar.titulo);
      if (tareaAEditar.editor_data) {
        setCanchaConfig(tareaAEditar.editor_data.cancha || { tamaño: '40x20', color: '#064e3b' });
        
        let loadedFrames = [];
        if (tareaAEditar.editor_data.frames && tareaAEditar.editor_data.frames.length > 0) {
           loadedFrames = tareaAEditar.editor_data.frames;
        } else {
           loadedFrames = [{
             id: 'frame-0',
             elementos: tareaAEditar.editor_data.elementos || [],
             lineas: tareaAEditar.editor_data.lineas || []
           }];
        }
        setFrames(loadedFrames);
        setElementos(loadedFrames[0].elementos || []);
        setLineas(loadedFrames[0].lineas || []);
      }
      setFichaTecnica({...tareaAEditar});
    }
  }, [tareaAEditar]);

  const togglePlay = async () => {
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      setAnimElements(null);
      return;
    }

    if (frames.length < 2) return showToast("Necesitás al menos 2 fotogramas para reproducir una jugada.", "warning");

    isPlayingRef.current = true;
    setIsPlaying(true);
    setSelectedId(null);
    setModoAccion('mover');

    const DURATION = 800; 
    const PAUSE = 400; 

    for (let i = 0; i < frames.length - 1; i++) {
      if (!isPlayingRef.current) break;

      setCurrentFrameIdx(i);
      const frameA = frames[i];
      const frameB = frames[i + 1];
      
      setLineas(frameA.lineas || []);

      await new Promise(resolve => {
        let startTime = null;
        const animate = (timestamp) => {
          if (!isPlayingRef.current) return resolve();
          if (!startTime) startTime = timestamp;
          
          const elapsed = timestamp - startTime;
          let progress = elapsed / DURATION;
          if (progress > 1) progress = 1;

          const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          const interpolatedElements = (frameA.elementos || []).map(elA => {
            const elB = (frameB.elementos || []).find(b => b.id === elA.id);
            if (!elB) return elA; 

            return {
              ...elA,
              x: elA.x + (elB.x - elA.x) * ease,
              y: elA.y + (elB.y - elA.y) * ease,
              rotation: elA.rotation + (elB.rotation - elA.rotation) * ease,
              scaleX: elA.scaleX + ((elB.scaleX || 1) - (elA.scaleX || 1)) * ease,
              scaleY: elA.scaleY + ((elB.scaleY || 1) - (elA.scaleY || 1)) * ease,
            };
          });

          const nuevosElements = (frameB.elementos || []).filter(b => !(frameA.elementos || []).find(a => a.id === b.id));

          setAnimElements([...interpolatedElements, ...(progress > 0.8 ? nuevosElements : [])]);

          if (progress < 1) {
            requestAnimationFrame(animate); 
          } else {
            resolve(); 
          }
        };
        requestAnimationFrame(animate); 
      });

      if (!isPlayingRef.current) break;
      
      setCurrentFrameIdx(i + 1);
      setLineas(frameB.lineas || []);
      setAnimElements(frameB.elementos || []);
      
      await new Promise(res => setTimeout(res, PAUSE));
    }

    isPlayingRef.current = false;
    setIsPlaying(false);
    setAnimElements(null);
    setElementos(frames[frames.length - 1].elementos || []);
  };

  const cambiarFrame = (newIdx) => {
    if (isPlaying) return; 
    const newFrames = [...frames];
    newFrames[currentFrameIdx] = { ...newFrames[currentFrameIdx], elementos, lineas };
    setFrames(newFrames);

    setElementos(newFrames[newIdx].elementos || []);
    setLineas(newFrames[newIdx].lineas || []);
    setCurrentFrameIdx(newIdx);
    setSelectedId(null);
  };

  const agregarFrameVacio = () => {
    if (isPlaying) return;
    const newFramesArray = [...frames];
    newFramesArray[currentFrameIdx] = { ...newFramesArray[currentFrameIdx], elementos, lineas };
    newFramesArray.push({ id: `frame-${Date.now()}`, elementos: [], lineas: [] });
    
    setFrames(newFramesArray);
    setElementos([]);
    setLineas([]);
    setCurrentFrameIdx(newFramesArray.length - 1);
  };

  const duplicarFrameActual = () => {
    if (isPlaying) return;
    const newFramesArray = [...frames];
    newFramesArray[currentFrameIdx] = { ...newFramesArray[currentFrameIdx], elementos, lineas };
    
    const newFrame = { 
      id: `frame-${Date.now()}`, 
      elementos: JSON.parse(JSON.stringify(elementos)), 
      lineas: JSON.parse(JSON.stringify(lineas)) 
    };
    
    newFramesArray.splice(currentFrameIdx + 1, 0, newFrame);
    setFrames(newFramesArray);
    setCurrentFrameIdx(currentFrameIdx + 1);
  };

  const eliminarFrame = (idx) => {
    if (isPlaying) return;
    if (frames.length <= 1) return showToast("No podés borrar el único fotograma.", "warning");
    if (!window.confirm("¿Seguro que querés borrar este fotograma?")) return;

    const newFrames = frames.filter((_, index) => index !== idx);
    setFrames(newFrames);
    
    const newIdx = currentFrameIdx >= newFrames.length ? newFrames.length - 1 : currentFrameIdx;
    setElementos(newFrames[newIdx].elementos || []);
    setLineas(newFrames[newIdx].lineas || []);
    setCurrentFrameIdx(newIdx);
  };

  const herramientas = [
    { id: 'j_rojo', tipo: 'jugador', color: '#ef4444', texto: '', label: 'Jugador Rojo', radio: 18 },
    { id: 'j_azul', tipo: 'jugador', color: '#3b82f6', texto: '', label: 'Jugador Azul', radio: 18 },
    { id: 'j_verde', tipo: 'jugador', color: '#22c55e', texto: '', label: 'Jugador Verde', radio: 18 },
    { id: 'j_rosa', tipo: 'jugador', color: '#ec4899', texto: '', label: 'Jugador Rosa', radio: 18 },
    { id: 'arq_ama', tipo: 'arquero', color: '#eab308', texto: 'A', label: 'Arquero Amarillo', radio: 20 },
    { id: 'arq_vio', tipo: 'arquero', color: '#a855f7', texto: 'A', label: 'Arquero Violeta', radio: 20 },
    { id: 'staff', tipo: 'staff', color: '#111', texto: 'DT', label: 'Staff Técnico', radio: 18 },
    { id: 'pelota', tipo: 'pelota', label: 'Pelota', radio: 8 },
    { id: 'cono_alto', tipo: 'cono_alto', color: '#f97316', label: 'Cono Alto', radio: 8 },
    { id: 'cono_plato', tipo: 'cono_plato', color: '#facc15', label: 'Cono Plato', radio: 8 },
    { id: 'valla', tipo: 'valla', color: '#fbbf24', label: 'Valla', w: 40, h: 10 },
    { id: 'escalera', tipo: 'escalera', color: '#94a3b8', label: 'Escalera', w: 100, h: 25 },
    { id: 'mini_arco', tipo: 'mini_arco', color: '#fff', label: 'Mini Arco', w: 40, h: 20 },
    { id: 'arco_fijo', tipo: 'arco', color: '#fff', label: 'Arco Móvil', w: 80, h: 30 },
  ];

  useEffect(() => {
    if (trRef.current) {
      if (selectedId) {
        const node = stageRef.current.findOne('#' + selectedId);
        if (node) { trRef.current.nodes([node]); trRef.current.getLayer().batchDraw(); }
      } else {
        trRef.current.nodes([]);
      }
    }
  }, [selectedId, elementos, lineas]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlaying) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !mostrarModal) {
        setElementos(prev => prev.filter(el => el.id !== selectedId));
        setLineas(prev => prev.filter(li => li.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, mostrarModal, isPlaying]);

  const deshacerUltimoTrazo = () => { if (!isPlaying && lineas.length > 0) setLineas(prev => prev.slice(0, -1)); };

  const getLogicalPointerPos = () => {
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert(); 
    return transform.point(pointerPos);
  };

  const handleStageMouseDown = (e) => {
    if (isPlaying) return; 
    if (e.target.getParent()?.className === 'Transformer') return;
    const isBackground = e.target.name() === 'fondo_cancha' || e.target === e.target.getStage();

    if (isBackground) {
      setSelectedId(null);
      const pos = getLogicalPointerPos(); 

      if (modoAccion === 'mover' && herramientaSeleccionada) {
        const nuevoElemento = { ...herramientaSeleccionada, id: 'el-' + Date.now(), x: pos.x, y: pos.y, rotation: 0, scaleX: 1, scaleY: 1 };
        setElementos([...elementos, nuevoElemento]);
      } 
      else if (modoAccion !== 'mover') {
        isDrawing.current = true;
        const nuevaLinea = {
          id: 'li-' + Date.now(),
          tipoTool: modoAccion,
          puntos: [pos.x, pos.y, pos.x, pos.y],
          ...dibujoConfig
        };
        setLineas([...lineas, nuevaLinea]);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (isPlaying || !isDrawing.current || modoAccion === 'mover') return;
    const pos = getLogicalPointerPos(); 
    
    setLineas(prev => {
      const nuevasLineas = [...prev];
      const ultima = { ...nuevasLineas[nuevasLineas.length - 1] };
      
      if (modoAccion === 'dibujar_conduccion') {
        ultima.puntos = [...ultima.puntos, pos.x, pos.y];
      } else {
        ultima.puntos = [ultima.puntos[0], ultima.puntos[1], pos.x, pos.y]; 
      }
      nuevasLineas[nuevasLineas.length - 1] = ultima;
      return nuevasLineas;
    });
  };

  const handleMouseUp = () => { isDrawing.current = false; };

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
      case 'pelota': return (<Group><Circle radius={el.radio} fill="#fff" stroke="#000" strokeWidth={1.5} /><Circle radius={el.radio * 0.4} fill="#000" /><Line points={[0, -(el.radio*0.4), 0, -el.radio]} stroke="#000" strokeWidth={1} /><Line points={[-(el.radio*0.3), (el.radio*0.3), -(el.radio*0.7), (el.radio*0.7)]} stroke="#000" strokeWidth={1} /><Line points={[(el.radio*0.3), (el.radio*0.3), (el.radio*0.7), (el.radio*0.7)]} stroke="#000" strokeWidth={1} /></Group>);
      case 'cono_alto': return (<Group><Circle radius={el.radio + 2} fill="rgba(0,0,0,0.3)" x={2} y={2} /><Circle radius={el.radio} fill={el.color} stroke="#c2410c" strokeWidth={1} /><Circle radius={el.radio * 0.4} fill="#fff" opacity={0.8} /></Group>);
      case 'cono_plato': return (<Group><Circle radius={el.radio} fill={el.color} stroke="#ca8a04" strokeWidth={1} /><Circle radius={el.radio * 0.3} fill={canchaConfig.color} stroke="rgba(0,0,0,0.2)" strokeWidth={1} /></Group>);
      case 'valla': return (<Group x={-el.w/2} y={-el.h/2}><Rect x={2} y={0} width={4} height={el.h} fill="#333" /><Rect x={el.w - 6} y={0} width={4} height={el.h} fill="#333" /><Rect x={0} y={el.h/2 - 2} width={el.w} height={4} fill={el.color} stroke="#000" strokeWidth={0.5} /></Group>);
      case 'escalera': const rungs = []; const rungCount = 6; const rungSpacing = el.w / rungCount; for(let i = 0; i <= rungCount; i++) { rungs.push(<Rect key={i} x={i * rungSpacing - 1} y={0} width={2} height={el.h} fill="#facc15" />); } return (<Group x={-el.w/2} y={-el.h/2}><Rect x={0} y={0} width={el.w} height={2} fill={el.color} /><Rect x={0} y={el.h - 2} width={el.w} height={2} fill={el.color} />{rungs}</Group>);
      case 'arco': case 'mini_arco': return (<Group x={-el.w/2} y={-el.h/2}><Path data={`M 0 0 L ${el.w} 0 L ${el.w - 5} ${el.h} L 5 ${el.h} Z`} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" strokeWidth={1} dash={[2, 2]} /><Rect x={0} y={0} width={el.w} height={3} fill="#fff" stroke="#999" strokeWidth={0.5} /><Rect x={0} y={0} width={3} height={el.h} fill="#fff" stroke="#999" strokeWidth={0.5} /><Rect x={el.w - 3} y={0} width={3} height={el.h} fill="#fff" stroke="#999" strokeWidth={0.5} /></Group>);
      default: return <Rect width={el.w} height={el.h} fill={el.color} stroke="#000" strokeWidth={1} x={-el.w/2} y={-el.h/2} />;
    }
  };

  const DibujoCancha = () => {
    const stroke = "rgba(255,255,255,0.7)"; const sw = 3; const midX = logicalSize.w / 2; const midY = logicalSize.h / 2; const padding = 20; const t = canchaConfig.tamaño;
    return (<Group><Rect name="fondo_cancha" width={logicalSize.w} height={logicalSize.h} fill={canchaConfig.color} /><Rect name="fondo_cancha" x={padding} y={padding} width={logicalSize.w - padding * 2} height={logicalSize.h - padding * 2} stroke={stroke} strokeWidth={sw} cornerRadius={5} />{(t === '40x20' || t === '28x20' || t === '20x20_central') && (<Group><Line name="fondo_cancha" points={[midX, padding, midX, logicalSize.h - padding]} stroke={stroke} strokeWidth={sw} /><Circle name="fondo_cancha" x={midX} y={midY} radius={70} stroke={stroke} strokeWidth={sw} /><Circle name="fondo_cancha" x={midX} y={midY} radius={4} fill={stroke} /></Group>)}{t !== '20x20_central' && (<Group><Rect name="fondo_cancha" x={padding} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[0, 70, 70, 0]} /><Circle name="fondo_cancha" x={padding + 80} y={midY} radius={4} fill={stroke} />{(t === '40x20' || t === '28x20') && (<Group><Rect name="fondo_cancha" x={logicalSize.w - padding - 100} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[70, 0, 0, 70]} /><Circle name="fondo_cancha" x={logicalSize.w - padding - 80} y={midY} radius={4} fill={stroke} /></Group>)}</Group>)}</Group>);
  };

  const renderIconoHerramienta = (h) => {
    switch (h.tipo) {
      case 'jugador': case 'arquero': case 'staff': return (<svg width="24" height="24" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5)', borderRadius: '4px' }}><path d="M 80 10 A 40 40 0 0 0 80 70 L 65 65 A 25 25 0 0 1 65 15 Z M 84 40 A 10 10 0 1 1 50 40 A 10 10 0 1 1 84 40" fill={h.color} stroke="black" strokeWidth="3" /></svg>);
      case 'pelota': return <span style={{ fontSize: '1.2rem' }}>⚽</span>;
      case 'cono_alto': return <div style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '16px solid #f97316' }}></div>;
      case 'cono_plato': return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '4px solid #facc15' }}></div>;
      case 'valla': return <div style={{ width: '24px', height: '14px', borderLeft: '3px solid #666', borderRight: '3px solid #666', borderTop: '4px solid #fbbf24' }}></div>;
      case 'escalera': return <div style={{ width: '12px', height: '24px', background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, #facc15 3px, #facc15 5px)', borderLeft: '2px solid #94a3b8', borderRight: '2px solid #94a3b8' }}></div>;
      case 'mini_arco': case 'arco': return <div style={{ width: '26px', height: '14px', borderTop: '2px solid #fff', borderLeft: '2px solid #fff', borderRight: '2px solid #fff', background: 'rgba(255,255,255,0.2)' }}></div>;
      default: return null;
    }
  };

  const RenderLineaCustom = ({ li }) => {
    const isRecta = li.tipoTool === 'dibujar_pase';
    const points = li.puntos;
    const dashPattern = li.tipoTrazo === 'punteada' ? [12, 6] : [];
    const len = points.length;
    let angleRad = 0;
    let endX = points[len-2], endY = points[len-1];
    if (len >= 4) { const p1x = points[len-4], p1y = points[len-3]; angleRad = Math.atan2(endY - p1y, endX - p1x); }
    const angleDeg = angleRad * 180 / Math.PI;

    return (
      <Group id={li.id} draggable={modoAccion === 'mover'} onClick={(e) => { e.cancelBubble = true; setSelectedId(li.id); }} onTap={(e) => { e.cancelBubble = true; setSelectedId(li.id); }}>
        <Line points={points} stroke={li.color} strokeWidth={li.grosor} opacity={li.transparencia} dash={dashPattern} lineCap="round" lineJoin="round" tension={isRecta ? 0 : 0.5} />
        {modoAccion !== 'mover' && (
          <Group x={endX} y={endY} rotation={angleDeg} opacity={li.transparencia}>
            {li.topeFinal === 'punto' && (<Circle radius={li.grosor * 2} fill={li.color} stroke="#000" strokeWidth={0.5}/>)}
            {li.topeFinal === 'triangulo' && (<Path data={`M 0 0 L -${li.grosor * 3} -${li.grosor * 1.5} L -${li.grosor * 3} ${li.grosor * 1.5} Z`} fill={li.color} stroke="#000" strokeWidth={0.5} x={0} y={0}/>)}
            {li.topeFinal === 'transversal' && (<Rect width={2} height={li.grosor * 5} fill={li.color} stroke="#000" strokeWidth={0.5} x={-1} y={-(li.grosor * 2.5)}/>)}
          </Group>
        )}
      </Group>
    );
  };

  const confirmarGuardado = async () => {
    if (!nombreTarea) return showToast("Por favor, ponéle un nombre a la tarea arriba a la izquierda.", "warning");
    setSelectedId(null); 
    
    const prevFrame = currentFrameIdx;
    cambiarFrame(0); 

    setTimeout(async () => {
      try {
        const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
        
        const finalFrames = [...frames];
        finalFrames[currentFrameIdx] = { ...finalFrames[currentFrameIdx], elementos, lineas };
        
        const dataVectores = { frames: finalFrames, cancha: canchaConfig };
        const club_id = localStorage.getItem('club_id') || 'club_default';

        const payload = {
          club_id: club_id, 
          titulo: nombreTarea, 
          espacio: canchaConfig.tamaño,
          url_grafico: dataURL, 
          editor_data: dataVectores,
          categoria_ejercicio: fichaTecnica.categoria_ejercicio, 
          fase_juego: fichaTecnica.fase_juego, 
          duracion_estimada: parseInt(fichaTecnica.duracion_estimada) || 0, 
          intensidad_rpe: parseInt(fichaTecnica.intensidad_rpe) || 0,
          jugadores_involucrados: fichaTecnica.jugadores_involucrados, 
          objetivo_principal: fichaTecnica.objetivo_principal, 
          descripcion: fichaTecnica.descripcion, 
          video_url: fichaTecnica.video_url,
        };

        if (tareaIdEditando) {
          const { error } = await supabase.from('tareas').update(payload).eq('id', tareaIdEditando);
          if (error) throw error;
          showToast("¡Tarea ACTUALIZADA con éxito!", "success");
          navigate('/banco-tareas');
        } else {
          const { error } = await supabase.from('tareas').insert([payload]);
          if (error) throw error;
          showToast("¡Nueva Ficha Táctica guardada!", "success");
          setMostrarModal(false);
          setFrames([{ id: 'frame-0', elementos: [], lineas: [] }]);
          setElementos([]); setLineas([]);
          setCurrentFrameIdx(0);
          setNombreTarea('');
        }
      } catch (err) {
        showToast("Error al guardar: " + err.message, "error");
        cambiarFrame(prevFrame);
      }
    }, 300);
  };

  const elementosARenderizar = isPlaying && animElements ? animElements : elementos;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: '15px', color: 'white', padding: '15px', background: '#0a0a0a' }}>
      
      {/* HEADER TÁCTICO */}
      <div className="bento-card" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: '#111', borderBottom: tareaIdEditando ? '2px solid #3b82f6' : '2px solid #333', padding: '10px 15px' }}>
        {tareaIdEditando && (<div style={{ background: '#3b82f6', color: '#fff', padding: '5px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>MODO EDICIÓN</div>)}
        <input placeholder="Ej: Rondo 4v4 + 3 Comodines" value={nombreTarea} onChange={e => setNombreTarea(e.target.value)} disabled={isPlaying} style={inputStyle} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={headerLabelStyle}>Dimensión:</span>
          <select value={canchaConfig.tamaño} onChange={(e) => setCanchaConfig({...canchaConfig, tamaño: e.target.value})} disabled={isPlaying} style={selectStyle}>
            <option value="40x20">Pista 40x20</option><option value="28x20">Reducido 28x20</option><option value="20x20_mitad">Media Pista</option><option value="20x20_central">Zona Central</option>
          </select>
          <span style={headerLabelStyle}>Color:</span>
          <select value={canchaConfig.color} onChange={(e) => setCanchaConfig({...canchaConfig, color: e.target.value})} disabled={isPlaying} style={selectStyle}>
            <option value="#064e3b">Verde Césped</option><option value="#1e3a8a">Azul Sintético</option><option value="#b45309">Madera</option><option value="#334155">Cemento</option>
          </select>
        </div>
        
        <div style={{ flex: 1 }}></div>
        
        <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', gap: '4px', border: '1px solid #222', opacity: isPlaying ? 0.3 : 1, pointerEvents: isPlaying ? 'none' : 'auto' }}>
          <button onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(null); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'mover' && !herramientaSeleccionada ? 'var(--accent)' : 'transparent', color: modoAccion === 'mover' && !herramientaSeleccionada ? '#000' : '#fff'}} title="Mover / Rotar / Borrar">🖐️</button>
          <button onClick={() => {setModoAccion('dibujar_pase'); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'dibujar_pase' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_pase' ? '#000' : '#fff'}} title="Trazar Pase">↗️</button>
          <button onClick={() => {setModoAccion('dibujar_conduccion'); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'dibujar_conduccion' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_conduccion' ? '#000' : '#facc15'}} title="Trazar Conducción">〰️</button>
          <div style={{ width: '1px', background: '#333', margin: '0 5px' }}></div>
          <button onClick={deshacerUltimoTrazo} style={{...modeBtn, color: lineas.length > 0 ? '#fff' : '#555'}} disabled={lineas.length === 0} title="Deshacer último trazo">↩️</button>
        </div>
        
        {(modoAccion === 'dibujar_pase' || modoAccion === 'dibujar_conduccion') && (
          <div className="bento-card" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#1a1a1a', border: '1px solid var(--accent)', padding: '5px 10px', borderRadius: '8px', animation: 'fadeIn 0.2s', opacity: isPlaying ? 0.3 : 1, pointerEvents: isPlaying ? 'none' : 'auto' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>TRAZO:</span>
            <input type="color" value={dibujoConfig.color} onChange={e => setDibujoConfig({...dibujoConfig, color: e.target.value})} style={{...colorInputStyle, border: `2px solid ${dibujoConfig.color}`}} title="Color" />
            <select value={dibujoConfig.tipoTrazo} onChange={e => setDibujoConfig({...dibujoConfig, tipoTrazo: e.target.value})} style={miniSelectStyle} title="Tipo"><option value="continua">Continua</option><option value="punteada">Punteada</option></select>
            <input type="number" min="1" max="10" value={dibujoConfig.grosor} onChange={e => setDibujoConfig({...dibujoConfig, grosor: parseInt(e.target.value)})} style={miniInputStyle} title="Grosor (px)" />
            <input type="number" min="0.1" max="1.0" step="0.1" value={dibujoConfig.transparencia} onChange={e => setDibujoConfig({...dibujoConfig, transparencia: parseFloat(e.target.value)})} style={miniInputStyle} title="Opacidad" />
            <select value={dibujoConfig.topeFinal} onChange={e => setDibujoConfig({...dibujoConfig, topeFinal: e.target.value})} style={miniSelectStyle} title="Final"><option value="ninguno">Ninguno</option><option value="punto">Punto</option><option value="triangulo">Triángulo</option><option value="transversal">T. Transversal</option></select>
          </div>
        )}

        <div style={{ flex: 1, minWidth: '20px' }}></div>
        <button onClick={() => {
            if(!nombreTarea) return showToast("Por favor, ponéle un nombre a la tarea arriba a la izquierda.", "warning");
            setMostrarModal(true);
        }} disabled={isPlaying} className="btn-action" style={{ background: tareaIdEditando ? '#3b82f6' : 'var(--accent)', color: tareaIdEditando ? '#fff' : '#000', padding: '8px 15px', opacity: isPlaying ? 0.5 : 1 }}>{tareaIdEditando ? '💾 ACTUALIZAR' : '💾 GUARDAR'}</button>
      </div>

      {/* ÁREA CENTRAL */}
      <div style={{ display: 'flex', flex: 1, gap: '15px', overflow: 'hidden' }}>
        
        {/* PALETA DE HERRAMIENTAS */}
        <div className="bento-card" style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#111', overflowY:'auto', opacity: isPlaying ? 0.3 : 1, pointerEvents: isPlaying ? 'none' : 'auto' }}>
          <div>
            <span style={labelStyle}>JUGADORES Y STAFF</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
              {herramientas.filter(h => h.tipo === 'jugador' || h.tipo === 'arquero' || h.tipo === 'staff').map(h => (
                <div key={h.id} title={h.label} onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} style={{...iconGridBtn, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #333', background: herramientaSeleccionada?.id === h.id ? 'rgba(0, 255, 136, 0.1)' : '#000'}}>{renderIconoHerramienta(h)}</div>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>MATERIALES</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
              {herramientas.filter(h => h.tipo !== 'jugador' && h.tipo !== 'arquero' && h.tipo !== 'staff').map(h => (
                <div key={h.id} title={h.label} onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} style={{...iconGridBtn, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #333', background: herramientaSeleccionada?.id === h.id ? 'rgba(0, 255, 136, 0.1)' : '#000'}}>{renderIconoHerramienta(h)}</div>
              ))}
            </div>
          </div>
        </div>

        {/* CONTENEDOR DE PIZARRA Y TIMELINE */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
          
          {/* PIZARRA RESPONSIVA */}
          <div ref={containerRef} style={{ flex: 1, background: '#000', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222', position: 'relative' }}>
            <Stage 
              width={stageSize.containerW} 
              height={stageSize.containerH}
              scaleX={stageSize.scale}
              scaleY={stageSize.scale}
              x={(stageSize.containerW - logicalSize.w * stageSize.scale) / 2 || 0}
              y={(stageSize.containerH - logicalSize.h * stageSize.scale) / 2 || 0}
              ref={stageRef}
              onMouseDown={handleStageMouseDown} onTouchStart={handleStageMouseDown}
              onMouseMove={handleMouseMove} onTouchMove={handleMouseMove}
              onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
            >
              <Layer>
                <DibujoCancha />
                {lineas.map(li => <RenderLineaCustom key={li.id} li={li} />)}
                
                {elementosARenderizar.map(el => (
                  <Group 
                    key={el.id} 
                    id={el.id} 
                    x={el.x} 
                    y={el.y} 
                    rotation={el.rotation} 
                    scaleX={el.scaleX} 
                    scaleY={el.scaleY} 
                    draggable={modoAccion === 'mover' && !isPlaying} 
                    onClick={(e) => { e.cancelBubble = true; setSelectedId(el.id); }} 
                    onTap={(e) => { e.cancelBubble = true; setSelectedId(el.id); }} 
                    onDragEnd={(e) => { 
                      setElementos(elementos.map(item => item.id === el.id ? {...item, x: e.target.x(), y: e.target.y()} : item)); 
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      setElementos(elementos.map(item => item.id === el.id ? {
                        ...item, 
                        x: node.x(), 
                        y: node.y(), 
                        rotation: node.rotation(), 
                        scaleX: Math.max(0.1, node.scaleX()), 
                        scaleY: Math.max(0.1, node.scaleY())
                      } : item));
                    }}
                  >
                    <RenderElemento el={el} />
                  </Group>
                ))}

                {!isPlaying && <Transformer ref={trRef} boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox} borderStroke="#00ff88" anchorStroke="#00ff88" anchorFill="#000" anchorSize={8} enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} />}
              </Layer>
            </Stage>
            {selectedId && !mostrarModal && !isPlaying && (
              <div style={{ position:'absolute', bottom: 20, left: 20, background:'rgba(0,0,0,0.9)', padding:'10px 20px', borderRadius:'12px', display: 'flex', alignItems: 'center', gap: '15px', border:'1px solid #333', zIndex: 100 }}>
                <span style={{ fontSize:'0.75rem', fontWeight:'bold', color: 'var(--text-dim)' }}>Objeto seleccionado</span>
                <button onClick={() => { setElementos(prev => prev.filter(el => el.id !== selectedId)); setLineas(prev => prev.filter(li => li.id !== selectedId)); setSelectedId(null); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ ELIMINAR</button>
              </div>
            )}
          </div>

          {/* LÍNEA DE TIEMPO (TIMELINE) CON PLAY */}
          <div className="bento-card" style={{ height: '70px', background: '#111', border: '1px solid #222', display: 'flex', alignItems: 'center', padding: '10px 20px', gap: '15px', overflowX: 'auto' }}>
            <button 
              onClick={togglePlay} 
              style={{
                width: '50px', height: '50px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: isPlaying ? '#ef4444' : 'var(--accent)', 
                color: isPlaying ? '#fff' : '#000', 
                fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isPlaying ? '0 0 15px rgba(239, 68, 68, 0.5)' : '0 0 15px rgba(0, 255, 136, 0.3)',
                transition: '0.3s'
              }}
              title={isPlaying ? "Detener Animación" : "Reproducir Animación"}
            >
              {isPlaying ? '🛑' : '▶'}
            </button>
            <div style={{ width: '1px', height: '30px', background: '#333', margin: '0 5px' }}></div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', opacity: isPlaying ? 0.5 : 1, pointerEvents: isPlaying ? 'none' : 'auto' }}>
              {frames.map((frame, index) => (
                <div key={frame.id} style={{ position: 'relative' }}>
                  <button onClick={() => cambiarFrame(index)} style={{ width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', background: currentFrameIdx === index ? 'var(--accent)' : '#222', border: currentFrameIdx === index ? '2px solid #fff' : '1px solid #444', color: currentFrameIdx === index ? '#000' : '#fff', fontWeight: '900', fontSize: '1rem', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {index + 1}
                  </button>
                  {currentFrameIdx === index && frames.length > 1 && (
                    <button onClick={() => eliminarFrame(index)} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', border: 'none', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Borrar fotograma">✖</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ width: '1px', height: '30px', background: '#333', margin: '0 10px' }}></div>
            <div style={{ display: 'flex', gap: '10px', opacity: isPlaying ? 0.3 : 1, pointerEvents: isPlaying ? 'none' : 'auto' }}>
              <button onClick={duplicarFrameActual} style={{...timelineBtnStyle, background: '#2563eb', color: '#fff'}} title="Duplicar fotograma actual (Mantiene la jugada para seguirla)">
                ⏭️ Continuar Jugada
              </button>
              <button onClick={agregarFrameVacio} style={{...timelineBtnStyle, background: '#333', color: '#fff'}} title="Agregar fotograma en blanco">
                ➕ Frame Vacío
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL FICHA TÉCNICA RECARGADO */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '800px', border: '2px solid var(--accent)', padding: '30px', maxHeight: '95vh', overflowY: 'auto', animation: 'fadeIn 0.2s' }}>
             
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.5rem', textTransform: 'uppercase' }}>
                  {tareaIdEditando ? 'Actualizar Ficha Técnica' : 'Ficha Técnica de la Tarea'}
                </h2>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{nombreTarea} • {canchaConfig.tamaño}</span>
              </div>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✖</button>
            </div>

            {/* FORMULARIO DE FICHA TÉCNICA */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
  
  <div>
    <label style={modalLabel}>Categoría</label>
    <select style={modalInput} value={fichaTecnica.categoria_ejercicio} onChange={e => setFichaTecnica({...fichaTecnica, categoria_ejercicio: e.target.value})}>
      <option value="Táctico">Táctico (General)</option>
      <option value="Libro Táctico">Libro Táctico (Playbook)</option>
      <option value="Técnico">Técnico</option>
      <option value="Físico">Físico</option>
      <option value="Cognitivo">Cognitivo</option>
      <option value="ABP">Pelota Parada (Normal)</option>
    </select>
  </div>
              <div>
                <div>
    <label style={modalLabel}>Situación / Fase</label>
    {fichaTecnica.categoria_ejercicio === 'Libro Táctico' ? (
      <select style={modalInput} value={fichaTecnica.fase_juego} onChange={e => setFichaTecnica({...fichaTecnica, fase_juego: e.target.value})}>
        <option value="Salida de Presión">Salida de Presión</option>
        <option value="Laterales Bajos">Laterales Bajos</option>
        <option value="Laterales Medios">Laterales Medios</option>
        <option value="Laterales Altos">Laterales Altos</option>
        <option value="Corners">Corners</option>
        <option value="Tiros Libres">Tiros Libres</option>
        <option value="5v4">5v4</option>
      </select>
    ) : (
      <select style={modalInput} value={fichaTecnica.fase_juego} onChange={e => setFichaTecnica({...fichaTecnica, fase_juego: e.target.value})}>
        <option value="Ataque Posicional">Ataque Posicional</option>
        <option value="Defensa Posicional">Defensa Posicional</option>
        <option value="Transición Ofensiva">Transición Ofensiva</option>
        <option value="Transición Defensiva">Transición Defensiva</option>
      </select>
    )}
  </div>

                <label style={modalLabel}>Duración Estimada (min)</label>
                <input type="number" style={modalInput} value={fichaTecnica.duracion_estimada} onChange={e => setFichaTecnica({...fichaTecnica, duracion_estimada: e.target.value})} />
              </div>
              <div>
                <label style={modalLabel}>Intensidad RPE (1-10)</label>
                <input type="number" min="1" max="10" style={modalInput} value={fichaTecnica.intensidad_rpe} onChange={e => setFichaTecnica({...fichaTecnica, intensidad_rpe: e.target.value})} />
              </div>
              <div>
                <label style={modalLabel}>Jugadores Involucrados</label>
                <input type="text" placeholder="Ej: 4v4 + 2 Comodines" style={modalInput} value={fichaTecnica.jugadores_involucrados} onChange={e => setFichaTecnica({...fichaTecnica, jugadores_involucrados: e.target.value})} />
              </div>
              <div>
                <label style={modalLabel}>Objetivo Principal</label>
                <input type="text" placeholder="Ej: Mantener posesión bajo presión" style={modalInput} value={fichaTecnica.objetivo_principal} onChange={e => setFichaTecnica({...fichaTecnica, objetivo_principal: e.target.value})} />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={modalLabel}>Reglas y Desarrollo</label>
              <textarea rows="4" style={{...modalInput, height: 'auto', resize: 'vertical'}} placeholder="Describí paso a paso el desarrollo de la tarea..." value={fichaTecnica.descripcion} onChange={e => setFichaTecnica({...fichaTecnica, descripcion: e.target.value})}></textarea>
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={modalLabel}>URL del Video (Opcional)</label>
              <input type="text" placeholder="https://youtube.com/..." style={modalInput} value={fichaTecnica.video_url} onChange={e => setFichaTecnica({...fichaTecnica, video_url: e.target.value})} />
            </div>

             <button onClick={confirmarGuardado} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}>
               {tareaIdEditando ? '💾 ACTUALIZAR TAREA' : '💾 GUARDAR EN EL BANCO'}
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- ESTILOS ---
const inputStyle = { padding: '8px 12px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', width: '220px' };
const selectStyle = { padding: '8px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.8rem', outline: 'none' };
const headerLabelStyle = { fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase' };
const modeBtn = { width: '38px', height: '38px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.2rem', display:'flex', alignItems:'center', justifyContent:'center', transition: '0.2s' };
const labelStyle = { fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: '900', letterSpacing: '1px', borderBottom: '1px solid #333', paddingBottom: '5px', display: 'block' };
const iconGridBtn = { width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const colorInputStyle = { width: '26px', height: '26px', border: 'none', borderRadius: '50%', background: 'none', cursor: 'pointer', outline: 'none', padding: 0 };
const miniSelectStyle = { padding: '5px', background: '#000', border: '1px solid #333', borderRadius: '5px', color: '#fff', fontSize: '0.7rem', outline: 'none', cursor: 'pointer' };
const miniInputStyle = { width: '40px', padding: '5px', background: '#000', border: '1px solid #333', borderRadius: '5px', color: '#fff', fontSize: '0.7rem', outline: 'none', textAlign: 'center' };
const timelineBtnStyle = { padding: '8px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', transition: '0.2s' };

const modalLabel = { display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '5px' };
const modalInput = { width: '100%', padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };

export default CreadorTareas;