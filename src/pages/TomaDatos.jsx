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
  
  // --- ESTADO PARA SUBMENÚS (Remates y Tarjetas) ---
  const [menuActivo, setMenuActivo] = useState(null); 

  // --- ESTADOS DE PLANTILLA Y EVENTOS ---
  const [modalCambio, setModalCambio] = useState(false);
  const [saleId, setSaleId] = useState('');
  const [entraId, setEntraId] = useState('');
  const [activosEnCancha, setActivosEnCancha] = useState([]);
  const [jugadoresPartido, setJugadoresPartido] = useState([]);
  const [eventos, setEventos] = useState([]);

  // DETECTOR DE TAMAÑO DE PANTALLA
  useEffect(() => {
    const manejarResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', manejarResize);
    return () => window.removeEventListener('resize', manejarResize);
  }, []);

  // RELOJ
  useEffect(() => {
    let intervalo;
    if (relojCorriendo) {
      intervalo = setInterval(() => {
        setSegundos(prev => {
          if (prev >= 59) {
            setMinuto(m => m + 1);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [relojCorriendo]);

  // CARGA INICIAL
  useEffect(() => {
    if (partido && partido.plantilla) obtenerDatosIniciales(partido.id, partido.plantilla);
  }, [partido]);

  async function obtenerDatosIniciales(idPartido, plantilla) {
    const ids = plantilla.map(p => p.id_jugador);
    const { data: dataJugadores } = await supabase.from('jugadores').select('*').in('id', ids);
    if (dataJugadores) setJugadoresPartido(dataJugadores);

    const titulares = plantilla.filter(p => p.titular).map(p => parseInt(p.id_jugador));
    const { data: dataEventos } = await supabase.from('eventos').select('*').eq('id_partido', idPartido).order('id', { ascending: true });
    
    if (dataEventos) {
      setEventos(dataEventos);
      let activosActuales = [...titulares];
      dataEventos.forEach(ev => {
        if (ev.accion === 'Cambio' || ev.accion === 'Lesión') {
          activosActuales = activosActuales.filter(id => id !== ev.id_jugador);
          if (ev.id_receptor) activosActuales.push(ev.id_receptor);
        }
      });
      setActivosEnCancha(activosActuales);
    } else {
      setActivosEnCancha(titulares);
    }
  }

  if (!partido) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px' }}>
        <div className="stat-label">ERROR</div>
        <div className="stat-value" style={{ color: 'var(--danger)', fontSize: '1.5rem' }}>NO HAY PARTIDO ACTIVO</div>
        <button onClick={() => navigate('/')} className="btn-action" style={{ marginTop: '20px' }}>VOLVER A INICIO</button>
      </div>
    );
  }

  const getColorAccion = (acc) => {
    const colores = {
      'Remate - Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7',
      'Recuperación': '#eab308', 'Pérdida': '#ef4444',
      'Duelo DEF Ganado': '#10b981', 'Duelo DEF Perdido': '#dc2626',
      'Duelo OFE Ganado': '#0ea5e9', 'Duelo OFE Perdido': '#f97316',
      'Lateral': '#06b6d4', 'Córner': '#f97316', 'Falta cometida': '#ec4899',
      'Tarjeta Amarilla': '#facc15', 'Tarjeta Roja': '#991b1b'
    };
    return colores[acc] || '#ffffff';
  };

  const registrarToque = (e) => {
    if (panelLateral.activo || !pitchRef.current) return; 
    const rect = pitchRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPanelLateral({ activo: true, x, y });
    setPanelAbierto(true);
    setPasoRegistro(1);
    setMenuActivo(null);
  };

  const seleccionarAccion = (acc) => {
    setAccion(acc);
    setPasoRegistro(2);
    setMenuActivo(null);
  };

  // 📸 GUARDADO CON FOTO DEL QUINTETO
  const guardarEventoFinal = async (idJugadorSeleccionado) => {
    let jId = equipo === 'Propio' ? (idJugadorSeleccionado ? parseInt(idJugadorSeleccionado) : null) : null;
    let rId = equipo === 'Rival' && (accion === 'Falta cometida' || accion === 'Remate - Atajado') ? (idJugadorSeleccionado ? parseInt(idJugadorSeleccionado) : null) : null;

    const nuevoEvento = {
      id_partido: partido.id, 
      id_jugador: jId, 
      id_receptor: rId,
      accion: accion, 
      zona_x: panelLateral.x, 
      zona_y: panelLateral.y, 
      equipo: equipo, 
      periodo: periodo, 
      minuto: minuto,
      quinteto_activo: activosEnCancha // ACÁ SE GUARDA EL ARRAY DE IDs
    };

    const { data, error } = await supabase.from('eventos').insert([nuevoEvento]).select();
    if (!error) {
      setEventos([...eventos, data[0]]);
      setPanelLateral({ activo: false, x: 0, y: 0 });
      setPasoRegistro(1);
    }
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
  };

  // 📸 GUARDADO DE CAMBIO CON FOTO DEL QUINTETO (ANTES DE SALIR)
  const guardarCambio = async () => {
    if (!saleId || !entraId) return;
    const nuevoCambio = {
      id_partido: partido.id, 
      id_jugador: parseInt(saleId), 
      id_receptor: parseInt(entraId),
      accion: 'Cambio', 
      zona_x: null, 
      zona_y: null, 
      equipo: 'Propio', 
      periodo: periodo, 
      minuto: minuto,
      quinteto_activo: activosEnCancha
    };
    const { data, error } = await supabase.from('eventos').insert([nuevoCambio]).select();
    if (!error) {
      setEventos([...eventos, data[0]]);
      setActivosEnCancha([...activosEnCancha.filter(id => id !== parseInt(saleId)), parseInt(entraId)]);
      setModalCambio(false);
      setSaleId(''); setEntraId('');
    }
  };

  const jugadoresActivos = jugadoresPartido.filter(j => activosEnCancha.includes(j.id));
  const jugadoresEnBanco = jugadoresPartido.filter(j => !activosEnCancha.includes(j.id));

  // --- COMPONENTE AUXILIAR PARA BOTONES ---
  const BotonAccion = ({ label, color, onClick, span = 1, bold = false }) => (
    <button 
      onClick={onClick}
      style={{
        gridColumn: `span ${span}`,
        background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}`, color: color,
        padding: '12px 5px', borderRadius: '4px', fontWeight: bold ? 900 : 700, fontSize: '0.7rem',
        cursor: 'pointer', textTransform: 'uppercase', transition: '0.2s'
      }}
      onMouseOver={(e) => e.currentTarget.style.background = `${color}20`}
      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
    >
      {label}
    </button>
  );

  const containerStyle = {
    display: 'grid', gridTemplateColumns: (!esMovil && panelAbierto) ? 'minmax(0,1fr) 350px' : '1fr',
    gridTemplateRows: (esMovil && panelAbierto) ? '1fr auto' : '1fr',
    width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)'
  };

  const sidePanelStyle = {
    background: 'var(--panel)', borderLeft: esMovil ? 'none' : '1px solid var(--border)',
    borderTop: esMovil ? '1px solid var(--border)' : 'none', padding: '20px', display: 'flex',
    flexDirection: 'column', gap: '20px', overflowY: 'auto', width: '100%', height: '100%'
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
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
            <div ref={pitchRef} onClick={registrarToque} className="pitch-container" style={{ width: '100%', height: '100%', position: 'relative', cursor: 'crosshair', backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '15px 15px' }}>
               <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)' }}></div>
               {eventos.filter(e => e.zona_x !== null).map((ev) => (
                <div key={ev.id} style={{ position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '14px', height: '14px', backgroundColor: getColorAccion(ev.accion), border: '2px solid #000', borderRadius: '2px', transform: 'translate(-50%, -50%)' }} />
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
                <div className="stat-label">{pasoRegistro === 1 ? '1. ACCIÓN' : '2. JUGADOR'}</div>
                <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
              </div>

              {pasoRegistro === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* SELECTOR EQUIPO */}
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <button onClick={() => setEquipo('Propio')} style={{ flex: 1, padding: '10px', background: equipo === 'Propio' ? 'rgba(0,255,136,0.1)' : 'none', color: equipo === 'Propio' ? 'var(--accent)' : 'var(--text-dim)', border: 'none', fontWeight: 800 }}>MI EQUIPO</button>
                    <button onClick={() => setEquipo('Rival')} style={{ flex: 1, padding: '10px', background: equipo === 'Rival' ? 'rgba(255,255,255,0.05)' : 'none', color: equipo === 'Rival' ? '#fff' : 'var(--text-dim)', border: 'none', fontWeight: 800 }}>RIVAL</button>
                  </div>

                  {/* BLOQUES JERÁRQUICOS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* BLOQUE 1: FINALIZACIÓN */}
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

                    {/* BLOQUE 2: POSESIÓN Y FRICCIÓN */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>⚔️ POSESIÓN Y FRICCIÓN</div>
                      <BotonAccion label="RECU." color="#eab308" onClick={() => seleccionarAccion('Recuperación')} />
                      <BotonAccion label="PÉRDIDA" color="#ef4444" onClick={() => seleccionarAccion('Pérdida')} />
                      <BotonAccion label="DEF (✓)" color="#10b981" onClick={() => seleccionarAccion('Duelo DEF Ganado')} />
                      <BotonAccion label="DEF (✕)" color="#dc2626" onClick={() => seleccionarAccion('Duelo DEF Perdido')} />
                      <BotonAccion label="OFE (✓)" color="#0ea5e9" onClick={() => seleccionarAccion('Duelo OFE Ganado')} />
                      <BotonAccion label="OFE (✕)" color="#f97316" onClick={() => seleccionarAccion('Duelo OFE Perdido')} />
                    </div>

                    {/* BLOQUE 3: FALTAS Y TARJETAS */}
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

                    {/* BLOQUE 4: BALÓN PARADO */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>🏳️ BFA</div>
                      <BotonAccion label="LATERAL" color="#06b6d4" onClick={() => seleccionarAccion('Lateral')} />
                      <BotonAccion label="CÓRNER" color="#f97316" onClick={() => seleccionarAccion('Córner')} />
                    </div>
                  </div>
                </div>
              ) : (
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