import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useParams, useNavigate } from 'react-router-dom';

// ─── xT GRID FUTSAL (10×6) ──────────────────────────────────────────────────
const XT_GRID = [
  [0.01,0.02,0.03,0.04,0.05,0.06,0.08,0.12,0.18,0.25],
  [0.02,0.03,0.04,0.06,0.08,0.10,0.14,0.20,0.28,0.38],
  [0.03,0.04,0.06,0.08,0.11,0.15,0.21,0.32,0.45,0.62],
  [0.03,0.04,0.06,0.08,0.11,0.15,0.21,0.32,0.45,0.62],
  [0.02,0.03,0.04,0.06,0.08,0.10,0.14,0.20,0.28,0.38],
  [0.01,0.02,0.03,0.04,0.05,0.06,0.08,0.12,0.18,0.25],
];

const calcularXT = (x, y) => {
  if (x == null) return null;
  const col = Math.min(9, Math.floor(x / 10));
  const row = Math.min(5, Math.floor(y / (100 / 6)));
  return parseFloat(XT_GRID[row][col].toFixed(3));
};

// xG fútsal: modelo logístico distancia+ángulo (cancha 40×20m)
const calcularXG = (x, y) => {
  if (x == null) return null;
  const dx = ((100 - x) / 100) * 40;
  const dy = (Math.abs(y - 50) / 100) * 20;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ang = Math.atan2(1.5, dist);
  const logit = 0.9 - dist * 0.045 + ang * 0.6;
  return parseFloat(Math.max(0.01, Math.min(0.99, 1 / (1 + Math.exp(-logit)))).toFixed(3));
};

// xA: xG del remate que sigue a un pase en la misma secuencia
// Se asigna post-hoc en sincronizarBaseDatos mirando el buffer

const getColorAccion = (accion) => {
  if (!accion) return '#6b7280';
  const a = accion.toLowerCase();
  if (a.includes('gol')) return '#10b981';
  if (a.includes('remate')) return '#3b82f6';
  if (a.includes('pérdida') || a.includes('perdida')) return '#ef4444';
  if (a.includes('recuperación') || a.includes('recuperacion')) return '#f59e0b';
  if (a.includes('pase')) return '#a78bfa';
  if (a.includes('duelo')) return '#fb923c';
  if (a.includes('falta')) return '#f43f5e';
  if (a.includes('córner') || a.includes('corner')) return '#06b6d4';
  if (a.includes('atajada')) return '#84cc16';
  return '#6b7280';
};

const ETIQUETAS_TACTICAS = ['—', 'Contraataque', 'Posición', 'Pelota Parada', 'Portero-Jugador', '2ª Ola'];

const mapAccionBD = {
  Pase: 'Pase', Remate: 'Remate', Recuperacion: 'Recuperación', Perdida: 'Pérdida',
  Falta: 'Falta cometida', DueloGanado: 'Duelo Ganado', DueloPerdido: 'Duelo Perdido',
  Bloqueo: 'Bloqueo/Intercepción', Atajada: 'Atajada', Lateral: 'Lateral',
  Corner: 'Córner', Ventaja: 'Falta (Ventaja)',
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
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
  const [videoDuration, setVideoDuration] = useState(0);

  // ─── RELOJ Y SINCRONIZACIÓN ────────────────────────────────────────────────
  const [offsetVideo, setOffsetVideo] = useState(null);
  const [reloj, setReloj] = useState({ corriendo: false, minuto: 0, segundos: 0, periodo: 'PT' });
  const relojRef = useRef(reloj);
  useEffect(() => { relojRef.current = reloj; }, [reloj]);

  // ─── TECLAS ────────────────────────────────────────────────────────────────
  const [teclas, setTeclas] = useState({
    videoPlayPause: 'Space', relojToggle: 'KeyC',
    retroceder: 'KeyA', avanzar: 'KeyD',
    Pase: 'KeyP', Remate: 'KeyT', Recuperacion: 'KeyR', Perdida: 'KeyE',
    Falta: 'KeyF', DueloGanado: 'KeyW', DueloPerdido: 'KeyQ',
    Bloqueo: 'KeyB', Atajada: 'KeyG', Lateral: 'KeyL', Corner: 'KeyX', Ventaja: 'KeyV',
    PorteroJugador: 'KeyN', CambioFormacion: 'KeyM',
  });
  const [editandoTecla, setEditandoTecla] = useState(null);

  // ─── ESTADO DE EVENTO ──────────────────────────────────────────────────────
  const [bufferEventos, setBufferEventos] = useState([]);
  const [eventosBase, setEventosBase] = useState([]);
  const [eventoPendiente, setEventoPendiente] = useState(null);
  const [pasoRegistro, setPasoRegistro] = useState(0); // 0=idle 1=mapa 2=jugador 3=remate
  const [herramientaMapa, setHerramientaMapa] = useState('accion');
  const [etiquetaTactica, setEtiquetaTactica] = useState('—');
  const [optDeEspaldas, setOptDeEspaldas] = useState(false);
  const [optBajoPresion, setOptBajoPresion] = useState(false);
  const [rotarCancha, setRotarCancha] = useState(false); // NUEVO ESTADO ROTACIÓN

  // ─── MODO TURBO: buffer de dígitos para preseleccionar jugador ─────────────
  const [dorsalBuffer, setDorsalBuffer] = useState('');
  const dorsalTimerRef = useRef(null);
  const [jugadorPreseleccionado, setJugadorPreseleccionado] = useState(null);

  // ─── ESTADO FÚTSAL ESPECÍFICO ──────────────────────────────────────────────
  const [porteroJugador, setPorteroJugador] = useState(false);
  const [faltasAcumuladas, setFaltasAcumuladas] = useState({ PT: 0, ST: 0 });
  const [formacionActual, setFormacionActual] = useState('1-2-2');
  const [rotaciones, setRotaciones] = useState([]);
  const [secuenciaActiva, setSecuenciaActiva] = useState(null);
  const [equipoActivo, setEquipoActivo] = useState('Propio'); // 'Propio' | 'Rival'

  // ─── UI ────────────────────────────────────────────────────────────────────
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const [mostrarDashboard, setMostrarDashboard] = useState(false);
  const [mostrarFormacion, setMostrarFormacion] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (msg, tipo = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, tipo });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  // ─── INIT ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function inicializar() {
      setCargando(true);
      if (!id) {
        const { data } = await supabase
          .from('partidos').select('id, fecha, rival, categoria, competicion, estado')
          .eq('club_id', clubId).order('fecha', { ascending: false });
        setListaPartidos(data || []);
        setFase(0); setCargando(false); return;
      }
      const { data: dbPartido } = await supabase.from('partidos').select('*').eq('id', id).single();
      if (!dbPartido) { navigate('/analisis-video'); return; }
      setPartidoActual(dbPartido);
      let idsPlantilla = [];
      try {
        const p = typeof dbPartido.plantilla === 'string' ? JSON.parse(dbPartido.plantilla) : dbPartido.plantilla;
        idsPlantilla = p ? p.map(j => j.id_jugador) : [];
      } catch { idsPlantilla = []; }
      if (idsPlantilla.length === 0) {
        const { data: dbJ } = await supabase.from('jugadores').select('*').eq('club_id', clubId).order('apellido', { ascending: true });
        setJugadoresClub(dbJ || []);
        setFase(1);
      } else {
        const { data: dbC } = await supabase.from('jugadores').select('*').in('id', idsPlantilla).order('dorsal', { ascending: true });
        setJugadoresConvocados(dbC || []);
        
        const { data: dbEv } = await supabase.from('eventos').select('*').eq('id_partido', id).order('minuto', { ascending: true });
        setEventosBase(dbEv || []);

        setFase(2);
      }
      setCargando(false);
    }
    inicializar();
  }, [id, clubId, navigate]);

  // ─── BACKUP LOCAL ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (fase === 3) {
      const bk = localStorage.getItem(`tracking_async_${partidoActual?.id}`);
      if (bk) {
        const { bufferGuardado, relojGuardado, faltasGuardadas, rotacionesGuardadas } = JSON.parse(bk);
        if (bufferGuardado) setBufferEventos(bufferGuardado);
        if (relojGuardado) setReloj({ ...relojGuardado, corriendo: false });
        if (faltasGuardadas) setFaltasAcumuladas(faltasGuardadas);
        if (rotacionesGuardadas) setRotaciones(rotacionesGuardadas);
      }
    }
  }, [fase, partidoActual?.id]);

  useEffect(() => {
    if (fase === 3 && partidoActual?.id) {
      localStorage.setItem(`tracking_async_${partidoActual.id}`, JSON.stringify({
        bufferGuardado: bufferEventos, relojGuardado: reloj,
        faltasGuardadas: faltasAcumuladas, rotacionesGuardadas: rotaciones,
      }));
    }
  }, [bufferEventos, reloj, faltasAcumuladas, rotaciones, fase, partidoActual?.id]);

  // ─── RELOJ ATADO AL VIDEO ──────────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current || offsetVideo === null) return;
    
    const handleTimeUpdate = () => {
      if (videoRef.current.currentTime >= offsetVideo && reloj.corriendo) {
        const elapsedSeconds = Math.floor(videoRef.current.currentTime - offsetVideo);
        setReloj(r => ({ ...r, minuto: Math.floor(elapsedSeconds / 60), segundos: elapsedSeconds % 60 }));
      }
    };

    const videoEl = videoRef.current;
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    return () => videoEl.removeEventListener('timeupdate', handleTimeUpdate);
  }, [offsetVideo, reloj.corriendo]);

  // ─── QUINTETO ACTIVO ───────────────────────────────────────────────────────
  const quintetoActivoIds = useMemo(() => {
    let activos = new Set(jugadoresConvocados.slice(0, 5).map(j => j.id)); 
    const tiempoActual = videoRef.current?.currentTime || 0;
    const eventosHastaAhora = [...eventosBase, ...bufferEventos].filter(e => 
      e.tiempo_video != null && e.tiempo_video <= tiempoActual
    ).sort((a, b) => a.tiempo_video - b.tiempo_video);

    eventosHastaAhora.forEach(ev => {
      if (ev.accion === 'Cambio In' && ev.id_jugador) activos.add(ev.id_jugador);
      if (ev.accion === 'Cambio Out' && ev.id_jugador) activos.delete(ev.id_jugador);
    });

    return Array.from(activos);
  }, [eventosBase, bufferEventos, reloj.segundos, jugadoresConvocados]);

  // ─── MODO TURBO: dorsal buffer ─────────────────────────────────────────────
  const resolverDorsal = useCallback((buf) => {
    const jug = jugadoresConvocados.find(j =>
      String(j.dorsal) === buf || String(j.dorsal).endsWith(buf)
    );
    if (jug) {
      setJugadorPreseleccionado(jug.id);
      showToast(`#${jug.dorsal} ${jug.apellido || jug.nombre}`, 'turbo');
    }
    setDorsalBuffer('');
  }, [jugadoresConvocados]);

  // ─── ENRIQUECER EVENTO DEL VIVO ────────────────────────────────────────────
  const iniciarEnriquecimiento = useCallback((evBase) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setHerramientaMapa('accion');
    
    setEventoPendiente({
      ...evBase,
      tiempo_video: parseFloat(videoRef.current.currentTime.toFixed(3)),
      isUpdate: true 
    });
    setPasoRegistro(1); 
  }, []);

  // ─── INICIAR EVENTO ────────────────────────────────────────────────────────
  const iniciarEvento = useCallback((accionKey) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    const accionStr = mapAccionBD[accionKey] || accionKey;
    setHerramientaMapa('accion');
    setEventoPendiente({
      id_partido: partidoActual.id,
      club_id: clubId,
      periodo: relojRef.current.periodo,
      minuto: relojRef.current.minuto,
      segundos: relojRef.current.segundos,
      tiempo_video: parseFloat(videoRef.current.currentTime.toFixed(3)),
      accion: accionStr,
      equipo: equipoActivo,
      zona_x: null, zona_y: null,
      id_jugador: jugadorPreseleccionado,
      id_asistencia: null,
      contexto_juego: porteroJugador ? 'Portero-Jugador' : '5v5',
      origen_gol: null,
      posiciones: [],
      etiqueta_tactica: etiquetaTactica !== '—' ? etiquetaTactica : null,
      faltas_acumuladas_snap: faltasAcumuladas[relojRef.current.periodo],
      xT: null, xG: null, xA: null,
    });
    setPasoRegistro(1);
  }, [partidoActual, clubId, equipoActivo, jugadorPreseleccionado, porteroJugador, etiquetaTactica, faltasAcumuladas]);

  // ─── KEYDOWN HANDLER ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!videoRef.current || editandoTecla || mostrarAyuda || mostrarDashboard || mostrarFormacion) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const key = e.code;

    // Dígitos → modo turbo preselección jugador
    if (/^Digit\d$/.test(key) && pasoRegistro === 0) {
      e.preventDefault();
      const d = key.replace('Digit', '');
      clearTimeout(dorsalTimerRef.current);
      const nuevo = dorsalBuffer + d;
      setDorsalBuffer(nuevo);
      dorsalTimerRef.current = setTimeout(() => resolverDorsal(nuevo), 450);
      return;
    }

    // Undo Ctrl+Z
    if (key === 'KeyZ' && e.ctrlKey && pasoRegistro === 0) {
      e.preventDefault();
      setBufferEventos(prev => {
        if (prev.length === 0) return prev;
        showToast('Evento eliminado', 'warn');
        return prev.slice(0, -1);
      });
      return;
    }

    // ESC → cancelar
    if (key === 'Escape') { if (pasoRegistro > 0) cancelarEvento(); return; }

    // Enter → skip mapa (confirmar sin coordenada)
    if (key === 'Enter' && pasoRegistro === 1) {
      e.preventDefault();
      confirmarMapeoYContinuar(true);
      return;
    }

    if (key === teclas.videoPlayPause) {
      e.preventDefault();
      videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
    } else if (key === teclas.relojToggle) {
      setReloj(r => ({ ...r, corriendo: !r.corriendo }));
    } else if (key === teclas.retroceder) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 3);
    } else if (key === teclas.avanzar) {
      videoRef.current.currentTime += 3;
    } else if (key === teclas.PorteroJugador && pasoRegistro === 0) {
      togglePorteroJugador();
    } else if (key === teclas.CambioFormacion && pasoRegistro === 0) {
      setMostrarFormacion(true);
    } else {
      const accionEncontrada = Object.keys(teclas).find(k =>
        teclas[k] === key &&
        !['videoPlayPause','relojToggle','retroceder','avanzar','PorteroJugador','CambioFormacion'].includes(k)
      );
      if (accionEncontrada && pasoRegistro === 0) iniciarEvento(accionEncontrada);
    }
  }, [teclas, editandoTecla, iniciarEvento, mostrarAyuda, mostrarDashboard, mostrarFormacion,
      pasoRegistro, dorsalBuffer, resolverDorsal]);

  useEffect(() => {
    if (fase === 3) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, fase]);

  // ─── PORTERO JUGADOR ───────────────────────────────────────────────────────
  const togglePorteroJugador = () => {
    const nuevo = !porteroJugador;
    setPorteroJugador(nuevo);
    if (videoRef.current) {
      setBufferEventos(prev => [...prev, {
        id_partido: partidoActual.id, club_id: clubId,
        periodo: relojRef.current.periodo,
        minuto: relojRef.current.minuto, segundos: relojRef.current.segundos,
        tiempo_video: parseFloat(videoRef.current.currentTime.toFixed(3)),
        accion: nuevo ? 'Portero-Jugador ON' : 'Portero-Jugador OFF',
        equipo: 'Propio', zona_x: null, zona_y: null,
        id_jugador: null, contexto_juego: nuevo ? 'Portero-Jugador' : '5v5',
      }]);
    }
    showToast(nuevo ? '5° atacante ACTIVO' : '5° atacante INACTIVO', nuevo ? 'danger' : 'info');
  };

  // ─── MAPA: registrar coordenada ────────────────────────────────────────────
  const registrarCoordenada = (e) => {
    if (!eventoPendiente) return;
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Cálculo base con soporte a inversión de cancha
    let x = parseFloat((((e.clientX - rect.left) / rect.width) * 100).toFixed(2));
    let y = parseFloat((((e.clientY - rect.top) / rect.height) * 100).toFixed(2));

    if (rotarCancha) {
      x = parseFloat((100 - x).toFixed(2));
      y = parseFloat((100 - y).toFixed(2));
    }
    
    // MODO ABP: Si es Pelota Parada y estás en modo jugador
    if (etiquetaTactica === 'Pelota Parada' && herramientaMapa !== 'accion' && herramientaMapa !== 'rival') {
       setEventoPendiente(prev => ({ 
         ...prev, 
         posiciones: [...(prev.posiciones || []).filter(p => p.id_jugador !== herramientaMapa), { tipo: 'propio', id_jugador: herramientaMapa, x, y }] 
       }));
       showToast(`Posición fijada`, 'success');
       return; 
    }

    if (herramientaMapa === 'accion') {
      const xT = calcularXT(x, y);
      const xG = eventoPendiente.accion.includes('Remate') ? calcularXG(x, y) : null;
      
      // AUTO-CÁLCULO: Altura de Bloque en Recuperaciones
      let alturaBloque = null;
      if (eventoPendiente.accion === 'Recuperación') {
        alturaBloque = x < 33.3 ? 'Baja' : x < 66.6 ? 'Media' : 'Alta';
        showToast(`Recuperación en Altura ${alturaBloque}`, 'success');
      }

      setEventoPendiente(prev => ({ 
        ...prev, 
        zona_x: x, 
        zona_y: y, 
        xT, 
        xG,
        etiqueta_tactica: alturaBloque ? `Recup. ${alturaBloque}` : prev.etiqueta_tactica 
      }));
    } else if (herramientaMapa === 'rival') {
      setEventoPendiente(prev => ({ ...prev, posiciones: [...(prev.posiciones || []), { tipo: 'rival', x, y }] }));
    } else {
      setEventoPendiente(prev => ({ ...prev, posiciones: [...(prev.posiciones || []), { tipo: 'propio', id_jugador: herramientaMapa, x, y }] }));
    }
  };

  const confirmarMapeoYContinuar = (skipMapa = false) => {
    if (!skipMapa && eventoPendiente?.zona_x == null) return;
    if (eventoPendiente?.id_jugador != null) {
      if (eventoPendiente.accion === 'Remate') {
        setPasoRegistro(3);
      } else {
        finalizarEvento(eventoPendiente);
      }
    } else {
      setPasoRegistro(2);
    }
  };

  const asignarJugador = (jugadorId) => {
    const ev = { ...eventoPendiente, id_jugador: jugadorId };
    setEventoPendiente(ev);
    if (ev.accion === 'Remate') {
      setPasoRegistro(3);
    } else {
      if (ev.accion === 'Pase') {
        if (!secuenciaActiva) {
          setSecuenciaActiva({ inicio: ev.tiempo_video, jugadores: [jugadorId] });
        } else {
          setSecuenciaActiva(prev => ({ ...prev, jugadores: [...new Set([...prev.jugadores, jugadorId])] }));
        }
      } else {
        if (secuenciaActiva && (ev.accion === 'Pérdida' || ev.accion === 'Remate' || ev.accion === 'Falta cometida')) {
          setSecuenciaActiva(null);
        }
      }
      finalizarEvento(ev);
    }
  };

  const asignarResultadoRemate = (resultado, asistenciaId = null, origen = null) => {
    const xG = eventoPendiente.xG;
    let modificadores = [];
    if (origen) modificadores.push(origen);
    if (optDeEspaldas) modificadores.push('De Espaldas');
    if (optBajoPresion) modificadores.push('Bajo Presión');
    const origenFinal = modificadores.length > 0 ? modificadores.join(' | ') : null;
    
    finalizarEvento({ ...eventoPendiente, accion: resultado, id_asistencia: asistenciaId, origen_gol: origenFinal });
    
    setOptDeEspaldas(false);
    setOptBajoPresion(false);    

    if (asistenciaId && xG) {
      setBufferEventos(prev => {
        const copia = [...prev];
        for (let i = copia.length - 1; i >= 0; i--) {
          if (copia[i].id_jugador === asistenciaId && copia[i].accion === 'Pase') {
            copia[i] = { ...copia[i], xA: xG };
            break;
          }
        }
        return copia;
      });
    }
  };

  const finalizarEvento = (ev) => {
    if (ev.accion === 'Falta cometida' && ev.equipo === 'Propio') {
      setFaltasAcumuladas(prev => ({ ...prev, [ev.periodo]: prev[ev.periodo] + 1 }));
    }
    setBufferEventos(prev => [...prev, ev]);
    setEventoPendiente(null);
    setPasoRegistro(0);
    setHerramientaMapa('accion');
    setJugadorPreseleccionado(null);
    if (videoRef.current) videoRef.current.play();
  };

  const cancelarEvento = () => {
    setEventoPendiente(null);
    setPasoRegistro(0);
    setHerramientaMapa('accion');
    setOptDeEspaldas(false);
    setOptBajoPresion(false);
    if (videoRef.current) videoRef.current.play();
  };

  // ─── SINCRONIZAR DB ────────────────────────────────────────────────────────
  const sincronizarBaseDatos = async () => {
    if (bufferEventos.length === 0) return;
    setCargando(true);

    const eventosLimpios = bufferEventos.map(ev => {
      const { isUpdate, xT, xG, xA, ...resto } = ev; 
      
      return { 
        ...resto, 
        xt: xT,  
        xg: xG,  
        xa: xA   
      };
    });

    const eventosNuevos = eventosLimpios.filter(ev => !ev.id);
    const eventosExistentes = eventosLimpios.filter(ev => ev.id);

    let errorInsert = null;
    let errorUpdate = null;

    if (eventosNuevos.length > 0) {
      const { error } = await supabase.from('eventos').insert(eventosNuevos);
      errorInsert = error;
    }

    if (eventosExistentes.length > 0) {
      const { error } = await supabase.from('eventos').upsert(eventosExistentes);
      errorUpdate = error;
    }

    if (!errorInsert && !errorUpdate) {
      setBufferEventos([]);
      setEventosBase(prev => prev.filter(eBase => !bufferEventos.some(b => b.id === eBase.id)));
      localStorage.removeItem(`tracking_async_${partidoActual.id}`);
      showToast(`${bufferEventos.length} eventos sincronizados`, 'success');
    } else {
      console.error("Error Insert:", errorInsert, "Error Update:", errorUpdate);
      showToast('Error al sincronizar. Revisa la consola.', 'danger');
    }
    setCargando(false);
  };

  // ─── STATS LIVE (dashboard) ────────────────────────────────────────────────
  const statsLive = (() => {
    const propios = bufferEventos.filter(e => e.equipo === 'Propio');
    const rivales = bufferEventos.filter(e => e.equipo === 'Rival');
    return {
      pases: propios.filter(e => e.accion === 'Pase').length,
      remates: propios.filter(e => e.accion?.includes('Remate')).length,
      goles: propios.filter(e => e.accion === 'Remate - Gol').length,
      golesRival: rivales.filter(e => e.accion === 'Remate - Gol').length,
      recuperaciones: propios.filter(e => e.accion === 'Recuperación').length,
      perdidas: propios.filter(e => e.accion === 'Pérdida').length,
      xGTotal: propios.filter(e => e.xG).reduce((s, e) => s + (e.xG || 0), 0).toFixed(2),
      xTTotal: propios.filter(e => e.xT).reduce((s, e) => s + (e.xT || 0), 0).toFixed(2),
      xATotal: propios.filter(e => e.xA).reduce((s, e) => s + (e.xA || 0), 0).toFixed(2),
      faltasPT: faltasAcumuladas.PT,
      faltasST: faltasAcumuladas.ST,
      contras: propios.filter(e => e.etiqueta_tactica === 'Contraataque').length,
      eventosTotales: bufferEventos.length,
    };
  })();

  // ─── HELPERS ───────────────────────────────────────────────────────────────
  const seleccionarPartido = (pid) => navigate(`/partido/${pid}/analisis-video`);
  const toggleJugador = (jId) => setSeleccionadosId(p => p.includes(jId) ? p.filter(i => i !== jId) : [...p, jId]);

  const guardarConvocatoria = async () => {
    if (seleccionadosId.length === 0) return;
    setCargando(true);
    const plantilla = seleccionadosId.map(jId => {
      const j = jugadoresClub.find(x => x.id === jId);
      return { id_jugador: j.id, dorsal: j.dorsal, apellido: j.apellido };
    });
    await supabase.from('partidos').update({ plantilla }).eq('id', partidoActual.id);
    const { data } = await supabase.from('jugadores').select('*').in('id', seleccionadosId).order('dorsal', { ascending: true });
    setJugadoresConvocados(data || []);
    setFase(2); setCargando(false);
  };

  const handleCargaVideo = (e) => {
    const file = e.target.files[0];
    if (file) { setVideoSrc(URL.createObjectURL(file)); setFase(3); }
  };

  const setNuevaTecla = (e) => {
    if (!editandoTecla) return;
    e.preventDefault();
    setTeclas(prev => ({ ...prev, [editandoTecla]: e.code }));
    setEditandoTecla(null);
  };

  const faltasActuales = faltasAcumuladas[reloj.periodo];
  const colorFaltas = faltasActuales >= 5 ? '#ef4444' : faltasActuales >= 4 ? '#f59e0b' : '#10b981';

  // ─── HEATMAP DATA por jugador (para dashboard) ─────────────────────────────
  const heatmapData = (jugadorId) =>
    bufferEventos.filter(e => e.id_jugador === jugadorId && e.zona_x != null)
                 .map(e => ({ x: e.zona_x, y: e.zona_y, accion: e.accion }));

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (cargando) return (
    <div style={{ background: '#000', height: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid #333', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ color: '#666', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '0.1em' }}>PROCESANDO DATOS...</span>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // FASE 0: LISTA DE PARTIDOS
  // ══════════════════════════════════════════════════════════════════
  if (fase === 0) {
    const categorias = ['Todas', ...new Set(listaPartidos.map(p => p.categoria).filter(Boolean))];
    const competiciones = ['Todas', ...new Set(listaPartidos.map(p => p.competicion).filter(Boolean))];
    const filtrados = listaPartidos.filter(p =>
      (filtroCategoria === 'Todas' || p.categoria === filtroCategoria) &&
      (filtroCompeticion === 'Todas' || p.competicion === filtroCompeticion)
    );
    return (
      <div style={{ padding: '40px', background: 'var(--bg)', minHeight: '100vh', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <h1 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>SELECCIONAR PARTIDO</h1>
            <button onClick={() => navigate('/inicio')} className="btn-secondary" style={{ padding: '10px 20px', fontWeight: 'bold' }}>VOLVER AL INICIO</button>
          </div>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
            <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ padding: '12px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontWeight: 900, flex: 1, cursor: 'pointer' }}>
              {categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'CATEGORÍA: TODAS' : c}</option>)}
            </select>
            <select value={filtroCompeticion} onChange={e => setFiltroCompeticion(e.target.value)} style={{ padding: '12px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '4px', outline: 'none', fontWeight: 900, flex: 1, cursor: 'pointer' }}>
              {competiciones.map(c => <option key={c} value={c}>{c === 'Todas' ? 'COMPETENCIA: TODAS' : c}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {filtrados.map(p => (
              <div key={p.id} onClick={() => seleccionarPartido(p.id)} style={{ background: '#111', border: '1px solid #333', padding: '20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'border-color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#333'}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 900 }}>{p.fecha?.split('-').reverse().join('/')} | {p.categoria} | {p.competicion}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase' }}>VS {p.rival}</div>
                </div>
                <div style={{ background: 'var(--accent)', color: '#000', padding: '8px 16px', borderRadius: '4px', fontWeight: 900, fontSize: '0.8rem' }}>ANALIZAR</div>
              </div>
            ))}
            {filtrados.length === 0 && <div style={{ color: '#888', textAlign: 'center', padding: '20px', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>NO SE ENCONTRARON PARTIDOS.</div>}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // FASE 1: CONVOCATORIA
  // ══════════════════════════════════════════════════════════════════
  if (fase === 1) {
    return (
      <div style={{ padding: '40px', background: 'var(--bg)', minHeight: '100vh', color: '#fff' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
            <div>
              <h1 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase' }}>CONVOCATORIA</h1>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>VS {partidoActual?.rival}</div>
            </div>
            <button onClick={() => navigate('/analisis-video')} className="btn-secondary" style={{ padding: '10px 20px', fontWeight: 'bold' }}>VOLVER</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '30px' }}>
            {jugadoresClub.map(j => (
              <div key={j.id} onClick={() => toggleJugador(j.id)} style={{ background: seleccionadosId.includes(j.id) ? 'rgba(0,255,136,0.1)' : '#111', border: `1px solid ${seleccionadosId.includes(j.id) ? 'var(--accent)' : '#333'}`, padding: '15px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
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

  // ══════════════════════════════════════════════════════════════════
  // FASE 2: CARGA VIDEO
  // ══════════════════════════════════════════════════════════════════
  if (fase === 2) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: '#fff', padding: '20px' }}>
        <div style={{ background: '#111', border: '1px solid var(--border)', padding: '40px', borderRadius: '8px', textAlign: 'center', maxWidth: '600px', width: '100%' }}>
          <h2 style={{ margin: '0 0 10px 0', color: 'var(--accent)', textTransform: 'uppercase' }}>TRACKING ASÍNCRONO</h2>
          <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '30px' }}>
            <strong>PARTIDO:</strong> VS {partidoActual?.rival} ({partidoActual?.categoria})<br />
            <strong>PLANTILLA:</strong> {jugadoresConvocados.length} JUGADORES
          </div>
          <label style={{ display: 'inline-block', background: '#3b82f6', color: '#fff', padding: '15px 30px', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, width: '100%', boxSizing: 'border-box' }}>
            SELECCIONAR ARCHIVO DE VIDEO LOCAL
            <input type="file" accept="video/*" onChange={handleCargaVideo} style={{ display: 'none' }} />
          </label>
          <button onClick={() => navigate('/analisis-video')} style={{ width: '100%', marginTop: '15px', padding: '15px 30px', background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: '4px', cursor: 'pointer', fontWeight: 900 }}>VOLVER</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // FASE 3: TRACKING PRINCIPAL
  // ══════════════════════════════════════════════════════════════════
  if (fase === 3) {
    return (
      <>
        <style>{`
          /* AJUSTE DEL RELOJ: Más chico el font-size y se ajustó el width */
          .input-reloj { width:24px;background:transparent;border:none;color:#fff;font-size:0.9rem;font-weight:900;text-align:center;outline:none; }
          @keyframes pulseRed { 0%,100%{opacity:1} 50%{opacity:0.6} }
          @keyframes fadeSlide { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
          .evento-badge { animation: fadeSlide 0.15s ease; }
          .btn-accion { background:#1a1a1a;color:#ccc;border:1px solid #333;padding:8px 12px;border-radius:4px;cursor:pointer;font-weight:900;font-size:0.75rem;transition:all 0.15s; }
          .btn-accion:hover { background:#252525;color:#fff;border-color:#555; }
          .btn-accion.activo { background:rgba(0,255,136,0.12);color:var(--accent);border-color:var(--accent); }
        `}</style>

        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#000', color: '#fff', fontFamily: 'system-ui,sans-serif' }}>

          {/* ── HEADER ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0d0d0d', borderBottom: '1px solid #222', padding: '0 16px', height: '56px', flexShrink: 0, gap: '12px' }}>

            {/* Izquierda: partido + reloj */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 900 }}>ANALIZANDO</div>
                <div style={{ fontWeight: 900, color: '#f97316', fontSize: '1rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>VS {partidoActual?.rival}</div>
              </div>

              {/* Reloj y Botón SYNC */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '0 8px', gap: '8px', height: '36px' }}>
                <button onClick={() => setReloj(r => ({ ...r, corriendo: !r.corriendo }))} style={{ background: reloj.corriendo ? '#ef4444' : '#10b981', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '3px', cursor: 'pointer', fontWeight: 900, fontSize: '0.65rem', flexShrink: 0 }}>
                  {reloj.corriendo ? '⏸' : '▶'}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', background: '#000', padding: '2px 6px', borderRadius: '3px', border: '1px solid #2a2a2a' }}>
                  <input type="text" className="input-reloj" value={String(reloj.minuto).padStart(2, '0')} onChange={e => setReloj(r => ({ ...r, minuto: parseInt(e.target.value.replace(/\D/g,''),10)||0 }))} />
                  <span style={{ fontWeight: 900, paddingBottom: '1px' }}>:</span>
                  <input type="text" className="input-reloj" value={String(reloj.segundos).padStart(2, '0')} onChange={e => { let v=parseInt(e.target.value.replace(/\D/g,''),10)||0; if(v>59)v=59; setReloj(r=>({...r,segundos:v})); }} />
                </div>
                <select value={reloj.periodo} onChange={e => setReloj(r => ({ ...r, periodo: e.target.value }))} style={{ background: 'transparent', color: '#aaa', border: 'none', fontWeight: 900, fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}>
                  <option value="PT">PT</option>
                  <option value="ST">ST</option>
                  <option value="TE">TE</option>
                </select>
                
                {/* BOTÓN SYNC RELOJ */}
                <button 
                  onClick={() => {
                    if (videoRef.current) {
                      setOffsetVideo(videoRef.current.currentTime);
                      setReloj({ corriendo: true, minuto: 0, segundos: 0, periodo: 'PT' });
                      showToast('Reloj sincronizado con el video', 'success');
                    }
                  }} 
                  style={{ background: offsetVideo !== null ? 'rgba(16,185,129,0.2)' : 'transparent', border: `1px solid ${offsetVideo !== null ? '#10b981' : '#444'}`, color: offsetVideo !== null ? '#10b981' : '#888', padding: '4px 8px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.65rem' }}
                  title="Fijar el 00:00 del partido en el frame actual del video"
                >
                  {offsetVideo !== null ? '⏱️ SYNC OK' : '⏱️ FIJAR INICIO'}
                </button>
              </div>

              {/* Faltas acumuladas */}
              <div style={{ background: '#0a0a0a', border: `1px solid ${colorFaltas}`, borderRadius: '4px', padding: '3px 10px', fontWeight: 900, fontSize: '0.75rem', color: colorFaltas, flexShrink: 0 }}>
                FALTAS {faltasActuales}/5
                {faltasActuales >= 5 && <span style={{ marginLeft: '6px', animation: 'pulseRed 1s infinite' }}>⚡PDT</span>}
              </div>

              {/* Portero-jugador */}
              {porteroJugador && (
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '4px', padding: '3px 10px', fontWeight: 900, fontSize: '0.7rem', color: '#ef4444', animation: 'pulseRed 1.2s infinite', flexShrink: 0 }}>
                  5° ATQ
                </div>
              )}

              {/* Jugador preseleccionado (modo turbo) */}
              {jugadorPreseleccionado && pasoRegistro === 0 && (
                <div style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid #a78bfa', borderRadius: '4px', padding: '3px 10px', fontWeight: 900, fontSize: '0.7rem', color: '#a78bfa', flexShrink: 0 }}>
                  #{jugadoresConvocados.find(j=>j.id===jugadorPreseleccionado)?.dorsal} PRE
                </div>
              )}

              {/* Etiqueta táctica */}
              <select value={etiquetaTactica} onChange={e => setEtiquetaTactica(e.target.value)} style={{ background: '#111', color: etiquetaTactica !== '—' ? '#fbbf24' : '#666', border: `1px solid ${etiquetaTactica !== '—' ? '#f59e0b' : '#333'}`, borderRadius: '4px', padding: '4px 8px', fontWeight: 900, fontSize: '0.7rem', outline: 'none', cursor: 'pointer' }}>
                {ETIQUETAS_TACTICAS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>

              {/* Toggle equipo */}
              <div style={{ display: 'flex', background: '#111', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                <button onClick={() => setEquipoActivo('Propio')} style={{ padding: '4px 10px', background: equipoActivo==='Propio' ? '#3b82f6' : 'transparent', color: equipoActivo==='Propio' ? '#fff' : '#666', border: 'none', fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer' }}>PROPIO</button>
                <button onClick={() => setEquipoActivo('Rival')} style={{ padding: '4px 10px', background: equipoActivo==='Rival' ? '#ef4444' : 'transparent', color: equipoActivo==='Rival' ? '#fff' : '#666', border: 'none', fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer' }}>RIVAL</button>
              </div>
            </div>

            {/* Derecha: acciones */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => setMostrarDashboard(true)} style={{ background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '6px 12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem' }}>
                📊 STATS
              </button>
              <button onClick={() => setMostrarAyuda(true)} style={{ background: 'transparent', border: '1px solid #444', color: '#888', padding: '6px 12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem' }}>
                ❔
              </button>
              <button onClick={() => setFase(2)} style={{ background: 'transparent', border: '1px solid #333', color: '#666', padding: '6px 12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem' }}>
                CERRAR
              </button>
              <div style={{ color: bufferEventos.length > 0 ? '#10b981' : '#444', fontSize: '0.75rem', fontWeight: 900, minWidth: '70px', textAlign: 'right' }}>
                BUF: {bufferEventos.length}
              </div>
              <button onClick={sincronizarBaseDatos} disabled={bufferEventos.length === 0} style={{ background: bufferEventos.length > 0 ? 'var(--accent)' : '#1a1a1a', color: bufferEventos.length > 0 ? '#000' : '#444', border: 'none', padding: '6px 14px', borderRadius: '4px', fontWeight: 900, cursor: bufferEventos.length > 0 ? 'pointer' : 'default', fontSize: '0.75rem' }}>
                SYNC DB
              </button>
            </div>
          </div>

          {/* ── CUERPO ── */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

            {/* ── VIDEO + ATAJOS ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a1a', minHeight: 0 }}>

              {/* Video */}
              <div style={{ background: '#000', flex: 1, position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onLoadedMetadata={e => setVideoDuration(e.target.duration)}
                />

                {/* Banner evento activo */}
                {pasoRegistro > 0 && (
                  <div className="evento-badge" style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.92)', color: '#fff', padding: '8px 20px', borderRadius: '20px', fontWeight: 900, fontSize: '0.85rem', border: '1.5px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>
                    ● {eventoPendiente?.accion?.toUpperCase()} — PASO {pasoRegistro}/{ eventoPendiente?.accion === 'Remate' ? 3 : 2}
                    {eventoPendiente?.xT && <span style={{ marginLeft: '10px', opacity: 0.8, fontSize: '0.75rem' }}>xT {eventoPendiente.xT}</span>}
                  </div>
                )}

                {/* Toast */}
                {toast && (
                  <div style={{ position: 'absolute', bottom: 60, right: 16, background: toast.tipo === 'danger' ? '#ef4444' : toast.tipo === 'success' ? '#10b981' : toast.tipo === 'turbo' ? '#a78bfa' : '#f59e0b', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: 900, fontSize: '0.8rem', animation: 'fadeSlide 0.2s ease' }}>
                    {toast.msg}
                  </div>
                )}

                {/* Timeline de eventos sobre la barra del video */}
                {videoDuration > 0 && (
                  <div style={{ position: 'absolute', bottom: 46, left: 0, right: 0, height: '16px', pointerEvents: 'none' }}>
                    {bufferEventos.filter(e => e.tiempo_video != null).map((ev, i) => (
                      <div key={i} title={`${ev.minuto}' ${ev.accion}${ev.xT ? ` xT:${ev.xT}` : ''}`} style={{ position: 'absolute', left: `${(ev.tiempo_video / videoDuration) * 100}%`, bottom: 0, width: '3px', height: ev.accion?.includes('Gol') ? '14px' : '8px', background: getColorAccion(ev.accion), transform: 'translateX(-50%)', borderRadius: '1px', opacity: 0.85 }} />
                    ))}
                  </div>
                )}
              </div>

              {/* ── ATAJOS ── */}
              <div style={{ height: '100px', flexShrink: 0, background: '#080808', borderTop: '1px solid #1a1a1a', padding: '8px 12px', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '5px' }}>ATAJOS — CLICK PARA REASIGNAR</div>
                {editandoTecla && (
                  <input autoFocus onKeyDown={setNuevaTecla} onBlur={() => setEditandoTecla(null)}
                    placeholder="Presione nueva tecla..."
                    style={{ position: 'absolute', zIndex: 200, background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', fontWeight: 900, borderRadius: '4px', fontSize: '0.8rem' }} />
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.entries(teclas).map(([accion, tecla]) => (
                    <div key={accion} onClick={() => setEditandoTecla(accion)} style={{ background: '#111', border: '1px solid #222', padding: '3px 7px', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '0.6rem', color: '#888' }}>{accion}</span>
                      <span style={{ background: '#1a1a1a', color: 'var(--accent)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 900 }}>{tecla}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── PANEL DERECHO ── */}
            <div style={{ width: '380px', flexShrink: 0, background: '#0d0d0d', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              {/* Toolbar herramientas mapa (solo en paso 1) */}
              {pasoRegistro === 1 && (
                <div style={{ padding: '8px 12px', background: '#080808', borderBottom: '1px solid #1a1a1a', display: 'flex', gap: '5px', overflowX: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setHerramientaMapa('accion')} className={`btn-accion${herramientaMapa==='accion'?' activo':''}`}>📍 ACCIÓN</button>
                  <button onClick={() => setHerramientaMapa('rival')} style={{ ...{background:'#1a1a1a',color:'#ccc',border:'1px solid #333',padding:'8px 12px',borderRadius:'4px',cursor:'pointer',fontWeight:900,fontSize:'0.75rem'}, ...(herramientaMapa==='rival'?{background:'rgba(239,68,68,0.15)',color:'#ef4444',borderColor:'#ef4444'}:{}) }}>🔴 RIVAL</button>
                  <div style={{ width: '1px', background: '#222', margin: '0 2px' }} />
                  {jugadoresConvocados.map(j => (
                    <button key={j.id} onClick={() => setHerramientaMapa(j.id)} style={{ background: herramientaMapa===j.id ? 'rgba(59,130,246,0.15)' : '#1a1a1a', color: herramientaMapa===j.id ? '#60a5fa' : '#888', border: `1px solid ${herramientaMapa===j.id ? '#3b82f6' : '#333'}`, padding: '6px 9px', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.7rem' }}>
                      {j.dorsal}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

                {/* ─── PASO 1: MAPA ──────────────────────────────────── */}
                {pasoRegistro === 1 && (
                  <div style={{ padding: '12px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent)' }}>1. MAPA ESPACIAL — {eventoPendiente?.accion}</span>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* BOTÓN DE ROTAR CANCHA */}
                        <button onClick={() => setRotarCancha(!rotarCancha)} style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '3px 8px', borderRadius: '4px', fontSize: '0.6rem', cursor: 'pointer', fontWeight: 900, transition: '0.2s' }}>
                          🔄 {rotarCancha ? 'ATACANDO IZQ' : 'ATACANDO DER'}
                        </button>
                        
                        {eventoPendiente?.zona_x != null && (
                          <span style={{ fontSize: '0.65rem', color: '#888' }}>
                            {eventoPendiente.xT && <span style={{ color: '#f59e0b', marginRight: '8px' }}>xT {eventoPendiente.xT}</span>}
                            {eventoPendiente.xG && <span style={{ color: '#3b82f6' }}>xG {eventoPendiente.xG}</span>}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* CANCHA */}
                    <div onClick={registrarCoordenada} style={{ width: '100%', aspectRatio: '2/1', background: '#050f08', border: '1px solid #1a3a22', position: 'relative', cursor: 'crosshair', overflow: 'hidden', borderRadius: '4px' }}>
                      {/* Líneas de cancha fútsal */}
                      <div style={{ position:'absolute',left:'50%',top:0,bottom:0,width:'1px',background:'rgba(255,255,255,0.08)',pointerEvents:'none' }} />
                      <div style={{ position:'absolute',left:'50%',top:'50%',width:'18%',height:'36%',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'50%',transform:'translate(-50%,-50%)',pointerEvents:'none' }} />
                      {/* Áreas */}
                      <div style={{ position:'absolute',left:0,top:'20%',width:'14%',height:'60%',border:'1px solid rgba(255,255,255,0.1)',borderLeft:'none',pointerEvents:'none' }} />
                      <div style={{ position:'absolute',right:0,top:'20%',width:'14%',height:'60%',border:'1px solid rgba(255,255,255,0.1)',borderRight:'none',pointerEvents:'none' }} />
                      {/* Área chica */}
                      <div style={{ position:'absolute',left:0,top:'32%',width:'6%',height:'36%',border:'1px solid rgba(255,255,255,0.12)',borderLeft:'none',pointerEvents:'none' }} />
                      <div style={{ position:'absolute',right:0,top:'32%',width:'6%',height:'36%',border:'1px solid rgba(255,255,255,0.12)',borderRight:'none',pointerEvents:'none' }} />

                      {/* Heatmap histórico del buffer */}
                      {bufferEventos.filter(e => e.zona_x != null).map((ev, i) => (
                        <div key={i} style={{ position:'absolute',left:`${rotarCancha ? 100 - ev.zona_x : ev.zona_x}%`,top:`${rotarCancha ? 100 - ev.zona_y : ev.zona_y}%`,width:'8px',height:'8px',background:getColorAccion(ev.accion),borderRadius:'50%',transform:'translate(-50%,-50%)',opacity:0.25,pointerEvents:'none' }} />
                      ))}

                      {/* Posiciones de jugadores/rivales en este evento */}
                      {eventoPendiente?.posiciones?.map((pos, i) => (
                        <div key={i} style={{ position:'absolute',left:`${rotarCancha ? 100 - pos.x : pos.x}%`,top:`${rotarCancha ? 100 - pos.y : pos.y}%`,width:'14px',height:'14px',background:pos.tipo==='rival'?'#ef4444':'#3b82f6',borderRadius:'50%',transform:'translate(-50%,-50%)',border:'1px solid rgba(255,255,255,0.5)',pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center' }}>
                          {pos.tipo==='propio' && <span style={{ fontSize:'0.45rem',color:'#fff',fontWeight:900 }}>{jugadoresConvocados.find(j=>j.id===pos.id_jugador)?.dorsal}</span>}
                        </div>
                      ))}

                      {/* Marcador acción principal */}
                      {eventoPendiente?.zona_x != null && (
                        <div style={{ position:'absolute',left:`${rotarCancha ? 100 - eventoPendiente.zona_x : eventoPendiente.zona_x}%`,top:`${rotarCancha ? 100 - eventoPendiente.zona_y : eventoPendiente.zona_y}%`,width:'18px',height:'18px',background:'#f97316',borderRadius:'50%',transform:'translate(-50%,-50%)',border:'2px solid #fff',zIndex:10,pointerEvents:'none',boxShadow:'0 0 0 4px rgba(249,115,22,0.25)' }} />
                      )}

                      {/* Grid xT overlay sutil */}
                      <svg style={{ position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none',opacity:0.12 }} viewBox="0 0 100 50">
                        {[10,20,30,40,50,60,70,80,90].map(x => (
                          <line key={x} x1={x} y1={0} x2={x} y2={50} stroke="#fff" strokeWidth="0.3"/>
                        ))}
                        {[8.3,16.7,25,33.3,41.7].map(y => (
                          <line key={y} x1={0} y1={y} x2={100} y2={y} stroke="#fff" strokeWidth="0.3"/>
                        ))}
                      </svg>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button onClick={() => confirmarMapeoYContinuar(false)} disabled={eventoPendiente?.zona_x == null} style={{ flex: 1, background: eventoPendiente?.zona_x != null ? 'var(--accent)' : '#1a1a1a', color: eventoPendiente?.zona_x != null ? '#000' : '#444', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 900, cursor: eventoPendiente?.zona_x != null ? 'pointer' : 'default', fontSize: '0.8rem' }}>
                        CONFIRMAR MAPA
                      </button>
                      <button onClick={() => confirmarMapeoYContinuar(true)} style={{ background: '#1a1a1a', color: '#888', border: '1px solid #333', padding: '8px 12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem' }} title="Enter">
                        SKIP [↵]
                      </button>
                    </div>
                  </div>
                )}

                {/* ─── PASO 2: JUGADOR ───────────────────────────────── */}
                {pasoRegistro === 2 && (
                  <div style={{ padding: '12px', animation: 'fadeSlide 0.15s ease' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent)', marginBottom: '10px' }}>
                      2. AUTOR — {eventoPendiente?.accion}
                      {eventoPendiente?.xG && <span style={{ color: '#3b82f6', marginLeft: '8px' }}>xG {eventoPendiente.xG}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {jugadoresConvocados.map(jug => (
                        <button key={jug.id} onClick={() => asignarJugador(jug.id)} style={{ background: '#161616', color: '#fff', border: '1px solid #2a2a2a', padding: '10px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'border-color 0.1s' }}
                          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
                          onMouseLeave={e=>e.currentTarget.style.borderColor='#2a2a2a'}>
                          <span style={{ color: 'var(--accent)', fontWeight: 900, background: '#0a0a0a', padding: '2px 5px', borderRadius: '3px', minWidth: '28px', textAlign: 'center' }}>{jug.dorsal}</span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jug.apellido || jug.nombre}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => asignarJugador(null)} style={{ width: '100%', marginTop: '8px', background: 'transparent', border: '1px dashed #333', color: '#666', padding: '8px', cursor: 'pointer', fontSize: '0.75rem', borderRadius: '4px' }}>
                      SIN JUGADOR / RIVAL
                    </button>
                  </div>
                )}

                {/* ─── PASO 3: CIERRE REMATE ─────────────────────────── */}
                {pasoRegistro === 3 && (
                  <div style={{ padding: '12px', animation: 'fadeSlide 0.15s ease' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#f97316', marginBottom: '10px' }}>
                      3. RESULTADO REMATE
                      {eventoPendiente?.xG && <span style={{ color: '#3b82f6', marginLeft: '8px', fontSize: '0.75rem' }}>xG {eventoPendiente.xG}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol')} style={{ background:'rgba(16,185,129,0.12)',border:'1px solid #10b981',color:'#10b981',padding:'12px',borderRadius:'6px',fontWeight:900,cursor:'pointer',fontSize:'0.9rem' }}>⚽ GOL</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Atajado')} style={{ background:'rgba(245,158,11,0.12)',border:'1px solid #f59e0b',color:'#f59e0b',padding:'10px',borderRadius:'6px',fontWeight:900,cursor:'pointer' }}>🧤 ATAJADO</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Afuera')} style={{ background:'rgba(239,68,68,0.12)',border:'1px solid #ef4444',color:'#ef4444',padding:'10px',borderRadius:'6px',fontWeight:900,cursor:'pointer' }}>❌ AFUERA / BLOQ.</button>
                    </div>

                    {/* Asistencia */}
                    <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '6px' }}>ASISTENCIA (OPCIONAL)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '12px' }}>
                      {jugadoresConvocados.filter(j => j.id !== eventoPendiente?.id_jugador).map(j => (
                        <button key={j.id} onClick={() => { setEventoPendiente(p=>({...p,id_asistencia:p.id_asistencia===j.id?null:j.id})); }} style={{ background: eventoPendiente?.id_asistencia===j.id ? 'rgba(59,130,246,0.2)' : '#111', border: `1px solid ${eventoPendiente?.id_asistencia===j.id?'#3b82f6':'#222'}`, color: eventoPendiente?.id_asistencia===j.id?'#60a5fa':'#888', padding: '5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 900, fontSize: '0.65rem' }}>
                          #{j.dorsal}
                        </button>
                      ))}
                    </div>

                    {/* FASE 3: BOTONES DE POSTURA Y PRESIÓN */}
                    <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '6px' }}>POSTURA Y PRESIÓN (xG)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '12px' }}>
                      <button onClick={() => setOptDeEspaldas(!optDeEspaldas)} style={{ background: optDeEspaldas ? 'rgba(245,158,11,0.2)' : '#111', border: `1px solid ${optDeEspaldas ? '#f59e0b' : '#222'}`, color: optDeEspaldas ? '#f59e0b' : '#888', padding: '5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 900, fontSize: '0.65rem', transition: '0.2s' }}>
                        {optDeEspaldas ? '✓ DE ESPALDAS' : '👤 DE ESPALDAS'}
                      </button>
                      <button onClick={() => setOptBajoPresion(!optBajoPresion)} style={{ background: optBajoPresion ? 'rgba(239,68,68,0.2)' : '#111', border: `1px solid ${optBajoPresion ? '#ef4444' : '#222'}`, color: optBajoPresion ? '#ef4444' : '#888', padding: '5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 900, fontSize: '0.65rem', transition: '0.2s' }}>
                        {optBajoPresion ? '✓ BAJO PRESIÓN' : '🛡️ BAJO PRESIÓN'}
                      </button>
                    </div>

                    <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '6px' }}>MODIFICADORES RÁPIDOS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol', eventoPendiente?.id_asistencia, '2do Palo')} style={{ background:'#111',color:'#ccc',border:'1px solid #222',padding:'8px',borderRadius:'4px',cursor:'pointer',fontSize:'0.7rem',fontWeight:900 }}>GOL 2DO PALO</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Atajado', null, 'Mano a Mano')} style={{ background:'#111',color:'#ccc',border:'1px solid #222',padding:'8px',borderRadius:'4px',cursor:'pointer',fontSize:'0.7rem',fontWeight:900 }}>ATAJADA 1v1</button>
                      <button onClick={() => asignarResultadoRemate('Remate - Gol', eventoPendiente?.id_asistencia, 'Contraataque')} style={{ background:'#111',color:'#ccc',border:'1px solid #222',padding:'8px',borderRadius:'4px',cursor:'pointer',fontSize:'0.7rem',fontWeight:900,gridColumn:'span 2' }}>GOL CONTRAATAQUE</button>
                    </div>
                  </div>
                )}

                {/* ─── PASO 0: LISTA PLANTEL + LÍNEA DE TIEMPO ──────── */}
                {pasoRegistro === 0 && (
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                    {/* Mini stats rápidas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginBottom: '14px', flexShrink: 0 }}>
                      {[
                        { label: 'PASES', val: statsLive.pases, color: '#a78bfa' },
                        { label: 'REMA.', val: statsLive.remates, color: '#3b82f6' },
                        { label: 'xG', val: statsLive.xGTotal, color: '#10b981' },
                        { label: 'GOLES', val: `${statsLive.goles}-${statsLive.golesRival}`, color: '#f97316' },
                      ].map(s => (
                        <div key={s.label} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '6px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.55rem', color: '#555', fontWeight: 900 }}>{s.label}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 900, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Plantel */}
                    <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '8px', flexShrink: 0 }}>PLANTEL EN CAMPO</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '14px', flexShrink: 0 }}>
                      {jugadoresConvocados.map(jug => {
                        const enCancha = quintetoActivoIds.includes(jug.id);
                        const evJug = bufferEventos.filter(e => e.id_jugador === jug.id);
                        const xTJug = evJug.reduce((s,e)=>s+(e.xT||0),0).toFixed(2);
                        const gJug = evJug.filter(e=>e.accion==='Remate - Gol').length;
                        return (
                          <div key={jug.id} style={{ 
                            background: enCancha ? 'rgba(59,130,246,0.1)' : '#0a0a0a', 
                            border: `1px solid ${enCancha ? '#3b82f6' : '#1a1a1a'}`, 
                            padding: '8px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '8px',
                            opacity: enCancha ? 1 : 0.4 
                          }}>
                            <span style={{ fontWeight: 900, background: '#000', color: enCancha ? '#3b82f6' : 'var(--accent)', padding: '2px 5px', borderRadius: '3px', minWidth: '26px', textAlign: 'center', fontSize: '0.8rem' }}>{jug.dorsal}</span>
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>{jug.apellido || jug.nombre}</div>
                              <div style={{ fontSize: '0.6rem', color: '#555' }}>xT {xTJug}{gJug > 0 && <span style={{ color: '#10b981', marginLeft: '4px' }}>⚽{gJug}</span>}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── PANEL DE EVENTOS (PENDIENTES VS MAPEADOS) ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', flex: 1, minHeight: 0 }}>
                      
                      {/* 1. EVENTOS DEL VIVO PENDIENTES DE MAPEAR */}
                      {eventosBase.filter(e => e.tiempo_video == null).length > 0 && (
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 900, marginBottom: '6px' }}>
                            📥 PENDIENTES DEL VIVO ({eventosBase.filter(e => e.tiempo_video == null).length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
                            {eventosBase
                              .filter(e => e.tiempo_video == null)
                              .sort((a, b) => {
                                const periodos = { PT: 1, ST: 2, TE: 3 };
                                if (periodos[a.periodo] !== periodos[b.periodo]) return (periodos[a.periodo] || 9) - (periodos[b.periodo] || 9);
                                if (a.minuto !== b.minuto) return a.minuto - b.minuto;
                                return (a.segundos || 0) - (b.segundos || 0);
                              })
                              .map(ev => {
                              const jug = jugadoresConvocados.find(j => j.id === ev.id_jugador);
                              return (
                                <div key={ev.id} onClick={() => iniciarEnriquecimiento(ev)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(245,158,11,0.1)', border: '1px dashed #f59e0b', borderRadius: '4px', cursor: 'pointer' }}>
                                  <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 900, minWidth: '30px' }}>{ev.periodo} {ev.minuto}'</span>
                                  <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.accion}</span>
                                  {jug && <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 900 }}>#{jug.dorsal}</span>}
                                  <span style={{ fontSize: '0.6rem', background: '#f59e0b', color: '#000', padding: '2px 6px', borderRadius: '3px', fontWeight: 900 }}>MAPEAR</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2. LÍNEA DE TIEMPO UNIFICADA (ORDENADA POR SEGUNDO DE VIDEO) */}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <div style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 900, marginBottom: '6px' }}>
                          ⏱️ LÍNEA DE TIEMPO DEL VIDEO
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', paddingRight: '4px', flex: 1 }}>
                          {[...eventosBase.filter(e => e.tiempo_video != null), ...bufferEventos]
                            .sort((a, b) => a.tiempo_video - b.tiempo_video)
                            .map((ev, i) => {
                              const jug = jugadoresConvocados.find(j => j.id === ev.id_jugador);
                              const minsVideo = Math.floor(ev.tiempo_video / 60);
                              const secsVideo = Math.floor(ev.tiempo_video % 60).toString().padStart(2, '0');
                              
                              return (
                                <div key={ev.id || `buf-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: ev.isUpdate ? 'rgba(59,130,246,0.1)' : '#080808', borderRadius: '3px', borderLeft: `2px solid ${getColorAccion(ev.accion)}` }}>
                                  <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 900, minWidth: '35px' }}>{minsVideo}:{secsVideo}</span>
                                  <span style={{ fontSize: '0.7rem', color: getColorAccion(ev.accion), fontWeight: 900, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {ev.accion} {ev.origen_gol ? `(${ev.origen_gol})` : ''}
                                  </span>
                                  {jug && <span style={{ fontSize: '0.6rem', color: '#ccc' }}>#{jug.dorsal}</span>}
                                  {ev.xT && <span style={{ fontSize: '0.55rem', color: '#f59e0b', background: '#222', padding: '1px 3px', borderRadius: '2px' }}>xT {ev.xT}</span>}
                                </div>
                              );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancelar */}
                {pasoRegistro > 0 && (
                  <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
                    <button onClick={cancelarEvento} style={{ width: '100%', background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '8px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', fontSize: '0.75rem' }}>
                      ABORTAR [ESC]
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══ MODAL DASHBOARD ══════════════════════════════════════════════ */}
        {mostrarDashboard && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}>
            <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: '8px', padding: '24px', maxWidth: '700px', width: '100%', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1rem', textTransform: 'uppercase', fontWeight: 900 }}>Dashboard en Vivo — VS {partidoActual?.rival}</h2>
                <button onClick={() => setMostrarDashboard(false)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>

              {/* Stats generales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '20px' }}>
                {[
                  { l:'GOLES', v:`${statsLive.goles}–${statsLive.golesRival}`, c:'#f97316' },
                  { l:'xG TOTAL', v:statsLive.xGTotal, c:'#10b981' },
                  { l:'xT TOTAL', v:statsLive.xTTotal, c:'#f59e0b' },
                  { l:'xA TOTAL', v:statsLive.xATotal, c:'#a78bfa' },
                  { l:'PASES', v:statsLive.pases, c:'#6b7280' },
                  { l:'REMATES', v:statsLive.remates, c:'#3b82f6' },
                  { l:'RECUPERAC.', v:statsLive.recuperaciones, c:'#f59e0b' },
                  { l:'PÉRDIDAS', v:statsLive.perdidas, c:'#ef4444' },
                  { l:'CONTRAS', v:statsLive.contras, c:'#fb923c' },
                  { l:'F. ACUM PT', v:`${statsLive.faltasPT}/5`, c:statsLive.faltasPT>=5?'#ef4444':statsLive.faltasPT>=4?'#f59e0b':'#666' },
                  { l:'F. ACUM ST', v:`${statsLive.faltasST}/5`, c:statsLive.faltasST>=5?'#ef4444':statsLive.faltasST>=4?'#f59e0b':'#666' },
                  { l:'EVENTOS', v:statsLive.eventosTotales, c:'#6b7280' },
                ].map(s => (
                  <div key={s.l} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '6px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', color: '#555', fontWeight: 900, marginBottom: '3px' }}>{s.l}</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Stats por jugador */}
              <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: 900, marginBottom: '8px' }}>RENDIMIENTO POR JUGADOR</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['#','JUGADOR','PASES','REMA.','GOL','RECUP.','PÉRD.','xT','xG','xA'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: h==='JUGADOR'?'left':'center', color: '#555', fontWeight: 900, fontSize: '0.6rem' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jugadoresConvocados.map(jug => {
                      const evJ = bufferEventos.filter(e => e.id_jugador === jug.id);
                      const row = {
                        pases: evJ.filter(e=>e.accion==='Pase').length,
                        remates: evJ.filter(e=>e.accion?.includes('Remate')).length,
                        goles: evJ.filter(e=>e.accion==='Remate - Gol').length,
                        recup: evJ.filter(e=>e.accion==='Recuperación').length,
                        perd: evJ.filter(e=>e.accion==='Pérdida').length,
                        xT: evJ.reduce((s,e)=>s+(e.xT||0),0).toFixed(2),
                        xG: evJ.reduce((s,e)=>s+(e.xG||0),0).toFixed(2),
                        xA: evJ.reduce((s,e)=>s+(e.xA||0),0).toFixed(2),
                      };
                      return (
                        <tr key={jug.id} style={{ borderBottom: '1px solid #111' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--accent)', fontWeight: 900, textAlign: 'center' }}>{jug.dorsal}</td>
                          <td style={{ padding: '6px 8px', color: '#ccc', fontWeight: 'bold' }}>{jug.apellido||jug.nombre}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#a78bfa' }}>{row.pases}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#3b82f6' }}>{row.remates}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: row.goles>0?'#10b981':'#444', fontWeight:900 }}>{row.goles}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#f59e0b' }}>{row.recup}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: row.perd>0?'#ef4444':'#444' }}>{row.perd}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#f59e0b' }}>{row.xT}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#3b82f6' }}>{row.xG}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#a78bfa' }}>{row.xA}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Heatmap mini por jugador */}
              <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: 900, margin: '16px 0 8px' }}>HEATMAP POR JUGADOR</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '8px' }}>
                {jugadoresConvocados.map(jug => {
                  const pts = heatmapData(jug.id);
                  return (
                    <div key={jug.id} style={{ background: '#080808', border: '1px solid #1a1a1a', borderRadius: '4px', padding: '6px' }}>
                      <div style={{ fontSize: '0.6rem', color: '#888', fontWeight: 900, marginBottom: '4px' }}>#{jug.dorsal} {jug.apellido||jug.nombre}</div>
                      <div style={{ width: '100%', aspectRatio: '2/1', background: '#030a05', border: '1px solid #1a3a22', position: 'relative', borderRadius: '2px', overflow: 'hidden' }}>
                        {pts.map((p, i) => (
                          <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: '6px', height: '6px', background: getColorAccion(p.accion), borderRadius: '50%', transform: 'translate(-50%,-50%)', opacity: 0.7 }} />
                        ))}
                        {pts.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#333' }}>sin datos</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={() => setMostrarDashboard(false)} style={{ width: '100%', marginTop: '20px', background: 'var(--accent)', color: '#000', border: 'none', padding: '12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}>
                VOLVER AL TRACKING
              </button>
            </div>
          </div>
        )}

        {/* ══ MODAL AYUDA ══════════════════════════════════════════════════ */}
        {mostrarAyuda && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ background: '#0d0d0d', border: '1px solid #3b82f6', borderRadius: '8px', padding: '24px', maxWidth: '560px', width: '100%', color: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
              <h2 style={{ margin: '0 0 16px', color: '#3b82f6', textTransform: 'uppercase', fontSize: '1rem', fontWeight: 900 }}>Manual Operativo</h2>

              {[
                { t: 'Modo Turbo', c: 'Escribí el dorsal (ej: 7) antes de presionar el atajo de acción. El jugador queda preseleccionado y saltás el paso de selección. Ejemplo: [7][P] = Pase de #7.', color: '#a78bfa' },
                { t: 'Skip coordenadas [↵]', c: 'Si el partido va muy rápido, presioná Enter en el paso del mapa para registrar sin coordenada. El xT quedará null pero el evento se guarda.', color: '#f59e0b' },
                { t: 'Undo [Ctrl+Z]', c: 'Borra el último evento del buffer sin necesidad de abrir ningún menú. Solo funciona cuando no hay evento en progreso.', color: '#ef4444' },
                { t: 'Portero-Jugador [N]', c: 'Activa/desactiva el modo 5° atacante. Se registra automáticamente con timestamp. El header muestra una alerta visual mientras está activo.', color: '#ef4444' },
                { t: 'Toggle Equipo', c: 'Cambiá entre Propio y Rival en el header para registrar acciones del equipo rival (remates en contra, recuperaciones rivales, etc).', color: '#3b82f6' },
                { t: 'Etiqueta Táctica', c: 'Seleccioná el contexto antes de registrar (Contraataque, Posición, PP, etc). Se aplica a todos los eventos siguientes hasta que la cambies.', color: '#fbbf24' },
                { t: 'xT / xG / xA', c: 'Se calculan automáticamente al mapear la coordenada. xT usa grid 10×6 calibrado para fútsal. xG usa modelo logístico de distancia+ángulo. xA se asigna al último pase cuando el remate tiene resultado.', color: '#10b981' },
                { t: 'Faltas acumuladas', c: 'Se incrementan automáticamente al registrar una Falta cometida (equipo Propio). A partir de la 5ta aparece el aviso de PDT. Cada período se cuenta por separado.', color: '#f43f5e' },
                { t: 'Sincronización', c: 'El buffer se guarda en localStorage instantáneamente. Podés cerrar el navegador y retomar. Cuando terminés, presioná SYNC DB para enviar todo a Supabase.', color: '#10b981' },
              ].map(item => (
                <div key={item.t} style={{ marginBottom: '12px', paddingLeft: '10px', borderLeft: `2px solid ${item.color}` }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: item.color, marginBottom: '2px' }}>{item.t}</div>
                  <div style={{ fontSize: '0.78rem', color: '#888', lineHeight: '1.5' }}>{item.c}</div>
                </div>
              ))}

              <button onClick={() => setMostrarAyuda(false)} style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', padding: '12px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer', marginTop: '8px' }}>
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