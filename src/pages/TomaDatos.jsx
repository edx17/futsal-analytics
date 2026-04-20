import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { getColorAccion } from '../utils/helpers';
import { useToast } from '../components/ToastContext';

function TomaDatos() {
  const location = useLocation();
  const navigate = useNavigate();
  const partido = location.state?.partido;
  const clubId = localStorage.getItem('club_id');
  const pitchRef = useRef(null);
  
  const { showToast } = useToast();

  const [esMovil, setEsMovil] = useState(window.innerWidth <= 1024);
  const [periodo, setPeriodo] = useState('PT');
  const [minuto, setMinuto] = useState(0);
  const [segundos, setSegundos] = useState(0);
  const [relojCorriendo, setRelojCorriendo] = useState(false);

  const [direccionAtaque, setDireccionAtaque] = useState('derecha');
  const [contextoJuego, setContextoJuego] = useState('5v5');

  const [panelAbierto, setPanelAbierto] = useState(true);
  const [panelLateral, setPanelLateral] = useState({ activo: false, x: 0, y: 0 });
  const [pasoRegistro, setPasoRegistro] = useState(1);
  const [tabActiva, setTabActiva] = useState('registro'); 
  const [isDeleting, setIsDeleting] = useState(false);
  const [equipo, setEquipo] = useState('Propio');
  const [accion, setAccion] = useState('');
  
  const [menuActivo, setMenuActivo] = useState(null); 
  const [autorGol, setAutorGol] = useState(null); 
  const [autorAsistencia, setAutorAsistencia] = useState(null);
  
  const [modificadoresRemate, setModificadoresRemate] = useState([]);

  const [eventoEditando, setEventoEditando] = useState(null); 
  const [modalFinalizar, setModalFinalizar] = useState(false); 
  const [isFinishing, setIsFinishing] = useState(false); 

  const [modalCambio, setModalCambio] = useState(false);
  const [jugadoresEnCancha, setJugadoresEnCancha] = useState([]);
  const [jugadoresEnBanco, setJugadoresEnBanco] = useState([]);
  const [salenIds, setSalenIds] = useState([]);
  const [entranIds, setEntranIds] = useState([]);
  const [isSavingCambio, setIsSavingCambio] = useState(false); 
  const [eventos, setEventos] = useState([]);
  
  const [cupoCancha, setCupoCancha] = useState(5);

  const [modalEditarTitulares, setModalEditarTitulares] = useState(false);
  const [tempTitulares, setTempTitulares] = useState([]);
  const [tempSuplentes, setTempSuplentes] = useState([]);
  const [isSavingTitulares, setIsSavingTitulares] = useState(false);

  const [optDeEspaldas, setOptDeEspaldas] = useState(false);
  const [optBajoPresion, setOptBajoPresion] = useState(false);

  useEffect(() => {
    if (!partido) navigate('/');
  }, [partido, navigate]);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 1024);
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

  const deshacerUltimaAccion = async () => {
    if (eventos.length === 0) return;
    const ultimoEvento = eventos[eventos.length - 1];
    
    await eliminarEvento(ultimoEvento.id);
    showToast(`Deshecho: ${ultimoEvento.accion}`, "info");
  };

  const manejarCambioPeriodo = (e) => {
    const nuevo = e.target.value;
    setPeriodo(nuevo);
    if (nuevo === 'ST' && periodo === 'PT') setDireccionAtaque('izquierda');
    if (nuevo === 'PT' && periodo === 'ST') setDireccionAtaque('derecha');
  };

  const statsEnVivo = useMemo(() => {
    const stats = {
      golesMios: 0, golesRival: 0,
      rematesPT: 0, rematesST: 0,
      faltasPT: 0, faltasST: 0,
      faltasRivalPT: 0, faltasRivalST: 0
    };
    eventos.forEach(ev => {
      const esGol = ev.accion === 'Remate - Gol' || ev.accion === 'Gol';
      if (esGol) {
        if (ev.equipo === 'Propio') stats.golesMios++;
        else stats.golesRival++;
      }
      if (ev.equipo === 'Propio') {
        if (ev.accion?.includes('Remate') || ev.accion === 'Ocasión Fallada') {
          if (ev.periodo === 'PT') stats.rematesPT++;
          else stats.rematesST++;
        }
        if (ev.accion?.includes('Falta cometida') || ev.accion === 'Penal en contra') {
          if (ev.periodo === 'PT') stats.faltasPT++;
          else stats.faltasST++;
        }
        if (ev.accion?.includes('Falta recibida') || ev.accion === 'Penal a favor') {
          if (ev.periodo === 'PT') stats.faltasRivalPT++;
          else stats.faltasRivalST++;
        }
      } else if (ev.equipo === 'Rival') {
        if (ev.accion?.includes('Falta cometida') || ev.accion === 'Penal en contra') {
          if (ev.periodo === 'PT') stats.faltasRivalPT++;
          else stats.faltasRivalST++;
        }
        if (ev.accion?.includes('Falta recibida') || ev.accion === 'Penal a favor') {
          if (ev.periodo === 'PT') stats.faltasPT++;
          else stats.faltasST++;
        }
      }
    });
    return stats;
  }, [eventos]);

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
    setModificadoresRemate([]); 
    setMenuActivo(null);
    setTabActiva('registro'); 
  };

  const triggerABP = (acc, x, y) => {
    setPanelAbierto(true); 
    setPanelLateral({ activo: true, x, y });
    setAccion(acc);
    setPasoRegistro(4); 
    setAutorGol(null);
    setAutorAsistencia(null);
    setModificadoresRemate([]); 
    setMenuActivo(null);
    setTabActiva('registro');
  };

  const seleccionarAccion = (acc) => {
    let finalAcc = acc;

    // Calcular las coordenadas absolutas en la cancha (donde X=0 es arco propio y X=100 es arco rival)
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }

    // Definición de las áreas según las medidas de tu pitch-container (width: 15%, Y: 25% al 75%)
    const enAreaPropia = dbX <= 15 && dbY >= 25 && dbY <= 75;
    const enAreaRival = dbX >= 85 && dbY >= 25 && dbY <= 75;

    // LÓGICA DE PENALES AUTOMÁTICOS SEGÚN ZONA
    if (equipo === 'Propio') {
      if (acc === 'Falta cometida' && enAreaPropia) {
        finalAcc = 'Penal en contra';
        showToast("⚠️ ¡PENAL EN CONTRA! Falta cometida en área propia.", "error");
      } else if (acc === 'Falta recibida' && enAreaRival) {
        finalAcc = 'Penal a favor';
        showToast("✅ ¡PENAL A FAVOR! Falta recibida en área rival.", "success");
      }
    } else if (equipo === 'Rival') {
      // Si registras la acción como 'Rival' directamente
      if (acc === 'Falta cometida' && enAreaRival) {
        finalAcc = 'Penal en contra'; // del rival (a favor nuestro)
        showToast("✅ ¡PENAL A FAVOR! El rival cometió falta en su área.", "success");
      } else if (acc === 'Falta recibida' && enAreaPropia) {
        finalAcc = 'Penal a favor'; // del rival (en contra nuestro)
        showToast("⚠️ ¡PENAL EN CONTRA! El rival recibió falta en tu área.", "error");
      }
    }

    setAccion(finalAcc);
    setPasoRegistro(2);
    setMenuActivo(null);
  };

  const toggleModificador = (mod) => {
    setModificadoresRemate(prev => 
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  const sumarFaltaVentaja = async (equipoInfractor) => {
    const quintetoActual = jugadoresEnCancha.map(j => j.id);
    const evento = {
      club_id: clubId, 
      id_partido: partido.id,
      accion: 'Falta cometida (Ventaja)',
      equipo: equipoInfractor,
      periodo: periodo, 
      minuto: minuto,
      segundos: segundos,
      quinteto_activo: quintetoActual,
      contexto_juego: contextoJuego
    };
    
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert([evento]).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
      showToast(`Ley de ventaja registrada (${equipoInfractor})`, "info");
    } else {
      showToast("Error al registrar falta", "error");
    }
  };

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
      segundos: segundos,
      quinteto_activo: quintetoActual,
      contexto_juego: contextoJuego
    };
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert([evento]).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      showToast("Error de red al guardar el evento rápido.", "error");
    }
  };

  const guardarEventoFinal = async (jugadorId) => {
    const quintetoActual = jugadoresEnCancha.map(j => j.id);
    
    const esRemate = accion.includes('Remate') || accion === 'Gol' || accion === 'Ocasión Fallada';

    if (pasoRegistro === 2 && esRemate) {
      setAutorGol(jugadorId);
      setPasoRegistro(3); 
      return; 
    }
    if (pasoRegistro === 3 && esRemate) {
      setAutorAsistencia(jugadorId);
      setPasoRegistro(5); 
      return; 
    }

    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }
    
    const finalEquipo = jugadorId === null && pasoRegistro === 2 ? 'Rival' : equipo;
    
    if (accion === 'Tarjeta Roja') {
      if (finalEquipo === 'Propio' && jugadorId) {
        setCupoCancha(4); 
        setContextoJuego('4v5');
        setJugadoresEnCancha(prev => prev.filter(j => j.id !== parseInt(jugadorId, 10)));
        setJugadoresEnBanco(prev => prev.filter(j => j.id !== parseInt(jugadorId, 10)));
        showToast("¡Roja! Jugador expulsado. Jugás con 4.", "warning");
      } else if (finalEquipo === 'Rival') {
        setContextoJuego('5v4');
        showToast("¡Expulsión rival! Contexto en 5v4.", "info");
      }
    }

    const eventoPrincipal = {
      club_id: clubId, 
      id_partido: partido.id, 
      id_jugador: jugadorId ? parseInt(jugadorId, 10) : null,
      accion: accion, 
      zona_x: dbX, 
      zona_y: dbY, 
      equipo: finalEquipo,
      periodo: periodo, 
      minuto: minuto, 
      segundos: segundos,
      quinteto_activo: quintetoActual,
      contexto_juego: contextoJuego 
    };

    const eventosAInsertar = [eventoPrincipal];

    const esRemateAlArco = accion === 'Remate - Atajado' || accion === 'Remate - Gol';
    const esRival = finalEquipo === 'Rival';

    const arquero = jugadoresEnCancha.find(j => 
      (j.posicion || '').toLowerCase().includes('arquero') || (j.posicion || '').toLowerCase().includes('portero')
    );

    if (esRemateAlArco && esRival && arquero) {
      eventosAInsertar.push({
        club_id: clubId,
        id_partido: partido.id,
        id_jugador: arquero.id,
        accion: accion === 'Remate - Gol' ? 'Gol Recibido' : 'Atajada',
        zona_x: dbX,
        zona_y: dbY,
        equipo: 'Propio',
        periodo: periodo,
        minuto: minuto,
        segundos: segundos,
        quinteto_activo: quintetoActual,
        contexto_juego: contextoJuego
      });
    }

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    
    const { data: eventosGuardados, error } = await supabase.from('eventos').insert(eventosAInsertar).select();
    
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
    } else {
      showToast("Error de red al guardar el evento.", "error");
    }
  };

  const finalizarRegistroRemate = async (origenContexto) => {
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }
    const quintetoActual = jugadoresEnCancha.map(j => j.id);
    const eventosAInsertar = [];
    
    const origenFinal = [origenContexto, ...modificadoresRemate].filter(Boolean).join(' | ');
    const esGol = accion === 'Remate - Gol' || accion === 'Gol';

    if (esGol && equipo === 'Rival' && cupoCancha < 5) {
      setCupoCancha(5);
      setContextoJuego('5v5');
      showToast("Sanción cumplida (Gol en contra). Ya podés ingresar al 5to jugador.", "info");
    }

    eventosAInsertar.push({
      club_id: clubId, 
      id_partido: partido.id, 
      id_jugador: autorGol ? parseInt(autorGol, 10) : null,
      id_asistencia: autorAsistencia ? parseInt(autorAsistencia, 10) : null, 
      accion: accion, 
      zona_x: dbX, 
      zona_y: dbY, 
      equipo: equipo, 
      periodo: periodo, 
      minuto: minuto, 
      segundos: segundos,
      quinteto_activo: quintetoActual,
      origen_gol: origenFinal,
      contexto_juego: contextoJuego 
    });

    if (autorAsistencia) {
      eventosAInsertar.push({
        club_id: clubId, 
        id_partido: partido.id, 
        id_jugador: parseInt(autorAsistencia, 10),
        accion: esGol ? 'Asistencia' : 'Pase Clave', 
        zona_x: dbX, 
        zona_y: dbY, 
        equipo: equipo,
        periodo: periodo, 
        minuto: minuto, 
        segundos: segundos,
        quinteto_activo: quintetoActual,
        contexto_juego: contextoJuego 
      });
    }

    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setAutorGol(null);
    setAutorAsistencia(null);
    setModificadoresRemate([]);

    const { data: eventosGuardados, error } = await supabase.from('eventos').insert(eventosAInsertar).select();
    if (!error && eventosGuardados) {
      setEventos(prev => [...prev, ...eventosGuardados]);
      showToast(esGol ? "¡Gol registrado en la base de datos!" : "Acción registrada", "success");
    } else {
      showToast("Error de red al guardar el evento.", "error");
    }
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
    setAutorGol(null);
    setAutorAsistencia(null);
    setModificadoresRemate([]); 
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
    } finally {
      setEventoEditando(null); 
    }
  };

  const toggleSale = (id) => setSalenIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleEntra = (id) => setEntranIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const guardarCambio = async () => {
    if (salenIds.length === 0 && entranIds.length === 0) return;
    
    const huecos = cupoCancha - jugadoresEnCancha.length;
    const entranRequeridos = salenIds.length + huecos;

    if (entranIds.length !== entranRequeridos) {
      showToast(huecos > 0 ? `Tenés ${huecos} cupo/s libres. Deben entrar ${entranRequeridos}.` : "Deben salir y entrar la misma cantidad", "warning");
      return;
    }

    setIsSavingCambio(true);
    
    const jSalen = jugadoresEnCancha.filter(j => salenIds.includes(j.id));
    const jEntran = jugadoresEnBanco.filter(j => entranIds.includes(j.id));
    
    const nuevosEnCancha = [...jugadoresEnCancha.filter(j => !salenIds.includes(j.id)), ...jEntran];
    const nuevosEnBanco = [...jugadoresEnBanco.filter(j => !entranIds.includes(j.id)), ...jSalen];
    
    const eventosAInsertar = jSalen.map((jSale, index) => ({
      club_id: clubId, 
      id_partido: partido.id, 
      id_jugador: jSale.id, 
      accion: 'Cambio', 
      equipo: 'Propio',
      periodo: periodo, 
      minuto: minuto, 
      segundos: segundos,
      id_receptor: jEntran[index]?.id || null, 
      quinteto_activo: nuevosEnCancha.map(j => j.id),
      contexto_juego: contextoJuego
    }));
    
    setJugadoresEnCancha(nuevosEnCancha);
    setJugadoresEnBanco(nuevosEnBanco);
    
    if (eventosAInsertar.length > 0) {
        const { data: cambiosGuardados, error } = await supabase.from('eventos').insert(eventosAInsertar).select();
        if (cambiosGuardados && !error) {
          setEventos(prev => [...prev, ...cambiosGuardados]);
          showToast("Cambios registrados", "success");
        } else {
           showToast("Error al guardar el cambio", "error");
        }
    } else {
        showToast("Equipo completado (Sanción cumplida)", "success");
    }
    
    setModalCambio(false); 
    setSalenIds([]); 
    setEntranIds([]);
    setIsSavingCambio(false);
  };

  const abrirModalTitulares = () => {
    setTempTitulares([...jugadoresEnCancha]);
    setTempSuplentes([...jugadoresEnBanco]);
    setModalEditarTitulares(true);
  };

  const toggleTitular = (jugador, esTitularActualmente) => {
    if (esTitularActualmente) {
      setTempTitulares(prev => prev.filter(j => j.id !== jugador.id));
      setTempSuplentes(prev => [...prev, jugador]);
    } else {
      if (tempTitulares.length >= 5) {
        showToast("Ya tenés 5 titulares seleccionados.", "warning");
        return;
      }
      setTempSuplentes(prev => prev.filter(j => j.id !== jugador.id));
      setTempTitulares(prev => [...prev, jugador]);
    }
  };

  const guardarNuevosTitulares = async () => {
    if (tempTitulares.length !== 5) {
      showToast("Debes seleccionar exactamente 5 titulares.", "error");
      return;
    }
    setIsSavingTitulares(true);
    try {
      const nuevaPlantilla = [
        ...tempTitulares.map(j => ({ id_jugador: j.id, titular: true })),
        ...tempSuplentes.map(j => ({ id_jugador: j.id, titular: false }))
      ];

      const { error } = await supabase
        .from('partidos')
        .update({ plantilla: nuevaPlantilla })
        .eq('id', partido.id);

      if (error) throw error;

      setJugadoresEnCancha(tempTitulares);
      setJugadoresEnBanco(tempSuplentes);
      setModalEditarTitulares(false);
      showToast("Quinteto inicial actualizado correctamente.", "success");
    } catch (error) {
      console.error(error);
      showToast("Error al guardar en Supabase.", "error");
    } finally {
      setIsSavingTitulares(false);
    }
  };

  const confirmarFinalizarPartido = async () => {
    try {
      setIsFinishing(true);
      
      const { error } = await supabase
        .from('partidos')
        .update({ 
          estado: 'Finalizado',
          goles_propios: statsEnVivo.golesMios,
          goles_rival: statsEnVivo.golesRival
        })
        .eq('id', partido.id);

      if (error) throw error;
      
      showToast("¡Partido finalizado correctamente!", "success");
      setModalFinalizar(false);
      
      navigate(`/resumen/${partido.id}`); 
      
    } catch (error) {
      console.error(error);
      showToast("Error de red al finalizar el partido.", "error");
    } finally {
      setIsFinishing(false);
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
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => navigate(-1)} 
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', transition: '0.2s' }}
              onMouseOver={(e) => e.target.style.color = '#fff'}
              onMouseOut={(e) => e.target.style.color = 'var(--text-dim)'}
            >
              ⬅ VOLVER
            </button>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            TRACKER // vs {partido.rivales?.nombre?.toUpperCase() || partido.rival?.toUpperCase() || 'RIVAL'}
              <div style={{ background: '#111', padding: '4px 12px', borderRadius: '4px', border: '1px solid #333', fontSize: '1.2rem', fontFamily: 'JetBrains Mono', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent)' }}>{statsEnVivo.golesMios}</span>
                <span style={{ color: '#555' }}>-</span>
                <span style={{ color: '#ef4444' }}>{statsEnVivo.golesRival}</span>

                <button 
                  onClick={deshacerUltimaAccion}
                  disabled={eventos.length === 0 || isDeleting}
                  title="Deshacer última acción"
                  style={{ 
                    marginLeft: '15px',
                    background: '#ef444422',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    width: '28px',
                    height: '28px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    opacity: eventos.length === 0 ? 0.3 : 1
                  }}
                >
                  ↩
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '5px' }}>
              <span style={{fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800}}>CONTEXTO:</span>
              <select 
                value={contextoJuego} 
                onChange={e => setContextoJuego(e.target.value)}
                style={{ background: '#111', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
              >
                <option value="5v5">5v5 (Normal)</option>
                <option value="5v4">5v4 (A Favor)</option>
                <option value="4v5">4v5 (En Contra)</option>
                <option value="4v4">4v4</option>
                <option value="4v3">4v3 (A Favor)</option>
                <option value="3v4">3v4 (En Contra)</option>
                <option value="3v3">3v3</option>
              </select>
            </div>
          </div>
          
          <button 
            onClick={() => setDireccionAtaque(d => d === 'derecha' ? 'izquierda' : 'derecha')}
            style={{ background: '#111', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '8px 15px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 10px rgba(0,255,136,0.1)' }}
          >
            MI EQUIPO ATACA HACIA: <span style={{ fontSize: '1.2rem' }}>{direccionAtaque === 'derecha' ? '➡️' : '⬅️'}</span>
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            
            <button 
              onClick={() => navigate(`/resumen/${partido.id}`)} 
              className="btn-action" 
              style={{ background: '#3b82f6', color: '#ffffff', border: '1px solid #2563eb', fontSize: '0.7rem', fontWeight: 800, padding: '0 15px', borderRadius: '4px', cursor: 'pointer' }}
            >
              RESUMEN PARCIAL
            </button>

            <button 
              onClick={() => setModalFinalizar(true)} 
              className="btn-action" 
              style={{ background: '#dc2626', color: '#ffffff', border: '1px solid #991b1b', fontSize: '0.7rem', fontWeight: 800, padding: '0 15px', borderRadius: '4px', cursor: 'pointer' }}
            >
              FINALIZAR
            </button>

            <button onClick={() => setPanelAbierto(!panelAbierto)} className="btn-action" style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem' }}>{panelAbierto ? "OCULTAR" : "MOSTRAR"} PANEL</button>
            
            {eventos.length === 0 && (
              <button onClick={abrirModalTitulares} className="btn-action" style={{ background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)', fontSize: '0.7rem', fontWeight: 800 }}>EDITAR 5 INICIAL</button>
            )}

            <button 
              onClick={() => setModalCambio(true)} 
              className="btn-action" 
              style={{ background: '#ffffff', border: '1px solid #333', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              CAMBIOS
            </button>

            {cupoCancha < 5 && (
              <button 
                onClick={() => {
                  setCupoCancha(5);
                  setContextoJuego('5v5');
                  showToast("Sanción de 2 min cumplida. Ya podés meter al 5to jugador en CAMBIOS.", "success");
                }} 
                className="btn-action" 
                style={{ background: '#f59e0b', color: '#000', border: '1px solid #d97706', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', animation: 'pulse 2s infinite' }}
              >
                ⌛ CUMPLIR SANCIÓN
              </button>
            )}
            
            <div style={relojContainer}>
              <button onClick={() => setRelojCorriendo(!relojCorriendo)} style={btnPlay}>{relojCorriendo ? '⏸' : '▶'}</button>
              
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 5px', color: '#ffffff', fontWeight: 800 }}>
                <input 
                  type="number"
                  value={minuto}
                  onChange={(e) => setMinuto(Math.max(0, parseInt(e.target.value) || 0))}
                  onFocus={() => setRelojCorriendo(false)} 
                  style={{ 
                    background: 'transparent', border: 'none', color: '#ffffff', 
                    width: '35px', textAlign: 'right', fontSize: '1.2rem', 
                    fontFamily: 'monospace', fontWeight: 800, outline: 'none',
                    padding: 0, margin: 0, WebkitAppearance: 'none', MozAppearance: 'textfield'
                  }}
                />
                <span>:</span>
                <input 
                  type="number"
                  value={segundos}
                  onChange={(e) => setSegundos(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  onFocus={() => setRelojCorriendo(false)} 
                  style={{ 
                    background: 'transparent', border: 'none', color: '#ffffff', 
                    width: '35px', textAlign: 'left', fontSize: '1.2rem', 
                    fontFamily: 'monospace', fontWeight: 800, outline: 'none',
                    padding: 0, margin: 0, WebkitAppearance: 'none', MozAppearance: 'textfield'
                  }}
                />
              </div>

              <select value={periodo} onChange={manejarCambioPeriodo} style={{ background: 'transparent', border: 'none', color: '#888' }}>
                <option value="PT">PT</option><option value="ST">ST</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
          
          <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px 20px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '15px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800 }}>REMATES PROPIOS</div>
              <div style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 900 }}>PT: {statsEnVivo.rematesPT} <span style={{color:'#555'}}>|</span> ST: {statsEnVivo.rematesST}</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border)' }}></div>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                FALTAS PROPIAS
                <button onClick={() => sumarFaltaVentaja('Propio')} title="Falta por Ventaja" style={{ background: '#ec489922', color: '#ec4899', border: '1px solid #ec4899', borderRadius: '4px', fontSize: '0.6rem', padding: '1px 4px', cursor: 'pointer', fontWeight: 900 }}>+1</button>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#ec4899', fontWeight: 900 }}>PT: {statsEnVivo.faltasPT} <span style={{color:'#555'}}>|</span> ST: {statsEnVivo.faltasST}</div>
            </div>
            
            <div style={{ width: '1px', background: 'var(--border)' }}></div>
            
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
                FALTAS RIVAL
                <button onClick={() => sumarFaltaVentaja('Rival')} title="Falta por Ventaja" style={{ background: '#ec489922', color: '#ec4899', border: '1px solid #ec4899', borderRadius: '4px', fontSize: '0.6rem', padding: '1px 4px', cursor: 'pointer', fontWeight: 900 }}>+1</button>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#ec4899', fontWeight: 900 }}>PT: {statsEnVivo.faltasRivalPT} <span style={{color:'#555'}}>|</span> ST: {statsEnVivo.faltasRivalST}</div>
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

              {/* --- NUEVA GRILLA VISUAL: 4 ZONAS y 3 CARRILES --- */}
              {/* Zonas Verticales (25% y 75% - El 50% ya está marcado por el medio campo) */}
              <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255,255,255,0.15)', pointerEvents: 'none' }}></div>
              <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, width: '1px', borderLeft: '1px dashed rgba(255,255,255,0.15)', pointerEvents: 'none' }}></div>
              
              {/* Carriles Horizontales (33.33% y 66.66%) */}
              <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255,255,255,0.15)', pointerEvents: 'none' }}></div>
              <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255,255,255,0.15)', pointerEvents: 'none' }}></div>
              {/* ------------------------------------------------ */}

              {eventos.filter(e => e.zona_x !== null).map((ev, index, arr) => {
                const renderX = direccionAtaque === 'derecha' ? ev.zona_x : 100 - ev.zona_x;
                const renderY = direccionAtaque === 'derecha' ? ev.zona_y : 100 - ev.zona_y;
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>{ev.periodo} {ev.minuto}' <span style={{color: '#666'}}>({ev.contexto_juego || '5v5'})</span></div>
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
                      {pasoRegistro === 5 && '4. CONTEXTO TÁCTICO (xG)'}
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
                          <BotonAccion label="OCASIÓN FALLADA (PASE)" color="#f59e0b" span={2} onClick={() => seleccionarAccion('Ocasión Fallada')} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>POSESIÓN Y DUELOS</div>
                          <BotonAccion label="RECUPERACIÓN" color="#eab308" onClick={() => seleccionarAccion('Recuperación')} />
                          <BotonAccion label="PÉRDIDA" color="#ef4444" onClick={() => seleccionarAccion('Pérdida')} />
                          <BotonAccion label="PASE INCOMPLETO" color="#f59e0b" span={2} onClick={() => seleccionarAccion('Pase Incompleto')} />
                          <BotonAccion label="DUELO DEF GANADO" color="#10b981" onClick={() => seleccionarAccion('Duelo DEF Ganado')} />
                          <BotonAccion label="DUELO DEF PERDIDO" color="#dc2626" onClick={() => seleccionarAccion('Duelo DEF Perdido')} />
                          <BotonAccion label="DUELO OFE GANADO" color="#0ea5e9" onClick={() => seleccionarAccion('Duelo OFE Ganado')} />
                          <BotonAccion label="DUELO OFE PERDIDO" color="#f97316" onClick={() => seleccionarAccion('Duelo OFE Perdido')} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div className="stat-label" style={{ gridColumn: 'span 2', fontSize: '0.6rem' }}>DISCIPLINA</div>
                          <BotonAccion label="FALTA COMETIDA" color="#ec4899" onClick={() => seleccionarAccion('Falta cometida')} />
                          <BotonAccion label="FALTA RECIBIDA" color="#0ea5e9" onClick={() => seleccionarAccion('Falta recibida')} />
                          {menuActivo === 'tarjetas' ? (
                            <>
                              <BotonAccion label="AMARILLA" color="#facc15" onClick={() => seleccionarAccion('Tarjeta Amarilla')} />
                              <BotonAccion label="ROJA" color="#991b1b" onClick={() => seleccionarAccion('Tarjeta Roja')} />
                              <BotonAccion label="✕" color="#fff" onClick={() => setMenuActivo(null)} />
                            </>
                          ) : (
                            <BotonAccion label="TARJETAS" color="#facc15" span={2} onClick={() => setMenuActivo('tarjetas')} />
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
                      <button onClick={() => guardarEventoFinal(null)} style={{ marginTop: '10px', background: 'none', border: '1px dashed #444', color: '#ffffff', padding: '10px', cursor: 'pointer' }}>SIN PASE PREVIO (JUGADA INDIVIDUAL)</button>
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
                      <div className="stat-label" style={{ color: '#00ff88', marginBottom: '5px' }}>¿CÓMO SE GESTÓ EL TIRO?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <BotonAccion label="A. POSICIONAL" color="#fff" onClick={() => finalizarRegistroRemate('Ataque Posicional')} />
                        <BotonAccion label="CONTRAATAQUE" color="#fff" onClick={() => finalizarRegistroRemate('Contraataque')} />
                        <BotonAccion label="RECUP. ALTA" color="#fff" onClick={() => finalizarRegistroRemate('Recuperación Alta')} />
                        <BotonAccion label="ERROR RIVAL" color="#fff" onClick={() => finalizarRegistroRemate('Error No Forzado')} />
                      </div>
                      
                      <div className="stat-label" style={{ color: 'var(--text-dim)', marginTop: '10px', marginBottom: '5px' }}>PELOTA PARADA (ABP)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <BotonAccion label="CÓRNER" color="#f97316" onClick={() => finalizarRegistroRemate('Córner')} />
                        <BotonAccion label="LATERAL" color="#06b6d4" onClick={() => finalizarRegistroRemate('Lateral')} />
                        <BotonAccion label="TIRO LIBRE" color="#a855f7" onClick={() => finalizarRegistroRemate('Tiro Libre')} />
                        <BotonAccion label="PENAL" color="#ef4444" onClick={() => finalizarRegistroRemate('Penal / Sexta Falta')} />
                        <BotonAccion label="5v4 / 4v3" color="#0a7fec" onClick={() => finalizarRegistroRemate('5v4 / 4v3')} />
                        <BotonAccion label="4v5 / 3v4" color="#b6df03" onClick={() => finalizarRegistroRemate('4v5 / 3v4')} />
                      </div>

                      <div style={{ marginTop: '20px', borderTop: '1px dashed #444', paddingTop: '15px' }}>
                        <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '10px' }}>MODIFICADORES TÁCTICOS (OPCIONAL)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <BotonAccion label="2DO PALO" color={modificadoresRemate.includes('2do Palo') ? '#00ff88' : '#555'} onClick={() => toggleModificador('2do Palo')} />
                          <BotonAccion label="MANO A MANO" color={modificadoresRemate.includes('Mano a Mano') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Mano a Mano')} />
                          <BotonAccion label="PUNTEO" color={modificadoresRemate.includes('Punteo') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Punteo')} />
                          <BotonAccion label="ARQ. ADELANTADO" color={modificadoresRemate.includes('Arq. Adelantado') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Arq. Adelantado')} />
                          <BotonAccion label="👤 DE ESPALDAS" color={modificadoresRemate.includes('De Espaldas') ? '#f59e0b' : '#555'} onClick={() => toggleModificador('De Espaldas')} />
                          <BotonAccion label="🛡️ BAJO PRESIÓN" color={modificadoresRemate.includes('Bajo Presión') ? '#ef4444' : '#555'} onClick={() => toggleModificador('Bajo Presión')} />
                        </div>
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
            <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>PERÍODO Y MINUTO</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select value={eventoEditando.periodo} onChange={e => setEventoEditando({...eventoEditando, periodo: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }}>
                    <option value="PT">PT</option><option value="ST">ST</option>
                  </select>
                  <input type="number" value={eventoEditando.minuto} onChange={e => setEventoEditando({...eventoEditando, minuto: e.target.value})} style={{ flex: 1, padding: '10px', background: '#111', color: '#fff', border: '1px solid #444' }} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEventoEditando(null)} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarEdicion} className="btn-action" style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>GUARDAR CAMBIOS</button>
            </div>
          </div>
        </div>
      )}

      {modalCambio && (
        <div style={overlayStyle}>
          <div style={{ ...modalIndustrial, width: '450px' }}>
            <div className="stat-label" style={{ marginBottom: '15px', color: '#fff' }}>🔄 GESTIÓN DE CAMBIOS MÚLTIPLES</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '20px', lineHeight: 1.4 }}>
              Marcá los jugadores que <strong style={{color: '#ef4444'}}>SALEN</strong> y los que <strong style={{color: '#10b981'}}>ENTRAN</strong>. <br/>
              Asegurate de que salga y entre la misma cantidad.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: salenIds.length > 0 ? '#ef4444' : 'var(--text-dim)' }}>
                  SALEN ({salenIds.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {jugadoresEnCancha.map(j => {
                    const isSelected = salenIds.includes(j.id);
                    return (
                      <button 
                        key={j.id} 
                        onClick={() => toggleSale(j.id)} 
                        style={{ 
                          background: isSelected ? 'rgba(239, 68, 68, 0.2)' : '#111', 
                          border: `1px solid ${isSelected ? '#ef4444' : '#333'}`, 
                          color: isSelected ? '#fff' : '#aaa', 
                          padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' 
                        }}
                      >
                        <span>{j.apellido || j.nombre}</span> <span style={{ fontWeight: 'bold' }}>{j.dorsal}</span>
                      </button>
                    );
                  })}
                  {jugadoresEnCancha.length === 0 && <div style={{ fontSize: '0.7rem', color: '#555' }}>Vacío</div>}
                </div>
              </div>

              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: entranIds.length > 0 ? '#10b981' : 'var(--text-dim)' }}>
                  ENTRAN ({entranIds.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '200px', overflowY: 'auto' }}>
                  {jugadoresEnBanco.map(j => {
                    const isSelected = entranIds.includes(j.id);
                    return (
                      <button 
                        key={j.id} 
                        onClick={() => toggleEntra(j.id)} 
                        style={{ 
                          background: isSelected ? 'rgba(16, 185, 129, 0.2)' : '#111', 
                          border: `1px solid ${isSelected ? '#10b981' : '#333'}`, 
                          color: isSelected ? '#fff' : '#aaa', 
                          padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' 
                        }}
                      >
                        <span>{j.apellido || j.nombre}</span> <span style={{ fontWeight: 'bold' }}>{j.dorsal}</span>
                      </button>
                    );
                  })}
                  {jugadoresEnBanco.length === 0 && <div style={{ fontSize: '0.7rem', color: '#555' }}>Vacío</div>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => { setModalCambio(false); setSalenIds([]); setEntranIds([]); }} 
                disabled={isSavingCambio}
                className="btn-action" 
                style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
              >
                CANCELAR
              </button>
              
              {(() => {
                const huecos = cupoCancha - jugadoresEnCancha.length;
                const entranRequeridos = salenIds.length + huecos;
                const esCambioValido = entranIds.length === entranRequeridos && entranIds.length > 0;

                return (
                  <button 
                    onClick={guardarCambio} 
                    disabled={!esCambioValido || isSavingCambio} 
                    className="btn-action" 
                    style={{ 
                      flex: 1, padding: '10px', 
                      background: esCambioValido ? '#fff' : '#555', 
                      color: esCambioValido ? '#000' : '#888', 
                      fontWeight: 'bold', 
                      cursor: esCambioValido ? 'pointer' : 'not-allowed', 
                      border: 'none' 
                    }}
                  >
                    {isSavingCambio ? 'GUARDANDO...' : (huecos > 0 ? `CONFIRMAR INGRESO (${entranIds.length}/${entranRequeridos})` : 'CONFIRMAR CAMBIOS')}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {modalEditarTitulares && (
        <div style={overlayStyle}>
          <div style={{ ...modalIndustrial, width: '450px' }}>
            <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>EDITAR 5 INICIAL</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '20px', lineHeight: 1.4 }}>
              Tocá a un jugador para cambiarlo de lista. Para poder guardar, deben haber <strong style={{color: '#fff'}}>exactamente 5 jugadores</strong> en la lista de titulares.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: tempTitulares.length === 5 ? '#00ff88' : '#ef4444' }}>
                  TITULARES ({tempTitulares.length}/5)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {tempTitulares.map(j => (
                    <button key={j.id} onClick={() => toggleTitular(j, true)} style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid var(--accent)', color: '#fff', padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.apellido || j.nombre}</span> <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{j.dorsal}</span>
                    </button>
                  ))}
                  {tempTitulares.length === 0 && <div style={{ fontSize: '0.7rem', color: '#555' }}>Vacío</div>}
                </div>
              </div>

              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: 'var(--text-dim)' }}>
                  AL BANCO
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '200px', overflowY: 'auto' }}>
                  {tempSuplentes.map(j => (
                    <button key={j.id} onClick={() => toggleTitular(j, false)} style={{ background: '#111', border: '1px solid #333', color: '#aaa', padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.apellido || j.nombre}</span> <span style={{ fontWeight: 'bold', color: '#666' }}>{j.dorsal}</span>
                    </button>
                  ))}
                   {tempSuplentes.length === 0 && <div style={{ fontSize: '0.7rem', color: '#555' }}>Vacío</div>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalEditarTitulares(false)} disabled={isSavingTitulares} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button 
                onClick={guardarNuevosTitulares} 
                disabled={isSavingTitulares || tempTitulares.length !== 5} 
                className="btn-action" 
                style={{ flex: 1, padding: '10px', background: tempTitulares.length === 5 ? 'var(--accent)' : '#555', color: tempTitulares.length === 5 ? '#000' : '#888', fontWeight: 'bold', cursor: tempTitulares.length === 5 ? 'pointer' : 'not-allowed', border: 'none' }}
              >
                {isSavingTitulares ? 'GUARDANDO...' : 'CONFIRMAR 5'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFinalizar && (
        <div style={overlayStyle}>
          <div style={modalIndustrial}>
            <div className="stat-label" style={{ marginBottom: '10px', color: '#dc2626', fontSize: '1.2rem' }}>⚠️ FINALIZAR PARTIDO</div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
              ¿Estás seguro que deseas dar por finalizado el encuentro contra <strong>{partido.rival}</strong>? <br/><br/>
              Esta acción actualizará el estado en la base de datos y te llevará al reporte final.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalFinalizar(false)} disabled={isFinishing} className="btn-action" style={{ flex: 1, background: '#222', padding: '10px', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarFinalizarPartido} disabled={isFinishing} className="btn-action" style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#fff', fontWeight: 'bold', border: '1px solid #991b1b', cursor: 'pointer' }}>
                {isFinishing ? 'PROCESANDO...' : 'SÍ, FINALIZAR'}
              </button>
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