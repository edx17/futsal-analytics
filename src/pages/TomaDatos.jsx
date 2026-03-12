import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { getColorAccion } from '../utils/helpers';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

function TomaDatos() {
  const location = useLocation();
  const navigate = useNavigate();
  const partido = location.state?.partido;
  const clubId = localStorage.getItem('club_id');
  const pitchRef = useRef(null);
  
  const { showToast } = useToast(); // INICIALIZAMOS TOAST

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
  
  // --- ESTADOS PARA GOL, ASISTENCIA Y ORIGEN ---
  const [menuActivo, setMenuActivo] = useState(null); 
  const [autorGol, setAutorGol] = useState(null); 
  const [autorAsistencia, setAutorAsistencia] = useState(null);

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

  // --- NUEVO: CÁLCULOS EN VIVO (MARCADOR Y MINI-RESUMEN) ---
  const statsEnVivo = useMemo(() => {
    const stats = {
      golesMios: 0, golesRival: 0,
      rematesPT: 0, rematesST: 0,
      faltasPT: 0, faltasST: 0
    };
    eventos.forEach(ev => {
      const esGol = ev.accion === 'Remate - Gol' || ev.accion === 'Gol';
      if (esGol) {
        if (ev.equipo === 'Propio') stats.golesMios++;
        else stats.golesRival++;
      }
      if (ev.equipo === 'Propio') {
        if (ev.accion?.includes('Remate')) {
          if (ev.periodo === 'PT') stats.rematesPT++;
          else stats.rematesST++;
        }
        if (ev.accion === 'Falta cometida') {
          if (ev.periodo === 'PT') stats.faltasPT++;
          else stats.faltasST++;
        }
      }
    });
    return stats;
  }, [eventos]);

  // --- LOGICA DE REGISTRO NORMAL ---
  const registrarToque = (e) => {
    setPanelAbierto(true);
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
    setAutorAsistencia(null);
    setMenuActivo(null);
    setTabActiva('registro'); 
  };

  // --- LOGICA DE REGISTRO RÁPIDO (ABP) ---
  const triggerABP = (acc, x, y) => {
    setPanelAbierto(true); 
    setPanelLateral({ activo: true, x, y });
    setAccion(acc);
    setPasoRegistro(4); // PASO 4: Confirmación rápida de equipo
    setAutorGol(null);
    setAutorAsistencia(null);
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
      club_id: clubId, 
      id_partido: partido.id,
      id_jugador: null, 
      accion: accion,
      zona_x: dbX, zona_y: dbY,
      equipo: equipoSeleccionado,
      periodo: periodo, minuto: minuto,
      quinteto_activo: quintetoActual
    };

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);

    const { data: eventosGuardados, error } = await supabase.from('eventos').insert([evento]).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      showToast("Error de red al guardar el evento rápido.", "error");
      console.error("Error de Supabase:", error);
    }
  };

  // GUARDADO DE ACCIONES COMUNES Y FLUJO DE GOL
  const guardarEventoFinal = async (jugadorId) => {
    const quintetoActual = jugadoresEnCancha.map(j => j.id);

    // Si estamos en Paso 2 y fue Gol, guardamos el autor y avanzamos al Paso 3 (Asistencia)
    if (pasoRegistro === 2 && accion === 'Remate - Gol') {
      setAutorGol(jugadorId);
      setPasoRegistro(3); 
      return; 
    }

    // Si estamos en Paso 3 y fue Gol, guardamos la asistencia y avanzamos al Paso 5 (Origen)
    if (pasoRegistro === 3 && accion === 'Remate - Gol') {
      setAutorAsistencia(jugadorId);
      setPasoRegistro(5); 
      return; 
    }

    // LÓGICA PARA EL RESTO DE ACCIONES (Remates, Faltas, Recuperaciones, etc.)
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }

    const finalEquipo = jugadorId === null && pasoRegistro === 2 ? 'Rival' : equipo;
    
    const evento = {
      club_id: clubId, 
      id_partido: partido.id, 
      id_jugador: jugadorId ? parseInt(jugadorId, 10) : null,
      accion: accion, 
      zona_x: dbX, 
      zona_y: dbY, 
      equipo: finalEquipo,
      periodo: periodo, 
      minuto: minuto, 
      quinteto_activo: quintetoActual
    };

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert([evento]).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      showToast("Error de red al guardar el evento.", "error");
      console.error("Error de Supabase:", error);
    }
  };

  // FINALIZADOR ESPECÍFICO DEL GOL (Paso 5)
  const finalizarRegistroGol = async (origenContexto) => {
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }

    const quintetoActual = jugadoresEnCancha.map(j => j.id);
    const eventosAInsertar = [];

    // 1. Insertar el Evento del Gol con su Origen
    eventosAInsertar.push({
      club_id: clubId, 
      id_partido: partido.id, 
      id_jugador: autorGol ? parseInt(autorGol, 10) : null,
      accion: 'Remate - Gol', 
      zona_x: dbX, 
      zona_y: dbY, 
      equipo: equipo, 
      periodo: periodo, 
      minuto: minuto, 
      quinteto_activo: quintetoActual,
      origen_gol: origenContexto 
    });

    // 2. Insertar la asistencia (si la hubo)
    if (autorAsistencia) {
      eventosAInsertar.push({
        club_id: clubId, 
        id_partido: partido.id, 
        id_jugador: parseInt(autorAsistencia, 10),
        accion: 'Asistencia', 
        zona_x: dbX, 
        zona_y: dbY, 
        equipo: equipo,
        periodo: periodo, 
        minuto: minuto, 
        quinteto_activo: quintetoActual
      });
    }

    // Resetear todo
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setAutorGol(null);
    setAutorAsistencia(null);
    
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert(eventosAInsertar).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
      showToast("¡Gol registrado en la base de datos!", "success");
    } else {
      showToast("Error de red al guardar el gol.", "error");
      console.error("Error de Supabase:", error);
    }
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
    setAutorGol(null);
    setAutorAsistencia(null);
  };

  const eliminarEvento = async (idEvento) => {
    const eventoBackup = eventos.find(e => e.id === idEvento);
    if (!eventoBackup) return;
    setEventos(prev => prev.filter(e => e.id !== idEvento));
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('eventos').delete().eq('id', idEvento);
      if (error) throw error;
      showToast("Evento eliminado", "info");
    } catch (error) {
      setEventos(prev => [...prev, eventoBackup]);
      showToast("Error de red: No se pudo eliminar el evento.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmarEdicion = async () => {
    if (!eventoEditando) return;
    
    try {
      const esGol = eventoEditando.accion === 'Remate - Gol' || eventoEditando.accion === 'Gol';
      const payload = {
        periodo: eventoEditando.periodo,
        minuto: parseInt(eventoEditando.minuto, 10),
        id_jugador: eventoEditando.id_jugador ? parseInt(eventoEditando.id_jugador, 10) : null,
        equipo: eventoEditando.equipo,
        accion: eventoEditando.accion,
        origen_gol: esGol ? eventoEditando.origen_gol : null
      };

      const { error } = await supabase.from('eventos').update(payload).eq('id', eventoEditando.id);
      if (error) throw error;

      setEventos(prev => prev.map(e => e.id === eventoEditando.id ? { ...e, ...payload } : e));
      showToast("Evento modificado correctamente", "success");
    } catch (error) {
      showToast("Error de red: No se pudo modificar el evento.", "error");
      console.error(error);
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
      club_id: clubId, 
      id_partido: partido.id, id_jugador: jSale.id, accion: 'Cambio', equipo: 'Propio',
      periodo: periodo, minuto: minuto, id_receptor: jEntra.id,
      quinteto_activo: jugadoresEnCancha.map(j => j.id)
    };

    setJugadoresEnCancha(prev => [...prev.filter(j => j.id != saleId), jEntra]);
    setJugadoresEnBanco(prev => [...prev.filter(j => j.id != entraId), jSale]);
    setModalCambio(false); setSaleId(''); setEntraId('');

    const { data: cambioGuardado, error } = await supabase.from('eventos').insert([evtSalida]).select();
    if (cambioGuardado) {
      setEventos(prev => [...prev, ...cambioGuardado]);
      showToast("Cambio registrado", "info");
    } else {
       showToast("Error al guardar el cambio", "error");
       console.error("Error de Supabase:", error);
    }
  };

  if (!partido) return <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '50px' }}>Cargando datos del partido...</div>;

  const jugadoresActivos = equipo === 'Propio' ? jugadoresEnCancha : [];
  const todosLosJugadores = [...jugadoresEnCancha, ...jugadoresEnBanco];

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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              onClick={() => navigate(-1)} 
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', transition: '0.2s' }}
              onMouseOver={(e) => e.target.style.color = '#fff'}
              onMouseOut={(e) => e.target.style.color = 'var(--text-dim)'}
            >
              ⬅ VOLVER
            </button>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              TRACKER // vs {partido.rival.toUpperCase()}
              {/* ACA ESTÁ EL NUEVO MARCADOR EN VIVO */}
              <div style={{ background: '#111', padding: '4px 12px', borderRadius: '4px', border: '1px solid #333', fontSize: '1.2rem', fontFamily: 'JetBrains Mono', display: 'flex', gap: '10px' }}>
                <span style={{ color: 'var(--accent)' }} title="Goles Propios">{statsEnVivo.golesMios}</span>
                <span style={{ color: '#555' }}>-</span>
                <span style={{ color: '#ef4444' }} title="Goles Rival">{statsEnVivo.golesRival}</span>
              </div>
            </div>
          </div>
          
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
          
          {/* NUEVO DASHBOARD EN VIVO ARRIBA DE LA CANCHA */}
          <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '15px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>REMATES PROPIOS</div>
              <div style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 900 }}>PT: {statsEnVivo.rematesPT} <span style={{color:'#555'}}>|</span> ST: {statsEnVivo.rematesST}</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>FALTAS PROPIAS</div>
              <div style={{ fontSize: '0.85rem', color: '#ec4899', fontWeight: 900 }}>PT: {statsEnVivo.faltasPT} <span style={{color:'#555'}}>|</span> ST: {statsEnVivo.faltasST}</div>
            </div>
          </div>

          <div className="pitch-wrapper" style={{ width: '100%', maxWidth: esMovil ? '100%' : 'calc((100dvh - 220px) * 2)', aspectRatio: '2 / 1', position: 'relative' }}>
            
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

              {eventos.filter(e => e.zona_x !== null).map((ev, index, arr) => {
                const renderX = direccionAtaque === 'derecha' ? ev.zona_x : 100 - ev.zona_x;
                const renderY = direccionAtaque === 'derecha' ? ev.zona_y : 100 - ev.zona_y;
                // ACA CALCULAMOS SI ES EL ÚLTIMO EVENTO (EL MÁS RECIENTE) PARA RESALTARLO
                const esUltimo = index === arr.length - 1;

                return (
                  <div 
                    key={ev.id} 
                    style={{ 
                      position: 'absolute', 
                      left: `${renderX}%`, 
                      top: `${renderY}%`, 
                      width: esUltimo ? '16px' : '12px', 
                      height: esUltimo ? '16px' : '12px', 
                      backgroundColor: getColorAccion(ev.accion), 
                      border: esUltimo ? '2px solid #fff' : '2px solid #000', 
                      borderRadius: '2px', 
                      transform: 'translate(-50%, -50%)', 
                      zIndex: esUltimo ? 20 : 10,
                      opacity: esUltimo ? 1 : 0.35,
                      boxShadow: esUltimo ? `0 0 12px ${getColorAccion(ev.accion)}` : 'none',
                      transition: 'all 0.3s ease'
                    }} 
                  />
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
              {!panelLateral.activo && (
                <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.5 }}>
                  <div style={{ fontSize: '3rem' }}>📍</div>
                  <div className="stat-label">SISTEMA EN ESPERA</div>
                  <p style={{ fontSize: '0.8rem' }}>Tocá la pista para registrar</p>
                </div>
              )}

              {panelLateral.activo && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                    <div className="stat-label">
                      {pasoRegistro === 1 && '1. ACCIÓN'}
                      {pasoRegistro === 2 && '2. AUTOR'}
                      {pasoRegistro === 3 && '3. ASISTENCIA'}
                      {pasoRegistro === 4 && 'CONFIRMAR EQUIPO'}
                      {pasoRegistro === 5 && '4. ORIGEN'}
                    </div>
                    <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
                  </div>

                  {pasoRegistro === 1 && (
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
                  )}

                  {pasoRegistro === 2 && (
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
                  )}

                  {pasoRegistro === 3 && (
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

                  {pasoRegistro === 4 && (
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
                  )}

                  {pasoRegistro === 5 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                      <div className="stat-label" style={{ color: '#00ff88', marginBottom: '5px' }}>¿CÓMO SE GESTÓ EL GOL?</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <BotonAccion label="A. POSICIONAL" color="#fff" onClick={() => finalizarRegistroGol('Ataque Posicional')} />
                        <BotonAccion label="CONTRAATAQUE" color="#fff" onClick={() => finalizarRegistroGol('Contraataque')} />
                        <BotonAccion label="RECUP. ALTA" color="#fff" onClick={() => finalizarRegistroGol('Recuperación Alta')} />
                        <BotonAccion label="ERROR RIVAL" color="#fff" onClick={() => finalizarRegistroGol('Error No Forzado')} />
                      </div>
                      
                      <div className="stat-label" style={{ color: 'var(--text-dim)', marginTop: '10px', marginBottom: '5px' }}>PELOTA PARADA (ABP)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <BotonAccion label="CÓRNER" color="#f97316" onClick={() => finalizarRegistroGol('Córner')} />
                        <BotonAccion label="LATERAL" color="#06b6d4" onClick={() => finalizarRegistroGol('Lateral')} />
                        <BotonAccion label="TIRO LIBRE" color="#a855f7" onClick={() => finalizarRegistroGol('Tiro Libre')} />
                        <BotonAccion label="PENAL" color="#ef4444" onClick={() => finalizarRegistroGol('Penal / Sexta Falta')} />
                      </div>
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
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)' }}>EDITAR EVENTO</div>
            
            {/* TIEMPO */}
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>PERÍODO Y MINUTO</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select value={eventoEditando.periodo} onChange={e => setEventoEditando({...eventoEditando, periodo: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
                    <option value="PT">PT</option><option value="ST">ST</option>
                  </select>
                  <input type="number" value={eventoEditando.minuto} onChange={e => setEventoEditando({...eventoEditando, minuto: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }} />
                </div>
            </div>
            
            {/* EQUIPO */}
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>EQUIPO</label>
                <select 
                  value={eventoEditando.equipo} 
                  onChange={e => {
                    const nuevoEquipo = e.target.value;
                    setEventoEditando({
                      ...eventoEditando, 
                      equipo: nuevoEquipo,
                      // Si pasa a rival, borramos el jugador asociado (para no cruzar datos)
                      id_jugador: nuevoEquipo === 'Rival' ? null : eventoEditando.id_jugador
                    });
                  }} 
                  style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}
                >
                  <option value="Propio">MI EQUIPO</option>
                  <option value="Rival">RIVAL</option>
                </select>
            </div>

            {/* JUGADOR */}
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>JUGADOR ASIGNADO</label>
                <select 
                  value={eventoEditando.id_jugador || ''} 
                  onChange={e => setEventoEditando({...eventoEditando, id_jugador: e.target.value || null})} 
                  disabled={eventoEditando.equipo === 'Rival'}
                  style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: '1px solid #444', opacity: eventoEditando.equipo === 'Rival' ? 0.5 : 1 }}
                >
                  <option value="">SIN JUGADOR ASIGNADO</option>
                  {todosLosJugadores.map(j => <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido || j.nombre}</option>)}
                </select>
            </div>

            {/* ACCIÓN */}
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>ACCIÓN</label>
                <select 
                  value={eventoEditando.accion} 
                  onChange={e => setEventoEditando({...eventoEditando, accion: e.target.value})} 
                  style={{ width: '100%', padding: '10px', background: '#111', color: getColorAccion(eventoEditando.accion), fontWeight: 'bold', border: '1px solid #444' }}
                >
                  <optgroup label="Finalización">
                    <option value="Remate - Gol">GOL</option>
                    <option value="Remate - Atajado">REMATE ATAJADO</option>
                    <option value="Remate - Desviado">REMATE DESVIADO</option>
                    <option value="Remate - Rebatido">REMATE REBATIDO</option>
                    <option value="Asistencia">ASISTENCIA</option>
                  </optgroup>
                  <optgroup label="Posesión y Duelos">
                    <option value="Recuperación">RECUPERACIÓN</option>
                    <option value="Pérdida">PÉRDIDA</option>
                    <option value="Duelo DEF Ganado">DUELO DEF GANADO</option>
                    <option value="Duelo DEF Perdido">DUELO DEF PERDIDO</option>
                    <option value="Duelo OFE Ganado">DUELO OFE GANADO</option>
                    <option value="Duelo OFE Perdido">DUELO OFE PERDIDO</option>
                  </optgroup>
                  <optgroup label="Disciplina y ABP">
                    <option value="Falta cometida">FALTA COMETIDA</option>
                    <option value="Tarjeta Amarilla">TARJETA AMARILLA</option>
                    <option value="Tarjeta Roja">TARJETA ROJA</option>
                    <option value="Lateral">LATERAL</option>
                    <option value="Córner">CÓRNER</option>
                    <option value="Tiro Libre">TIRO LIBRE</option>
                    <option value="Penal / Sexta Falta">PENAL</option>
                  </optgroup>
                  <optgroup label="Otros">
                    <option value="Cambio">CAMBIO DE JUGADOR</option>
                  </optgroup>
                </select>
            </div>

            {/* ORIGEN DEL GOL (Condicional: Solo si la acción es GOL) */}
            {(eventoEditando.accion === 'Remate - Gol' || eventoEditando.accion === 'Gol') && (
              <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '0.7rem', color: 'var(--accent)', display: 'block', marginBottom: '5px' }}>ORIGEN DEL GOL</label>
                  <select 
                    value={eventoEditando.origen_gol || 'No Especificado'} 
                    onChange={e => setEventoEditando({...eventoEditando, origen_gol: e.target.value})} 
                    style={{ width: '100%', padding: '10px', background: '#111', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    <option value="No Especificado">NO ESPECIFICADO</option>
                    <option value="Ataque Posicional">ATAQUE POSICIONAL</option>
                    <option value="Contraataque">CONTRAATAQUE</option>
                    <option value="Recuperación Alta">RECUPERACIÓN ALTA</option>
                    <option value="Error No Forzado">ERROR NO FORZADO / RIVAL</option>
                    <option value="Córner">CÓRNER</option>
                    <option value="Lateral">LATERAL</option>
                    <option value="Tiro Libre">TIRO LIBRE</option>
                    <option value="Penal / Sexta Falta">PENAL</option>
                  </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEventoEditando(null)} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarEdicion} className="btn-action" style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>GUARDAR CAMBIOS</button>
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

const abpBtn = {
  position: 'absolute', width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(17, 17, 17, 0.5)',
  border: '2px solid', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 800,
  fontSize: '0.8rem', cursor: 'pointer', zIndex: 100, opacity: 0.5, boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
  transition: 'opacity 0.2s'
};

const relojContainer = { display: 'flex', alignItems: 'center', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px' };
const btnPlay = { background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: 'var(--text-dim)', padding: '10px 15px', cursor: 'pointer', fontSize: '0.8rem' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalIndustrial = { background: 'var(--panel)', border: '1px solid var(--border)', padding: '30px', width: '350px', borderRadius: '4px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' };

export default TomaDatos;