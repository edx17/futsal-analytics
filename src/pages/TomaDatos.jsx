import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function TomaDatos() {
  const location = useLocation();
  const navigate = useNavigate();
  const partido = location.state?.partido;
  const pitchRef = useRef(null);

  // --- ESTADOS TÉCNICOS Y RESPONSIVE ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  const [periodo, setPeriodo] = useState('PT');
  const [minuto, setMinuto] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [relojCorriendo, setRelojCorriendo] = useState(false);

  // --- ESTADO DE NORMALIZACIÓN ESPACIAL ---
  const [direccionAtaque, setDireccionAtaque] = useState('derecha');

  // --- ESTADOS DEL PANEL ---
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [panelLateral, setPanelLateral] = useState({ activo: false, x: 0, y: 0 });
  const [pasoRegistro, setPasoRegistro] = useState(1);
  const [tabActiva, setTabActiva] = useState('registro'); 
  const [isDeleting, setIsDeleting] = useState(false);
  const [equipo, setEquipo] = useState('Propio');
  const [accion, setAccion] = useState('');
  
  // --- ESTADOS PARA GOL Y ASISTENCIA ---
  const [menuActivo, setMenuActivo] = useState(null); 
  const [autorGol, setAutorGol] = useState(null); 

  // --- ESTADOS DE EDICIÓN ---
  const [eventoEditando, setEventoEditando] = useState(null); 

  // --- ESTADOS DE PLANTILLA Y EVENTOS ---
  const [modalCambio, setModalCambio] = useState(false);
  const [jugadoresEnCancha, setJugadoresEnCancha] = useState([]);
  const [jugadoresEnBanco, setJugadoresEnBanco] = useState([]);
  const [saleId, setSaleId] = useState('');
  const [entraId, setEntraId] = useState('');
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    if (!partido) navigate('/');
  }, [partido, navigate]);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let intervalo;
    if (relojCorriendo) {
      intervalo = setInterval(() => {
        setSegundos(s => {
          if (s === 59) {
            setMinuto(m => m + 1);
            return 0;
          }
          return s + 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [relojCorriendo]);

  useEffect(() => {
    async function cargarDatos() {
      if (!partido) return;
      try {
        const plantel = typeof partido.plantilla === 'string' ? JSON.parse(partido.plantilla) : partido.plantilla;
        const ids = plantel.map(p => p.id_jugador);
        
        const { data: dbJugadores } = await supabase.from('jugadores').select('*').in('id', ids);
        const mapJugadores = {};
        dbJugadores.forEach(j => { mapJugadores[j.id] = j; });

        const titulares = [];
        const suplentes = [];
        
        plantel.forEach(p => {
          const jFull = mapJugadores[p.id_jugador];
          if (jFull) {
            if (p.titular) titulares.push(jFull);
            else suplentes.push(jFull);
          }
        });

        setJugadoresEnCancha(titulares);
        setJugadoresEnBanco(suplentes);

        const { data: dbEventos } = await supabase.from('eventos').select('*').eq('id_partido', partido.id);
        if (dbEventos) setEventos(dbEventos);
      } catch (e) {
        console.error("Error parseando plantilla", e);
      }
    }
    cargarDatos();
  }, [partido]);

  const manejarCambioPeriodo = (e) => {
    const nuevo = e.target.value;
    setPeriodo(nuevo);
    if (nuevo === 'ST' && periodo === 'PT') setDireccionAtaque('izquierda');
    if (nuevo === 'PT' && periodo === 'ST') setDireccionAtaque('derecha');
  };

  // --- LOGICA DE REGISTRO NORMAL ---
  const registrarToque = (e) => {
    setPanelAbierto(true); // AUTO-ABRIR PANEL
    const rect = pitchRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setPanelLateral({ activo: true, x, y });
    setPasoRegistro(1);
    setEquipo('Propio');
    setAccion('');
    setAutorGol(null);
    setMenuActivo(null);
    setTabActiva('registro'); 
  };

  // --- LOGICA DE REGISTRO RÁPIDO (ABP) ---
  const triggerABP = (acc, x, y) => {
    setPanelAbierto(true); // AUTO-ABRIR PANEL
    setPanelLateral({ activo: true, x, y });
    setAccion(acc);
    setPasoRegistro(4); // PASO 4: Confirmación rápida de equipo
    setAutorGol(null);
    setMenuActivo(null);
    setTabActiva('registro');
  };

  const seleccionarAccion = (acc) => {
    setAccion(acc);
    setPasoRegistro(2);
    setMenuActivo(null);
  };

  // GUARDADO RÁPIDO PARA ABP (SIN JUGADOR)
  const guardarEventoRapido = async (equipoSeleccionado) => {
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }

    const quintetoActual = jugadoresEnCancha.map(j => j.id);

    const evento = {
      id_partido: partido.id,
      id_jugador: null, // SIN JUGADOR
      accion: accion,
      zona_x: dbX, zona_y: dbY,
      equipo: equipoSeleccionado,
      periodo: periodo, minuto: minuto,
      quinteto_activo: JSON.stringify(quintetoActual)
    };

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);

    const { data: eventosGuardados, error } = await supabase.from('eventos').insert([evento]).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      alert("Error de red al guardar el evento.");
    }
  };

  // GUARDADO COMPLETO (CON JUGADORES)
  const guardarEventoFinal = async (jugadorId) => {
    const quintetoActual = jugadoresEnCancha.map(j => j.id);

    if (pasoRegistro === 2 && accion === 'Remate - Gol') {
      setAutorGol(jugadorId);
      setPasoRegistro(3); 
      return;
    }

    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }

    const finalEquipo = jugadorId === null && pasoRegistro === 2 ? 'Rival' : equipo;
    const eventosAInsertar = [];

    if (pasoRegistro === 3) {
      eventosAInsertar.push({
        id_partido: partido.id, id_jugador: autorGol ? parseInt(autorGol, 10) : null,
        accion: 'Remate - Gol', zona_x: dbX, zona_y: dbY, equipo: finalEquipo,
        periodo: periodo, minuto: minuto, quinteto_activo: JSON.stringify(quintetoActual)
      });
      if (jugadorId) {
        eventosAInsertar.push({
          id_partido: partido.id, id_jugador: parseInt(jugadorId, 10),
          accion: 'Asistencia', zona_x: dbX, zona_y: dbY, equipo: finalEquipo,
          periodo: periodo, minuto: minuto, quinteto_activo: JSON.stringify(quintetoActual)
        });
      }
    } else {
      eventosAInsertar.push({
        id_partido: partido.id, id_jugador: jugadorId ? parseInt(jugadorId, 10) : null,
        accion: accion, zona_x: dbX, zona_y: dbY, equipo: finalEquipo,
        periodo: periodo, minuto: minuto, quinteto_activo: JSON.stringify(quintetoActual)
      });
    }

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setAutorGol(null);
    
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert(eventosAInsertar).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      alert("Error de red al guardar el evento.");
    }
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
    setAutorGol(null);
  };

  const eliminarEvento = async (idEvento) => {
    const eventoBackup = eventos.find(e => e.id === idEvento);
    if (!eventoBackup) return;
    setEventos(prev => prev.filter(e => e.id !== idEvento));
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('eventos').delete().eq('id', idEvento);
      if (error) throw error;
    } catch (error) {
      setEventos(prev => [...prev, eventoBackup]);
      alert("Error de red: No se pudo eliminar el evento.");
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmarEdicion = async () => {
    if (!eventoEditando) return;
    setEventos(prev => prev.map(e => e.id === eventoEditando.id ? eventoEditando : e));
    try {
      const payload = {
        periodo: eventoEditando.periodo, minuto: parseInt(eventoEditando.minuto, 10),
        id_jugador: eventoEditando.id_jugador ? parseInt(eventoEditando.id_jugador, 10) : null
      };
      const { error } = await supabase.from('eventos').update(payload).eq('id', eventoEditando.id);
      if (error) throw error;
    } catch (error) {
      alert("Error de red: No se pudo modificar el evento.");
    } finally {
      setEventoEditando(null); 
    }
  };

  const guardarCambio = async () => {
    if (!saleId || !entraId) return;
    const jSale = jugadoresEnCancha.find(j => j.id == saleId);
    const jEntra = jugadoresEnBanco.find(j => j.id == entraId);
    if (!jSale || !jEntra) return;

    const evtSalida = {
      id_partido: partido.id, id_jugador: jSale.id, accion: 'Cambio', equipo: 'Propio',
      periodo: periodo, minuto: minuto, id_receptor: jEntra.id,
      quinteto_activo: JSON.stringify(jugadoresEnCancha.map(j => j.id))
    };

    setJugadoresEnCancha(prev => [...prev.filter(j => j.id != saleId), jEntra]);
    setJugadoresEnBanco(prev => [...prev.filter(j => j.id != entraId), jSale]);
    setModalCambio(false); setSaleId(''); setEntraId('');

    const { data: cambioGuardado } = await supabase.from('eventos').insert([evtSalida]).select();
    if (cambioGuardado) setEventos(prev => [...prev, ...cambioGuardado]);
  };

  if (!partido) return <div>Cargando...</div>;

  const jugadoresActivos = equipo === 'Propio' ? jugadoresEnCancha : [];
  const todosLosJugadores = [...jugadoresEnCancha, ...jugadoresEnBanco];

  const getColorAccion = (acc) => {
    if (acc.includes('Gol')) return '#00ff88';
    if (acc === 'Asistencia') return '#06b6d4';
    if (acc.includes('Ganado') || acc === 'Recuperación') return '#3b82f6';
    if (acc.includes('Perdido') || acc === 'Pérdida') return '#ef4444';
    if (acc === 'Tarjeta Roja') return '#991b1b';
    if (acc === 'Tarjeta Amarilla') return '#facc15';
    if (acc === 'Falta cometida') return '#ec4899';
    return '#888';
  };

  const BotonAccion = ({ label, color, span = 1, bold = false, onClick }) => (
    <button onClick={onClick} className="btn-action" style={{ gridColumn: `span ${span}`, background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}`, color: color, fontWeight: bold ? 800 : 500, padding: '12px 5px', fontSize: '0.75rem', textShadow: bold ? `0 0 5px ${color}` : 'none', cursor: 'pointer' }}>
      {label}
    </button>
  );

  const containerStyle = esMovil ? { display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' } : { display: 'flex', height: '100dvh', background: 'var(--bg)' };
  const sidePanelStyle = esMovil ? { width: '100%', height: '50vh', borderTop: '1px solid var(--border)', background: 'var(--panel)', padding: '15px', overflowY: 'auto' } : { width: '320px', borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', padding: '15px', overflowY: 'auto' };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', gap: '10px' }}>
          <div className="stat-label">TRACKER // {partido.rival}</div>
          
          <button 
            onClick={() => setDireccionAtaque(d => d === 'derecha' ? 'izquierda' : 'derecha')}
            style={{ background: '#111', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '8px 15px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 10px rgba(0,255,136,0.1)' }}
          >
            MI EQUIPO ATACA HACIA: <span style={{ fontSize: '1.2rem' }}>{direccionAtaque === 'derecha' ? '➡️' : '⬅️'}</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPanelAbierto(!panelAbierto)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem' }}>{panelAbierto ? "OCULTAR" : "MOSTRAR"} PANEL</button>
            <button onClick={() => setModalCambio(true)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem' }}>CAMBIOS</button>
            <div style={relojContainer}>
              <button onClick={() => setRelojCorriendo(!relojCorriendo)} style={btnPlay}>{relojCorriendo ? '⏸' : '▶'}</button>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--accent)', fontWeight: 800 }}>
                {String(minuto).padStart(2,'0')}:{String(segundos).padStart(2,'0')}
              </div>
              <select value={periodo} onChange={manejarCambioPeriodo} style={{ background: 'transparent', border: 'none', color: '#888' }}>
                <option value="PT">PT</option><option value="ST">ST</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '30px' }}>
          <div className="pitch-wrapper" style={{ width: '100%', maxWidth: esMovil ? '100%' : 'calc((100dvh - 180px) * 2)', aspectRatio: '2 / 1', position: 'relative' }}>
            
            {/* BOTONES RÁPIDOS ABP CON OPACIDAD 0.5 */}
            <button onClick={() => triggerABP('Córner', 0, 0)} style={{...abpBtn, top: '-25px', left: '-25px', color: '#f97316', borderColor: '#f97316'}}>C</button>
            <button onClick={() => triggerABP('Córner', 100, 0)} style={{...abpBtn, top: '-25px', right: '-25px', color: '#f97316', borderColor: '#f97316'}}>C</button>
            <button onClick={() => triggerABP('Córner', 0, 100)} style={{...abpBtn, bottom: '-25px', left: '-25px', color: '#f97316', borderColor: '#f97316'}}>C</button>
            <button onClick={() => triggerABP('Córner', 100, 100)} style={{...abpBtn, bottom: '-25px', right: '-25px', color: '#f97316', borderColor: '#f97316'}}>C</button>

            <button onClick={() => triggerABP('Lateral', 12.5, 0)} style={{...abpBtn, top: '-25px', left: 'calc(12.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 37.5, 0)} style={{...abpBtn, top: '-25px', left: 'calc(37.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 62.5, 0)} style={{...abpBtn, top: '-25px', left: 'calc(62.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 87.5, 0)} style={{...abpBtn, top: '-25px', left: 'calc(87.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>

            <button onClick={() => triggerABP('Lateral', 12.5, 100)} style={{...abpBtn, bottom: '-25px', left: 'calc(12.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 37.5, 100)} style={{...abpBtn, bottom: '-25px', left: 'calc(37.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 62.5, 100)} style={{...abpBtn, bottom: '-25px', left: 'calc(62.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>
            <button onClick={() => triggerABP('Lateral', 87.5, 100)} style={{...abpBtn, bottom: '-25px', left: 'calc(87.5% - 15px)', color: '#06b6d4', borderColor: '#06b6d4'}}>L</button>

            <div ref={pitchRef} onClick={registrarToque} className="pitch-container" style={{ width: '100%', height: '100%', position: 'relative', cursor: 'crosshair', backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '15px 15px', overflow: 'hidden', border: '2px solid var(--border)' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '10rem', opacity: 0.05, pointerEvents: 'none' }}>
                {direccionAtaque === 'derecha' ? '➡️' : '⬅️'}
              </div>

              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', pointerEvents: 'none' }}></div>
              <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>
              
              <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', backgroundColor: direccionAtaque === 'izquierda' ? 'rgba(0,255,136,0.05)' : 'transparent' }}></div>
              <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', backgroundColor: direccionAtaque === 'derecha' ? 'rgba(0,255,136,0.05)' : 'transparent' }}></div>

              {eventos.filter(e => e.zona_x !== null).map((ev) => {
                const renderX = direccionAtaque === 'derecha' ? ev.zona_x : 100 - ev.zona_x;
                const renderY = direccionAtaque === 'derecha' ? ev.zona_y : 100 - ev.zona_y;
                return (
                  <div key={ev.id} style={{ position: 'absolute', left: `${renderX}%`, top: `${renderY}%`, width: '14px', height: '14px', backgroundColor: getColorAccion(ev.accion), border: '2px solid #000', borderRadius: '2px', transform: 'translate(-50%, -50%)', zIndex: 10 }} />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {panelAbierto && (
        <aside style={sidePanelStyle}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '15px', flexShrink: 0 }}>
            <button onClick={() => setTabActiva('registro')} style={{ flex: 1, padding: '10px', background: tabActiva === 'registro' ? 'rgba(255,255,255,0.1)' : 'transparent', color: tabActiva === 'registro' ? '#fff' : 'var(--text-dim)', border: 'none', fontWeight: 600, cursor: 'pointer' }}>REGISTRO</button>
            <button onClick={() => setTabActiva('timeline')} style={{ flex: 1, padding: '10px', background: tabActiva === 'timeline' ? 'rgba(255,255,255,0.1)' : 'transparent', color: tabActiva === 'timeline' ? '#fff' : 'var(--text-dim)', border: 'none', fontWeight: 600, cursor: 'pointer' }}>TIMELINE ({eventos.length})</button>
          </div>

          {tabActiva === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
              {eventos.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '20px', color: 'var(--text-dim)' }}>No hay eventos registrados.</div>
              ) : (
                [...eventos].reverse().map(ev => {
                  const jugador = todosLosJugadores.find(j => j.id === ev.id_jugador);
                  const nombreJugador = jugador ? (jugador.apellido || jugador.nombre) : 'Sin asignar';
                  const labelAccion = ev.accion === 'Remate - Gol' ? 'GOL' : ev.accion.toUpperCase();

                  return (
                    <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: '10px', borderRadius: '4px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>{ev.periodo} {ev.minuto}'</div>
                        <div style={{ fontSize: '0.85rem', color: getColorAccion(ev.accion), fontWeight: 'bold' }}>{labelAccion}</div>
                        <div style={{ fontSize: '0.75rem', color: '#ccc' }}>{nombreJugador} ({ev.equipo})</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <button onClick={() => setEventoEditando({ ...ev })} style={{ background: 'none', border: '1px solid var(--text-dim)', color: 'var(--text-dim)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>EDITAR</button>
                        <button onClick={() => eliminarEvento(ev.id)} disabled={isDeleting} style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem' }}>BORRAR</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tabActiva === 'registro' && (
            <>
              {!panelLateral.activo ? (
                <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.5 }}>
                  <div style={{ fontSize: '3rem' }}>📍</div>
                  <div className="stat-label">SISTEMA EN ESPERA</div>
                  <p style={{ fontSize: '0.8rem' }}>Tocá la pista para registrar</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                    <div className="stat-label">
                      {pasoRegistro === 1 ? '1. ACCIÓN' : pasoRegistro === 2 ? '2. AUTOR' : pasoRegistro === 3 ? '3. ASISTENCIA' : 'CONFIRMAR EQUIPO'}
                    </div>
                    <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                  </div>

                  {/* NUEVO PASO 4: REGISTRO RÁPIDO ABP */}
                  {pasoRegistro === 4 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>
                      <div className="stat-label" style={{ color: getColorAccion(accion), textAlign: 'center', fontSize: '1.2rem', margin: '10px 0' }}>
                        {accion.toUpperCase()} RÁPIDO
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center', marginBottom: '10px' }}>
                        ¿De quién es la pelota?
                      </div>
                      
                      <button onClick={() => guardarEventoRapido('Propio')} className="btn-action" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '20px', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer', borderRadius: '4px' }}>
                        MI EQUIPO
                      </button>
                      <button onClick={() => guardarEventoRapido('Rival')} className="btn-action" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #555', color: '#fff', padding: '20px', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer', borderRadius: '4px' }}>
                        RIVAL
                      </button>
                    </div>
                  ) : pasoRegistro === 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '15px' }}>
                      <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                        <button onClick={() => setEquipo('Propio')} style={{ flex: 1, padding: '10px', background: equipo === 'Propio' ? 'rgba(0,255,136,0.1)' : 'none', color: equipo === 'Propio' ? 'var(--accent)' : 'var(--text-dim)', border: 'none', fontWeight: 800, cursor: 'pointer' }}>MI EQUIPO</button>
                        <button onClick={() => setEquipo('Rival')} style={{ flex: 1, padding: '10px', background: equipo === 'Rival' ? 'rgba(255,255,255,0.05)' : 'none', color: equipo === 'Rival' ? '#fff' : 'var(--text-dim)', border: 'none', fontWeight: 800, cursor: 'pointer' }}>RIVAL</button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>FINALIZACIÓN</div>
                          <BotonAccion label="GOL" color="#00ff88" bold={true} span={2} onClick={() => seleccionarAccion('Remate - Gol')} />
                          {menuActivo === 'remate' ? (
                            <>
                              <BotonAccion label="ATAJADO" color="#3b82f6" onClick={() => seleccionarAccion('Remate - Atajado')} />
                              <BotonAccion label="DESVIADO" color="#888" onClick={() => seleccionarAccion('Remate - Desviado')} />
                              <BotonAccion label="REBATIDO" color="#a855f7" onClick={() => seleccionarAccion('Remate - Rebatido')} />
                              <BotonAccion label="✕" color="#fff" onClick={() => setMenuActivo(null)} />
                            </>
                          ) : (
                            <BotonAccion label="REMATE" color="#3b82f6" span={2} onClick={() => setMenuActivo('remate')} />
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>POSESIÓN Y DUELOS</div>
                          <BotonAccion label="RECUPERACIÓN" color="#eab308" onClick={() => seleccionarAccion('Recuperación')} />
                          <BotonAccion label="PÉRDIDA" color="#ef4444" onClick={() => seleccionarAccion('Pérdida')} />
                          <BotonAccion label="DUELO DEF GANADO" color="#10b981" onClick={() => seleccionarAccion('Duelo DEF Ganado')} />
                          <BotonAccion label="DUELO DEF PERDIDO" color="#dc2626" onClick={() => seleccionarAccion('Duelo DEF Perdido')} />
                          <BotonAccion label="DUELO OFE GANADO" color="#0ea5e9" onClick={() => seleccionarAccion('Duelo OFE Ganado')} />
                          <BotonAccion label="DUELO OFE PERDIDO" color="#f97316" onClick={() => seleccionarAccion('Duelo OFE Perdido')} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>DISCIPLINA</div>
                          <BotonAccion label="FALTA" color="#ec4899" onClick={() => seleccionarAccion('Falta cometida')} />
                          {menuActivo === 'tarjetas' ? (
                            <>
                              <BotonAccion label="AMARILLA" color="#facc15" onClick={() => seleccionarAccion('Tarjeta Amarilla')} />
                              <BotonAccion label="ROJA" color="#991b1b" onClick={() => seleccionarAccion('Tarjeta Roja')} />
                              <BotonAccion label="✕" color="#fff" onClick={() => setMenuActivo(null)} />
                            </>
                          ) : (
                            <BotonAccion label="TARJETAS" color="#facc15" onClick={() => setMenuActivo('tarjetas')} />
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>ABP MANUAL (SI NO USASTE LA CANCHA)</div>
                          <BotonAccion label="LATERAL" color="#06b6d4" onClick={() => seleccionarAccion('Lateral')} />
                          <BotonAccion label="CÓRNER" color="#f97316" onClick={() => seleccionarAccion('Córner')} />
                        </div>
                      </div>
                    </div>
                  ) : pasoRegistro === 2 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                      <div className="stat-label" style={{ color: getColorAccion(accion) }}>{accion}</div>
                      {jugadoresActivos.map(j => (
                        <button key={j.id} onClick={() => guardarEventoFinal(j.id)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #ffffff', padding: '15px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                          <span>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span>
                          <span style={{ color: 'var(--accent)' }}>{j.dorsal}</span>
                        </button>
                      ))}
                      <button onClick={() => guardarEventoFinal(null)} style={{ marginTop: '10px', background: 'none', border: '1px dashed #444', color: '#ffffff', padding: '10px', cursor: 'pointer' }}>SIN JUGADOR / RIVAL</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                      <div className="stat-label" style={{ color: '#06b6d4', marginBottom: '5px' }}>¿QUIÉN DIO EL PASE PREVIO?</div>
                      {jugadoresActivos.filter(j => j.id != autorGol).map(j => (
                        <button key={j.id} onClick={() => guardarEventoFinal(j.id)} className="btn-action" style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid #06b6d4', padding: '15px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', color: '#fff', cursor: 'pointer' }}>
                          <span>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span>
                          <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>{j.dorsal}</span>
                        </button>
                      ))}
                      <button onClick={() => guardarEventoFinal(null)} style={{ marginTop: '10px', background: 'none', border: '1px dashed #444', color: '#ffffff', padding: '10px', cursor: 'pointer' }}>JUGADA INDIVIDUAL (SIN ASISTENCIA)</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </aside>
      )}

      {eventoEditando && (
        <div style={overlayStyle}>
          <div style={modalIndustrial}>
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)' }}>EDITAR METADATA</div>
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>PERÍODO Y MINUTO</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select value={eventoEditando.periodo} onChange={e => setEventoEditando({...eventoEditando, periodo: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
                    <option value="PT">PT</option><option value="ST">ST</option>
                  </select>
                  <input type="number" value={eventoEditando.minuto} onChange={e => setEventoEditando({...eventoEditando, minuto: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }} />
                </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>JUGADOR ASIGNADO</label>
                <select value={eventoEditando.id_jugador || ''} onChange={e => setEventoEditando({...eventoEditando, id_jugador: e.target.value || null})} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
                  <option value="">SIN JUGADOR ASIGNADO</option>
                  {todosLosJugadores.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido || j.nombre}</option>)}
                </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEventoEditando(null)} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarEdicion} className="btn-action" style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {modalCambio && (
        <div style={overlayStyle}>
          <div style={modalIndustrial}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>GESTIÓN DE CAMBIOS</div>
            <select value={saleId} onChange={(e) => setSaleId(e.target.value)} style={{ width: '100%', marginBottom: '10px', padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
              <option value="">SALE...</option>
              {jugadoresEnCancha.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido ? j.apellido : j.nombre}</option>)}
            </select>
            <select value={entraId} onChange={(e) => setEntraId(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
              <option value="">ENTRA...</option>
              {jugadoresEnBanco.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido ? j.apellido : j.nombre}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalCambio(false)} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={guardarCambio} className="btn-action" style={{ flex: 1, padding: '10px', background: '#fff', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ESTILOS NUEVOS PARA BOTONES ABP CON OPACIDAD
const abpBtn = {
  position: 'absolute',
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  background: 'rgba(17, 17, 17, 0.5)', // Fondo oscuro con opacidad
  border: '2px solid',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontWeight: 800,
  fontSize: '0.8rem',
  cursor: 'pointer',
  zIndex: 100,
  opacity: 0.5, // Botón entero al 50% de opacidad
  boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
  transition: 'opacity 0.2s'
};

const relojContainer = { display: 'flex', alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px' };
const btnPlay = { background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-dim)', padding: '10px 15px', cursor: 'pointer', fontSize: '0.8rem' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalIndustrial = { background: 'var(--panel)', border: '1px solid var(--border)', padding: '30px', width: '350px', borderRadius: '4px', maxWidth: '90%' };

export default TomaDatos;