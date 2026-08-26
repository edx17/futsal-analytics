import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { getColorAccion } from '../utils/helpers';
import { useToast } from '../components/ToastContext';

/* Máximo hueco que el cronómetro recupera automáticamente tras volver de
   segundo plano o de una recarga. Más que esto, restaura en pausa. */
const CRONO_MAX_RECUPERACION_MS = 15 * 60 * 1000;

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

  /* ── CRONÓMETRO POR ANCLAJE ──────────────────────────────────────────
     No contamos ticks (setInterval se estrangula en segundo plano y pierde
     tiempo real). Guardamos milisegundos ACUMULADOS por período y, mientras
     corre, un ancla con Date.now(). El transcurrido se CALCULA:
        acumulado + (corriendo ? Date.now() - ancla : 0)
     El intervalo pasa a ser sólo de repintado. Cero deriva.
     Todo se persiste en localStorage por partido, así una recarga o un
     cierre de la app en el entretiempo no borra el reloj.
     ─────────────────────────────────────────────────────────────────── */
  const [acumPeriodo, setAcumPeriodo] = useState({ PT: 0, ST: 0 });

  /* ── COLA OFFLINE ────────────────────────────────────────────────────
     Todo evento se pinta en pantalla al instante y se intenta subir. Si la
     red falla, queda en una cola en localStorage y se reintenta solo (cada
     15s, al volver la conexión y al reabrir el partido). Nada se pierde. */
  const [pendientes, setPendientes] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const colaKey = partido?.id ? `vc_cola_eventos_${partido.id}` : null;

  /* Sugerencia de pausa tras acciones que detienen el juego */
  const [sugerirPausa, setSugerirPausa] = useState(false);
  const anclaRef = useRef(null);
  const cronoRestauradoRef = useRef(false);
  const cronoKey = partido?.id ? `vc_crono_${partido.id}` : null;

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
  const [origenRemate, setOrigenRemate] = useState(null); // se elige, no guarda al toque

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

  /* Restauración del reloj al montar (recarga, crash, cambio de app) */
  useEffect(() => {
    if (!cronoKey || cronoRestauradoRef.current) return;
    cronoRestauradoRef.current = true;
    try {
      const crudo = localStorage.getItem(cronoKey);
      if (!crudo) return;
      const g = JSON.parse(crudo);
      const acum = { PT: Number(g?.acum?.PT) || 0, ST: Number(g?.acum?.ST) || 0 };
      const per = g?.periodo === 'ST' ? 'ST' : 'PT';
      let corriendo = false;

      if (g?.corriendo && g?.ancla) {
        const hueco = Date.now() - g.ancla;
        // Si el hueco es razonable lo recuperamos; si es enorme (cerró la app
        // y volvió al otro día) restauramos en pausa para no inventar tiempo.
        if (hueco > 0 && hueco <= CRONO_MAX_RECUPERACION_MS) {
          acum[per] += hueco;
          anclaRef.current = Date.now();
          corriendo = true;
        } else {
          showToast('Reloj restaurado EN PAUSA: pasó demasiado tiempo desde el último registro. Revisá el minuto.', 'warning');
        }
      }

      setAcumPeriodo(acum);
      setPeriodo(per);
      setRelojCorriendo(corriendo);
      if (per === 'ST') setDireccionAtaque('izquierda');
    } catch (e) {
      console.warn('No se pudo restaurar el cronómetro:', e);
    }
  }, [cronoKey, showToast]);

  /* Repintado: NO acumula, sólo lee el tiempo real transcurrido */
  useEffect(() => {
    const pintar = () => {
      const ms = (acumPeriodo[periodo] || 0) + (relojCorriendo && anclaRef.current ? Date.now() - anclaRef.current : 0);
      const totalSeg = Math.max(0, Math.floor(ms / 1000));
      setMinuto(Math.floor(totalSeg / 60));
      setSegundos(totalSeg % 60);
    };
    pintar();
    if (!relojCorriendo) return;
    const id = setInterval(pintar, 250);
    return () => clearInterval(id);
  }, [relojCorriendo, acumPeriodo, periodo]);

  /* Persistencia */
  useEffect(() => {
    if (!cronoKey) return;
    try {
      localStorage.setItem(cronoKey, JSON.stringify({
        acum: acumPeriodo, periodo, corriendo: relojCorriendo, ancla: anclaRef.current
      }));
    } catch (e) { /* cuota llena: el reloj sigue funcionando en memoria */ }
  }, [cronoKey, acumPeriodo, periodo, relojCorriendo, minuto]);

  /* Vuelve del segundo plano -> repintamos ya, sin esperar el próximo tick */
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible' || !relojCorriendo || !anclaRef.current) return;
      const ms = (acumPeriodo[periodo] || 0) + (Date.now() - anclaRef.current);
      const totalSeg = Math.max(0, Math.floor(ms / 1000));
      setMinuto(Math.floor(totalSeg / 60));
      setSegundos(totalSeg % 60);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [relojCorriendo, acumPeriodo, periodo]);

  /* Congela lo corrido hasta ahora dentro del acumulado del período */
  const congelarCrono = () => {
    const extra = anclaRef.current ? Date.now() - anclaRef.current : 0;
    anclaRef.current = null;
    if (extra > 0) setAcumPeriodo(prev => ({ ...prev, [periodo]: (prev[periodo] || 0) + extra }));
  };

  const toggleReloj = () => {
    if (relojCorriendo) {
      congelarCrono();
      setRelojCorriendo(false);
    } else {
      anclaRef.current = Date.now();
      setRelojCorriendo(true);
    }
  };

  /* Corrección manual: reescribe el acumulado del período actual */
  const fijarTiempo = (m, sg) => {
    const mm = Math.max(0, Number.isFinite(m) ? m : 0);
    const ss = Math.max(0, Math.min(59, Number.isFinite(sg) ? sg : 0));
    setAcumPeriodo(prev => ({ ...prev, [periodo]: (mm * 60 + ss) * 1000 }));
    if (relojCorriendo) anclaRef.current = Date.now();
  };

  const reiniciarPeriodo = () => {
    anclaRef.current = relojCorriendo ? Date.now() : null;
    setAcumPeriodo(prev => ({ ...prev, [periodo]: 0 }));
    showToast(`Reloj del ${periodo} puesto en 0:00`, 'info');
  };

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

  /* ── Helpers de la cola ── */
  const leerCola = () => {
    if (!colaKey) return [];
    try { return JSON.parse(localStorage.getItem(colaKey) || '[]'); } catch { return []; }
  };
  const escribirCola = (arr) => {
    if (!colaKey) return;
    try { localStorage.setItem(colaKey, JSON.stringify(arr)); } catch (e) { console.warn('Cola llena', e); }
    setPendientes(arr);
  };
  const limpiarPayload = (ev) => {
    const { _localId, _pendiente, ...limpio } = ev;
    return limpio;
  };

  /* Al abrir el partido, recuperamos lo que haya quedado sin subir */
  useEffect(() => {
    if (!colaKey) return;
    const cola = leerCola();
    if (cola.length === 0) return;
    setPendientes(cola);
    setEventos(prev => {
      const yaEstan = new Set(prev.map(e => e.id));
      const faltantes = cola.filter(e => !yaEstan.has(e._localId));
      return [...prev, ...faltantes.map(e => ({ ...e, id: e._localId, _pendiente: true }))];
    });
    showToast(`${cola.length} evento(s) sin sincronizar recuperados. Reintentando...`, 'warning');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaKey]);

  /* Sincronizador: sube todo lo pendiente en un solo insert */
  const sincronizarCola = async (silencioso = true) => {
    if (!colaKey || sincronizando) return;
    const cola = leerCola();
    if (cola.length === 0) return;

    setSincronizando(true);
    try {
      const { data, error } = await supabase.from('eventos').insert(cola.map(limpiarPayload)).select();
      if (error || !data) throw error || new Error('sin datos');

      const localIds = new Set(cola.map(e => e._localId));
      setEventos(prev => [...prev.filter(e => !localIds.has(e.id)), ...data]);
      escribirCola([]);
      showToast(`${data.length} evento(s) sincronizado(s).`, 'success');
    } catch (e) {
      if (!silencioso) showToast('Todavía no hay conexión. Los eventos siguen guardados.', 'warning');
    } finally {
      setSincronizando(false);
    }
  };

  /* Reintento automático: cada 15s y cuando vuelve la conexión */
  useEffect(() => {
    if (pendientes.length === 0) return;
    const id = setInterval(() => sincronizarCola(true), 15000);
    const alVolverRed = () => sincronizarCola(true);
    window.addEventListener('online', alVolverRed);
    return () => { clearInterval(id); window.removeEventListener('online', alVolverRed); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendientes.length, colaKey, sincronizando]);

  /* ── PUNTO ÚNICO DE GUARDADO ──
     Pinta primero, sube después. Si falla, encola. Nunca tira el evento. */
  const guardarEventos = async (payloads, mensajeOk = null) => {
    const lista = (Array.isArray(payloads) ? payloads : [payloads]).filter(Boolean);
    if (lista.length === 0) return { ok: true, encolados: false };

    const marcados = lista.map((ev, i) => ({
      ...ev,
      _localId: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${i}`
    }));

    // 1) Optimista: se ve en pantalla ya mismo
    setEventos(prev => [...prev, ...marcados.map(e => ({ ...e, id: e._localId, _pendiente: true }))]);

    // 2) Intento de subida
    try {
      const { data, error } = await supabase.from('eventos').insert(marcados.map(limpiarPayload)).select();
      if (error || !data) throw error || new Error('sin datos');

      const localIds = new Set(marcados.map(e => e._localId));
      setEventos(prev => [...prev.filter(e => !localIds.has(e.id)), ...data]);
      if (mensajeOk) showToast(mensajeOk, 'success');
      return { ok: true, encolados: false };
    } catch (e) {
      // 3) Falló: a la cola. El evento YA está en pantalla, no se pierde.
      escribirCola([...leerCola(), ...marcados]);
      showToast('Sin conexión: el evento quedó guardado y se sube solo.', 'warning');
      return { ok: false, encolados: true };
    }
  };

  /* Acciones que detienen el juego: ofrecemos pausar el reloj */
  const proponerPausa = (accionRegistrada = '') => {
    const detiene = /Gol|Falta|Tarjeta|Penal/i.test(accionRegistrada);
    if (detiene && relojCorriendo) setSugerirPausa(true);
  };

  /* La sugerencia de pausa se apaga sola a los 10s o si ya pausaste */
  useEffect(() => {
    if (!sugerirPausa) return;
    if (!relojCorriendo) { setSugerirPausa(false); return; }
    const id = setTimeout(() => setSugerirPausa(false), 10000);
    return () => clearTimeout(id);
  }, [sugerirPausa, relojCorriendo]);

  /* Aviso al cerrar/recargar con el reloj andando o con eventos sin subir */
  useEffect(() => {
    const alSalir = (e) => {
      if (!relojCorriendo && pendientes.length === 0) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [relojCorriendo, pendientes.length]);

  const deshacerUltimaAccion = async () => {
    if (eventos.length === 0) return;
    const ultimoEvento = eventos[eventos.length - 1];
    
    await eliminarEvento(ultimoEvento.id);
    showToast(`Deshecho: ${ultimoEvento.accion}`, "info");
  };

  const manejarCambioPeriodo = (e) => {
    const nuevo = e.target.value;
    if (nuevo === periodo) return;
    // Cada período tiene su propio acumulado: al cambiar, congelamos el actual
    // y el reloj queda en pausa mostrando lo que llevaba el período destino.
    if (relojCorriendo) { congelarCrono(); setRelojCorriendo(false); }
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
    setOrigenRemate(null);
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
    setOrigenRemate(null);
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

  /* Un toque selecciona el origen (sin guardar, para poder sumar modificadores).
     Un segundo toque sobre el MISMO origen confirma y guarda: 2 taps, igual de
     rápido que antes para el que no usa modificadores. */
  const elegirOrigen = (org) => {
    if (origenRemate === org) finalizarRegistroRemate(org);
    else setOrigenRemate(org);
  };

  const toggleModificador = (mod) => {
    setModificadoresRemate(prev => 
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );
  };

  const sumarFaltaVentaja = async (equipoInfractor) => {
    const quintetoActual = jugadoresEnCancha.map(j => String(j.id));
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
    
    await guardarEventos([evento], `Ley de ventaja registrada (${equipoInfractor})`);
    proponerPausa('Falta');
  };

  const guardarEventoRapido = async (equipoSeleccionado) => {
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }
    const quintetoActual = jugadoresEnCancha.map(j => String(j.id));
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
    await guardarEventos([evento]);
  };

  const guardarEventoFinal = async (jugadorId) => {
    const quintetoActual = jugadoresEnCancha.map(j => String(j.id));
    
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

    // --- DOBLE AMARILLA → ROJA por doble amonestación ---
    // Si el jugador propio ya tiene una amarilla en este partido, la 2da se convierte
    // en roja: se borra la amarilla previa y queda únicamente la expulsión.
    if (accion === 'Tarjeta Amarilla' && finalEquipo === 'Propio' && jugadorId) {
      const jid = parseInt(jugadorId, 10);
      const amarillaPrevia = eventos.find(
        e => e.accion === 'Tarjeta Amarilla' && e.equipo === 'Propio' && e.id_jugador === jid
      );
      if (amarillaPrevia) {
        await eliminarEvento(amarillaPrevia.id); // dejar solo la roja
        setCupoCancha(4);
        setContextoJuego('4v5');
        setJugadoresEnCancha(prev => prev.filter(j => j.id !== jid));
        setJugadoresEnBanco(prev => prev.filter(j => j.id !== jid));

        const rojaDobleAmarilla = {
          club_id: clubId,
          id_partido: partido.id,
          id_jugador: jid,
          accion: 'Tarjeta Roja',
          zona_x: dbX,
          zona_y: dbY,
          equipo: 'Propio',
          periodo: periodo,
          minuto: minuto,
          segundos: segundos,
          quinteto_activo: quintetoActual,
          contexto_juego: '4v5',
          etiqueta_tactica: 'doble_amarilla',
        };

        setPanelLateral({ activo: false, x: 0, y: 0 });
        setPasoRegistro(1);

        await guardarEventos([rojaDobleAmarilla]);
        showToast("🟥 Doble amarilla → ROJA. Jugador expulsado, jugás con 4.", "warning");
        proponerPausa('Tarjeta');
        return; // corta el flujo normal: no se inserta una 2da amarilla
      }
    }

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
    
    await guardarEventos(eventosAInsertar);
    proponerPausa(accion);
  };

  const finalizarRegistroRemate = async (origenContexto) => {
    let dbX = panelLateral.x;
    let dbY = panelLateral.y;
    if (direccionAtaque === 'izquierda') {
      dbX = 100 - dbX;
      dbY = 100 - dbY;
    }
    const quintetoActual = jugadoresEnCancha.map(j => String(j.id));
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
    setOrigenRemate(null);

    await guardarEventos(eventosAInsertar, esGol ? "¡Gol registrado!" : "Acción registrada");
    proponerPausa(accion);
  };

  const cancelarRegistro = () => {
    setPanelLateral({ activo: false, x: 0, y: 0 });
    setPasoRegistro(1);
    setMenuActivo(null);
    setAutorGol(null);
    setAutorAsistencia(null);
    setModificadoresRemate([]); 
    setOrigenRemate(null);
  };

  const eliminarEvento = async (idEvento) => {
    const eventoBackup = eventos.find(e => e.id === idEvento);
    if (!eventoBackup) return;

    // Evento que todavía no llegó a la base: se borra sólo de la cola local
    if (typeof idEvento === 'string' && idEvento.startsWith('tmp_')) {
      setEventos(prev => prev.filter(e => e.id !== idEvento));
      escribirCola(leerCola().filter(e => e._localId !== idEvento));
      return;
    }
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
      quinteto_activo: nuevosEnCancha.map(j => String(j.id)),
      contexto_juego: contextoJuego
    }));
    
    setJugadoresEnCancha(nuevosEnCancha);
    setJugadoresEnBanco(nuevosEnBanco);
    
    if (eventosAInsertar.length > 0) {
        await guardarEventos(eventosAInsertar, "Cambios registrados");
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

  /* Botón de origen: resalta el elegido; el segundo toque confirma y guarda. */
  const BotonOrigen = ({ label, valor, color }) => {
    const activo = origenRemate === valor;
    return (
      <button
        onClick={() => elegirOrigen(valor)}
        className="btn-action"
        title={activo ? 'Tocá de nuevo para guardar' : 'Tocá para elegir'}
        style={{
          background: activo ? color : 'rgba(255,255,255,0.03)',
          border: `2px solid ${color}`,
          color: activo ? '#000' : color,
          fontWeight: activo ? 900 : 500,
          padding: '12px 5px', fontSize: '0.75rem', cursor: 'pointer',
          boxShadow: activo ? `0 0 10px ${color}` : 'none'
        }}
      >
        {activo ? '✓ ' : ''}{label}
      </button>
    );
  };

  const containerStyle = esMovil
    ? { display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }
    : { display: 'flex', height: '100dvh', background: 'var(--bg)' };

  // Columna principal (cancha). En stacked toma ~46% y permite encogerse (minHeight:0).
  const mainColStyle = esMovil
    ? { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', flex: '1 1 46%', minHeight: 0 }
    : { display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', flex: 1 };

  // Panel de registro. En stacked toma ~54% y SIEMPRE scrollea (sin vh fijo → se ve completo en tablet).
  const sidePanelStyle = esMovil
    ? { width: '100%', flex: '1 1 54%', minHeight: 0, borderTop: '1px solid var(--border)', background: 'var(--panel)', padding: '15px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }
    : { width: '340px', borderLeft: '1px solid var(--border)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', padding: '15px', overflowY: 'auto' };

  return (
    <div style={containerStyle}>
      <div style={mainColStyle}>
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
              <div style={{ background: 'var(--panel)', padding: '4px 12px', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '1.2rem', fontFamily: 'JetBrains Mono', display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                style={{ background: 'var(--panel)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
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
            style={{ background: 'var(--panel)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '8px 15px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 0 10px rgba(0,255,136,0.1)' }}
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

            <button onClick={() => setPanelAbierto(!panelAbierto)} className="btn-action" style={{ background: '#ffffff', border: '1px solid var(--border)', fontSize: '0.7rem' }}>{panelAbierto ? "OCULTAR" : "MOSTRAR"} PANEL</button>
            
            {eventos.length === 0 && (
              <button onClick={abrirModalTitulares} className="btn-action" style={{ background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)', fontSize: '0.7rem', fontWeight: 800 }}>EDITAR 5 INICIAL</button>
            )}

            <button 
              onClick={() => setModalCambio(true)} 
              className="btn-action" 
              style={{ background: '#ffffff', border: '1px solid var(--border)', fontSize: '0.7rem', cursor: 'pointer' }}
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
            
            {pendientes.length > 0 && (
              <button
                onClick={() => sincronizarCola(false)}
                title="Reintentar la subida ahora"
                style={{
                  background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', color: '#f59e0b',
                  borderRadius: '4px', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 800,
                  cursor: 'pointer', whiteSpace: 'nowrap'
                }}
              >
                {sincronizando ? '⟳ SUBIENDO...' : `⚠ ${pendientes.length} SIN SUBIR`}
              </button>
            )}

            {sugerirPausa && relojCorriendo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(14,165,233,0.15)', border: '1px solid #0ea5e9', borderRadius: '4px', padding: '4px 6px' }}>
                <button
                  onClick={() => { toggleReloj(); setSugerirPausa(false); }}
                  style={{ background: '#0ea5e9', border: 'none', color: '#000', borderRadius: '3px', padding: '5px 9px', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  ⏸ ¿PAUSAR?
                </button>
                <button
                  onClick={() => setSugerirPausa(false)}
                  title="Seguir sin pausar"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                >
                  ✕
                </button>
              </div>
            )}

            <div style={relojContainer}>
              <button onClick={toggleReloj} style={btnPlay} title={relojCorriendo ? 'Pausar' : 'Iniciar'}>{relojCorriendo ? '⏸' : '▶'}</button>
              
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 5px', color: '#ffffff', fontWeight: 800 }}>
                <input 
                  type="number"
                  value={minuto}
                  onChange={(e) => fijarTiempo(parseInt(e.target.value) || 0, segundos)}
                  onFocus={() => { if (relojCorriendo) { congelarCrono(); setRelojCorriendo(false); } }} 
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
                  onChange={(e) => fijarTiempo(minuto, parseInt(e.target.value) || 0)}
                  onFocus={() => { if (relojCorriendo) { congelarCrono(); setRelojCorriendo(false); } }} 
                  style={{ 
                    background: 'transparent', border: 'none', color: '#ffffff', 
                    width: '35px', textAlign: 'left', fontSize: '1.2rem', 
                    fontFamily: 'monospace', fontWeight: 800, outline: 'none',
                    padding: 0, margin: 0, WebkitAppearance: 'none', MozAppearance: 'textfield'
                  }}
                />
              </div>

              <select value={periodo} onChange={manejarCambioPeriodo} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)' }}>
                <option value="PT">PT</option><option value="ST">ST</option>
              </select>

              <button
                onClick={reiniciarPeriodo}
                title={`Poner el reloj del ${periodo} en 0:00`}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0 8px', fontSize: '0.9rem' }}
              >
                ⟲
              </button>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 20px', overflow: 'hidden' }}>
          
          <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.5)', padding: '8px 20px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '0px', flexShrink: 0 }}>
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

          <div className="pitch-wrapper" style={{ width: esMovil ? 'min(100%, calc(40dvh * 2))' : '100%', maxWidth: esMovil ? '100%' : 'calc((100dvh - 260px) * 2)', aspectRatio: '2 / 1', position: 'relative', margin: esMovil ? '12px auto' : '30px 30px', flexShrink: 0 }}>
            
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
                        <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                          {ev.periodo} {ev.minuto}' <span style={{color: '#666'}}>({ev.contexto_juego || '5v5'})</span>
                          {ev._pendiente && <span title="Todavía no subido: se sincroniza solo" style={{ color: '#f59e0b', marginLeft: '6px' }}>⚠</span>}
                        </div>
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
                    <button onClick={cancelarRegistro} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
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
                          {menuActivo === 'duelo_ind' ? (
                            <>
                              <BotonAccion label="OFE IND. GANADO" color="#2dd4bf" onClick={() => seleccionarAccion('Duelo OFE Indirecto Ganado')} />
                              <BotonAccion label="OFE IND. PERDIDO" color="#fb923c" onClick={() => seleccionarAccion('Duelo OFE Indirecto Perdido')} />
                              <BotonAccion label="DEF IND. GANADO" color="#5eead4" onClick={() => seleccionarAccion('Duelo DEF Indirecto Ganado')} />
                              <BotonAccion label="DEF IND. PERDIDO" color="#f87171" onClick={() => seleccionarAccion('Duelo DEF Indirecto Perdido')} />
                              <BotonAccion label="✕ CERRAR" color="#fff" span={2} onClick={() => setMenuActivo(null)} />
                            </>
                          ) : (
                            <BotonAccion label="⚡ DUELO INDIRECTO (SIN PELOTA)" color="#14b8a6" span={2} onClick={() => setMenuActivo('duelo_ind')} />
                          )}
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
                        <button key={j.id} onClick={() => guardarEventoFinal(j.id)} className="btn-action" style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid #06b6d4', padding: '15px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', color: 'var(--text)', cursor: 'pointer' }}>
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
                      <button onClick={() => guardarEventoRapido('Rival')} className="btn-action" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #555', color: 'var(--text)', padding: '20px', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer', borderRadius: '4px' }}>
                        RIVAL
                      </button>
                    </div>
                  )}

                  {pasoRegistro === 5 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                      <div className="stat-label" style={{ color: '#00ff88', marginBottom: '5px' }}>¿CÓMO SE GESTÓ EL TIRO?</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {[['A. POSICIONAL', 'Ataque Posicional', '#fff'],
                          ['CONTRAATAQUE', 'Contraataque', '#fff'],
                          ['RECUP. ALTA', 'Recuperación Alta', '#fff'],
                          ['ERROR RIVAL', 'Error No Forzado', '#fff']].map(([lbl, val, col]) => (
                          <BotonOrigen key={val} label={lbl} valor={val} color={col} />
                        ))}
                      </div>
                      
                      <div className="stat-label" style={{ color: 'var(--text-dim)', marginTop: '10px', marginBottom: '5px' }}>PELOTA PARADA (ABP)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {[['CÓRNER', 'Córner', '#f97316'],
                          ['LATERAL', 'Lateral', '#06b6d4'],
                          ['TIRO LIBRE', 'Tiro Libre', '#a855f7'],
                          ['PENAL', 'Penal / Sexta Falta', '#ef4444'],
                          ['5v4 / 4v3', '5v4 / 4v3', '#0a7fec'],
                          ['4v5 / 3v4', '4v5 / 3v4', '#b6df03']].map(([lbl, val, col]) => (
                          <BotonOrigen key={val} label={lbl} valor={val} color={col} />
                        ))}
                      </div>

                      <div style={{ marginTop: '20px', borderTop: '1px dashed #444', paddingTop: '15px' }}>
                        <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '10px' }}>MODIFICADORES TÁCTICOS (OPCIONAL · SE COMBINAN)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <BotonAccion label="2DO PALO" color={modificadoresRemate.includes('2do Palo') ? '#00ff88' : '#555'} onClick={() => toggleModificador('2do Palo')} />
                          <BotonAccion label="MANO A MANO" color={modificadoresRemate.includes('Mano a Mano') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Mano a Mano')} />
                          <BotonAccion label="PUNTEO" color={modificadoresRemate.includes('Punteo') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Punteo')} />
                          <BotonAccion label="ARQ. ADELANTADO" color={modificadoresRemate.includes('Arq. Adelantado') ? '#00ff88' : '#555'} onClick={() => toggleModificador('Arq. Adelantado')} />
                          <BotonAccion label="👤 DE ESPALDAS" color={modificadoresRemate.includes('De Espaldas') ? '#f59e0b' : '#555'} onClick={() => toggleModificador('De Espaldas')} />
                          <BotonAccion label="🛡️ BAJO PRESIÓN" color={modificadoresRemate.includes('Bajo Presión') ? '#ef4444' : '#555'} onClick={() => toggleModificador('Bajo Presión')} />
                        </div>
                      </div>

                      {/* Resumen + confirmación */}
                      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: '12px', marginTop: '4px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '8px', minHeight: '16px' }}>
                          {origenRemate
                            ? <span><strong style={{ color: 'var(--accent)' }}>{origenRemate}</strong>{modificadoresRemate.length > 0 ? ` | ${modificadoresRemate.join(' | ')}` : ''}</span>
                            : 'Elegí cómo se gestó el tiro para poder guardar.'}
                        </div>
                        <button
                          onClick={() => origenRemate && finalizarRegistroRemate(origenRemate)}
                          disabled={!origenRemate}
                          style={{
                            width: '100%', padding: '16px', fontSize: '0.95rem', fontWeight: 900, borderRadius: '4px',
                            cursor: origenRemate ? 'pointer' : 'not-allowed',
                            background: origenRemate ? 'var(--accent)' : 'transparent',
                            color: origenRemate ? '#000' : '#555',
                            border: `1px solid ${origenRemate ? 'var(--accent)' : '#333'}`
                          }}
                        >
                          ✓ GUARDAR REMATE
                        </button>
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
                  <select value={eventoEditando.periodo} onChange={e => setEventoEditando({...eventoEditando, periodo: e.target.value})} style={{ flex: 1, padding: '10px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid #444' }}>
                    <option value="PT">PT</option><option value="ST">ST</option>
                  </select>
                  <input type="number" value={eventoEditando.minuto} onChange={e => setEventoEditando({...eventoEditando, minuto: e.target.value})} style={{ flex: 1, padding: '10px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid #444' }} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setEventoEditando(null)} className="btn-action" style={{ flex: 1, background: 'var(--panel)', padding: '10px', color: 'var(--text)', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarEdicion} className="btn-action" style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>GUARDAR CAMBIOS</button>
            </div>
          </div>
        </div>
      )}

      {modalCambio && (
        <div style={overlayStyle}>
          <div style={{ ...modalIndustrial, width: '450px' }}>
            <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--text)' }}>🔄 GESTIÓN DE CAMBIOS MÚLTIPLES</div>
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
                style={{ flex: 1, background: 'var(--panel)', padding: '10px', color: 'var(--text)', border: '1px solid #444', cursor: 'pointer' }}
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
              Tocá a un jugador para cambiarlo de lista. Para poder guardar, deben haber <strong style={{color: 'var(--text)'}}>exactamente 5 jugadores</strong> en la lista de titulares.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' }}>
              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: tempTitulares.length === 5 ? '#00ff88' : '#ef4444' }}>
                  TITULARES ({tempTitulares.length}/5)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {tempTitulares.map(j => (
                    <button key={j.id} onClick={() => toggleTitular(j, true)} style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid var(--accent)', color: 'var(--text)', padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
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
                    <button key={j.id} onClick={() => toggleTitular(j, false)} style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: '#aaa', padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{j.apellido || j.nombre}</span> <span style={{ fontWeight: 'bold', color: '#666' }}>{j.dorsal}</span>
                    </button>
                  ))}
                   {tempSuplentes.length === 0 && <div style={{ fontSize: '0.7rem', color: '#555' }}>Vacío</div>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalEditarTitulares(false)} disabled={isSavingTitulares} className="btn-action" style={{ flex: 1, background: 'var(--panel)', padding: '10px', color: 'var(--text)', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
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
              <button onClick={() => setModalFinalizar(false)} disabled={isFinishing} className="btn-action" style={{ flex: 1, background: 'var(--panel)', padding: '10px', color: 'var(--text)', border: '1px solid #444', cursor: 'pointer' }}>CANCELAR</button>
              <button onClick={confirmarFinalizarPartido} disabled={isFinishing} className="btn-action" style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#ffffff', fontWeight: 'bold', border: '1px solid #991b1b', cursor: 'pointer' }}>
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