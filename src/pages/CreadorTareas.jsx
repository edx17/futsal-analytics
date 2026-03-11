import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Circle, Rect, Text, Group, Line, Arrow, Transformer } from 'react-konva';
import { supabase } from '../supabase';
import { useLocation, useNavigate } from 'react-router-dom'; // <-- IMPORTAMOS ROUTER

const CreadorTareas = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Verificamos si venimos del "Banco de Tareas" para editar
  const tareaAEditar = location.state?.editando;
  const [tareaIdEditando, setTareaIdEditando] = useState(tareaAEditar?.id || null);

  const [elementos, setElementos] = useState([]);
  const [lineas, setLineas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [herramientaSeleccionada, setHerramientaSeleccionada] = useState(null);
  const [modoAccion, setModoAccion] = useState('mover');
  const [canchaConfig, setCanchaConfig] = useState({ tamaño: '40x20', color: '#064e3b' });
  const [nombreTarea, setNombreTarea] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [fichaTecnica, setFichaTecnica] = useState({
    categoria_ejercicio: 'Táctico',
    fase_juego: 'Ataque Posicional',
    duracion_estimada: 15,
    intensidad_rpe: 6,
    jugadores_involucrados: '4v4',
    objetivo_principal: '',
    descripcion: '',
    video_url: ''
  });

  const stageRef = useRef(null);
  const trRef = useRef(null);
  const isDrawing = useRef(false);

  // --- CARGA DE DATOS PARA EDICIÓN ---
  useEffect(() => {
    if (tareaAEditar) {
      setNombreTarea(tareaAEditar.titulo);
      
      // Si guardamos los vectores antes, los cargamos
      if (tareaAEditar.editor_data) {
        setElementos(tareaAEditar.editor_data.elementos || []);
        setLineas(tareaAEditar.editor_data.lineas || []);
        setCanchaConfig(tareaAEditar.editor_data.cancha || { tamaño: '40x20', color: '#064e3b' });
      }

      setFichaTecnica({
        categoria_ejercicio: tareaAEditar.categoria_ejercicio || 'Táctico',
        fase_juego: tareaAEditar.fase_juego || 'Ataque Posicional',
        duracion_estimada: tareaAEditar.duracion_estimada || 15,
        intensidad_rpe: tareaAEditar.intensidad_rpe || 6,
        jugadores_involucrados: tareaAEditar.jugadores_involucrados || '4v4',
        objetivo_principal: tareaAEditar.objetivo_principal || '',
        descripcion: tareaAEditar.descripcion || '',
        video_url: tareaAEditar.video_url || ''
      });
    }
  }, [tareaAEditar]);

  // --- DIMENSIONES ---
  const getDimensiones = () => {
    switch (canchaConfig.tamaño) {
      case '20x20_mitad': return { w: 500, h: 500 };
      case '20x20_central': return { w: 500, h: 500 };
      case '28x20': return { w: 700, h: 500 };
      default: return { w: 900, h: 500 }; 
    }
  };
  const { w: CANVAS_WIDTH, h: CANVAS_HEIGHT } = getDimensiones();

  // --- HERRAMIENTAS ---
  const herramientas = [
    { id: 'j_rojo', tipo: 'jugador', color: '#ef4444', texto: '1', label: 'Rojo', radio: 15 },
    { id: 'j_azul', tipo: 'jugador', color: '#3b82f6', texto: '1', label: 'Azul', radio: 15 },
    { id: 'arq', tipo: 'jugador', color: '#eab308', texto: 'AR', label: 'Arquero', radio: 16 },
    { id: 'staff', tipo: 'staff', color: '#111', texto: 'DT', label: 'Staff', radio: 15 },
    { id: 'pelota', tipo: 'pelota', color: '#fff', label: 'Pelota', radio: 8 },
    { id: 'cono', tipo: 'cono', color: '#f97316', label: 'Cono', radio: 8 },
    { id: 'valla', tipo: 'material', color: '#fbbf24', label: 'Valla', w: 40, h: 6 },
    { id: 'escalera', tipo: 'material', color: '#94a3b8', label: 'Escalera', w: 120, h: 30 },
    { id: 'mini_arco', tipo: 'material', color: '#fff', label: 'Mini Arco', w: 30, h: 10 },
    { id: 'arco_fijo', tipo: 'material', color: '#fff', label: 'Arco Fijo', w: 60, h: 12 },
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
  }, [selectedId, elementos]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !mostrarModal) {
        setElementos(prev => prev.filter(el => el.id !== selectedId));
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
        setLineas([...lineas, { id: 'li-' + Date.now(), tipo: modoAccion, puntos: [pos.x, pos.y, pos.x, pos.y], color: '#ffffff' }]);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current || modoAccion === 'mover') return;
    const pos = stageRef.current.getPointerPosition();
    const nuevasLineas = [...lineas];
    const ultima = nuevasLineas[nuevasLineas.length - 1];
    if (modoAccion === 'dibujar_libre') ultima.puntos = ultima.puntos.concat([pos.x, pos.y]);
    else ultima.puntos = [ultima.puntos[0], ultima.puntos[1], pos.x, pos.y];
    setLineas(nuevasLineas);
  };

  const handleMouseUp = () => { isDrawing.current = false; };

  // --- GUARDADO / ACTUALIZACIÓN INTELIGENTE ---
  const confirmarGuardado = async () => {
    if (!nombreTarea) return alert("Por favor, ponéle un nombre a la tarea arriba a la izquierda.");
    
    setSelectedId(null); 
    
    setTimeout(async () => {
      try {
        const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
        const dataVectores = { elementos, lineas, cancha: canchaConfig };
        const club_id = localStorage.getItem('club_id') || 'club_default';

        const payload = {
          club_id: club_id,
          titulo: nombreTarea,
          categoria_ejercicio: fichaTecnica.categoria_ejercicio,
          fase_juego: fichaTecnica.fase_juego,
          duracion_estimada: parseInt(fichaTecnica.duracion_estimada),
          intensidad_rpe: parseInt(fichaTecnica.intensidad_rpe),
          espacio: canchaConfig.tamaño,
          jugadores_involucrados: fichaTecnica.jugadores_involucrados,
          objetivo_principal: fichaTecnica.objetivo_principal,
          descripcion: fichaTecnica.descripcion,
          video_url: fichaTecnica.video_url,
          url_grafico: dataURL,
          editor_data: dataVectores
        };

        if (tareaIdEditando) {
          // Si estamos editando, hacemos un UPDATE
          const { error } = await supabase.from('tareas').update(payload).eq('id', tareaIdEditando);
          if (error) throw error;
          alert("¡Tarea ACTUALIZADA con éxito!");
          navigate('/banco-tareas'); // Volvemos al banco al terminar
        } else {
          // Si es nueva, hacemos un INSERT
          const { error } = await supabase.from('tareas').insert([payload]);
          if (error) throw error;
          alert("¡Nueva Ficha Táctica guardada!");
          setMostrarModal(false);
          setElementos([]); setLineas([]); setNombreTarea('');
          setFichaTecnica({ categoria_ejercicio: 'Táctico', fase_juego: 'Ataque Posicional', duracion_estimada: 15, intensidad_rpe: 6, jugadores_involucrados: '4v4', objetivo_principal: '', descripcion: '', video_url: '' });
        }

      } catch (err) {
        alert("Error al guardar: " + err.message);
      }
    }, 150); 
  };

  const DibujoCancha = () => {
    const stroke = "rgba(255,255,255,0.7)"; 
    const sw = 3;
    const midX = CANVAS_WIDTH / 2;
    const midY = CANVAS_HEIGHT / 2;
    const padding = 20;
    const t = canchaConfig.tamaño;

    return (
      <Group>
        <Rect name="fondo_cancha" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={canchaConfig.color} />
        <Rect name="fondo_cancha" x={padding} y={padding} width={CANVAS_WIDTH - padding * 2} height={CANVAS_HEIGHT - padding * 2} stroke={stroke} strokeWidth={sw} />
        
        {(t === '40x20' || t === '28x20' || t === '20x20_central') && (
          <Group>
            <Line name="fondo_cancha" points={[midX, padding, midX, CANVAS_HEIGHT - padding]} stroke={stroke} strokeWidth={sw} />
            <Circle name="fondo_cancha" x={midX} y={midY} radius={70} stroke={stroke} strokeWidth={sw} />
            <Circle name="fondo_cancha" x={midX} y={midY} radius={4} fill={stroke} />
          </Group>
        )}
        
        {t !== '20x20_central' && (
          <Group>
            <Rect name="fondo_cancha" x={padding} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[0, 70, 70, 0]} />
            <Circle name="fondo_cancha" x={padding + 80} y={midY} radius={4} fill={stroke} />
            {(t === '40x20' || t === '28x20') && (
              <Group>
                <Rect name="fondo_cancha" x={CANVAS_WIDTH - padding - 100} y={midY - 100} width={100} height={200} stroke={stroke} strokeWidth={sw} cornerRadius={[70, 0, 0, 70]} />
                <Circle name="fondo_cancha" x={CANVAS_WIDTH - padding - 80} y={midY} radius={4} fill={stroke} />
              </Group>
            )}
          </Group>
        )}
      </Group>
    );
  };

  const cargaTotal = fichaTecnica.duracion_estimada * fichaTecnica.intensidad_rpe;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', gap: '15px', color: 'white', padding: '15px', background: '#0a0a0a' }}>
      
      {/* HEADER TÁCTICO */}
      <div className="bento-card" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center', background: '#111', borderBottom: tareaIdEditando ? '2px solid #3b82f6' : '2px solid #333' }}>
        
        {tareaIdEditando && (
           <div style={{ background: '#3b82f6', color: '#fff', padding: '5px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
             MODO EDICIÓN
           </div>
        )}

        <input placeholder="Ej: Rondo 4v4 + 3 Comodines" value={nombreTarea} onChange={e => setNombreTarea(e.target.value)} style={inputStyle} />
        <select value={canchaConfig.tamaño} onChange={(e) => setCanchaConfig({...canchaConfig, tamaño: e.target.value})} style={selectStyle}>
          <option value="40x20">Pista 40x20</option>
          <option value="28x20">Reducido 28x20</option>
          <option value="20x20_mitad">Media Pista</option>
          <option value="20x20_central">Zona Central</option>
        </select>
        <select value={canchaConfig.color} onChange={(e) => setCanchaConfig({...canchaConfig, color: e.target.value})} style={selectStyle}>
          <option value="#064e3b">Verde</option>
          <option value="#1e3a8a">Azul</option>
          <option value="#b45309">Madera</option>
          <option value="#334155">Cemento</option>
        </select>
        
        <div style={{ flex: 1 }}></div>
        
        <div style={{ display: 'flex', background: '#000', padding: '4px', borderRadius: '8px', gap: '4px' }}>
          <button onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(null);}} style={{...modeBtn, background: modoAccion === 'mover' && !herramientaSeleccionada ? 'var(--accent)' : 'transparent', color: modoAccion === 'mover' && !herramientaSeleccionada ? '#000' : '#fff'}} title="Mover objetos">🖐️</button>
          <button onClick={() => setModoAccion('dibujar_flecha')} style={{...modeBtn, background: modoAccion === 'dibujar_flecha' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_flecha' ? '#000' : '#fff'}} title="Pase (Línea recta)">↗️</button>
          <button onClick={() => setModoAccion('dibujar_libre')} style={{...modeBtn, background: modoAccion === 'dibujar_libre' ? 'var(--accent)' : 'transparent', color: modoAccion === 'dibujar_libre' ? '#000' : '#fff'}} title="Conducción (Curva)">〰️</button>
          <div style={{ width: '1px', background: '#333', margin: '0 5px' }}></div>
          <button onClick={deshacerUltimoTrazo} style={{...modeBtn, color: lineas.length > 0 ? '#fff' : '#555'}} disabled={lineas.length === 0} title="Deshacer último trazo">↩️</button>
        </div>
        
        <button onClick={() => {if(window.confirm('¿Limpiar toda la pizarra?')){setElementos([]); setLineas([]);}}} className="btn-secondary" style={{padding:'8px 12px'}}>🗑️ LIMPIAR</button>
        <button onClick={() => {
            if(!nombreTarea) return alert("Por favor, ponéle un nombre a la tarea arriba a la izquierda.");
            setMostrarModal(true);
        }} className="btn-action" style={{ background: tareaIdEditando ? '#3b82f6' : 'var(--accent)', color: tareaIdEditando ? '#fff' : '#000' }}>
          {tareaIdEditando ? '💾 ACTUALIZAR TAREA' : '💾 CONFIGURAR Y GUARDAR'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '15px', overflow: 'hidden' }}>
        <div className="bento-card" style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#111', overflowY:'auto' }}>
          <div>
            <span style={labelStyle}>JUGADORES Y STAFF</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              {herramientas.filter(h => h.tipo === 'jugador' || h.tipo === 'staff').map(h => (
                <div key={h.id} onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} style={{...toolCard, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #222'}}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: h.color, border: '1px solid #000' }}></div>
                  <span style={{fontSize: '0.65rem', fontWeight: 'bold'}}>{h.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>MATERIALES</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              {herramientas.filter(h => h.tipo !== 'jugador' && h.tipo !== 'staff').map(h => (
                <div key={h.id} onClick={() => {setModoAccion('mover'); setHerramientaSeleccionada(h); setSelectedId(null);}} style={{...toolCard, border: herramientaSeleccionada?.id === h.id ? '2px solid var(--accent)' : '1px solid #222'}}>
                  <span style={{fontSize: '0.65rem', fontWeight: 'bold'}}>{h.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

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
              {lineas.map(l => (
                l.tipo === 'dibujar_flecha' ? 
                <Arrow key={l.id} points={l.puntos} stroke="#fff" strokeWidth={3} fill="#fff" dash={[10, 5]} /> :
                <Line key={l.id} points={l.puntos} stroke="#fff" strokeWidth={3} tension={0.6} lineCap="round" lineJoin="round" />
              ))}
              {elementos.map(el => (
                <Group 
                  key={el.id} id={el.id} x={el.x} y={el.y} rotation={el.rotation} scaleX={el.scaleX} scaleY={el.scaleY}
                  draggable={modoAccion === 'mover'}
                  onClick={(e) => { e.cancelBubble = true; setSelectedId(el.id); }}
                  onTap={(e) => { e.cancelBubble = true; setSelectedId(el.id); }}
                  onDragEnd={(e) => { setElementos(elementos.map(item => item.id === el.id ? {...item, x: e.target.x(), y: e.target.y()} : item)); }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    setElementos(elementos.map(item => item.id === el.id ? {
                      ...item, x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: Math.max(0.1, node.scaleX()), scaleY: Math.max(0.1, node.scaleY())
                    } : item));
                  }}
                >
                  {el.tipo === 'jugador' || el.tipo === 'staff' || el.tipo === 'cono' || el.tipo === 'pelota' ? (
                    <Group>
                      <Circle radius={el.radio} fill={el.color} stroke="#000" strokeWidth={1} />
                      <Text text={el.texto} fontSize={11} fontStyle="bold" x={-el.radio} y={-5} width={el.radio * 2} align="center" fill={el.color === '#fff' || el.color === '#eab308' ? '#000' : '#fff'} />
                    </Group>
                  ) : (
                    <Rect width={el.w} height={el.h} fill={el.color} stroke="#000" strokeWidth={1} x={-el.w/2} y={-el.h/2} cornerRadius={2} />
                  )}
                </Group>
              ))}
              <Transformer ref={trRef} boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5 ? oldBox : newBox} borderStroke="#00ff88" anchorStroke="#00ff88" anchorFill="#000"/>
            </Layer>
          </Stage>

          {selectedId && !mostrarModal && (
            <div style={{ position:'absolute', bottom: 20, background:'rgba(0,0,0,0.9)', padding:'10px 20px', borderRadius:'12px', display: 'flex', alignItems: 'center', gap: '15px', border:'1px solid #333', zIndex: 100 }}>
              <span style={{ fontSize:'0.75rem', fontWeight:'bold', color: 'var(--text-dim)' }}>Objeto seleccionado</span>
              <button onClick={() => { setElementos(prev => prev.filter(el => el.id !== selectedId)); setSelectedId(null); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}>
                🗑️ ELIMINAR
              </button>
            </div>
          )}
        </div>
      </div>

      {mostrarModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="bento-card" style={{ background: '#111', width: '100%', maxWidth: '900px', border: '2px solid var(--accent)', padding: '30px', maxHeight: '90vh', overflowY: 'auto', animation: 'fadeIn 0.2s' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.5rem', textTransform: 'uppercase' }}>{tareaIdEditando ? 'Actualizar Ficha Técnica' : 'Ficha Técnica de la Tarea'}</h2>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{nombreTarea} • {canchaConfig.tamaño}</span>
              </div>
              <button onClick={() => setMostrarModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div><label style={modalLabel}>Objetivo Principal</label><input type="text" value={fichaTecnica.objetivo_principal} onChange={e => setFichaTecnica({...fichaTecnica, objetivo_principal: e.target.value})} style={modalInput} /></div>
                <div><label style={modalLabel}>Clasificación Principal</label>
                  <select value={fichaTecnica.categoria_ejercicio} onChange={e => setFichaTecnica({...fichaTecnica, categoria_ejercicio: e.target.value})} style={modalInput}>
                    <option value="Táctico">Táctico</option><option value="Técnico">Técnico</option><option value="Físico">Físico</option><option value="ABP">ABP</option><option value="Cognitivo">Cognitivo</option>
                  </select>
                </div>
                <div><label style={modalLabel}>Fase del Juego</label>
                  <select value={fichaTecnica.fase_juego} onChange={e => setFichaTecnica({...fichaTecnica, fase_juego: e.target.value})} style={modalInput}>
                    <option value="Ataque Posicional">Ataque</option><option value="Defensa Posicional">Defensa</option><option value="Transición Ofensiva">Transición Ofensiva</option><option value="Transición Defensiva">Transición Defensiva</option><option value="Indistinta">Indistinta</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: 'rgba(0, 255, 136, 0.05)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                <div><label style={modalLabel}>Jugadores / Formato</label><input type="text" value={fichaTecnica.jugadores_involucrados} onChange={e => setFichaTecnica({...fichaTecnica, jugadores_involucrados: e.target.value})} style={modalInput} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div><label style={modalLabel}>Minutos Reales</label><input type="number" min="1" value={fichaTecnica.duracion_estimada} onChange={e => setFichaTecnica({...fichaTecnica, duracion_estimada: e.target.value})} style={modalInput} /></div>
                  <div><label style={modalLabel}>Intensidad (RPE)</label><input type="number" min="1" max="10" value={fichaTecnica.intensidad_rpe} onChange={e => setFichaTecnica({...fichaTecnica, intensidad_rpe: e.target.value})} style={{...modalInput, color: fichaTecnica.intensidad_rpe > 7 ? '#ef4444' : '#eab308', fontWeight: 'bold'}} /></div>
                </div>
                <div style={{ marginTop: 'auto', borderTop: '1px dashed #444', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-dim)' }}>Unidades de Carga (UC):</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--accent)' }}>{cargaTotal}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
              <div><label style={modalLabel}>Reglas, Consignas y Tiempos</label><textarea value={fichaTecnica.descripcion} onChange={e => setFichaTecnica({...fichaTecnica, descripcion: e.target.value})} style={{ ...modalInput, height: '100px', resize: 'vertical' }} /></div>
              <div><label style={modalLabel}>Enlace a Video / Referencia (Opcional)</label><input type="url" value={fichaTecnica.video_url} onChange={e => setFichaTecnica({...fichaTecnica, video_url: e.target.value})} style={modalInput} /></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', borderTop: '1px solid #333', paddingTop: '20px' }}>
              <button onClick={() => setMostrarModal(false)} className="btn-secondary" style={{ padding: '12px 25px' }}>Cancelar</button>
              <button onClick={confirmarGuardado} className="btn-action" style={{ padding: '12px 25px', fontSize: '1rem', background: tareaIdEditando ? '#3b82f6' : 'var(--accent)', color: tareaIdEditando ? '#fff' : '#000' }}>
                {tareaIdEditando ? '🔄 ACTUALIZAR DEFINITIVO' : '✅ GUARDAR DEFINITIVO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = { padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', width: '220px' };
const selectStyle = { padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: 'var(--accent)', fontWeight: 'bold' };
const modeBtn = { width: '38px', height: '38px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1.2rem', display:'flex', alignItems:'center', justifyContent:'center' };
const labelStyle = { fontSize: '0.65rem', color: '#666', fontWeight: '900', letterSpacing: '1px' };
const toolCard = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#000', borderRadius: '8px', cursor: 'pointer', transition: '0.2s' };
const modalLabel = { display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' };
const modalInput = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', outline: 'none' };

export default CreadorTareas;