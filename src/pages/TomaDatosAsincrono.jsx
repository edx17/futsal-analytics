import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useParams, useNavigate } from 'react-router-dom';

export default function TomaDatosAsincrono() {
  const { id } = useParams();
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();

  const [fase, setFase] = useState(0);
  const [cargando, setCargando] = useState(true);

  const [listaPartidos, setListaPartidos] = useState([]);
  const [partidoActual, setPartidoActual] = useState(null);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroCompeticion, setFiltroCompeticion] = useState('Todas');
  
  const [jugadoresClub, setJugadoresClub] = useState([]);
  const [seleccionadosId, setSeleccionadosId] = useState([]);
  const [jugadoresConvocados, setJugadoresConvocados] = useState([]);

  const videoRef = useRef(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const [reloj, setReloj] = useState({ corriendo: false, minuto: 0, segundos: 0, periodo: 'PT' });

  const [teclas, setTeclas] = useState({
    videoPlayPause: 'Space',
    relojToggle: 'KeyC',
    retroceder: 'KeyA',
    avanzar: 'KeyD',
    Pase: 'KeyP',
    Remate: 'KeyT',
    Recuperacion: 'KeyR',
    Perdida: 'KeyE',
    Falta: 'KeyF',
    DueloGanado: 'KeyW',
    DueloPerdido: 'KeyQ',
    Bloqueo: 'KeyB',
    Atajada: 'KeyG',
    Lateral: 'KeyL',
    Corner: 'KeyX',
    Ventaja: 'KeyV'
  });
  
  const mapAccionBD = {
    Pase: 'Pase', Remate: 'Remate', Recuperacion: 'Recuperación', Perdida: 'Pérdida',
    Falta: 'Falta cometida', DueloGanado: 'Duelo Ganado', DueloPerdido: 'Duelo Perdido',
    Bloqueo: 'Bloqueo/Intercepción', Atajada: 'Atajada', Lateral: 'Lateral', Corner: 'Córner', Ventaja: 'Falta (Ventaja)'
  };

  const [editandoTecla, setEditandoTecla] = useState(null);

  const [bufferEventos, setBufferEventos] = useState([]);
  const [eventoPendiente, setEventoPendiente] = useState(null);
  const [pasoRegistro, setPasoRegistro] = useState(0);
  
  const [herramientaMapa, setHerramientaMapa] = useState('accion');
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  useEffect(() => {
    async function inicializar() {
      setCargando(true);
      if (!id) {
        const { data } = await supabase
          .from('partidos')
          .select('id, fecha, rival, categoria, competicion, estado')
          .eq('club_id', clubId)
          .order('fecha', { ascending: false });
        setListaPartidos(data || []);
        setFase(0);
        setCargando(false);
        return;
      }

      const { data: dbPartido } = await supabase.from('partidos').select('*').eq('id', id).single();
      if (!dbPartido) {
        navigate('/analisis-video');
        return;
      }

      setPartidoActual(dbPartido);

      let idsPlantilla = [];
      try {
        const plantillaParseada = typeof dbPartido.plantilla === 'string' ? JSON.parse(dbPartido.plantilla) : dbPartido.plantilla;
        idsPlantilla = plantillaParseada ? plantillaParseada.map(p => p.id_jugador) : [];
      } catch (e) {
        idsPlantilla = [];
      }

      if (idsPlantilla.length === 0) {
        const { data: dbJugadores } = await supabase.from('jugadores').select('*').eq('club_id', clubId).order('apellido', { ascending: true });
        setJugadoresClub(dbJugadores || []);
        setFase(1);
      } else {
        const { data: dbConvocados } = await supabase.from('jugadores').select('*').in('id', idsPlantilla).order('dorsal', { ascending: true });
        setJugadoresConvocados(dbConvocados || []);
        setFase(2);
      }
      setCargando(false);
    }
    inicializar();
  }, [id, clubId, navigate]);

  useEffect(() => {
    if (fase === 3) {
      const backup = localStorage.getItem(`tracking_async_${partidoActual?.id}`);
      if (backup) {
        const { bufferGuardado, relojGuardado } = JSON.parse(backup);
        if (bufferGuardado) setBufferEventos(bufferGuardado);
        if (relojGuardado) setReloj({ ...relojGuardado, corriendo: false });
      }
    }
  }, [fase, partidoActual?.id]);

  useEffect(() => {
    if (fase === 3 && partidoActual?.id) {
      localStorage.setItem(`tracking_async_${partidoActual.id}`, JSON.stringify({
        bufferGuardado: bufferEventos,
        relojGuardado: reloj
      }));
    }
  }, [bufferEventos, reloj, fase, partidoActual?.id]);

  useEffect(() => {
    let intervalo;
    if (reloj.corriendo) {
      const tiempoInicio = Date.now();
      const minInicial = reloj.minuto;
      const segInicial = reloj.segundos;

      intervalo = setInterval(() => {
        const transcurrido = Math.floor((Date.now() - tiempoInicio) / 1000);
        const totalSegundos = segInicial + transcurrido;
        const m = minInicial + Math.floor(totalSegundos / 60);
        const s = totalSegundos % 60;
        
        setReloj(prev => ({ ...prev, minuto: m, segundos: s }));
      }, 200);
    }
    return () => clearInterval(intervalo);
  }, [reloj.corriendo, reloj.minuto, reloj.segundos]);

  const handleMinutoChange = (e) => {
    const val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
    setReloj(r => ({ ...r, minuto: val }));
  };

  const handleSegundosChange = (e) => {
    let val = parseInt(e.target.value.replace(/\D/g, ''), 10) || 0;
    if (val > 59) val = 59;
    setReloj(r => ({ ...r, segundos: val }));
  };

const iniciarEvento = useCallback((accionKey) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    
    const accionStr = mapAccionBD[accionKey] || accionKey;
    
    setHerramientaMapa('accion');
    setEventoPendiente({
      id_partido: partidoActual.id,
      club_id: clubId,
      periodo: reloj.periodo,
      minuto: reloj.minuto,
      segundos: reloj.segundos,
      tiempo_video: parseFloat(videoRef.current.currentTime.toFixed(3)),
      accion: accionStr,
      equipo: 'Propio',
      zona_x: null,
      zona_y: null,
      id_jugador: null,
      id_asistencia: null,
      contexto_juego: '5v5',
      origen_gol: null,
      posiciones: []
    });

    setPasoRegistro(1);
  }, [partidoActual, clubId, reloj]);

  const handleKeyDown = useCallback((e) => {
    if (!videoRef.current || e.target.tagName === 'INPUT' || editandoTecla || mostrarAyuda) return;
    const key = e.code;
    
    if (key === teclas.videoPlayPause) {
      e.preventDefault();
      videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
    } else if (key === teclas.relojToggle) {
      setReloj(r => ({ ...r, corriendo: !r.corriendo }));
    } else if (key === teclas.retroceder) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 3);
    } else if (key === teclas.avanzar) {
      videoRef.current.currentTime += 3;
    } else {
      const accionEncontrada = Object.keys(teclas).find(k => teclas[k] === key && !['videoPlayPause', 'relojToggle', 'retroceder', 'avanzar'].includes(k));
      if (accionEncontrada) {
        iniciarEvento(accionEncontrada);
      }
    }
  }, [teclas, editandoTecla, iniciarEvento, mostrarAyuda]);

  useEffect(() => {
    if (fase === 3) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, fase]);

  const seleccionarPartido = (partidoId) => navigate(`/partido/${partidoId}/analisis-video`);
  const toggleJugador = (jugId) => setSeleccionadosId(prev => prev.includes(jugId) ? prev.filter(i => i !== jugId) : [...prev, jugId]);

  const guardarConvocatoria = async () => {
    if (seleccionadosId.length === 0) return;
    setCargando(true);
    
    const plantillaEstructurada = seleccionadosId.map(jId => {
      const jug = jugadoresClub.find(j => j.id === jId);
      return { id_jugador: jug.id, dorsal: jug.dorsal, apellido: jug.apellido };
    });

    await supabase.from('partidos').update({ plantilla: plantillaEstructurada }).eq('id', partidoActual.id);
    const { data: dbConvocados } = await supabase.from('jugadores').select('*').in('id', seleccionadosId).order('dorsal', { ascending: true });
    setJugadoresConvocados(dbConvocados || []);
    setFase(2);
    setCargando(false);
  };

  const handleCargaVideo = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoSrc(URL.createObjectURL(file));
      setFase(3);
    }
  };

  const registrarCoordenada = (e) => {
    if (!eventoPendiente) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));
    
    if (herramientaMapa === 'accion') {
      setEventoPendiente(prev => ({ ...prev, zona_x: x, zona_y: y }));
    } else if (herramientaMapa === 'rival') {
      setEventoPendiente(prev => ({ ...prev, posiciones: [...prev.posiciones, { tipo: 'rival', x, y }] }));
    } else {
      setEventoPendiente(prev => ({ ...prev, posiciones: [...prev.posiciones, { tipo: 'propio', id_jugador: herramientaMapa, x, y }] }));
    }
  };

  const confirmarMapeoYContinuar = () => {
    if (eventoPendiente?.zona_x != null) {
      setPasoRegistro(2);
    }
  };

  const asignarJugador = (jugadorId) => {
    setEventoPendiente(prev => ({ ...prev, id_jugador: jugadorId }));
    if (eventoPendiente.accion === 'Remate' || eventoPendiente.accion === 'Gol') {
      setPasoRegistro(3);
    } else {
      finalizarEvento({ ...eventoPendiente, id_jugador: jugadorId });
    }
  };

  const asignarResultadoRemate = (resultado, asistenciaId = null, origen = null, contexto = '5v5') => {
    finalizarEvento({
      ...eventoPendiente,
      accion: resultado,
      id_asistencia: asistenciaId,
      origen_gol: origen,
      contexto_juego: contexto
    });
  };

  const finalizarEvento = (eventoFinal) => {
    setBufferEventos(prev => [...prev, eventoFinal]);
    setEventoPendiente(null);
    setPasoRegistro(0);
    setHerramientaMapa('accion');
    if (videoRef.current) videoRef.current.play();
  };

  const cancelarEvento = () => {
    setEventoPendiente(null);
    setPasoRegistro(0);
    setHerramientaMapa('accion');
  };

  const sincronizarBaseDatos = async () => {
    if (bufferEventos.length === 0) return;
    const { error } = await supabase.from('eventos').insert(bufferEventos);
    if (!error) {
      setBufferEventos([]);
      localStorage.removeItem(`tracking_async_${partidoActual.id}`);
    }
  };

  const setNuevaTecla = (e) => {
    if (!editandoTecla) return;
    e.preventDefault();
    setTeclas(prev => ({ ...prev, [editandoTecla]: e.code }));
    setEditandoTecla(null);
  };

  const getColorAccionLocal = (accionString) => {
    if (!accionString) return '#fff';
    const acc = accionString.toLowerCase();
    if (acc.includes('gol')) return '#10b981';
    if (acc.includes('remate')) return '#3b82f6';
    if (acc.includes('pérdida')) return '#ef4444';
    if (acc.includes('recuperación')) return '#f59e0b';
    return '#888';
  };

  if (cargando) return <div style={{ background: '#000', height: '100vh', color: '#fff', padding: '20px' }}>PROCESANDO DATOS...</div>;

  if (fase === 0) {
    const categoriasUnicas = ['Todas', ...new Set(listaPartidos.map(p => p.categoria).filter(Boolean))];
    const competicionesUnicas = ['Todas', ...new Set(listaPartidos.map(p => p.competicion).filter(Boolean))];

    const partidosFiltrados = listaPartidos.filter(p => {
      const pasaCategoria = filtroCategoria === 'Todas' || p.categoria === filtroCategoria;
      const pasaCompeticion = filtroCompeticion === 'Todas' || p.competicion === filtroCompeticion;
      return pasaCategoria && pasaCompeticion;
    });

    return (
      <div style={{ padding: '40px', background: 'var(--bg)', minHeight: '100vh', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <h1 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>SELECCIONAR PARTIDO</h1>
            <button onClick={() => navigate('/inicio')} className="btn-secondary" style={{ padding: '10px 20px', fontWeight: 'bold' }}>VOLVER AL INICIO</button>
          </div>
          
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ padding: '12px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontWeight: 900, flex: 1, cursor: 'pointer' }}>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c === 'Todas' ? 'CATEGORÍA: TODAS' : c}</option>)}
            </select>
            <select value={filtroCompeticion} onChange={(e) => setFiltroCompeticion(e.target.value)} style={{ padding: '12px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontWeight: 900, flex: 1, cursor: 'pointer' }}>
              {competicionesUnicas.map(c => <option key={c} value={c}>{c === 'Todas' ? 'COMPETENCIA: TODAS' : c}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {partidosFiltrados.map(p => (
              <div key={p.id} onClick={() => seleccionarPartido(p.id)} style={{ background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 900 }}>{p.fecha?.split('-').reverse().join('/')} | {p.categoria} | {p.competicion}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase' }}>VS {p.rival}</div>
                </div>
                <div style={{ background: 'var(--accent)', color: '#000', padding: '8px 16px', borderRadius: '4px', fontWeight: 900, fontSize: '0.8rem' }}>
                  ANALIZAR
                </div>
              </div>
            ))}
            {partidosFiltrados.length === 0 && <div style={{ color: '#888', textAlign: 'center', padding: '20px', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>NO SE ENCONTRARON PARTIDOS.</div>}
          </div>
        </div>
      </div>
    );
  }

  if (fase === 1) {
    return (
      <div style={{ padding: '40px', background: 'var(--bg)', minHeight: '100vh', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <div>
              <h1 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>CONVOCATORIA</h1>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>VS {partidoActual?.rival}</div>
            </div>
            <button onClick={() => navigate('/analisis-video')} className="btn-secondary" style={{ padding: '10px 20px', fontWeight: 'bold' }}>VOLVER ATRÁS</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '30px' }}>
            {jugadoresClub.map(j => (
              <div key={j.id} onClick={() => toggleJugador(j.id)} style={{ background: seleccionadosId.includes(j.id) ? 'rgba(0, 255, 136, 0.1)' : '#111', border: `1px solid ${seleccionadosId.includes(j.id) ? 'var(--accent)' : '#333'}`, padding: '15px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', background: '#000', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 900 }}>{j.dorsal}</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{j.apellido || j.nombre}</div>
              </div>
            ))}
          </div>

          <button onClick={guardarConvocatoria} disabled={seleccionadosId.length === 0} style={{ width: '100%', padding: '20px', background: seleccionadosId.length > 0 ? 'var(--accent)' : '#333', color: seleccionadosId.length > 0 ? '#000' : '#888', border: 'none', borderRadius: '8px', fontWeight: 900, fontSize: '1.1rem', cursor: seleccionadosId.length > 0 ? 'pointer' : 'default' }}>
            CONFIRMAR {seleccionadosId.length} JUGADORES
          </button>
        </div>
      </div>
    );
  }

  if (fase === 2) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: '#fff', padding: '20px' }}>
        <div style={{ background: '#111', border: '1px solid var(--border)', padding: '40px', borderRadius: '8px', textAlign: 'center', maxWidth: '600px', width: '100%' }}>
          <h2 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase' }}>TRACKING ASÍNCRONO</h2>
          <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '30px' }}>
            <strong>PARTIDO:</strong> VS {partidoActual?.rival} ({partidoActual?.categoria})<br/>
            <strong>PLANTILLA:</strong> {jugadoresConvocados.length} JUGADORES
          </div>
          <label style={{ display: 'inline-block', background: '#3b82f6', color: '#fff', padding: '15px 30px', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, width: '100%', boxSizing: 'border-box' }}>
            SELECCIONAR ARCHIVO DE VIDEO LOCAL
            <input type="file" accept="video/*" onChange={handleCargaVideo} style={{ display: 'none' }} />
          </label>
          <button onClick={() => navigate('/analisis-video')} style={{ width: '100%', marginTop: '15px', padding: '15px 30px', background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: '4px', cursor: 'pointer', fontWeight: 900 }}>
            VOLVER ATRÁS
          </button>
        </div>
      </div>
    );
  }

  if (fase === 3) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
          <style>{`
            .input-reloj { width: 35px; background: transparent; border: none; color: #fff; font-size: 1.2rem; font-weight: 900; text-align: center; outline: none; }
          `}</style>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderBottom: '1px solid #333', padding: '10px 20px', height: '60px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 900 }}>ANALIZANDO</div>
                <div style={{ fontWeight: 900, color: '#f97316', fontSize: '1.1rem', textTransform: 'uppercase' }}>VS {partidoActual?.rival}</div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', background: '#222', border: '1px solid #444', borderRadius: '6px', padding: '4px', gap: '10px' }}>
                <button onClick={() => setReloj(r => ({ ...r, corriendo: !r.corriendo }))} style={{ background: reloj.corriendo ? '#ef4444' : '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem' }}>
                  {reloj.corriendo ? 'PAUSAR RELOJ' : 'INICIAR RELOJ'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', background: '#000', padding: '2px 8px', borderRadius: '4px', border: '1px solid #333' }}>
                  <input type="text" className="input-reloj" value={String(reloj.minuto).padStart(2, '0')} onChange={handleMinutoChange} />
                  <span style={{ fontSize: '1.2rem', fontWeight: 900, paddingBottom: '2px' }}>:</span>
                  <input type="text" className="input-reloj" value={String(reloj.segundos).padStart(2, '0')} onChange={handleSegundosChange} />
                </div>
                <select value={reloj.periodo} onChange={(e) => setReloj(r => ({ ...r, periodo: e.target.value }))} style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: '0.9rem', fontWeight: 900, outline: 'none', cursor: 'pointer', paddingRight: '5px' }}>
                  <option value="PT">PT</option>
                  <option value="ST">ST</option>
                  <option value="TE">TE</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <button onClick={() => setMostrarAyuda(true)} style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '8px 16px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}>❔ AYUDA</button>
              <button onClick={() => setFase(2)} style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '8px 16px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}>CERRAR VIDEO</button>
              <div style={{ color: bufferEventos.length > 0 ? '#10b981' : '#666', fontSize: '0.8rem', fontWeight: 900 }}>
                BUFFER: {bufferEventos.length}
              </div>
              <button onClick={sincronizarBaseDatos} disabled={bufferEventos.length === 0} style={{ background: bufferEventos.length > 0 ? 'var(--accent)' : '#333', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 900, cursor: bufferEventos.length > 0 ? 'pointer' : 'default' }}>
                SINCRONIZAR DB
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #333', minHeight: 0 }}>
              <div style={{ background: '#000', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: 0 }}>
                <video ref={videoRef} src={videoSrc} controls style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                {pasoRegistro > 0 && (
                  <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239, 68, 68, 0.9)', color: '#fff', padding: '10px 20px', borderRadius: '20px', fontWeight: 900, fontSize: '0.9rem', border: '2px solid #fff', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                    GRABANDO EVENTO: {eventoPendiente?.accion.toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ height: '110px', flexShrink: 0, background: '#0a0a0a', borderTop: '1px solid #333', padding: '8px 15px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: 900, marginBottom: '6px' }}>MAPA DE ATAJOS (CLICK PARA REASIGNAR)</div>
                {editandoTecla && (
                  <input 
                    autoFocus
                    onKeyDown={setNuevaTecla}
                    onBlur={() => setEditandoTecla(null)}
                    placeholder="PRESIONE NUEVA TECLA..."
                    style={{ position: 'absolute', zIndex: 100, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', fontWeight: 'bold' }}
                  />
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {Object.entries(teclas).map(([accion, tecla]) => (
                    <div key={accion} onClick={() => setEditandoTecla(accion)} style={{ background: '#111', border: '1px solid #333', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.65rem', color: '#aaa' }}>{accion}</span>
                      <span style={{ background: '#222', color: 'var(--accent)', padding: '2px 4px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900 }}>{tecla}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ width: '400px', flexShrink: 0, background: '#111', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              
              {pasoRegistro === 1 && (
                <div style={{ display: 'flex', gap: '6px', padding: '10px 15px', background: '#0f172a', borderBottom: '1px solid #1e293b', overflowX: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  <button onClick={() => setHerramientaMapa('accion')} style={{ background: herramientaMapa === 'accion' ? '#f97316' : '#222', color: '#fff', border: 'none', padding: '6px 10px', fontSize: '0.7rem', fontWeight: 900, borderRadius: '4px', cursor: 'pointer' }}>📍 ACCIÓN PRINCIPAL</button>
                  <button onClick={() => setHerramientaMapa('rival')} style={{ background: herramientaMapa === 'rival' ? '#ef4444' : '#222', color: '#fff', border: 'none', padding: '6px 10px', fontSize: '0.7rem', fontWeight: 900, borderRadius: '4px', cursor: 'pointer' }}>🔴 RIVAL</button>
                  <div style={{ width: '1px', background: '#333', margin: '0 4px' }} />
                  {jugadoresConvocados.map(j => (
                    <button key={j.id} onClick={() => setHerramientaMapa(j.id)} style={{ background: herramientaMapa === j.id ? '#3b82f6' : '#222', color: '#fff', border: 'none', padding: '6px 10px', fontSize: '0.7rem', fontWeight: 900, borderRadius: '4px', cursor: 'pointer' }}>
                      🔵 {j.dorsal}
                    </button>
                  ))}
                </div>
              )}

              {pasoRegistro === 1 && (
                <div style={{ padding: '15px', borderBottom: '1px solid #333', background: '#0f172a', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent)' }}>1. MAPEO ESPACIAL</span>
                    {eventoPendiente?.zona_x != null && <span style={{ fontSize: '0.7rem', color: '#fff' }}>X: {eventoPendiente?.zona_x} | Y: {eventoPendiente?.zona_y}</span>}
                  </div>
                  
                  <div 
                    onClick={registrarCoordenada}
                    className="pitch-container"
                    style={{ 
                      width: '100%', aspectRatio: '2/1', backgroundColor: '#0a0a0a', backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '15px 15px', border: '2px solid #333', position: 'relative', cursor: 'crosshair', overflow: 'hidden'
                    }}
                  >
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: '#333', pointerEvents: 'none' }}></div>
                    <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid #333', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>
                    <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid #333', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', backgroundColor: 'transparent' }}></div>
                    <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid #333', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', backgroundColor: 'transparent' }}></div>
                    
                    {bufferEventos.filter(e => e.zona_x != null).map((ev, i) => (
                      <div key={i} style={{ position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, width: '10px', height: '10px', backgroundColor: getColorAccionLocal(ev.accion), borderRadius: '2px', transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0.35, boxShadow: `0 0 8px ${getColorAccionLocal(ev.accion)}` }} />
                    ))}

                    {eventoPendiente?.posiciones?.map((pos, i) => (
                      <div key={i} style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: '12px', height: '12px', background: pos.tipo === 'rival' ? '#ef4444' : '#3b82f6', borderRadius: '50%', transform: 'translate(-50%, -50%)', border: '1px solid #fff', pointerEvents: 'none' }}>
                        {pos.tipo === 'propio' && <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#fff', position: 'absolute', top: '-18px', left: '50%', transform: 'translateX(-50%)' }}>{jugadoresConvocados.find(j=>j.id===pos.id_jugador)?.dorsal}</span>}
                      </div>
                    ))}

                    {eventoPendiente && eventoPendiente.zona_x != null && (
                      <div style={{ position: 'absolute', left: `${eventoPendiente.zona_x}%`, top: `${eventoPendiente.zona_y}%`, width: '16px', height: '16px', background: '#f97316', borderRadius: '50%', transform: 'translate(-50%, -50%)', border: '2px solid #fff', boxShadow: '0 0 10px #000', zIndex: 10, pointerEvents: 'none' }} />
                    )}
                  </div>

                  <button onClick={confirmarMapeoYContinuar} disabled={eventoPendiente?.zona_x == null} style={{ width: '100%', marginTop: '15px', background: eventoPendiente?.zona_x != null ? 'var(--accent)' : '#333', color: '#000', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 900, cursor: eventoPendiente?.zona_x != null ? 'pointer' : 'default' }}>
                    CONFIRMAR MAPA
                  </button>
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                {pasoRegistro === 0 && (
                  <>
                    <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: 900, marginBottom: '10px', textAlign: 'center' }}>PLANTEL EN CAMPO</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {jugadoresConvocados.map(jug => (
                        <div key={jug.id} style={{ background: '#111', color: '#666', border: '1px solid #333', padding: '10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 900, background: '#000', padding: '2px 6px', borderRadius: '4px', width: '30px', textAlign: 'center' }}>{jug.dorsal}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{jug.apellido || jug.nombre}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {pasoRegistro === 2 && (
                  <div style={{ animation: 'fadeIn 0.2s' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '10px' }}>{eventoPendiente?.zona_x != null ? '2.' : '1.'} AUTOR DEL EVENTO ({eventoPendiente.accion})</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {jugadoresConvocados.map(jug => (
                        <button key={jug.id} onClick={() => asignarJugador(jug.id)} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 900, background: '#000', padding: '2px 6px', borderRadius: '4px', width: '30px', textAlign: 'center' }}>{jug.dorsal}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{jug.apellido || jug.nombre}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => asignarJugador(null)} style={{ width: '100%', marginTop: '10px', background: 'transparent', border: '1px dashed #444', color: '#888', padding: '10px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      SIN JUGADOR / RIVAL
                    </button>
                  </div>
                )}

                {pasoRegistro === 3 && (
                  <div style={{ animation: 'fadeIn 0.2s' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f97316', marginBottom: '10px' }}>3. CIERRE DEL REMATE</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol')} style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#10b981', padding: '12px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}>GOL</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Atajado')} style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '12px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}>ATAJADO</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Afuera')} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', padding: '12px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}>AFUERA / BLOQ.</button>
                    </div>

                    <div style={{ fontSize: '0.65rem', color: '#888', fontWeight: 900, marginBottom: '8px' }}>CON MODIFICADOR (OPCIONAL Y FINALIZADOR)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol', null, '2do Palo')} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900 }}>GOL 2DO PALO</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Atajado', null, 'Mano a Mano')} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 900 }}>ATAJADA 1v1</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol', null, 'Transición')} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', gridColumn: 'span 2', fontWeight: 900 }}>GOL TRANSICIÓN / CONTRA</button>
                    </div>
                  </div>
                )}

                {pasoRegistro > 0 && (
                  <button onClick={cancelarEvento} style={{ width: '100%', marginTop: '20px', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '10px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer', fontSize: '0.8rem' }}>
                    ABORTAR REGISTRO [ESC]
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        
{mostrarAyuda && (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
    <div style={{ background: '#111', border: '1px solid #3b82f6', borderRadius: '8px', padding: '30px', maxWidth: '600px', width: '100%', color: '#fff' }}>
      <h2 style={{ margin: '0 0 20px 0', color: '#3b82f6', textTransform: 'uppercase', fontSize: '1.4rem' }}>Manual Operativo Asíncrono</h2>
      
      <div style={{ marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.6', color: '#ccc' }}>
        <strong style={{ color: 'var(--accent)' }}>Flujo Analítico (Mapeo Total):</strong><br />
        Todas las acciones tácticas (Pases, Duelos, Remates, Recuperaciones) requieren coordenadas espaciales para el cálculo de métricas avanzadas (xT, xA). Al presionar el atajo, el video se pausa, se requiere el punto en el mapa y el autor del evento.
      </div>
      
      <div style={{ marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.6', color: '#ccc' }}>
        <strong style={{ color: '#f59e0b' }}>Persistencia y Sincronización:</strong><br />
        El buffer de eventos se guarda en el disco local instantáneamente. Si se interrumpe la conexión, los datos continúan intactos. Una vez finalizada la carga, pulsar <strong>SINCRONIZAR DB</strong> para el envío al servidor.
      </div>

      <button onClick={() => setMostrarAyuda(false)} style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', padding: '15px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '1rem' }}>
        ENTENDIDO
      </button>
    </div>
  </div>
)}
      </>
    );
  }

  return null;
}