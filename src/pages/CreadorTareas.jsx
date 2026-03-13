import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group, Line, Arrow, Transformer, Path } from 'react-konva';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

// --- CONFIGURACIÓN DE COLORES Y ESTILOS POR DEFECTO ---
const COLORES_LINEA = ['#ffffff', '#facc15', '#fbbf24', '#ef4444', '#3b82f6'];

const CreadorTareas = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const tareaAEditar = location.state?.editando;
  const [tareaIdEditando, setTareaIdEditando] = useState(tareaAEditar?.id || null);

  const [elementos, setElementos] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [herramientaSeleccionada, setHerramientaSeleccionada] = useState(null);
  
  // MODO DE ACCIÓN: mover, dibujar_pase (recta), dibujar_conduccion (alzada)
  const [modoAccion, setModoAccion] = useState('mover');
  
  // --- ESTADO GLOBAL DE ESTILOS DE DIBUJO ---
  const [dibujoConfig, setDibujoConfig] = useState({
    color: '#ffffff',
    tipoTrazo: 'continua', // continua, punteada
    grosor: 3,
    transparencia: 1.0,
    topeFinal: 'triangulo' // ninguno, punto, triangulo, transversal
  });

  const [canchaConfig, setCanchaConfig] = useState({ tamaño: '40x20', color: '#064e3b' });
  const [nombreTarea, setNombreTarea] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [fichaTecnica, setFichaTecnica] = useState({
    categoria_ejercicio: 'Táctico', fase_juego: 'Ataque Posicional', duracion_estimada: 15,
    intensidad_rpe: 6, jugadores_involucrados: '4v4', objetivo_principal: '', descripcion: '', video_url: ''
  });

  const stageRef = useRef(null);
  const trRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (tareaAEditar) {
      setNombreTarea(tareaAEditar.titulo);
      if (tareaAEditar.editor_data) {
        setElementos(tareaAEditar.editor_data.elementos || []);
        setLineas(tareaAEditar.editor_data.lineas || []);
        setCanchaConfig(tareaAEditar.editor_data.cancha || { tamaño: '40x20', color: '#064e3b' });
      }
      setFichaTecnica({...tareaAEditar});
    }
  }, [tareaAEditar]);

  const getDimensiones = () => {
    switch (canchaConfig.tamaño) {
      case '20x20_mitad': return { w: 500, h: 500 };
      case '20x20_central': return { w: 500, h: 500 };
      case '28x20': return { w: 700, h: 500 };
      default: return { w: 900, h: 500 }; 
    }
  };
  const { w: CANVAS_WIDTH, h: CANVAS_HEIGHT } = getDimensiones();

  // --- HERRAMIENTAS ÉLITE ---
  const herramientas = [
    // Jugadores
    { id: 'j_rojo', tipo: 'jugador', color: '#ef4444', texto: '', label: 'Jugador Rojo', radio: 18 },
    { id: 'j_azul', tipo: 'jugador', color: '#3b82f6', texto: '', label: 'Jugador Azul', radio: 18 },
    { id: 'j_verde', tipo: 'jugador', color: '#22c55e', texto: '', label: 'Jugador Verde', radio: 18 },
    { id: 'j_rosa', tipo: 'jugador', color: '#ec4899', texto: '', label: 'Jugador Rosa', radio: 18 },
    // Arqueros y Staff
    { id: 'arq_ama', tipo: 'arquero', color: '#eab308', texto: 'A', label: 'Arquero Amarillo', radio: 20 },
    { id: 'arq_vio', tipo: 'arquero', color: '#a855f7', texto: 'A', label: 'Arquero Violeta', radio: 20 },
    { id: 'staff', tipo: 'staff', color: '#111', texto: 'DT', label: 'Staff Técnico', radio: 18 },
    // Pelota y Materiales
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
        if (node) {
          trRef.current.nodes([node]);
          trRef.current.getLayer().batchDraw();
        }
      } else {
        trRef.current.nodes([]);
      }
    }
  }, [selectedId, elementos, lineas]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !mostrarModal) {
        setElementos(prev => prev.filter(el => el.id !== selectedId));
        setLineas(prev => prev.filter(li => li.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, mostrarModal]);

  const deshacerUltimoTrazo = () => {
    if (lineas.length > 0) setLineas(prev => prev.slice(0, -1));
  };

  const handleStageMouseDown = (e) => {
    if (e.target.getParent()?.className === 'Transformer') return;
    const isBackground = e.target.name() === 'fondo_cancha' || e.target === e.target.getStage();

    if (isBackground) {
      setSelectedId(null);
      if (modoAccion === 'mover' && herramientaSeleccionada) {
        const pos = stageRef.current.getPointerPosition();
        const nuevoElemento = { ...herramientaSeleccionada, id: 'el-' + Date.now(), x: pos.x, y: pos.y, rotation: 0, scaleX: 1, scaleY: 1 };
        setElementos([...elementos, nuevoElemento]);
      } 
      else if (modoAccion !== 'mover') {
        isDrawing.current = true;
        const pos = stageRef.current.getPointerPosition();
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
    if (!isDrawing.current || modoAccion === 'mover') return;
    const pos = stageRef.current.getPointerPosition();
    const nuevasLineas = [...lineas];
    const ultima = nuevasLineas[nuevasLineas.length - 1];
    
    if (modoAccion === 'dibujar_conduccion') {
      ultima.puntos = ultima.puntos.concat([pos.x, pos.y]);
    } else {
      ultima.puntos = [ultima.puntos[0], ultima.puntos[1], pos.x, pos.y]; 
    }
    setLineas(nuevasLineas);
  };

  const handleMouseUp = () => { isDrawing.current = false; };

  // --- MOTOR DE RENDERIZADO VISUAL ÉLITE (Actualizado con Nuevo Diseño) ---
  const RenderElemento = ({ el }) => {
    // Definimos el factor de escala basado en el radio para Konva
    const scaleFactor = el.radio / 35; // 35 es aprox la mitad del ancho del SVG original (120/2-ish)

    switch(el.tipo) {
      case 'jugador':
      case 'arquero':
      case 'staff':
        return (
          <Group scaleX={scaleFactor} scaleY={scaleFactor}>
            {/* Nuevo dibujo vectorial del jugador (SVG Path aportado) */}
            {/* Centramos el dibujo: el original está en viewBox 0 0 120 80, centro aprox 67, 40 */}
            <Group x={-67} y={-40}>
                <Path 
                  data="M 80 10 A 40 40 0 0 0 80 70 L 65 65 A 25 25 0 0 1 65 15 Z M 84 40 A 10 10 0 1 1 50 40 A 10 10 0 1 1 84 40" 
                  fill={el.color} 
                  stroke="black" 
                  strokeWidth={2} 
                />
            </Group>
            {/* Dorsal: Ajustado para que calce dentro del círculo de la cabeza del nuevo dibujo */}
            {/* El centro de la cabeza está aprox en x=0 relativo al grupo escalado si centramos bien el path */}
            <Text 
                text={el.texto} 
                fontSize={22} // Aumentado para que se vea bien escalado
                fontStyle="bold" 
                fill={el.color === '#fff' || el.color === '#eab308' ? '#000' : '#fff'} 
                x={-15} // Centrado manual
                y={-11} // Centrado manual dentro de la cabeza
                width={30} 
                align="center" 
            />
          </Group>
        );
      
      case 'pelota':
        return (
          <Group>
            <Circle radius={el.radio} fill="#fff" stroke="#000" strokeWidth={1.5} />
            <Circle radius={el.radio * 0.4} fill="#000" />
            <Line points={[0, -(el.radio*0.4), 0, -el.radio]} stroke="#000" strokeWidth={1} />
            <Line points={[-(el.radio*0.3), (el.radio*0.3), -(el.radio*0.7), (el.radio*0.7)]} stroke="#000" strokeWidth={1} />
            <Line points={[(el.radio*0.3), (el.radio*0.3), (el.radio*0.7), (el.radio*0.7)]} stroke="#000" strokeWidth={1} />
          </Group>
        );

      case 'cono_alto':
        return (
          <Group>
            <Circle radius={el.radio + 2} fill="rgba(0,0,0,0.3)" x={2} y={2} />
            <Circle radius={el.radio} fill={el.color} stroke="#c2410c" strokeWidth={1} />
            <Circle radius={el.radio * 0.4} fill="#fff" opacity={0.8} />
          </Group>
        );

      case 'cono_plato':
        return (
          <Group>
            <Circle radius={el.radio} fill={el.color} stroke="#ca8a04" strokeWidth={1} />
            <Circle radius={el.radio * 0.3} fill={canchaConfig.color} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
          </Group>
        );

      case 'valla':
        return (
          <Group x={-el.w/2} y={-el.h/2}>
            <Rect x={2} y={0} width={4} height={el.h} fill="#333" />
            <Rect x={el.w - 6} y={0} width={4} height={el.h} fill="#333" />
            <Rect x={0} y={el.h/2 - 2} width={el.w} height={4} fill={el.color} stroke="#000" strokeWidth={0.5} />
          </Group>
        );

      case 'escalera':
        const rungs = [];
        const rungCount = 6;
        const rungSpacing = el.w / rungCount;
        for(let i = 0; i <= rungCount; i++) {
          rungs.push(<Rect key={i} x={i * rungSpacing - 1} y={0} width={2} height={el.h} fill="#facc15" />);
        }
        return (
          <Group x={-el.w/2} y={-el.h/2}>
            <Rect x={0} y={0} width={el.w} height={2} fill={el.color} />
            <Rect x={0} y={el.h - 2} width={el.w} height={2} fill={el.color} />
            {rungs}
          </Group>
        );

      case 'arco':
      case 'mini_arco':
        return (
          <Group x={-el.w/2} y={-el.h/2}>
            <Path data={`M 0 0 L ${el.w} 0 L ${el.w - 5} ${el.h} L 5 ${el.h} Z`} fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" strokeWidth={1} dash={[2, 2]} />
            <Rect x={0} y={0} width={el.w} height={3} fill="#fff" stroke="#999" strokeWidth={0.5} />
            <Rect x={0} y={0} width={3} height={el.h} fill="#fff" stroke="#999" strokeWidth={0.5} />
            <Rect x={el.w - 3} y={0} width={3} height={el.h} fill="#fff" stroke="#999" strokeWidth={0.5} />
          </Group>
        );

      default:
        return <Rect width={el.w} height={el.h} fill={el.color} stroke="#000" strokeWidth={1} x={-el.w/2} y={-el.h/2} />;
    }
  };

  const DibujoCancha = () => {
    const stroke = "rgba(255,255,255,0.7)"; const sw = 3; const midX = CANVAS_WIDTH / 2; const midY = CANVAS_HEIGHT / 2; const padding = 20; const t = canchaConfig.tamaño;
    return (<Group><Rect name="fondo_cancha" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={canchaConfig.color} /><Rect name="fondo_cancha" x={padding} y={padding} width={CANVAS_WIDTH - padding * 2} height={CANVAS_HEIGHT - padding * 2} stroke={stroke} strokeWidth={sw} cornerRadius={5} />{(t === '40x20' || t === '28x20' || t === '20x20_central') && (<Group><Line name="fondo_cancha" points={[midX, padding, midX, CANVAS_HEIGHT - padding]} stroke={stroke} strokeWidth={sw} /><Circle name="fondo_cancha" x={midX} y={midY} radius={70} stroke={stroke} strokeWidth={sw} /><Circle name="fondo_cancha" x={midX} y={midY} radius={4} fill={stroke} /></Group>)}{t !== '20x20_central' && (<Group><Rect name="fondo_cancha" x={padding} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[0, 70, 70, 0]} /><Circle name="fondo_cancha" x={padding + 80} y={midY} radius={4} fill={stroke} />{(t === '40x20' || t === '28x20') && (<Group><Rect name="fondo_cancha" x={CANVAS_WIDTH - padding - 100} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[70, 0, 0, 70]} /><Circle name="fondo_cancha" x={CANVAS_WIDTH - padding - 80} y={midY} radius={4} fill={stroke} /></Group>)}</Group>)}</Group>);
  };

  // --- COMPONENTES VISUALES PARA ICONOS DE HERRAMIENTAS (Actualizado con Nuevo Diseño) ---
  const renderIconoHerramienta = (h) => {
    // Escala más pequeña para el toolbar
    const iconScale = 0.3; 

    switch (h.tipo) {
      case 'jugador':
      case 'arquero':
      case 'staff':
        // Usamos SVG nativo aquí para el toolbar, copiando los datos del Path aportado
        return (
          <svg width="24" height="24" viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5)', borderRadius: '4px' }}>
            <path
              d="M 80 10 A 40 40 0 0 0 80 70 L 65 65 A 25 25 0 0 1 65 15 Z M 84 40 A 10 10 0 1 1 50 40 A 10 10 0 1 1 84 40"
              fill={h.color}
              stroke="black"
              strokeWidth="3"
            />
          </svg>
        );
      case 'pelota': return <span style={{ fontSize: '1.2rem' }}>⚽</span>;
      case 'cono_alto': return <div style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '16px solid #f97316' }}></div>;
      case 'cono_plato': return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '4px solid #facc15' }}></div>;
      case 'valla': return <div style={{ width: '24px', height: '14px', borderLeft: '3px solid #666', borderRight: '3px solid #666', borderTop: '4px solid #fbbf24' }}></div>;
      case 'escalera': return <div style={{ width: '12px', height: '24px', background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, #facc15 3px, #facc15 5px)', borderLeft: '2px solid #94a3b8', borderRight: '2px solid #94a3b8' }}></div>;
      case 'mini_arco': case 'arco': return <div style={{ width: '26px', height: '14px', borderTop: '2px solid #fff', borderLeft: '2px solid #fff', borderRight: '2px solid #fff', background: 'rgba(255,255,255,0.2)' }}></div>;
      default: return null;
    }
  };

  // --- RENDERIZADO DE LÍNEA CON MINI-TOOLS Y MARCADORES ---
  const RenderLineaCustom = ({ li }) => {
    const isRecta = li.tipoTool === 'dibujar_pase';
    const points = li.puntos;
    const dashPattern = li.tipoTrazo === 'punteada' ? [12, 6] : [];
    
    // Calculamos la dirección del final para el triángulo/transversal
    const len = points.length;
    let angleRad = 0;
    let endX = points[len-2], endY = points[len-1];
    if (len >= 4) {
      const p1x = points[len-4], p1y = points[len-3];
      angleRad = Math.atan2(endY - p1y, endX - p1x);
    }
    const angleDeg = angleRad * 180 / Math.PI;

    return (
      <Group 
        id={li.id}
        draggable={modoAccion === 'mover'}
        onClick={(e) => { e.cancelBubble = true; setSelectedId(li.id); }}
        onTap={(e) => { e.cancelBubble = true; setSelectedId(li.id); }}
      >
        <Line 
          points={points} 
          stroke={li.color} 
          strokeWidth={li.grosor} 
          opacity={li.transparencia}
          dash={dashPattern} 
          lineCap="round" 
          lineJoin="round" 
          tension={isRecta ? 0 : 0.5} 
        />
        
        {modoAccion !== 'mover' && (
          <Group x={endX} y={endY} rotation={angleDeg} opacity={li.transparencia}>
            {li.topeFinal === 'punto' && (
              <Circle radius={li.grosor * 2} fill={li.color} stroke="#000" strokeWidth={0.5}/>
            )}
            {li.topeFinal === 'triangulo' && (
              <Path 
                data={`M 0 0 L -${li.grosor * 3} -${li.grosor * 1.5} L -${li.grosor * 3} ${li.grosor * 1.5} Z`} 
                fill={li.color} stroke="#000" strokeWidth={0.5}
                x={0} y={0}
              />
            )}
            {li.topeFinal === 'transversal' && (
              <Rect 
                width={2} height={li.grosor * 5} 
                fill={li.color} stroke="#000" strokeWidth={0.5} 
                x={-1} y={-(li.grosor * 2.5)}
              />
            )}
          </Group>
        )}
      </Group>
    );
  };

  // Resto de la lógica de guardado y UI (Modal) sin cambios significativos respecto a la estructura bento
  // ... (confirmarGuardado, inputs, selects de bento layout) ...

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: '15px', color: 'white', padding: '15px', background: '#0a0a0a' }}>
      
      {/* HEADER TÁCTICO BENTO */}
      <div className="bento-card" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: '#111', borderBottom: tareaIdEditando ? '2px solid #3b82f6' : '2px solid #333', padding: '10px 15px' }}>
        
        {tareaIdEditando && (<div style={{ background: '#3b82f6', color: '#fff', padding: '5px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>MODO EDICIÓN</div>)}

        <input placeholder="Ej: Rondo 4v4 + 3 Comodines" value={nombreTarea} onChange={e => setNombreTarea(e.target.value)} style={inputStyle} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={headerLabelStyle}>Dimensiones:</span>
          <select value={canchaConfig.tamaño} onChange={(e) => setCanchaConfig({...canchaConfig, tamaño: e.target.value})} style={selectStyle}>
            <option value="40x20">Pista 40x20</option><option value="28x20">Reducido 28x20</option><option value="20x20_mitad">Media Pista</option><option value="20x20_central">Zona Central</option>
          </select>
          <span style={headerLabelStyle}>Color Pista:</span>
          <select value={canchaConfig.color} onChange={(e) => setCanchaConfig({...canchaConfig, color: e.target.value})} style={selectStyle}>
            <option value="#064e3b">Verde Césped</option><option value="#1e3a8a">Azul Sintético</option><option value="#b45309">Madera Parquet</option><option value="#334155">Cemento / Asfalto</option>
          </select>
        </div>
        
        <div style={{ flex: 1 }}></div>
        
        {/* BOTONERA HERRAMIENTAS TÁCTICAS */}
        <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', gap: '4px', border: '1px solid #222' }}>
          <button onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(null); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'mover' && !herramientaSeleccionada ? 'var(--accent)' : 'transparent', color: modoAccion === 'mover' && !herramientaSeleccionada ? '#000' : '#fff'}} title="Mover / Rotar / Borrar objetos">🖐️</button>
          <button onClick={() => {setModoAccion('dibujar_pase'); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'dibujar_pase' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_pase' ? '#000' : '#fff'}} title="Trazar Pase / Trayectoria Recta">↗️</button>
          <button onClick={() => {setModoAccion('dibujar_conduccion'); setSelectedId(null);}} style={{...modeBtn, background: modoAccion === 'dibujar_conduccion' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_conduccion' ? '#000' : '#facc15'}} title="Trazar Conducción / Movimiento Alzada">〰️</button>
          <div style={{ width: '1px', background: '#333', margin: '0 5px' }}></div>
          <button onClick={deshacerUltimoTrazo} style={{...modeBtn, color: lineas.length > 0 ? '#fff' : '#555'}} disabled={lineas.length === 0} title="Deshacer último trazo">↩️</button>
        </div>
        
        {/* MINI TOOLS DE DIBUJO */}
        {(modoAccion === 'dibujar_pase' || modoAccion === 'dibujar_conduccion') && (
          <div className="bento-card" style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#1a1a1a', border: '1px solid var(--accent)', padding: '5px 10px', borderRadius: '8px', animation: 'fadeIn 0.2s' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>ESTILO TRAZO:</span>
            <input type="color" value={dibujoConfig.color} onChange={e => setDibujoConfig({...dibujoConfig, color: e.target.value})} style={{...colorInputStyle, border: `2px solid ${dibujoConfig.color}`}} title="Color de Línea" />
            <select value={dibujoConfig.tipoTrazo} onChange={e => setDibujoConfig({...dibujoConfig, tipoTrazo: e.target.value})} style={miniSelectStyle} title="Tipo de Línea"><option value="continua">Continua</option><option value="punteada">Punteada</option></select>
            <input type="number" min="1" max="10" value={dibujoConfig.grosor} onChange={e => setDibujoConfig({...dibujoConfig, grosor: parseInt(e.target.value)})} style={miniInputStyle} title="Grosor (px)" />
            <input type="number" min="0.1" max="1.0" step="0.1" value={dibujoConfig.transparencia} onChange={e => setDibujoConfig({...dibujoConfig, transparencia: parseFloat(e.target.value)})} style={miniInputStyle} title="Opacidad (0.1 a 1.0)" />
            <select value={dibujoConfig.topeFinal} onChange={e => setDibujoConfig({...dibujoConfig, topeFinal: e.target.value})} style={miniSelectStyle} title="Final de Línea"><option value="ninguno">Ninguno</option><option value="punto">Punto</option><option value="triangulo">Triángulo</option><option value="transversal">T. Transversal</option></select>
          </div>
        )}

        <div style={{ flex: 1, minWidth: '20px' }}></div>
        
        <button onClick={() => {if(window.confirm('¿Limpiar toda la pizarra?')){setElementos([]); setLineas([]);}}} className="btn-secondary" style={{padding:'8px 12px'}}>🗑️ LIMPIAR</button>
        <button onClick={() => {
            if(!nombreTarea) return showToast("Por favor, ponéle un nombre a la tarea arriba a la izquierda.", "warning");
            setMostrarModal(true);
        }} className="btn-action" style={{ background: tareaIdEditando ? '#3b82f6' : 'var(--accent)', color: tareaIdEditando ? '#fff' : '#000', padding: '8px 15px' }}>{tareaIdEditando ? '💾 ACTUALIZAR' : '💾 GUARDAR'}</button>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '15px', overflow: 'hidden' }}>
        
        {/* PALETA DE HERRAMIENTAS Bento */}
        <div className="bento-card" style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#111', overflowY:'auto' }}>
          
          <div>
            <span style={labelStyle}>JUGADORES Y STAFF</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
              {herramientas.filter(h => h.tipo === 'jugador' || h.tipo === 'arquero' || h.tipo === 'staff').map(h => (
                <div 
                  key={h.id} title={h.label}
                  onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} 
                  style={{...iconGridBtn, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #333', background: herramientaSeleccionada?.id === h.id ? 'rgba(0, 255, 136, 0.1)' : '#000'}}
                >
                  {renderIconoHerramienta(h)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <span style={labelStyle}>MATERIALES Bento</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
              {herramientas.filter(h => h.tipo !== 'jugador' && h.tipo !== 'arquero' && h.tipo !== 'staff').map(h => (
                <div 
                  key={h.id} title={h.label}
                  onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} 
                  style={{...iconGridBtn, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #333', background: herramientaSeleccionada?.id === h.id ? 'rgba(0, 255, 136, 0.1)' : '#000'}}
                >
                  {renderIconoHerramienta(h)}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', border: '1px dashed #444', textAlign: 'center' }}>
             <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: '1.4', display: 'block' }}>💡 El triángulo integrado en el nuevo diseño indica la orientación. Rotá la ficha para apuntar.</span>
          </div>
        </div>

        {/* PIZARRA Bento */}
        <div style={{ flex: 1, background: '#000', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'auto', border: '1px solid #222' }}>
          <Stage 
            width={CANVAS_WIDTH} height={CANVAS_HEIGHT} 
            ref={stageRef}
            onMouseDown={handleStageMouseDown} onTouchStart={handleStageMouseDown}
            onMouseMove={handleMouseMove} onTouchMove={handleMouseMove}
            onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp}
          >
            <Layer>
              <DibujoCancha />
              
              {lineas.map(li => (
                <RenderLineaCustom key={li.id} li={li} />
              ))}
              
              {elementos.map(el => (
                <Group 
                  key={el.id} id={el.id} x={el.x} y={el.y} rotation={el.rotation} scaleX={el.scaleX} scaleY={el.scaleY}
                  draggable={modoAccion === 'mover'}
                  onClick={(e) => { e.cancelBubble = true; setSelectedId(el.id); }}
                  onTap={(e) => { e.cancelBubble = true; setSelectedId(el.id); }}
                  onDragEnd={(e) => { setElementos(elementos.map(item => item.id === el.id ? {...item, x: e.target.x(), y: e.target.y()} : item)); }}
                >
                  <RenderElemento el={el} />
                </Group>
              ))}
              
              <Transformer 
                ref={trRef} 
                boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox} 
                borderStroke="#00ff88" anchorStroke="#00ff88" anchorFill="#000" anchorSize={8}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              />
            </Layer>
          </Stage>

          {selectedId && !mostrarModal && (
            <div style={{ position:'absolute', bottom: 20, background:'rgba(0,0,0,0.9)', padding:'10px 20px', borderRadius:'12px', display: 'flex', alignItems: 'center', gap: '15px', border:'1px solid #333', zIndex: 100 }}>
              <span style={{ fontSize:'0.75rem', fontWeight:'bold', color: 'var(--text-dim)' }}>Objeto seleccionado</span>
              <button onClick={() => { setElementos(prev => prev.filter(el => el.id !== selectedId)); setLineas(prev => prev.filter(li => li.id !== selectedId)); setSelectedId(null); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ ELIMINAR</button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL FICHA TÉCNICA Bento (Simplificado para brevedad, asumiendo estructura bento existente) */}
      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '900px', border: '2px solid var(--accent)', padding: '30px', maxHeight: '95vh', overflowY: 'auto', animation: 'fadeIn 0.2s' }}>
             {/* ... contenido del modal bento ... */}
             <button onClick={() => setMostrarModal(false)}>Cerrar</button>
             <button onClick={confirmarGuardado}>Guardar Definitivo</button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- ESTILOS CSS-in-JS BENTOLayout ---
const inputStyle = { padding: '8px 12px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', width: '220px' };
const selectStyle = { padding: '8px', background: '#000', border: '1px solid #333', borderRadius: '6px', color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.8rem', outline: 'none' };
const headerLabelStyle = { fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 'bold', textTransform: 'uppercase' };
const modeBtn = { width: '38px', height: '38px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.2rem', display:'flex', alignItems:'center', justifyContent:'center', transition: '0.2s' };
const labelStyle = { fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: '900', letterSpacing: '1px', borderBottom: '1px solid #333', paddingBottom: '5px', display: 'block' };
const iconGridBtn = { width: '40px', height: '40px', borderRadius: '8px', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const colorInputStyle = { width: '26px', height: '26px', border: 'none', borderRadius: '50%', background: 'none', cursor: 'pointer', outline: 'none', padding: 0 };
const miniSelectStyle = { padding: '5px', background: '#000', border: '1px solid #333', borderRadius: '5px', color: '#fff', fontSize: '0.7rem', outline: 'none', cursor: 'pointer' };
const miniInputStyle = { width: '40px', padding: '5px', background: '#000', border: '1px solid #333', borderRadius: '5px', color: '#fff', fontSize: '0.7rem', outline: 'none', textAlign: 'center' };
const modalInput = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none' };

export default CreadorTareas;