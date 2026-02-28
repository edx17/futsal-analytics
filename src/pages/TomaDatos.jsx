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
  const [subMenu, setSubMenu] = useState(null); // Nuevo estado para submenús rápidos
  
  // --- ESTADOS DE PLANTILLA Y EVENTOS ---
  const [modalCambio, setModalCambio] = useState(false);
  const [saleId, setSaleId] = useState('');
  const [entraId, setEntraId] = useState('');
  const [activosEnCancha, setActivosEnCancha] = useState([]);
  const [jugadoresPartido, setJugadoresPartido] = useState([]);
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    const manejarResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', manejarResize);
    return () => window.removeEventListener('resize', manejarResize);
  }, []);

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
      'Remate - Gol': '#00ff88',
      'Remate - Atajado': '#3b82f6',
      'Remate - Desviado': '#888888',
      'Remate - Rebatido': '#a855f7',
      'Recuperación': '#eab308',
      'Pérdida': '#ef4444',
      'Duelo DEF Ganado': '#10b981',
      'Duelo DEF Perdido': '#dc2626',
      'Duelo OFE Ganado': '#0ea5e9',
      'Duelo OFE Perdido': '#f97316',
      'Lateral': '#06b6d4',
      'Córner': '#f97316',
      'Falta cometida': '#ec4899',
      'Tarjeta Amarilla': '#facc15',
      'Tarjeta Roja': '#991b1b'
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
    setAccion('');
    setSubMenu(null);
  };

  const seleccionarAccion = (acc) => {
    setAccion(acc);
    setPasoRegistro(2);
    setSubMenu(null);
  };

  const guardarEventoFinal = async (idJugadorSeleccionado) => {
    let jId = null;
    let rId = null;

    if (equipo === 'Propio') {
      jId = idJugadorSeleccionado ? parseInt(idJugadorSeleccionado) : null;
    } else {
      if (accion === 'Falta cometida' || accion === 'Remate - Atajado') {
        rId = idJugadorSeleccionado ? parseInt(idJugadorSeleccionado) : null;
      }
    }

    const nuevoEvento = {
      id_partido: partido.id,
      id_jugador: jId,
      id_receptor: rId,
      accion: accion, zona_x: panelLateral.x, zona_y: panelLateral.y, equipo: equipo, periodo: periodo, minuto: minuto
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
    setSubMenu(null);
  };

  const guardarCambio = async () => {
    if (!saleId || !entraId) return;
    const nuevoCambio = {
      id_partido: partido.id,
      id_jugador: parseInt(saleId),
      id_receptor: parseInt(entraId),
      accion: 'Cambio', zona_x: null, zona_y: null, equipo: 'Propio', periodo: periodo, minuto: minuto
    };

    const { data, error } = await supabase.from('eventos').insert([nuevoCambio]).select();

    if (!error) {
      setEventos([...eventos, data[0]]);
      let nuevosActivos = activosEnCancha.filter(id => id !== parseInt(saleId));
      nuevosActivos.push(parseInt(entraId));
      setActivosEnCancha(nuevosActivos);
      setModalCambio(false);
      setSaleId(''); setEntraId('');
    }
  };

  const jugadoresActivos = jugadoresPartido.filter(j => activosEnCancha.includes(j.id));
  const jugadoresEnBanco = jugadoresPartido.filter(j => !activosEnCancha.includes(j.id));

  // --- ESTILOS DE COMPONENTES ---
  const containerStyle = {
    display: 'grid',
    gridTemplateColumns: (!esMovil && panelAbierto) ? 'minmax(0,1fr) 350px' : '1fr',
    gridTemplateRows: (esMovil && panelAbierto) ? '1fr auto' : '1fr',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg)'
  };

  const sidePanelStyle = {
    background: 'var(--panel)', borderLeft: esMovil ? 'none' : '1px solid var(--border)',
    borderTop: esMovil ? '1px solid var(--border)' : 'none', padding: '20px', display: 'flex',
    flexDirection: 'column', gap: '20px', overflowY: 'auto', width: '100%', height: '100%'
  };

  const bloqueBotonera = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    padding: '10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.05)'
  };

  const btnRegistro = {
    background: 'transparent', border: '1px solid', padding: '12px 5px', borderRadius: '4px',
    fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s'
  };

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'center', padding: '15px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: '10px' }}>
          <div style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            TRACKER // <span style={{ color: '#fff', fontWeight: 700 }}>{partido.rival}</span>
          </div>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setPanelAbierto(!panelAbierto)} className="btn-action" style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 15px', fontSize: '0.75rem' }}>
              {panelAbierto ? "OCULTAR PANEL" : "MOSTRAR PANEL"}
            </button>
            <button onClick={() => setModalCambio(true)} className="btn-action" style={{ backgroundColor: '#1a1a1a', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 15px', fontSize: '0.75rem' }}>
              CAMBIOS
            </button>
            
            <div style={relojContainer}>
              <button onClick={() => setRelojCorriendo(!relojCorriendo)} style={btnPlay}>{relojCorriendo ? 'STOP' : 'START'}</button>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 5px' }}>
                <input type="number" value={minuto} onChange={(e) => setMinuto(parseInt(e.target.value) || 0)} className="stat-value" style={{ width: '40px', background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '1.2rem', textAlign: 'right' }} />
                <span className="stat-value" style={{ fontSize: '1.2rem', margin: '0 2px' }}>:</span>
                <span className="stat-value" style={{ fontSize: '1.2rem', width: '25px', textAlign: 'left' }}>{String(segundos).padStart(2, '0')}</span>
              </div>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={{ background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 700, padding: '10px' }}>
                <option value="PT">PT</option>
                <option value="ST">ST</option>
              </select>
            </div>
          </div>
        </div>

        {/* CANCHA */}

        <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: '10px', opacity: panelLateral.activo ? 0.5 : 1, transition: 'opacity 0.3s' }}>

          <div className="pitch-wrapper" style={{ width: '100%', maxWidth: esMovil ? '100%' : 'calc((100dvh - 120px) * 2)', aspectRatio: '2 / 1', height: 'auto', maxHeight: '100%', margin: '0 auto', position: 'relative' }}>

            <div ref={pitchRef} onClick={registrarToque} className="pitch-container" style={{ width: '100%', height: '100%', position: 'relative', cursor: panelLateral.activo ? 'default' : 'crosshair', backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '15px 15px' }}>

              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', transform: 'translateX(-50%)', pointerEvents: 'none' }}></div>

              <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>

              <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none' }}></div>

              <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none' }}></div>



              {eventos.filter(e => e.zona_x !== null).map((ev) => (

                <div key={ev.id} style={{ position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '14px', height: '14px', backgroundColor: getColorAccion(ev.accion), border: ev.equipo === 'Rival' ? '2px solid #fff' : '2px solid #000', borderRadius: '2px', transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0.9 }} />

              ))}

            </div>

          </div>

        </div>
      </div>

      {/* PANEL LATERAL DE REGISTRO */}
      {panelAbierto && (
        <aside style={sidePanelStyle}>
          {!panelLateral.activo ? (
            <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>
               <div className="stat-label">SISTEMA EN ESPERA</div>
               <p style={{ fontSize: '0.8rem', marginTop: '10px' }}>TOCA EL TERRENO DE JUEGO PARA REGISTRAR</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <div className="stat-label">{pasoRegistro === 1 ? '1. SELECCIONAR ACCIÓN' : '2. SELECCIONAR JUGADOR'}</div>
                <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
              </div>

              {pasoRegistro === 1 ? (
                <>
                  <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <button onClick={() => setEquipo('Propio')} style={{ ...tabStyle, background: equipo === 'Propio' ? 'rgba(0,255,136,0.1)' : 'none', color: equipo === 'Propio' ? 'var(--accent)' : 'var(--text-dim)' }}>MI EQUIPO</button>
                    <button onClick={() => setEquipo('Rival')} style={{ ...tabStyle, background: equipo === 'Rival' ? 'rgba(255,255,255,0.05)' : 'none', color: equipo === 'Rival' ? '#fff' : 'var(--text-dim)' }}>RIVAL</button>
                  </div>

                  {/* SUBMENÚ DE REMATES */}
                  {subMenu === 'remate' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => seleccionarAccion('Remate - Atajado')} style={{ ...btnRegistro, borderColor: '#3b82f6', color: '#3b82f6' }}>ATAJADO</button>
                      <button onClick={() => seleccionarAccion('Remate - Desviado')} style={{ ...btnRegistro, borderColor: '#888888', color: '#888888' }}>DESVIADO</button>
                      <button onClick={() => seleccionarAccion('Remate - Rebatido')} style={{ ...btnRegistro, borderColor: '#a855f7', color: '#a855f7' }}>REBATIDO</button>
                      <button onClick={() => setSubMenu(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: '10px', textDecoration: 'underline', cursor: 'pointer' }}>VOLVER</button>
                    </div>
                  ) : subMenu === 'tarjetas' ? (
                    /* SUBMENÚ DE TARJETAS */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button onClick={() => seleccionarAccion('Tarjeta Amarilla')} style={{ ...btnRegistro, borderColor: '#facc15', color: '#facc15' }}>AMARILLA</button>
                      <button onClick={() => seleccionarAccion('Tarjeta Roja')} style={{ ...btnRegistro, borderColor: '#991b1b', color: '#991b1b' }}>ROJA</button>
                      <button onClick={() => setSubMenu(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: '10px', textDecoration: 'underline', cursor: 'pointer' }}>VOLVER</button>
                    </div>
                  ) : (
                    /* BLOQUES DE BOTONERA PRINCIPAL */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {/* BLOQUE 1: FINALIZACIÓN */}
                      <div style={bloqueBotonera}>
                        <button onClick={() => seleccionarAccion('Remate - Gol')} style={{ ...btnRegistro, gridColumn: 'span 2', background: '#00ff88', color: '#000', borderColor: '#00ff88', fontSize: '1rem' }}>GOL</button>
                        <button onClick={() => setSubMenu('remate')} style={{ ...btnRegistro, gridColumn: 'span 2', borderColor: '#3b82f6', color: '#3b82f6' }}>REMATE...</button>
                      </div>

                      {/* BLOQUE 2: POSESIÓN / DUELOS */}
                      <div style={{ ...bloqueBotonera, gridTemplateColumns: '1fr 1fr' }}>
                        <button onClick={() => seleccionarAccion('Recuperación')} style={{ ...btnRegistro, borderColor: '#eab308', color: '#eab308' }}>RECUPERACIÓN</button>
                        <button onClick={() => seleccionarAccion('Pérdida')} style={{ ...btnRegistro, borderColor: '#ef4444', color: '#ef4444' }}>PÉRDIDA</button>
                        <button onClick={() => seleccionarAccion('Duelo DEF Ganado')} style={{ ...btnRegistro, borderColor: '#10b981', color: '#10b981', fontSize: '0.6rem' }}>DUELO DEF (+)</button>
                        <button onClick={() => seleccionarAccion('Duelo DEF Perdido')} style={{ ...btnRegistro, borderColor: '#dc2626', color: '#dc2626', fontSize: '0.6rem' }}>DUELO DEF (-)</button>
                        <button onClick={() => seleccionarAccion('Duelo OFE Ganado')} style={{ ...btnRegistro, borderColor: '#0ea5e9', color: '#0ea5e9', fontSize: '0.6rem' }}>DUELO OFE (+)</button>
                        <button onClick={() => seleccionarAccion('Duelo OFE Perdido')} style={{ ...btnRegistro, borderColor: '#f97316', color: '#f97316', fontSize: '0.6rem' }}>DUELO OFE (-)</button>
                      </div>

                      {/* BLOQUE 3: INFRACCIONES */}
                      <div style={bloqueBotonera}>
                        <button onClick={() => seleccionarAccion('Falta cometida')} style={{ ...btnRegistro, borderColor: '#ec4899', color: '#ec4899' }}>FALTA</button>
                        <button onClick={() => setSubMenu('tarjetas')} style={{ ...btnRegistro, borderColor: '#facc15', color: '#facc15' }}>TARJETAS</button>
                      </div>

                      {/* BLOQUE 4: ABP */}
                      <div style={bloqueBotonera}>
                        <button onClick={() => seleccionarAccion('Lateral')} style={{ ...btnRegistro, borderColor: '#06b6d4', color: '#06b6d4' }}>LATERAL</button>
                        <button onClick={() => seleccionarAccion('Córner')} style={{ ...btnRegistro, borderColor: '#f97316', color: '#f97316' }}>CÓRNER</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ color: getColorAccion(accion), fontWeight: 800, textTransform: 'uppercase' }}>{accion}</div>
                     <button onClick={() => setPasoRegistro(1)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline' }}>CAMBIAR</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                    {jugadoresActivos.map(j => (
                      <button key={j.id} onClick={() => guardarEventoFinal(j.id)} style={btnJugador}>
                        <span style={{ color: 'var(--accent)', marginRight: '15px', width: '25px' }}>{j.dorsal}</span>
                        {j.nombre.toUpperCase()}
                      </button>
                    ))}
                    <button onClick={() => guardarEventoFinal(null)} style={{ padding: '15px', background: '#222', color: 'var(--text-dim)', border: '1px dashed #444', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', marginTop: '15px' }}>
                      GUARDAR SIN JUGADOR
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </aside>
      )}

      {/* MODAL DE CAMBIOS */}
      {modalCambio && (
        <div style={overlayStyle}>
          <div style={modalIndustrial}>
            <div className="stat-label" style={{ textAlign: 'center', fontSize: '1rem', color: '#fff', marginBottom: '20px' }}>GESTIÓN DE CAMBIOS</div>
            <div style={inputGroup}><label className="stat-label">SALE</label>
              <select value={saleId} onChange={(e) => setSaleId(e.target.value)} style={{ width: '100%', borderColor: 'var(--danger)' }}>
                <option value="">-- ELEGIR --</option>
                {jugadoresActivos.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.nombre.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ ...inputGroup, marginTop: '15px' }}><label className="stat-label">ENTRA</label>
              <select value={entraId} onChange={(e) => setEntraId(e.target.value)} style={{ width: '100%', borderColor: 'var(--accent)' }}>
                <option value="">-- ELEGIR --</option>
                {jugadoresEnBanco.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.nombre.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setModalCambio(false)} className="btn-action" style={{ flex: 1, background: '#222', color: 'var(--text)' }}>CANCELAR</button>
              <button onClick={guardarCambio} className="btn-action" style={{ flex: 1 }}>CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const relojContainer = { display: 'flex', alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px' };
const btnPlay = { background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-dim)', padding: '10px 15px', cursor: 'pointer', fontSize: '0.7rem' };
const tabStyle = { flex: 1, padding: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' };
const inputGroup = { display: 'flex', flexDirection: 'column', gap: '8px' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalIndustrial = { background: 'var(--panel)', border: '1px solid var(--border)', padding: '30px', width: '350px', borderRadius: '4px' };
const btnJugador = { background: '#1a1a1a', border: '1px solid #333', padding: '15px', color: '#fff', fontWeight: 700, textAlign: 'left', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' };

export default TomaDatos;