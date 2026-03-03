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

  // --- ESTADOS DEL PANEL ---
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [panelLateral, setPanelLateral] = useState({ activo: false, x: 0, y: 0 });
  const [pasoRegistro, setPasoRegistro] = useState(1);
  const [equipo, setEquipo] = useState('Propio');
  const [accion, setAccion] = useState('');
  
  // --- ESTADOS PARA GOL Y ASISTENCIA ---
  const [menuActivo, setMenuActivo] = useState(null); 
  const [autorGol, setAutorGol] = useState(null); // Guarda temporalmente quién hizo el gol

  // --- ESTADOS DE PLANTILLA Y EVENTOS ---
  const [modalCambio, setModalCambio] = useState(false);
  const [jugadoresEnCancha, setJugadoresEnCancha] = useState([]);
  const [jugadoresEnBanco, setJugadoresEnBanco] = useState([]);
  const [saleId, setSaleId] = useState('');
  const [entraId, setEntraId] = useState('');
  const [eventos, setEventos] = useState([]);

  // Redirección de seguridad
  useEffect(() => {
    if (!partido) navigate('/');
  }, [partido, navigate]);

  // Listener de Resize para Responsive
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reloj
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

  // Carga inicial de datos
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

        // Cargar eventos previos
        const { data: dbEventos } = await supabase.from('eventos').select('*').eq('id_partido', partido.id);
        if (dbEventos) setEventos(dbEventos);

      } catch (e) {
        console.error("Error parseando plantilla", e);
      }
    }
    cargarDatos();
  }, [partido]);

  // --- LOGICA DE REGISTRO ---
  const registrarToque = (e) => {
    if (!panelAbierto) return;
    const rect = pitchRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setPanelLateral({ activo: true, x, y });
    setPasoRegistro(1);
    setAccion('');
    setAutorGol(null);
    setMenuActivo(null);
  };

  const seleccionarAccion = (acc) => {
    setAccion(acc);
    setPasoRegistro(2);
    setMenuActivo(null);
  };

  const guardarEventoFinal = async (jugadorId) => {
    const quintetoActual = jugadoresEnCancha.map(j => j.id);

    // 1. SI ES UN GOL Y ESTAMOS EN EL PASO 2: Guardar al autor y pedir asistencia
    if (pasoRegistro === 2 && accion === 'Remate - Gol') {
      setAutorGol(jugadorId);
      setPasoRegistro(3); // Avanzamos al paso de asistencia
      return;
    }

    const eventosAInsertar = [];

    // 2. SI ESTAMOS EN EL PASO 3 (Guardando Gol + Asistencia)
    if (pasoRegistro === 3) {
      // Evento A: El Gol
      eventosAInsertar.push({
        id_partido: partido.id,
        id_jugador: autorGol ? parseInt(autorGol, 10) : null,
        accion: 'Remate - Gol',
        zona_x: panelLateral.x,
        zona_y: panelLateral.y,
        equipo: equipo,
        periodo: periodo,
        minuto: minuto,
        quinteto_activo: JSON.stringify(quintetoActual)
      });

      // Evento B: La Asistencia (si no eligió "Sin Asistencia")
      if (jugadorId) {
        eventosAInsertar.push({
          id_partido: partido.id,
          id_jugador: parseInt(jugadorId, 10),
          accion: 'Asistencia',
          zona_x: panelLateral.x,
          zona_y: panelLateral.y,
          equipo: equipo,
          periodo: periodo,
          minuto: minuto,
          quinteto_activo: JSON.stringify(quintetoActual)
        });
      }
    } else {
      // 3. FLUJO NORMAL PARA EL RESTO DE ACCIONES
      eventosAInsertar.push({
        id_partido: partido.id,
        id_jugador: jugadorId ? parseInt(jugadorId, 10) : null,
        accion: accion,
        zona_x: panelLateral.x,
        zona_y: panelLateral.y,
        equipo: equipo,
        periodo: periodo,
        minuto: minuto,
        quinteto_activo: JSON.stringify(quintetoActual)
      });
    }

    // Actualizamos la UI inmediatamente
    const nuevosEventosLocal = eventosAInsertar.map((ev, i) => ({ ...ev, id: Date.now() + i }));
    setEventos(prev => [...prev, ...nuevosEventosLocal]);

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setAutorGol(null);
    
    // Impacto en base de datos
    await supabase.from('eventos').insert(eventosAInsertar);
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
    setAutorGol(null);
  };

  // --- LOGICA DE CAMBIOS ---
  const guardarCambio = async () => {
    if (!saleId || !entraId) return;

    const jSale = jugadoresEnCancha.find(j => j.id == saleId);
    const jEntra = jugadoresEnBanco.find(j => j.id == entraId);

    if (!jSale || !jEntra) return;

    const quintetoActual = jugadoresEnCancha.map(j => j.id);

    // Evento de Salida
    const evtSalida = {
      id_partido: partido.id,
      id_jugador: jSale.id,
      accion: 'Cambio',
      equipo: 'Propio',
      periodo: periodo,
      minuto: minuto,
      id_receptor: jEntra.id,
      quinteto_activo: JSON.stringify(quintetoActual)
    };

    setJugadoresEnCancha(prev => [...prev.filter(j => j.id != saleId), jEntra]);
    setJugadoresEnBanco(prev => [...prev.filter(j => j.id != entraId), jSale]);

    setModalCambio(false);
    setSaleId('');
    setEntraId('');

    await supabase.from('eventos').insert([evtSalida]);
  };

  if (!partido) return <div>Cargando...</div>;

  const jugadoresActivos = equipo === 'Propio' ? jugadoresEnCancha : [];

  const getColorAccion = (acc) => {
    if (acc.includes('Gol')) return '#00ff88';
    if (acc === 'Asistencia') return '#06b6d4'; // Cyan para asistencias
    if (acc.includes('Ganado') || acc === 'Recuperación') return '#3b82f6';
    if (acc.includes('Perdido') || acc === 'Pérdida') return '#ef4444';
    if (acc === 'Tarjeta Roja') return '#991b1b';
    if (acc === 'Tarjeta Amarilla') return '#facc15';
    if (acc === 'Falta cometida') return '#ec4899';
    return '#888';
  };

  const BotonAccion = ({ label, color, span = 1, bold = false, onClick }) => (
    <button onClick={onClick} className="btn-action" style={{ 
      gridColumn: `span ${span}`, background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}`, 
      color: color, fontWeight: bold ? 800 : 500, padding: '12px 5px', fontSize: '0.75rem', 
      textShadow: bold ? `0 0 5px ${color}` : 'none' 
    }}>
      {label}
    </button>
  );

  const containerStyle = esMovil ? { display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' } : { display: 'flex', height: '100dvh', background: 'var(--bg)' };
  const sidePanelStyle = esMovil ? { width: '100%', height: '50vh', borderTop: '1px solid var(--border)', background: 'var(--panel)', padding: '15px', overflowY: 'auto' } : { width: '320px', borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', padding: '15px', overflowY: 'auto' };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', flex: 1 }}>
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div className="stat-label">TRACKER // {partido.rival}</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setPanelAbierto(!panelAbierto)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem' }}>{panelAbierto ? "OCULTAR PANEL" : "MOSTRAR PANEL"}</button>
            <button onClick={() => setModalCambio(true)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem' }}>CAMBIOS</button>
            <div style={relojContainer}>
              <button onClick={() => setRelojCorriendo(!relojCorriendo)} style={btnPlay}>{relojCorriendo ? '⏸' : '▶'}</button>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', color: 'var(--accent)', fontWeight: 800 }}>
                {String(minuto).padStart(2,'0')}:{String(segundos).padStart(2,'0')}
              </div>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#888' }}>
                <option value="PT">PT</option><option value="ST">ST</option>
              </select>
            </div>
          </div>
        </div>

        {/* CANCHA */}
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '10px' }}>
            <div className="pitch-wrapper" style={{ width: '100%', maxWidth: esMovil ? '100%' : 'calc((100dvh - 120px) * 2)', aspectRatio: '2 / 1', position: 'relative' }}>
              <div ref={pitchRef} onClick={registrarToque} className="pitch-container" style={{ width: '100%', height: '100%', position: 'relative', cursor: 'crosshair', backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '15px 15px', overflow: 'hidden' }}>
                
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', pointerEvents: 'none' }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>
                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none' }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none' }}></div>

                {eventos.filter(e => e.zona_x !== null).map((ev) => (
                  <div key={ev.id} style={{ position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '14px', height: '14px', backgroundColor: getColorAccion(ev.accion), border: '2px solid #000', borderRadius: '2px', transform: 'translate(-50%, -50%)', zIndex: 10 }} />
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* PANEL LATERAL */}
      {panelAbierto && (
        <aside style={sidePanelStyle}>
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
                  {pasoRegistro === 1 ? '1. ACCIÓN' : pasoRegistro === 2 ? '2. AUTOR DEL GOL' : '3. ASISTENCIA'}
                </div>
                <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
              </div>

              {pasoRegistro === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <button onClick={() => setEquipo('Propio')} style={{ flex: 1, padding: '10px', background: equipo === 'Propio' ? 'rgba(0,255,136,0.1)' : 'none', color: equipo === 'Propio' ? 'var(--accent)' : 'var(--text-dim)', border: 'none', fontWeight: 800 }}>MI EQUIPO</button>
                    <button onClick={() => setEquipo('Rival')} style={{ flex: 1, padding: '10px', background: equipo === 'Rival' ? 'rgba(255,255,255,0.05)' : 'none', color: equipo === 'Rival' ? '#fff' : 'var(--text-dim)', border: 'none', fontWeight: 800 }}>RIVAL</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>🎯 FINALIZACIÓN</div>
                      <BotonAccion label="⚽ GOL" color="#00ff88" bold={true} span={2} onClick={() => seleccionarAccion('Remate - Gol')} />
                      
                      {menuActivo === 'remate' ? (
                        <>
                          <BotonAccion label="ATAJADO" color="#3b82f6" onClick={() => seleccionarAccion('Remate - Atajado')} />
                          <BotonAccion label="DESVIADO" color="#888" onClick={() => seleccionarAccion('Remate - Desviado')} />
                          <BotonAccion label="REBATIDO" color="#a855f7" onClick={() => seleccionarAccion('Remate - Rebatido')} />
                          <BotonAccion label="✕" color="#fff" onClick={() => setMenuActivo(null)} />
                        </>
                      ) : (
                        <BotonAccion label="🔭 REMATE..." color="#3b82f6" span={2} onClick={() => setMenuActivo('remate')} />
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>⚔️ POSESIÓN Y FRICCIÓN</div>
                      <BotonAccion label="RECU." color="#eab308" onClick={() => seleccionarAccion('Recuperación')} />
                      <BotonAccion label="PÉRDIDA" color="#ef4444" onClick={() => seleccionarAccion('Pérdida')} />
                      <BotonAccion label="DEF (✓)" color="#10b981" onClick={() => seleccionarAccion('Duelo DEF Ganado')} />
                      <BotonAccion label="DEF (✕)" color="#dc2626" onClick={() => seleccionarAccion('Duelo DEF Perdido')} />
                      <BotonAccion label="OFE (✓)" color="#0ea5e9" onClick={() => seleccionarAccion('Duelo OFE Ganado')} />
                      <BotonAccion label="OFE (✕)" color="#f97316" onClick={() => seleccionarAccion('Duelo OFE Perdido')} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>🛑 DISCIPLINA</div>
                      <BotonAccion label="FALTA" color="#ec4899" onClick={() => seleccionarAccion('Falta cometida')} />
                      
                      {menuActivo === 'tarjetas' ? (
                        <>
                          <BotonAccion label="AMARILLA" color="#facc15" onClick={() => seleccionarAccion('Tarjeta Amarilla')} />
                          <BotonAccion label="ROJA" color="#991b1b" onClick={() => seleccionarAccion('Tarjeta Roja')} />
                          <BotonAccion label="✕" color="#fff" onClick={() => setMenuActivo(null)} />
                        </>
                      ) : (
                        <BotonAccion label="TARJETAS..." color="#facc15" onClick={() => setMenuActivo('tarjetas')} />
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>🏳️ BFA</div>
                      <BotonAccion label="LATERAL" color="#06b6d4" onClick={() => seleccionarAccion('Lateral')} />
                      <BotonAccion label="CÓRNER" color="#f97316" onClick={() => seleccionarAccion('Córner')} />
                    </div>
                  </div>
                </div>
              ) : pasoRegistro === 2 ? (
                // PASO 2: Selección del Autor de la Acción
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="stat-label" style={{ color: getColorAccion(accion) }}>{accion}</div>
                  {jugadoresActivos.map(j => (
                    <button key={j.id} onClick={() => guardarEventoFinal(j.id)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #ffffff', padding: '15px', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span>
                      <span style={{ color: 'var(--accent)' }}>{j.dorsal}</span>
                    </button>
                  ))}
                  <button onClick={() => guardarEventoFinal(null)} style={{ marginTop: '10px', background: 'none', border: '1px dashed #444', color: '#ffffff', padding: '10px', cursor: 'pointer' }}>SIN JUGADOR / RIVAL</button>
                </div>
              ) : (
                // PASO 3: Selección de Asistencia (Aparece sólo tras marcar Gol)
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="stat-label" style={{ color: '#06b6d4', marginBottom: '5px' }}>¿QUIÉN DIO EL PASE PREVIO?</div>
                  {jugadoresActivos
                    .filter(j => j.id != autorGol) // Ocultamos al jugador que hizo el gol para evitar auto-asistencia
                    .map(j => (
                    <button key={j.id} onClick={() => guardarEventoFinal(j.id)} className="btn-action" style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid #06b6d4', padding: '15px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
                      <span>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span>
                      <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>{j.dorsal}</span>
                    </button>
                  ))}
                  <button onClick={() => guardarEventoFinal(null)} style={{ marginTop: '10px', background: 'none', border: '1px dashed #444', color: '#ffffff', padding: '10px', cursor: 'pointer' }}>JUGADA INDIVIDUAL (SIN ASISTENCIA)</button>
                </div>
              )}
            </>
          )}
        </aside>
      )}

      {/* MODAL DE CAMBIOS */}
      {modalCambio && (
        <div style={overlayStyle}>
          <div style={modalIndustrial}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>GESTIÓN DE CAMBIOS</div>
            <select value={saleId} onChange={(e) => setSaleId(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
              <option value="">SALE...</option>
              {jugadoresEnCancha.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido ? j.apellido : j.nombre}</option>)}
            </select>
            <select value={entraId} onChange={(e) => setEntraId(e.target.value)} style={{ width: '100%', marginBottom: '20px' }}>
              <option value="">ENTRA...</option>
              {jugadoresEnBanco.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido ? j.apellido : j.nombre}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalCambio(false)} className="btn-action" style={{ flex: 1, background: '#222' }}>CANCELAR</button>
              <button onClick={guardarCambio} className="btn-action" style={{ flex: 1 }}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const relojContainer = { display: 'flex', alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px' };
const btnPlay = { background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-dim)', padding: '10px 15px', cursor: 'pointer', fontSize: '0.8rem' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalIndustrial = { background: 'var(--panel)', border: '1px solid var(--border)', padding: '30px', width: '350px', borderRadius: '4px', maxWidth: '90%' };

export default TomaDatos;