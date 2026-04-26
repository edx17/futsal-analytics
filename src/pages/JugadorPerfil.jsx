import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useLocation, useNavigate } from 'react-router-dom';

import { analizarPartido } from '../analytics/engine'; 
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';
import { calcularCadenasValor } from '../analytics/posesiones';
import InfoBox from '../components/InfoBox';
import { getColorAccion } from '../utils/helpers';
import PlayerReportGenerator from '../components/PlayerReportGenerator';
import PlayerReportIGStory from '../components/PlayerReportIGStory';

// ==========================================
// 🧠 MOTOR DE RATING ESTRUCTURAL (QUINTETOS)
// ==========================================
const calcularRatingQuintetoAvanzado = (q) => {
  const gf = q.golesFavor || 0;
  const gc = q.golesContra || 0;
  const rf = q.rematesFavor || 0;
  const rc = q.rematesContra || 0;
  const rec = q.recuperaciones || 0;
  const per = q.perdidas || 0;
  
  const volumenAcciones = gf + gc + rf + rc + rec + per;
  const mins = (q.minutos !== undefined && q.minutos > 0) ? q.minutos : (volumenAcciones * 0.8); 

  if (mins < 2) return '-'; 

  const min_factor = Math.min(1, mins / 10);
  const diferencial = (gf - gc) * 1.5 + (rf - rc) * 0.1 + (rec - per) * 0.2;
  let rating = 6.0 + (diferencial * min_factor);
  return Math.max(1, Math.min(10, rating));
};

// ==========================================
// 🎨 COMPONENTES VISUALES
// ==========================================

const RingMeter = ({ value, max = 100, color = '#00ff88', size = 120, label, subLabel }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={color} strokeWidth="9"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="50" y="47" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="monospace">{value}</text>
        <text x="50" y="62" textAnchor="middle" fill={color} fontSize="9" fontWeight="700">{subLabel}</text>
      </svg>
      {label && <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>{label}</div>}
    </div>
  );
};

const BarDual = ({ labelA, valA, colorA, labelB, valB, colorB }) => {
  const total = (valA + valB) || 1;
  const pctA = Math.round((valA / total) * 100);
  const pctB = 100 - pctA;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
        <span style={{ color: colorA, fontWeight: 700 }}>{labelA} {valA}</span>
        <span style={{ color: colorB, fontWeight: 700 }}>{valB} {labelB}</span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${pctA}%`, background: colorA, transition: 'width 0.5s ease' }} />
        <div style={{ width: `${pctB}%`, background: colorB, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>
        <span>{pctA}%</span>
        <span>{pctB}%</span>
      </div>
    </div>
  );
};

const StatRow = ({ label, value, sub, color, border = true }) => (
  <div style={{ 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '11px 0', 
    borderBottom: border ? '1px solid rgba(255,255,255,0.06)' : 'none',
    fontSize: '0.875rem'
  }}>
    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
    <strong style={{ color: color || '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
      {value}
      {sub && <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>{sub}</span>}
    </strong>
  </div>
);

const PitchLines = ({ stroke = "rgba(255,255,255,0.18)", strokeWidth = 0.5 }) => (
  <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
    <rect x="0" y="0" width="100" height="50" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
    <line x1="50" y1="0" x2="50" y2="50" stroke={stroke} strokeWidth={strokeWidth} />
    <circle cx="50" cy="25" r="7.5" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
    <circle cx="50" cy="25" r="0.6" fill={stroke} />
    <path d="M 0 6.25 A 15 15 0 0 1 15 21.25 L 15 28.75 A 15 15 0 0 1 0 43.75" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
    <rect x="-2.5" y="21.25" width="2.5" height="7.5" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} strokeDasharray="1.5 1.5" />
    <path d="M 100 6.25 A 15 15 0 0 0 85 21.25 L 85 28.75 A 15 15 0 0 0 100 43.75" fill="none" stroke={stroke} strokeWidth={strokeWidth} />
    <rect x="100" y="21.25" width="2.5" height="7.5" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.8} strokeDasharray="1.5 1.5" />
    <circle cx="25" cy="25" r="0.6" fill={stroke} opacity={0.5} />
    <circle cx="75" cy="25" r="0.6" fill={stroke} opacity={0.5} />
    <path d="M 2.5 0 A 2.5 2.5 0 0 1 0 2.5" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} />
    <path d="M 0 47.5 A 2.5 2.5 0 0 1 2.5 50" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} />
    <path d="M 97.5 50 A 2.5 2.5 0 0 1 100 47.5" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} />
    <path d="M 100 2.5 A 2.5 2.5 0 0 1 97.5 0" fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} />
  </svg>
);

// ==========================================

function JugadorPerfil() {
  const location = useLocation();
  const navigate = useNavigate();
  const [userRol, setUserRol] = useState(null);
  const [userCats, setUserCats] = useState([]); // ── CAMBIO: Nuevo estado para blindar categorías
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [clubId, setClubId] = useState(localStorage.getItem('club_id') || null);
  const [jugadores, setJugadores] = useState([]);
  
  const [partidos, setPartidos] = useState([]);
  const [clubInfo, setClubInfo] = useState({ nombre: 'VIRTUAL FUTSAL', escudo: '' });
  
  const [eventos, setEventos] = useState([]);
  const [eventosCompletos, setEventosCompletos] = useState([]);
  const [wellnessJugador, setWellnessJugador] = useState([]);
  

  const isKiosco = localStorage.getItem('kiosco_mode') === 'true';
  const kioscoJugadorId = localStorage.getItem('kiosco_jugador_id');
  // Se obtiene perfil de AuthContext si se necesitara, pero aquí asumimos lo original
  const miJugadorId = isKiosco ? kioscoJugadorId : null; 
  const esJugador = isKiosco; // O simplificado para el kiosco
  
  const [jugadorId, setJugadorId] = useState(
    location.state?.jugadorId || localStorage.getItem('kiosco_jugador_id') || ''
  );  
  
  const [partidoFiltro, setPartidoFiltro] = useState(
    location.state?.partidoFiltro || 'Todos'
  );
  
  const [tipoMapa, setTipoMapa] = useState('calor');
  const [filtroAccionMapa, setFiltroAccionMapa] = useState('Todas');
  const [filtroCategoriaGrid, setFiltroCategoriaGrid] = useState('Todas');
  const [tabActiva, setTabActiva] = useState('estadisticas'); 

  const heatmapRef = useRef(null);

  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [mostrarStory, setMostrarStory] = useState(false);

  useEffect(() => {
    async function checkPermisos() {
      try {
        if (localStorage.getItem('kiosco_jugador_id')) {
          setUserRol('Jugador');
          setCargandoAuth(false);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // ── CAMBIO: Traemos categorias_asignadas de la BD
          const { data: perfilData } = await supabase.from('usuarios').select('rol, club_id, categorias_asignadas').eq('id', user.id).single();
          if (perfilData) {
            setUserRol(perfilData.rol);
            if (perfilData.club_id) setClubId(perfilData.club_id);
            
            let cats = [];
            if (Array.isArray(perfilData.categorias_asignadas)) {
              cats = perfilData.categorias_asignadas;
            } else if (typeof perfilData.categorias_asignadas === 'string') {
              cats = perfilData.categorias_asignadas.split(',');
            }
            setUserCats(cats.filter(c => c != null).map(c => String(c).trim().toLowerCase()));

            setClubInfo({ nombre: 'CLUB ATLÉTICO FUTSAL', escudo: 'https://cdn-icons-png.flaticon.com/512/5110/5110754.png' });
          }
        }
      } catch (error) {
        console.error("Error verificando permisos:", error);
      } finally {
        setCargandoAuth(false);
      }
    }
    checkPermisos();
  }, []);

  // 🔥 MEJORA KIOSCO 1: Auto-Logout por inactividad (60 segundos)
  useEffect(() => {
    if (!isKiosco) return;

    let timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Limpia el jugador activo y vuelve a la pantalla del Kiosco
        localStorage.removeItem('kiosco_jugador_id');
        navigate('/kiosco'); // Asegúrate de que esta sea la ruta de tu login de kiosco
      }, 60000); // 60.000 ms = 60 segundos
    };

    // Escuchar eventos de interacción para reiniciar el temporizador
    const events = ['touchstart', 'mousemove', 'click', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer(); // Iniciar la primera vez

    return () => {
      clearTimeout(timeout);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [isKiosco, navigate]);

  useEffect(() => {
    if (cargandoAuth) return; // ── CAMBIO: Esperamos a tener el rol y categorías antes de buscar
    
    async function cargarCatalogos() {
      let queryJugadores = supabase.from('jugadores').select('*').order('apellido', { ascending: true });
      let queryPartidos = supabase.from('partidos').select('*').order('fecha', { ascending: false });
      if (clubId) {
        queryJugadores = queryJugadores.eq('club_id', clubId);
        queryPartidos = queryPartidos.eq('club_id', clubId);
      }
      const { data: j } = await queryJugadores;
      const { data: p } = await queryPartidos;
      
      let jFiltrados = j || [];
      let pFiltrados = p || [];

      // ── CAMBIO: Filtramos por las categorías permitidas si es rol CT
      if (userRol === 'CT' && userCats.length > 0) {
        jFiltrados = jFiltrados.filter(jug => 
          jug.categoria && userCats.includes(String(jug.categoria).trim().toLowerCase())
        );
        pFiltrados = pFiltrados.filter(part => 
          part.categoria && userCats.includes(String(part.categoria).trim().toLowerCase())
        );
      }

      const data = jFiltrados;
      setJugadores(data);
      if (esJugador && miJugadorId) {
        const yo = data.find(jug => jug.id == miJugadorId);
        if (yo) setJugadorId(yo.id); // Lo selecciona automáticamente
      }
      setPartidos(pFiltrados);
    }
    cargarCatalogos();
  }, [clubId, esJugador, miJugadorId, cargandoAuth, userRol, userCats]);

  useEffect(() => {
    async function fetchDataJugador() {
      if (!jugadorId) {
        setEventos([]);
        setEventosCompletos([]);
        setWellnessJugador([]);
        return;
      }
      const { data: evsJugador } = await supabase
        .from('eventos').select('*')
        .or(`id_jugador.eq.${jugadorId},id_asistencia.eq.${jugadorId}`)
        .order('id_partido', { ascending: false })
        .limit(10000);
      setEventos(evsJugador || []);

      const partidosIds = [...new Set((evsJugador || []).map(e => e.id_partido))];
      if (partidosIds.length > 0) {
        const { data: evsFull } = await supabase.from('eventos').select('*')
          .in('id_partido', partidosIds)
          .order('id_partido', { ascending: true })
          .order('created_at', { ascending: true }) 
          .limit(15000);
        setEventosCompletos(evsFull || []);
      } else {
        setEventosCompletos([]);
      }

      const { data: well } = await supabase.from('wellness').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }).limit(30);
      setWellnessJugador(well || []);
    }
    fetchDataJugador();
  }, [jugadorId]);

  // 🔥 NUEVA LÓGICA: Filtrar partidos donde el jugador realmente participó
  const partidosDondeJugo = useMemo(() => {
    const idsParticipados = new Set(eventos.map(e => e.id_partido));
    return partidos.filter(p => idsParticipados.has(p.id));
  }, [eventos, partidos]);

  const jugadorSeleccionado = useMemo(() => jugadores.find(j => j.id == jugadorId), [jugadores, jugadorId]);

  const categoriasUnicas = useMemo(() => {
    const cats = jugadores.map(j => j.categoria).filter(Boolean);
    return [...new Set(cats)];
  }, [jugadores]);

  const jugadoresGrid = useMemo(() => {
    if (filtroCategoriaGrid === 'Todas') return jugadores;
    return jugadores.filter(j => j.categoria === filtroCategoriaGrid);
  }, [jugadores, filtroCategoriaGrid]);

  const perfil = useMemo(() => {
    if (!jugadorId || !eventos.length || !jugadorSeleccionado) return null;

    const evFiltrados = partidoFiltro === 'Todos' ? eventos : eventos.filter(ev => ev.id_partido == partidoFiltro);
    const evCompletosFiltrados = partidoFiltro === 'Todos' ? eventosCompletos : eventosCompletos.filter(ev => ev.id_partido == partidoFiltro);
    
    if (!evFiltrados.length) return { vacio: true };

    const stats = { 
      goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, 
      recuperaciones: 0, recAltas: 0, perdidas: 0, perdidasPeligrosas: 0, faltas: 0, xG: 0, 
      duelosDefGanados: 0, duelosDefPerdidos: 0, duelosDefTotales: 0, 
      duelosOfeGanados: 0, duelosOfePerdidos: 0, duelosOfeTotales: 0,
      faltasCometidas: 0, faltasRecibidas: 0, amarillas: 0, rojas: 0, 
      atajadasDirectas: 0, golesRecibidosDirectos: 0, xGAcumuladoAtajadas: 0,
      pasesClave: 0, ocasionesFalladas: 0
    };
    
    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;
    const resultadosRemates = { Gol: 0, Atajado: 0, Desviado: 0, Rebatido: 0 };
    const accionesDirectas = []; 
    const eventosParaRating = []; 
    
    const perfilRemate = { centro: 0, banda: 0, cerca: 0, lejos: 0 };
    const sociosData = {};
    const contextoGoles = {};
    const contextoRecuperaciones = { alta: 0, media: 0, baja: 0 };
    const accionesPorMinuto = {};

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const zonaY = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
      const esAtaque = zonaX > 66;
      const esMedia = zonaX >= 33 && zonaX <= 66;
      const esDefensa = zonaX < 33;
      const accionStr = (ev.accion || '').toLowerCase();
      
      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) {
        stats.asistencias++;
        if (ev.id_jugador) sociosData[ev.id_jugador] = (sociosData[ev.id_jugador] || 0) + 1;
        eventosParaRating.push({ ...ev, id_jugador: jugadorId, tipoVirtual: 'Asistencia' });
      }

      if (ev.id_jugador == jugadorId) {
        accionesDirectas.push(ev);
        eventosParaRating.push(ev); 
        
        const xgEvento = calcularXGEvento(ev);

        const minKey = ev.minuto !== undefined ? Math.floor(ev.minuto) : 0;
        if (!accionesPorMinuto[minKey]) accionesPorMinuto[minKey] = 0;
        accionesPorMinuto[minKey]++;

        if (accionStr.includes('atajada') || accionStr.includes('parada')) {
          stats.atajadasDirectas++;
          stats.xGAcumuladoAtajadas += xgEvento;
        } else if (accionStr === 'gol recibido' || (accionStr.includes('gol') && accionStr.includes('contra'))) {
          stats.golesRecibidosDirectos++;
        } else if (accionStr.includes('remate') || accionStr === 'gol') {
          if (accionStr === 'remate - gol' || accionStr === 'gol') { 
            stats.goles++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Gol++;
            const origen = ev.origen_gol || ev.contexto_juego || 'Sin contexto';
            contextoGoles[origen] = (contextoGoles[origen] || 0) + 1;
          }
          else if (accionStr === 'remate - atajado') { stats.atajados++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Atajado++; }
          else if (accionStr === 'remate - desviado') { stats.desviados++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Desviado++; }
          else if (accionStr === 'remate - rebatido') { stats.rebatidos++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Rebatido++; }
          
          if (zonaY > 35 && zonaY < 65) perfilRemate.centro++;
          else perfilRemate.banda++;
          const dx = (100 - zonaX) * 0.4;
          const dy = Math.abs(50 - zonaY) * 0.2;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 8) perfilRemate.cerca++;
          else perfilRemate.lejos++;
        }
        else if (accionStr === 'recuperación') { 
          stats.recuperaciones++;
          if (esAtaque) { stats.recAltas++; contextoRecuperaciones.alta++; }
          else if (esMedia) contextoRecuperaciones.media++;
          else contextoRecuperaciones.baja++;
        }
        else if (accionStr === 'pérdida') { stats.perdidas++; if (esDefensa) stats.perdidasPeligrosas++; }
        else if (accionStr === 'duelo def ganado') { stats.duelosDefGanados++; stats.duelosDefTotales++; }
        else if (accionStr === 'duelo def perdido') { stats.duelosDefPerdidos++; stats.duelosDefTotales++; }
        else if (accionStr === 'duelo ofe ganado') { stats.duelosOfeGanados++; stats.duelosOfeTotales++; }
        else if (accionStr === 'duelo ofe perdido') { stats.duelosOfePerdidos++; stats.duelosOfeTotales++; }
        else if (accionStr.includes('falta cometida')) { stats.faltasCometidas++; stats.faltas++; }
        else if (accionStr.includes('falta recibida')) { stats.faltasRecibidas++; }
        else if (accionStr.includes('amarilla')) { stats.amarillas++; }
        else if (accionStr.includes('roja')) { stats.rojas++; }
        else if (accionStr === 'pase clave') { stats.pasesClave++; }
        else if (accionStr.includes('ocasión fallada')) { stats.ocasionesFalladas++; }
      }
    });

    const topSociosIds = Object.entries(sociosData).sort((a, b) => b[1] - a[1]).slice(0, 4).map(entry => ({ id: entry[0], conexiones: entry[1] }));
    const topSocios = topSociosIds.map(s => {
      const j = jugadores.find(jug => jug.id == s.id);
      return j ? { ...j, conexiones: s.conexiones } : null;
    }).filter(Boolean);

    let xgBuildup = 0;
    let plusMinus = 0;
    let minutos = 0;
    let transicionesInvolucrado = 0;
    
    let rivalStats = { Gol: 0, Atajado: 0, Desviado: 0, Rebatido: 0, Palo: 0 };
    let eventosRivalEnCancha = [];
    let xgEnContraBruto = 0;
    const quintetosAgregados = {};

    if (evCompletosFiltrados.length > 0) {
      const evsPorPartido = {};
      evCompletosFiltrados.forEach(e => {
        if (!evsPorPartido[e.id_partido]) evsPorPartido[e.id_partido] = [];
        evsPorPartido[e.id_partido].push(e);
      });

      let posesionesTotales = [];

      Object.values(evsPorPartido).forEach(evsPartido => {
        evsPartido.sort((a, b) => {
          if (a.created_at && b.created_at) {
            return new Date(a.created_at) - new Date(b.created_at);
          }
          const pA = a.periodo === 'ST' ? 1 : 0;
          const pB = b.periodo === 'ST' ? 1 : 0;
          if (pA !== pB) return pA - pB;
          const tA = (a.minuto || 0) * 60 + (a.segundos || 0);
          const tB = (b.minuto || 0) * 60 + (b.segundos || 0);
          return tA - tB;
        });

        const tieneTitular = evsPartido.some(e => e.accion === 'Quinteto Inicial' && e.id_jugador == jugadorId);
        const tieneCambioEntra = evsPartido.some(e => e.accion === 'Cambio Entra' && e.id_jugador == jugadorId);
        const primeraAccion = evsPartido.find(e => e.id_jugador == jugadorId);
        
        let enCancha = false;
        if (tieneTitular) {
          enCancha = true;
        } else if (primeraAccion && !tieneCambioEntra) {
          enCancha = true;
        } else if (primeraAccion && tieneCambioEntra && primeraAccion.minuto <= tieneCambioEntra.minuto) {
          enCancha = true;
        }

        const analisis = analizarPartido(evsPartido, 'Propio', false);
        if (analisis) {
          posesionesTotales = [...posesionesTotales, ...analisis.posesiones];
          let minsPartido = analisis.minutosJugados ? (Number(analisis.minutosJugados[jugadorId]) || Number(analisis.minutosJugados[Number(jugadorId)]) || 0) : 0;
          const accionesJugadorEnPartido = evsPartido.filter(e => e.id_jugador == jugadorId).length;

          if (minsPartido === 0 && accionesJugadorEnPartido > 0) {
            minsPartido = accionesJugadorEnPartido * 0.8; 
          } else if (minsPartido > 0 && accionesJugadorEnPartido > 0) {
            const minsEstimadoMinimo = accionesJugadorEnPartido * 0.4;
            if (minsEstimadoMinimo > minsPartido) {
               minsPartido = minsEstimadoMinimo;
            }
          }

          minutos += minsPartido;
          const pmPartido = analisis.plusMinusJugador ? (analisis.plusMinusJugador[jugadorId] || analisis.plusMinusJugador[Number(jugadorId)] || 0) : 0;
          plusMinus += pmPartido;

          if (analisis.transiciones) {
            analisis.transiciones.forEach(t => {
              if (t.recuperacion?.id_jugador == jugadorId || t.remate?.id_jugador == jugadorId) {
                transicionesInvolucrado++;
              }
            });
          }

          if (analisis.quintetos) {
            analisis.quintetos.forEach(q => {
              if (q.ids.some(id => id == jugadorId)) {
                const key = [...q.ids].sort().join('-');
                if (!quintetosAgregados[key]) {
                  quintetosAgregados[key] = { ids: q.ids, golesFavor: 0, golesContra: 0, rematesFavor: 0, rematesContra: 0, recuperaciones: 0, perdidas: 0, minutos: 0 };
                }
                const agg = quintetosAgregados[key];
                agg.golesFavor += (q.golesFavor || 0);
                agg.golesContra += (q.golesContra || 0);
                agg.rematesFavor += (q.rematesFavor || 0);
                agg.rematesContra += (q.rematesContra || 0);
                agg.recuperaciones += (q.recuperaciones || 0);
                agg.perdidas += (q.perdidas || 0);
                agg.minutos += (q.minutos || 0);
              }
            });
          }
        }
        
        evsPartido.forEach(ev => {
          if (ev.accion === 'Quinteto Inicial' && ev.id_jugador == jugadorId) enCancha = true;
          if (ev.accion === 'Cambio Entra' && ev.id_jugador == jugadorId) enCancha = true;
          if (ev.accion === 'Cambio Sale' && ev.id_jugador == jugadorId) enCancha = false;
          if (ev.id_jugador == jugadorId) enCancha = true;

          let jugadorEnCanchaExacta = enCancha;
          if (ev.quinteto_activo) {
            try {
              const quintetoArray = typeof ev.quinteto_activo === 'string' ? JSON.parse(ev.quinteto_activo) : ev.quinteto_activo;
              if (Array.isArray(quintetoArray)) {
                jugadorEnCanchaExacta = quintetoArray.some(id => String(id) === String(jugadorId));
              }
            } catch(e) {}
          }

          const accionStr = (ev.accion || '').toLowerCase();
          const esEventoRival = ev.equipo === 'Rival' || ev.is_rival || accionStr.includes('rival');

          if (jugadorEnCanchaExacta && esEventoRival) {
            eventosRivalEnCancha.push(ev);
            const xgRemateRival = calcularXGEvento(ev);
            if (accionStr.includes('remate') || accionStr.includes('gol') || accionStr.includes('tiro')) {
              xgEnContraBruto += xgRemateRival;
              if (accionStr.includes('gol') && !accionStr.includes('anulado') && !accionStr.includes('contra')) {
                rivalStats.Gol++;
              } else if (accionStr.includes('atajad') || accionStr.includes('parad')) {
                rivalStats.Atajado++;
              } else if (accionStr.includes('desviad') || accionStr.includes('fuera')) {
                rivalStats.Desviado++;
              } else if (accionStr.includes('rebatid') || accionStr.includes('bloquead') || accionStr.includes('rechazad')) {
                rivalStats.Rebatido++;
              } else if (accionStr.includes('palo') || accionStr.includes('poste') || accionStr.includes('travesaño')) {
                rivalStats.Palo++;
              }
            }
          }
        });
      });

      const cadenas = calcularCadenasValor(posesionesTotales, jugadorId);
      xgBuildup = cadenas.xgBuildup;
    }

    minutos = Math.round(minutos);
    if (minutos === 0 && evFiltrados.length > 0) {
       minutos = Math.round(Math.max(1, evFiltrados.length * 0.8));
    }

    let golesContraEngine = 0;
    Object.values(quintetosAgregados).forEach(q => { golesContraEngine += (q.golesContra || 0); });

    const totalAtajadas = Math.max(stats.atajadasDirectas, rivalStats.Atajado);
    const totalGolesRecibidos = Math.max(stats.golesRecibidosDirectos, rivalStats.Gol, golesContraEngine);
    
    let xgEnContraFinal = xgEnContraBruto;
    if (rivalStats.Atajado < stats.atajadasDirectas) { xgEnContraFinal += stats.xGAcumuladoAtajadas; }

    const quintetosFinales = Object.values(quintetosAgregados).map(q => {
      const rating = calcularRatingQuintetoAvanzado(q);
      const diffGoles = q.golesFavor - q.golesContra;
      return { ...q, rating, diffGoles };
    }).filter(q => q.rating !== '-');
    quintetosFinales.sort((a, b) => b.rating - a.rating);
    const mejorQuinteto = quintetosFinales.length > 0 ? quintetosFinales[0] : null;

    const eficacia = stats.remates > 0 ? ((stats.goles / stats.remates) * 100).toFixed(0) : 0;
    const volumenAcciones = stats.recuperaciones + stats.perdidas;
    const ratioSeguridad = volumenAcciones > 0 ? ((stats.recuperaciones / volumenAcciones) * 100).toFixed(0) : 0;
    
    const impacto = calcularRatingJugador(jugadorSeleccionado, eventosParaRating, eventosRivalEnCancha, plusMinus, minutos);

    const esArqueroFijo = jugadorSeleccionado.posicion && jugadorSeleccionado.posicion.toLowerCase().includes('arquero');
    let rol = esArqueroFijo ? 'ARQUERO' : 'MIXTO';
    
    if (!esArqueroFijo) {
      const ratioFinalizacion = stats.remates / (xgBuildup || 1);
      const ratioDefensivo = stats.recuperaciones / (stats.remates || 1);
      if (ratioFinalizacion >= 2.5 && stats.remates >= 2) rol = 'FINALIZADOR';
      else if (xgBuildup >= 0.4 && ratioFinalizacion < 1.5) rol = 'GENERADOR';
      else if (stats.recuperaciones >= 3 && ratioDefensivo > 2) rol = 'MURO DEF.';
      else if (stats.asistencias >= 2 && stats.xG < 0.5) rol = 'CREADOR';
      else if (stats.recAltas >= 3) rol = 'PRESIÓN ALTA';
    }

    const rematesAlArcoRival = totalGolesRecibidos + totalAtajadas;
    const pctAtajadas = rematesAlArcoRival > 0 ? ((totalAtajadas / rematesAlArcoRival) * 100).toFixed(1) : 0;
    const golesPrevenidos = (xgEnContraFinal - totalGolesRecibidos).toFixed(2);

    const norm = (val, max) => Math.min(100, Math.max(0, (val / max) * 100));
    const p40 = minutos > 0 ? (40 / minutos) : 0;

    let dataRadar = [];
    if (esArqueroFijo) {
      dataRadar = [
        { subject: 'Efectividad', A: norm(pctAtajadas, 100) },
        { subject: 'xG Prevenido', A: norm(Math.max(0, golesPrevenidos * 20), 100) },
        { subject: 'Distribución', A: norm((xgBuildup * p40 * 30) + (stats.asistencias * p40 * 20), 100) },
        { subject: 'Anticipación', A: norm(stats.recuperaciones * p40 * 10, 100) },
        { subject: 'Seguridad', A: norm(100 - (stats.perdidasPeligrosas * p40 * 20), 100) }
      ];
    } else {
      dataRadar = [
        { subject: 'Ataque', A: norm((stats.remates * p40 * 2) + (stats.goles * p40 * 5) + (stats.xG * p40 * 10), 25) },
        { subject: 'Defensa', A: norm((stats.recuperaciones * p40 * 2) + (stats.duelosDefGanados * p40 * 3), 30) },
        { subject: 'Creación', A: norm((stats.asistencias * p40 * 10) + (xgBuildup * p40 * 20), 25) },
        { subject: 'Posesión', A: norm(100 - (stats.perdidas * p40 * 2) - (stats.perdidasPeligrosas * p40 * 5), 100) },
        { subject: 'Físico', A: norm((stats.recuperaciones + stats.duelosOfeTotales + stats.duelosDefTotales) * p40, 40) }
      ];
    }

    const dataTortaRemates = Object.keys(resultadosRemates)
      .filter(k => resultadosRemates[k] > 0)
      .map(k => ({ name: k, value: resultadosRemates[k] }));

    const impactoTimeline = Object.entries(accionesPorMinuto)
      .map(([min, count]) => ({ min: Number(min), count }))
      .sort((a, b) => a.min - b.min);

    return { 
      stats, evFiltrados, accionesDirectas, partidosJugados, 
      eficacia, ratioSeguridad, impacto, dataTortaRemates, perfilRemate,
      xgBuildup, plusMinus, minutos, transicionesInvolucrado, rol, dataRadar, topSocios,
      mejorQuinteto, rivalStats, pctAtajadas, esArqueroFijo, eventosRivalEnCancha,
      xgEnContra: xgEnContraFinal, golesPrevenidos, totalAtajadas, totalGolesRecibidos,
      contextoGoles, contextoRecuperaciones, impactoTimeline,
      vacio: false 
    };
  }, [eventos, eventosCompletos, partidoFiltro, jugadorId, jugadorSeleccionado, partidos, jugadores]);

  const evMapa = useMemo(() => {
    if (!perfil || perfil.vacio) return [];
    let eventosAMostrar = [...perfil.accionesDirectas];
    if (perfil.esArqueroFijo) eventosAMostrar = [...eventosAMostrar, ...perfil.eventosRivalEnCancha];

    return eventosAMostrar.filter(ev => {
      const accionStr = (ev.accion || '').toLowerCase();
      const esRival = ev.equipo === 'Rival' || ev.is_rival || accionStr.includes('rival');
      if (filtroAccionMapa === 'Todas') {
        if (esRival) return accionStr.includes('remate') || accionStr.includes('gol') || accionStr.includes('tiro'); 
        return true;
      }
      if (filtroAccionMapa === 'Gol') { if (esRival) return false; return accionStr === 'gol' || accionStr === 'remate - gol'; }
      if (filtroAccionMapa === 'Goles Recibidos') { if (esRival) return accionStr.includes('gol') && !accionStr.includes('anulado'); return accionStr.includes('gol recibido'); }
      if (filtroAccionMapa === 'Atajada') return accionStr.includes('atajad') || accionStr.includes('parad');
      if (filtroAccionMapa === 'Remate') { if (esRival) return false; return accionStr.includes('remate'); }
      if (filtroAccionMapa === 'Recuperación') { if (esRival) return false; return accionStr.includes('recuperación'); }
      if (filtroAccionMapa === 'Pérdida') { if (esRival) return false; return accionStr.includes('pérdida'); }
      if (filtroAccionMapa === 'Duelo') { if (esRival) return false; return accionStr.includes('duelo'); }
      if (filtroAccionMapa === 'Faltas') { if (esRival) return false; return accionStr.includes('falta'); }
      return false;
    });
  }, [perfil, filtroAccionMapa]);

  useEffect(() => {
    if (tipoMapa !== 'calor' || !heatmapRef.current) return;
    const canvas = heatmapRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!evMapa.length) return;
    const dataPoints = evMapa
      .filter(ev => (ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x) != null)
      .map(ev => {
        const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
        const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
        return [(x / 100) * canvas.width, (y / 100) * canvas.height, 1];
      });
    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(35, 25);
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    const dynamicMax = Math.max(3, Math.floor(dataPoints.length / 5));
    heat.max(dynamicMax);
    heat.draw();
  }, [evMapa, tipoMapa]);

  // 🔥 LÓGICA DE LEYENDA REACTIVA TOTAL 🔥
  const itemsLeyenda = useMemo(() => {
    const config = {
      // Remates
      'GOL': { label: 'GOL', color: '#00ff88', tags: ['Todas', 'Gol', 'Remate'] },
      'ATAJADO': { label: 'REM. ATAJADO', color: '#3b82f6', tags: ['Remate'] },
      'DESVIADO': { label: 'REM. DESVIADO', color: '#6b7280', tags: ['Remate'] },
      'REBATIDO': { label: 'REM. REBATIDO', color: '#a855f7', tags: ['Remate'] },
      // Duelos
      'DEF_GANADO': { label: 'DUELO DEF. GANADO', color: '#00ff88', tags: ['Todas', 'Duelo'] },
      'DEF_PERDIDO': { label: 'DUELO DEF. PERDIDO', color: 'rgba(255,255,255,0.4)', tags: ['Duelo'] },
      'OFE_GANADO': { label: 'DUELO OFE. GANADO', color: '#c084fc', tags: ['Todas', 'Duelo'] },
      'OFE_PERDIDO': { label: 'DUELO OFE. PERDIDO', color: 'rgba(255,255,255,0.2)', tags: ['Duelo'] },
      // Otros
      'RECUPERACION': { label: 'RECUPERACIÓN', color: '#fbbf24', tags: ['Todas', 'Recuperación'] },
      'PERDIDA': { label: 'PÉRDIDA', color: '#ef4444', tags: ['Todas', 'Pérdida'] },
      'FALTA_COMETIDA': { label: 'FALTA COMETIDA', color: '#f97316', tags: ['Todas', 'Faltas'] },
      'FALTA_RECIBIDA': { label: 'FALTA RECIBIDA', color: '#00ff88', tags: ['Faltas'] },
      'ATAJADA': { label: 'ATAJADA', color: '#06b6d4', tags: ['Todas', 'Atajada'] },
      'GOL_RECIBIDO': { label: 'GOL RECIBIDO', color: '#ef4444', tags: ['Todas', 'Goles Recibidos'] }
    };

    const itemsAMostrar = Object.values(config).filter(item => {
      // Seguridad de arquero
      if (!perfil?.esArqueroFijo && (item.label === 'ATAJADA' || item.label === 'GOL RECIBIDO')) return false;
      // Filtro reactivo
      return item.tags.includes(filtroAccionMapa);
    });

    return itemsAMostrar;
  }, [filtroAccionMapa, perfil]);

  const metricasWellness = useMemo(() => {
    if (!wellnessJugador.length) return null;
    let arrayFiltro = [];
    if (partidoFiltro === 'Todos') {
      arrayFiltro = wellnessJugador.slice(0, 7);
    } else {
      const matchSeleccionado = partidos.find(p => p.id == partidoFiltro);
      if (matchSeleccionado && matchSeleccionado.fecha) {
        const dFin = new Date(matchSeleccionado.fecha);
        const dInicio = new Date(matchSeleccionado.fecha);
        dInicio.setDate(dInicio.getDate() - 7);
        arrayFiltro = wellnessJugador.filter(w => { const wd = new Date(w.fecha); return wd >= dInicio && wd <= dFin; });
      }
    }
    if (arrayFiltro.length === 0) return null;
    const readSum = arrayFiltro.reduce((a, b) => a + (b.readiness_score || 0), 0);
    const readValidCount = arrayFiltro.filter(w => w.readiness_score).length;
    const rpeSum = arrayFiltro.reduce((a, b) => a + (b.rpe || 0), 0);
    const rpeValidCount = arrayFiltro.filter(w => w.rpe).length;
    return {
      avgReadiness: readValidCount > 0 ? Math.round(readSum / readValidCount) : 'S/D',
      avgRPE: rpeValidCount > 0 ? (rpeSum / rpeValidCount).toFixed(1) : 'S/D',
      cargaAguda: arrayFiltro.reduce((a, b) => a + (b.carga_diaria || 0), 0)
    };
  }, [wellnessJugador, partidoFiltro, partidos]);

  const COLORS_REMATES = { 'Gol': '#00ff88', 'Atajado': '#3b82f6', 'Desviado': '#6b7280', 'Rebatido': '#a855f7' };
  const ACCENT = 'var(--accent)';

  if (cargandoAuth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>VERIFICANDO PERMISOS...</div>
      </div>
    );
  }

  if (userRol === 'Admin') {
    return (
      <div className="bento-card" style={{ textAlign: 'center', marginTop: '50px', padding: '40px', border: '1px solid #ef4444' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>ACCESO DENEGADO</h2>
        <p style={{ color: 'var(--text-dim)' }}>Tu rol de Administrador no tiene permisos para visualizar los reportes individuales del plantel.</p>
      </div>
    );
  }

  if (!jugadorId) {
    const arqueros = jugadoresGrid.filter(j => j.posicion && j.posicion.toLowerCase().includes('arquero'));
    const jugadoresCampo = jugadoresGrid.filter(j => !j.posicion || !j.posicion.toLowerCase().includes('arquero'));

    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <style>{`
          .player-card:hover { transform: translateY(-4px) !important; }
          .player-card:hover .player-card-glow { opacity: 1 !important; }
          .player-card-arquero { border-color: rgba(251, 191, 36, 0.3) !important; }
          .player-card-arquero:hover { border-color: #fbbf24 !important; }
        `}</style>
        
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>DIRECTORIO DE PLANTEL</div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un jugador para ver su analítica completa.</div>
          </div>
          <div style={{ width: esMovil ? '100%' : 'auto' }}>
            <div className="stat-label">FILTRAR POR CATEGORÍA</div>
            <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '100%', minWidth: '200px', background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333', outline: 'none' }}>
              <option value="Todas">TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        {arqueros.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ width: '3px', height: '18px', background: '#fbbf24', borderRadius: '2px' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.1em' }}>ARQUEROS</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
              {arqueros.map(j => (
                <div key={j.id} className="bento-card player-card player-card-arquero" onClick={() => setJugadorId(j.id)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}>
                  <div className="player-card-glow" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(251,191,36,0.06), transparent 70%)', opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', right: '-8px', top: '-20px', fontSize: '5.5rem', fontWeight: 900, color: 'rgba(251,191,36,0.04)', pointerEvents: 'none' }}>{j.dorsal}</div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#1a1400', border: '2px solid #fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '1rem', fontWeight: 800, color: '#fbbf24', flexShrink: 0 }}>
                      {j.foto ? <img src={j.foto} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <>{j.apellido ? j.apellido.charAt(0) : ''}{j.nombre ? j.nombre.charAt(0) : ''}</>}
                    </div>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{j.apellido || '-'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{j.nombre || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>🥅 ARQUERO</span>
                    <span style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>#{j.dorsal}</span>
                    {j.categoria && <span style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem' }}>{j.categoria}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {jugadoresCampo.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <div style={{ width: '3px', height: '18px', background: 'var(--accent)', borderRadius: '2px' }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.1em' }}>JUGADORES DE CAMPO</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
              {jugadoresCampo.map(j => (
                <div key={j.id} className="bento-card player-card" onClick={() => setJugadorId(j.id)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}>
                  <div className="player-card-glow" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(0,255,136,0.05), transparent 70%)', opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', right: '-8px', top: '-20px', fontSize: '5.5rem', fontWeight: 900, color: 'rgba(255,255,255,0.025)', pointerEvents: 'none' }}>{j.dorsal}</div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#111', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '1rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                      {j.foto ? <img src={j.foto} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <>{j.apellido ? j.apellido.charAt(0) : ''}{j.nombre ? j.nombre.charAt(0) : ''}</>}
                    </div>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{j.apellido || '-'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>{j.nombre || '-'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>{j.posicion || 'S/P'}</span>
                    <span style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>#{j.dorsal}</span>
                    {j.categoria && <span style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem' }}>{j.categoria}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const factor40 = perfil?.minutos > 0 ? (40 / perfil.minutos) : 1;
  const esArquero = perfil?.esArqueroFijo;
  const accentColor = esArquero ? '#fbbf24' : 'var(--accent)';

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <style>{`
        .tab-btn { border: none; background: transparent; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .tab-btn:hover { opacity: 0.85; }
        .jp-ring-pulse { animation: jpPulse 2s ease-in-out infinite; }
        @keyframes jpPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .jp-stat-card { transition: transform 0.15s; }
        .jp-stat-card:hover { transform: translateY(-2px); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .jp-section { animation: slideIn 0.3s ease both; }
      `}</style>

      {/* ── CONTROLES SUPERIORES ── */}
      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: esMovil ? '100%' : 'auto' }}>
          {!isKiosco && (
            <button onClick={() => setJugadorId('')} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', flex: esMovil ? '0 0 auto' : 'none' }}>
              ← PLANTEL
            </button>
          )}
          
          {/* 🔥 MEJORA KIOSCO 2: Botón gigante para salir en touch screen */}
          {isKiosco && (
            <button 
              onClick={() => {
                localStorage.removeItem('kiosco_jugador_id');
                navigate('/kiosco');
              }} 
              style={{ padding: '12px 20px', background: '#ef4444', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 900, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)', border: 'none', width: esMovil ? '100%' : 'auto', justifyContent: 'center' }}
            >
              👋 SALIR / CERRAR MI PERFIL
            </button>
          )}

          {jugadorId && (
            <div style={{ flex: esMovil ? '1 1 100%' : 'auto' }}>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ width: '100%', minWidth: '220px', background: '#0a0a0a', color: accentColor, border: `1px solid ${esArquero ? 'rgba(251,191,36,0.3)' : 'rgba(0,255,136,0.3)'}`, padding: '8px 12px', borderRadius: '6px', outline: 'none', fontWeight: 700, fontSize: '0.8rem' }}>
                <option value="Todos">TODA LA TEMPORADA</option>
                {/* 🔥 SOLO MOSTRAMOS PARTIDOS DONDE JUGÓ EL JUGADOR SELECCIONADO */}
                {partidosDondeJugo.map(p => <option key={p.id} value={p.id}>{p.rival?.toUpperCase()} // {p.fecha}</option>)}
              </select>
            </div>
          )}
        </div>

        {jugadorId && perfil && !perfil.vacio && (
          <div style={{ display: 'flex', gap: '8px', width: esMovil ? '100%' : 'auto', flexDirection: esMovil ? 'column' : 'row' }}>
            <button onClick={() => setMostrarStory(true)} className="btn-action" style={{ width: esMovil ? '100%' : 'auto', background: '#c084fc', color: '#fff', border: 'none', boxShadow: '0 4px 15px rgba(192,132,252,0.2)', fontSize: '0.75rem', padding: '9px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
              📱 STORY
            </button>
            <button onClick={() => setMostrarReporte(true)} className="btn-action" style={{ width: esMovil ? '100%' : 'auto', fontSize: '0.75rem', padding: '9px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>
              📄 REPORTE
            </button>
          </div>
        )}
      </div>

      {perfil?.vacio && (
        <div className="bento-card" style={{ textAlign: 'center', padding: '50px', color: 'rgba(255,255,255,0.3)' }}>
          Sin datos registrados para este filtro.
        </div>
      )}

      {jugadorSeleccionado && perfil && !perfil.vacio && (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* HEADER: IDENTIDAD DEL JUGADOR */}
          <div className="bento-card jp-section" style={{
            background: `linear-gradient(135deg, #0d0d0d 0%, #111 50%, ${esArquero ? '#110e00' : '#001a0d'} 100%)`,
            borderLeft: `4px solid ${accentColor}`,
            padding: esMovil ? '20px' : '24px 28px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', right: esMovil ? '-10px' : '20px', top: '-20px', fontSize: esMovil ? '8rem' : '11rem', fontWeight: 900, color: 'rgba(255,255,255,0.025)', pointerEvents: 'none', lineHeight: 1, fontFamily: 'monospace' }}>
              {jugadorSeleccionado.dorsal}
            </div>

            <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: esMovil ? '18px' : '28px', alignItems: esMovil ? 'flex-start' : 'center', position: 'relative', zIndex: 1 }}>
              
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: esMovil ? '64px' : '80px', height: esMovil ? '64px' : '80px', borderRadius: '50%', background: esArquero ? '#1a1400' : '#0a1a0d', border: `3px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '2rem', fontWeight: 800, color: accentColor }}>
                  {jugadorSeleccionado.foto
                    ? <img src={jugadorSeleccionado.foto} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <>{jugadorSeleccionado.apellido?.charAt(0)}{jugadorSeleccionado.nombre?.charAt(0)}</>}
                </div>
                {esArquero && (
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '22px', height: '22px', background: '#fbbf24', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', border: '2px solid #000' }}>🥅</div>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  <div style={{ fontSize: esMovil ? '1.8rem' : '2.4rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {jugadorSeleccionado.apellido}
                  </div>
                  <span style={{ background: accentColor, color: '#000', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.08em' }}>
                    {perfil.rol}
                  </span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', marginBottom: '10px' }}>
                  {jugadorSeleccionado.nombre}
                  <span style={{ marginLeft: '12px', color: accentColor, fontWeight: 800, fontFamily: 'monospace' }}>#{jugadorSeleccionado.dorsal}</span>
                  {jugadorSeleccionado.posicion && <span style={{ marginLeft: '12px', color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>· {jugadorSeleccionado.posicion}</span>}
                </div>
                {jugadorSeleccionado.categoria && (
                  <span style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600 }}>{jugadorSeleccionado.categoria}</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: esMovil ? '16px' : '24px', flexWrap: 'wrap', borderTop: esMovil ? `1px solid rgba(255,255,255,0.08)` : 'none', paddingTop: esMovil ? '14px' : '0', width: esMovil ? '100%' : 'auto', justifyContent: esMovil ? 'space-around' : 'flex-end' }}>
                {[
                  { label: 'PARTIDOS', val: perfil.partidosJugados, color: '#fff' },
                  { label: 'MINUTOS', val: `${perfil.minutos}'`, color: 'rgba(255,255,255,0.7)' },
                  { label: 'RATING', val: perfil.impacto !== '-' ? perfil.impacto.toFixed ? perfil.impacto.toFixed(1) : perfil.impacto : '-', color: typeof perfil.impacto === 'number' && perfil.impacto >= 6 ? '#00ff88' : '#ef4444' },
                  { label: '+/-', val: perfil.plusMinus > 0 ? `+${perfil.plusMinus}` : perfil.plusMinus, color: perfil.plusMinus > 0 ? '#00ff88' : perfil.plusMinus < 0 ? '#ef4444' : '#fff' },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '4px' }}>{k.label}</div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: k.color, lineHeight: 1, fontFamily: 'monospace' }}>{k.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TABS DE NAVEGACIÓN */}
          <div style={{ display: 'flex', gap: '4px', background: '#0a0a0a', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { id: 'estadisticas', label: esArquero ? '🥅 RENDIMIENTO' : '⚽ ESTADÍSTICAS' },
              { id: 'mapas', label: '🗺️ MAPA' },
              { id: 'quinteto', label: '👥 QUINTETO' },
            ].map(tab => (
              <button
                key={tab.id}
                className="tab-btn"
                onClick={() => setTabActiva(tab.id)}
                style={{
                  flex: 1, padding: '10px 8px',
                  borderRadius: '6px',
                  background: tabActiva === tab.id ? (esArquero ? '#1a1400' : '#001a0d') : 'transparent',
                  color: tabActiva === tab.id ? accentColor : 'rgba(255,255,255,0.35)',
                  fontWeight: 800, fontSize: esMovil ? '0.65rem' : '0.75rem',
                  letterSpacing: '0.03em',
                  borderBottom: tabActiva === tab.id ? `2px solid ${accentColor}` : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {tabActiva === 'estadisticas' && (
            <div className="jp-section" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1.4fr 1fr', gap: '18px' }}>
                <div className="bento-card jp-stat-card">
                  <div className="stat-label" style={{ marginBottom: '8px', color: accentColor }}>
                    {esArquero ? 'PERFIL DE PORTERÍA' : 'PERFIL DE RENDIMIENTO'}
                  </div>
                  <div style={{ width: '100%', height: '260px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="78%" data={perfil.dataRadar}>
                        <PolarGrid stroke="rgba(255,255,255,0.08)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name={jugadorSeleccionado.apellido} dataKey="A" stroke={accentColor} fill={accentColor} fillOpacity={0.25} isAnimationActive={true} dot={{ fill: accentColor, r: 3 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bento-card jp-stat-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="stat-label" style={{ marginBottom: '14px', color: '#facc15' }}>DISCIPLINA</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '18px', background: '#0a0a0a', padding: '16px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: '28px', height: '42px', background: '#facc15', borderRadius: '4px', margin: '0 auto 8px', boxShadow: '0 4px 12px rgba(250,204,21,0.3)' }} />
                      <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{perfil.stats.amarillas}</div>
                      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>AMARILLAS</div>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: '28px', height: '42px', background: '#ef4444', borderRadius: '4px', margin: '0 auto 8px', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' }} />
                      <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{perfil.stats.rojas}</div>
                      <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>ROJAS</div>
                    </div>
                  </div>
                  <StatRow label="Faltas cometidas" value={perfil.stats.faltasCometidas} sub={`(${(perfil.stats.faltasCometidas * factor40).toFixed(1)} p40)`} />
                  <StatRow label="Faltas recibidas" value={perfil.stats.faltasRecibidas} sub={`(${(perfil.stats.faltasRecibidas * factor40).toFixed(1)} p40)`} color="#00ff88" border={false} />
                </div>
              </div>

              {metricasWellness && (
                <div className="bento-card jp-section" style={{ background: 'linear-gradient(135deg, #0a0a1a, #000)', border: '1px solid rgba(59,130,246,0.3)' }}>
                  <div className="stat-label" style={{ color: '#3b82f6', marginBottom: '16px' }}>
                    🩺 WELLNESS {partidoFiltro === 'Todos' ? '(PROMEDIO ACTUAL)' : '(SEMANA PREVIA AL PARTIDO)'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
                    {[
                      { label: 'READINESS PRE-ENTRENO', val: metricasWellness.avgReadiness !== 'S/D' ? `${metricasWellness.avgReadiness}/100` : 'S/D', color: metricasWellness.avgReadiness >= 80 ? '#10b981' : metricasWellness.avgReadiness >= 60 ? '#eab308' : '#ef4444' },
                      { label: 'RPE POST-ENTRENO', val: metricasWellness.avgRPE !== 'S/D' ? `${metricasWellness.avgRPE}/10` : 'S/D', color: metricasWellness.avgRPE >= 8 ? '#ef4444' : '#eab308' },
                      { label: 'CARGA ACUMULADA', val: `${metricasWellness.cargaAguda} UC`, color: '#3b82f6' },
                    ].map((w, i) => (
                      <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '8px' }}>{w.label}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: w.color, fontFamily: 'monospace' }}>{w.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────── ARQUERO ────────── */}
              {esArquero ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '14px' }}>
                    {[
                      { label: 'EFECTIVIDAD', val: `${perfil.pctAtajadas}%`, sub: `${perfil.totalAtajadas}/${perfil.totalAtajadas + perfil.totalGolesRecibidos}`, color: '#00ff88', icon: '🛡️' },
                      { label: 'GOLES PREVENIDOS', val: perfil.golesPrevenidos > 0 ? `+${perfil.golesPrevenidos}` : perfil.golesPrevenidos, sub: `vs ${perfil.xgEnContra.toFixed(2)} xG recibido`, color: Number(perfil.golesPrevenidos) > 0 ? '#00ff88' : '#ef4444', icon: '✨' },
                      { label: 'REMATES RECIBIDOS', val: perfil.totalGolesRecibidos + perfil.totalAtajadas + (perfil.rivalStats?.Desviado || 0) + (perfil.rivalStats?.Rebatido || 0), sub: 'incl. desviados', color: '#fff', icon: '⚡' },
                      { label: 'GOLES RECIBIDOS', val: perfil.totalGolesRecibidos, sub: `xG recibido: ${perfil.xgEnContra.toFixed(2)}`, color: '#ef4444', icon: '❌' },
                    ].map((m, i) => (
                      <div key={i} className="bento-card jp-stat-card" style={{ textAlign: 'center', padding: '18px 12px', borderTop: `2px solid ${m.color}` }}>
                        <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>{m.icon}</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginBottom: '6px', letterSpacing: '0.06em' }}>{m.label}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: m.color, lineHeight: 1, fontFamily: 'monospace' }}>{m.val}</div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>{m.sub}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr', gap: '18px' }}>
                    
                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: accentColor, marginBottom: '20px' }}>ANÁLISIS DE EFECTIVIDAD</div>
                      <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '16px' }}>
                        <RingMeter value={Number(perfil.pctAtajadas)} max={100} color="#00ff88" size={110} label="Efectividad (%)" subLabel="%" />
                        <RingMeter 
                          value={perfil.totalAtajadas} 
                          max={perfil.totalAtajadas + perfil.totalGolesRecibidos || 1} 
                          color="#fbbf24" 
                          size={110} 
                          label="Atajadas" 
                          subLabel={`/${perfil.totalAtajadas + perfil.totalGolesRecibidos}`}
                        />
                        <RingMeter 
                          value={Math.max(0, Number(perfil.golesPrevenidos) * 10).toFixed(0)} 
                          max={100} 
                          color={Number(perfil.golesPrevenidos) > 0 ? '#00ff88' : '#ef4444'} 
                          size={110} 
                          label="xG Prevenido" 
                          subLabel={Number(perfil.golesPrevenidos) > 0 ? `+${perfil.golesPrevenidos}` : perfil.golesPrevenidos}
                        />
                      </div>
                    </div>

                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#0ea5e9', marginBottom: '16px' }}>DESGLOSE DE TIROS RECIBIDOS</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {[
                          { label: 'ATAJADOS', val: perfil.totalAtajadas, color: '#00ff88' },
                          { label: 'GOLES', val: perfil.totalGolesRecibidos, color: '#ef4444' },
                          { label: 'DESVIADOS', val: perfil.rivalStats?.Desviado || 0, color: '#6b7280' },
                          { label: 'REMATES RECIBIDOS', val: perfil.rivalStats?.Rebatido || 0, color: '#a855f7' },
                          { label: 'AL PALO', val: perfil.rivalStats?.Palo || 0, color: '#facc15' },
                        ].map((item, i, arr) => {
                          const total = arr.reduce((s, x) => s + x.val, 0) || 1;
                          return (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{item.label}</span>
                              <div style={{ width: `${Math.round((item.val / total) * 100)}px`, maxWidth: '80px', minWidth: '4px', height: '4px', background: item.color, borderRadius: '2px', opacity: 0.6 }} />
                              <strong style={{ color: item.color, fontSize: '1rem', minWidth: '28px', textAlign: 'right', fontFamily: 'monospace' }}>{item.val}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr 1fr', gap: '18px' }}>
                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#3b82f6', marginBottom: '16px' }}>🦶 JUEGO DE PIES Y DISTRIBUCIÓN</div>
                      <StatRow label="Inicio de jugada (xG buildup)" value={perfil.xgBuildup.toFixed(3)} color="#3b82f6" />
                      <StatRow label="Asistencias a gol" value={perfil.stats.asistencias} color="#00ff88" />
                      <StatRow label="Pases clave" value={perfil.stats.pasesClave} color="#c084fc" />
                      <StatRow label="Cortes / recuperaciones" value={perfil.stats.recuperaciones} color="#fbbf24" />
                      <StatRow label="Pérdidas en salida" value={perfil.stats.perdidasPeligrosas} color={perfil.stats.perdidasPeligrosas > 2 ? '#ef4444' : '#fff'} border={false} />
                    </div>

                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#c084fc', marginBottom: '16px' }}>📍 CONTEXTO DE JUEGO</div>
                      <StatRow label="Transiciones finalizadas" value={perfil.transicionesInvolucrado} color="#c084fc" />
                      <StatRow label="Duelos def. ganados" value={`${perfil.stats.duelosDefGanados}/${perfil.stats.duelosDefTotales}`} color="#00ff88" />
                      <StatRow label="Duelos def. perdidos" value={perfil.stats.duelosDefPerdidos} color="#ef4444" />
                      <StatRow label="Faltas cometidas" value={perfil.stats.faltasCometidas} />
                      <StatRow label="Faltas recibidas" value={perfil.stats.faltasRecibidas} color="#00ff88" border={false} />
                    </div>
                  </div>
                </div>
              ) : (
              /* ────────── JUGADOR DE CAMPO ────────── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: '12px' }}>
                    {[
                      { label: 'GOLES', val: perfil.stats.goles, color: '#00ff88', icon: '⚽' },
                      { label: 'ASISTENCIAS', val: perfil.stats.asistencias, color: '#c084fc', icon: '🎯' },
                      { label: 'xG', val: perfil.stats.xG.toFixed(2), color: '#fbbf24', icon: '📊' },
                      { label: 'RECUPERACIONES', val: perfil.stats.recuperaciones, color: '#3b82f6', icon: '💪' },
                      { label: 'xG BUILDUP', val: perfil.xgBuildup.toFixed(3), color: '#f97316', icon: '🔗' },
                    ].map((m, i) => (
                      <div key={i} className="bento-card jp-stat-card" style={{ textAlign: 'center', padding: '16px 10px', background: `linear-gradient(135deg, #0d0d0d, #111)` }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{m.icon}</div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 900, color: m.color, lineHeight: 1, fontFamily: 'monospace' }}>{m.val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr', gap: '18px' }}>
                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: '14px' }}>⚽ RADIOGRAFÍA OFENSIVA</div>
                      <StatRow label="Expectativa de gol (xG)" value={perfil.stats.xG.toFixed(2)} color="#fbbf24" sub={`Eficacia: ${perfil.eficacia}%`} />
                      <StatRow label="Remates totales" value={perfil.stats.remates} sub={`(${(perfil.stats.remates * factor40).toFixed(1)} p40)`} />
                      <StatRow label="Al arco (gol)" value={`${perfil.stats.goles + perfil.stats.atajados} (${perfil.stats.goles})`} color="#00ff88" />
                      <StatRow label="Ocasiones falladas" value={perfil.stats.ocasionesFalladas} color={perfil.stats.ocasionesFalladas > 2 ? '#ef4444' : '#888'} />
                      <StatRow label="Asistencias" value={perfil.stats.asistencias} color="#c084fc" sub={`xG buildup: ${perfil.xgBuildup.toFixed(2)}`} />
                      <StatRow label="Pases clave" value={perfil.stats.pasesClave} color="#c084fc" />
                      
                      <div style={{ marginTop: '14px', padding: '12px', background: '#0a0a0a', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', marginBottom: '10px', letterSpacing: '0.05em' }}>PERFIL DE REMATE</div>
                        <BarDual labelA="Centro" valA={perfil.perfilRemate.centro} colorA="#00ff88" labelB="Banda" valB={perfil.perfilRemate.banda} colorB="rgba(255,255,255,0.4)" />
                        <div style={{ marginTop: '10px' }}>
                          <BarDual labelA="Cercano" valA={perfil.perfilRemate.cerca} colorA="#fbbf24" labelB="Distancia" valB={perfil.perfilRemate.lejos} colorB="#ef4444" />
                        </div>
                      </div>
                    </div>

                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#ef4444', marginBottom: '14px' }}>🛡️ RADIOGRAFÍA DEFENSIVA</div>
                      <StatRow label="Recuperaciones totales" value={perfil.stats.recuperaciones} color="var(--accent)" sub={`(${(perfil.stats.recuperaciones * factor40).toFixed(1)} p40)`} />
                      
                      <div style={{ padding: '10px', background: '#0a0a0a', borderRadius: '6px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center', fontSize: '0.65rem' }}>
                          {[
                            { label: 'PRESIÓN\nALTA', val: perfil.contextoRecuperaciones.alta, color: '#ef4444' },
                            { label: 'ZONA\nMEDIA', val: perfil.contextoRecuperaciones.media, color: '#fbbf24' },
                            { label: 'ZONA\nBASE', val: perfil.contextoRecuperaciones.baja, color: '#6b7280' },
                          ].map(z => (
                            <div key={z.label} style={{ padding: '6px 4px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                              <div style={{ color: z.color, fontWeight: 900, fontSize: '1.1rem', fontFamily: 'monospace' }}>{z.val}</div>
                              <div style={{ color: 'rgba(255,255,255,0.3)', marginTop: '2px', lineHeight: 1.3, whiteSpace: 'pre-line' }}>{z.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <StatRow label="Pérdidas de balón" value={perfil.stats.perdidas} color="#ef4444" sub={`${perfil.stats.perdidasPeligrosas} peligrosas`} />
                      
                      <div style={{ padding: '10px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Ratio seguridad (Rec/Perd)</span>
                          <strong style={{ color: Number(perfil.ratioSeguridad) >= 60 ? '#00ff88' : '#ef4444' }}>{perfil.ratioSeguridad}%</strong>
                        </div>
                      </div>

                      <StatRow label="Duelos DEF. ganados" value={`${perfil.stats.duelosDefGanados}/${perfil.stats.duelosDefTotales}`} color="#00ff88" sub={`(${perfil.stats.duelosDefTotales > 0 ? ((perfil.stats.duelosDefGanados / perfil.stats.duelosDefTotales) * 100).toFixed(0) : 0}%)`} />
                      <StatRow label="Duelos OFE. ganados" value={`${perfil.stats.duelosOfeGanados}/${perfil.stats.duelosOfeTotales}`} sub={`(${perfil.stats.duelosOfeTotales > 0 ? ((perfil.stats.duelosOfeGanados / perfil.stats.duelosOfeTotales) * 100).toFixed(0) : 0}%)`} border={false} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr 1fr', gap: '18px' }}>
                    
                    <div className="bento-card jp-section" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div className="stat-label" style={{ marginBottom: '8px', color: '#3b82f6' }}>DESTINO DE REMATES</div>
                      <div style={{ flex: 1, minHeight: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {perfil.dataTortaRemates?.length > 0 ? (
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie data={perfil.dataTortaRemates} cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={4} dataKey="value">
                                {perfil.dataTortaRemates.map((entry, i) => (
                                  <Cell key={`cell-${i}`} fill={COLORS_REMATES[entry.name] || '#555'} />
                                ))}
                              </Pie>
                              <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '6px' }} itemStyle={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }} />
                              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem' }} iconType="circle" />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', textAlign: 'center' }}>Sin remates.</div>
                        )}
                      </div>
                    </div>

                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#f97316', marginBottom: '14px' }}>跑 TRANSICIONES</div>
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: '4rem', fontWeight: 900, color: '#f97316', fontFamily: 'monospace', lineHeight: 1 }}>{perfil.transicionesInvolucrado}</div>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '6px', lineHeight: 1.5 }}>contraataques<br/>finalizados</div>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '14px' }}>
                        <StatRow label="Contexto juego" value="-" />
                        <StatRow label="xG buildup" value={perfil.xgBuildup.toFixed(3)} color="#f97316" border={false} />
                      </div>
                    </div>

                    <div className="bento-card jp-section">
                      <div className="stat-label" style={{ color: '#facc15', marginBottom: '14px' }}>🤝 SOCIOS DE GOL</div>
                      {perfil.topSocios.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {perfil.topSocios.map((socio, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0a0a0a', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: isKiosco ? 'default' : 'pointer', opacity: isKiosco ? 0.9 : 1 }}
                              onClick={() => !isKiosco && navigate('/jugador', { state: { jugadorId: socio.id, partidoFiltro } })}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                {socio.apellido?.charAt(0)}{socio.nombre?.charAt(0)}
                              </div>
                              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase' }}>{socio.apellido || socio.nombre}</span>
                              <span style={{ fontWeight: 900, color: '#facc15', fontFamily: 'monospace' }}>{socio.conexiones}G</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>Sin conexiones directas.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tabActiva === 'mapas' && (
            <div className="jp-section bento-card">
              <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div className="stat-label" style={{ color: accentColor }}>
                    {esArquero ? 'MAPA DE TIROS RECIBIDOS' : 'MAPA DE INFLUENCIA INDIVIDUAL'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                    {esArquero
                      ? `Zonas de tiro del rival cuando ${jugadorSeleccionado.apellido} estuvo en arco.`
                      : `Zonas donde ${jugadorSeleccionado.apellido} interviene. (Ataque: izq → der)`}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: esMovil ? '100%' : 'auto' }}>
                  <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ flex: esMovil ? '1 1 100%' : 'auto', padding: '8px 10px', fontSize: '0.75rem', background: '#0a0a0a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', borderRadius: '6px' }}>
                    <option value="Todas">TODAS SUS ACCIONES</option>
                    <option value="Gol">SOLO GOLES</option>
                    {esArquero && <option value="Goles Recibidos">GOLES RECIBIDOS</option>}
                    {esArquero && <option value="Atajada">ATAJADAS</option>}
                    <option value="Remate">REMATES</option>
                    <option value="Recuperación">RECUPERACIONES</option>
                    <option value="Pérdida">PÉRDIDAS</option>
                    <option value="Duelo">DUELOS</option>
                    <option value="Faltas">FALTAS</option>
                  </select>

                  <div style={{ display: 'flex', gap: '4px', background: '#0a0a0a', padding: '3px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', flex: esMovil ? '1 1 100%' : 'auto' }}>
                    <button onClick={() => setTipoMapa('puntos')} style={{ flex: 1, padding: '7px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', background: tipoMapa === 'puntos' ? '#222' : 'transparent', color: tipoMapa === 'puntos' ? accentColor : 'rgba(255,255,255,0.35)', transition: '0.15s' }}>📍 PUNTOS</button>
                    <button onClick={() => setTipoMapa('calor')} style={{ flex: 1, padding: '7px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem', background: tipoMapa === 'calor' ? '#222' : 'transparent', color: tipoMapa === 'calor' ? accentColor : 'rgba(255,255,255,0.35)', transition: '0.15s' }}>🔥 CALOR</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '820px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative', background: '#0e1a10', border: '2px solid rgba(255,255,255,0.12)', borderRadius: '4px' }}>
                  <PitchLines />
                  
                  {tipoMapa === 'calor' && (
                    <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', opacity: 0.85 }} />
                  )}

                  {tipoMapa === 'puntos' && evMapa.map((ev, i) => {
                    const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
                    const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
                    if (xNorm == null || yNorm == null) return null;
                    const esRival = ev.equipo === 'Rival';

                    // 🔥 Lógica de Color Dinámica para puntos del mapa
                    const dotColor = (() => {
                      const a = (ev.accion || '').toLowerCase();
                      if (a.includes('gol') && !a.includes('contra') && !a.includes('recibido')) return '#00ff88';
                      if (a.includes('atajado')) return '#3b82f6';
                      if (a.includes('desviado')) return '#6b7280';
                      if (a.includes('rebatido')) return '#a855f7';
                      if (a.includes('def') && a.includes('ganado')) return '#00ff88';
                      if (a.includes('def') && a.includes('perdido')) return 'rgba(255,255,255,0.4)';
                      if (a.includes('ofe') && a.includes('ganado')) return '#c084fc';
                      if (a.includes('ofe') && a.includes('perdido')) return 'rgba(255,255,255,0.2)';
                      if (a.includes('cometida')) return '#f97316';
                      if (a.includes('recibida')) return '#00ff88';
                      return getColorAccion(ev.accion);
                    })();

                    return (
                      <div
                        key={ev.id || i}
                        title={`${ev.accion}${ev.periodo ? ` | ${ev.periodo} ${ev.minuto}'` : ''}`}
                        style={{
                          position: 'absolute', left: `${xNorm}%`, top: `${yNorm}%`,
                          width: esRival ? '10px' : '11px', height: esRival ? '10px' : '11px',
                          backgroundColor: dotColor,
                          border: esRival ? '1.5px solid rgba(0,0,0,0.8)' : '1.5px solid rgba(0,0,0,0.5)',
                          borderRadius: esRival ? '2px' : '50%',
                          transform: 'translate(-50%, -50%)',
                          opacity: 0.88, zIndex: 2,
                          boxShadow: `0 0 6px ${dotColor}66`
                        }}
                      />
                    );
                  })}

                  {evMapa.length === 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', zIndex: 2 }}>
                      Sin eventos para este filtro.
                    </div>
                  )}
                </div>
              </div>

              {/* LEYENDA REACTIVA TOTALMENTE DETALLADA */}
              <div style={{ 
                display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '16px', 
                padding: '12px', background: 'rgba(255,255,255,0.02)', 
                borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)',
                justifyContent: esMovil ? 'center' : 'flex-start'
              }}>
                {itemsLeyenda.map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color, border: '1px solid rgba(0,0,0,0.3)' }} />
                    {l.label.toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tabActiva === 'quinteto' && (
            <div className="jp-section" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="bento-card" style={{ borderTop: `3px solid ${accentColor}` }}>
                <div className="stat-label" style={{ marginBottom: '16px', color: accentColor }}>
                  SU MEJOR QUINTETO ESTRUCTURAL 
                  <InfoBox texto="La alineación de 5 con la que el equipo sacó el mejor Rating Avanzado cuando él estuvo en cancha." />
                </div>
                {perfil.mejorQuinteto ? (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                      {perfil.mejorQuinteto.ids.map(id => {
                        const j = jugadores.find(jug => jug.id == id);
                        const esEl = id == jugadorId;
                        return j ? (
                          <div key={id} onClick={() => !esEl && !isKiosco && navigate('/jugador', { state: { jugadorId: id, partidoFiltro } })}
                            style={{ 
                              background: esEl ? accentColor : '#111',
                              color: esEl ? '#000' : '#fff',
                              border: `1px solid ${esEl ? accentColor : 'rgba(255,255,255,0.1)'}`,
                              padding: '8px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800,
                              display: 'flex', alignItems: 'center', gap: '8px',
                              cursor: (esEl || isKiosco) ? 'default' : 'pointer',
                              transition: 'all 0.15s'
                            }}>
                            <span style={{ opacity: esEl ? 1 : 0.45, fontFamily: 'monospace', fontSize: '0.75rem' }}>{j.dorsal}</span>
                            {j.apellido?.toUpperCase() || j.nombre?.toUpperCase()}
                            {esEl && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>★</span>}
                          </div>
                        ) : null;
                      })}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', background: '#0a0a0a', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { label: 'RATING', val: perfil.mejorQuinteto.rating.toFixed(1), color: perfil.mejorQuinteto.rating >= 6 ? accentColor : '#ef4444' },
                        { label: '+/- GOLES', val: `${perfil.mejorQuinteto.diffGoles > 0 ? '+' : ''}${perfil.mejorQuinteto.diffGoles}`, color: perfil.mejorQuinteto.diffGoles > 0 ? '#00ff88' : '#ef4444' },
                        { label: 'REMATES', val: `${perfil.mejorQuinteto.rematesFavor}-${perfil.mejorQuinteto.rematesContra}`, color: '#3b82f6' },
                        { label: 'RECUPERACIONES', val: perfil.mejorQuinteto.recuperaciones, color: 'var(--accent)' },
                        { label: 'MINUTOS', val: `${perfil.mejorQuinteto.minutos?.toFixed(0) || 0}'`, color: 'rgba(255,255,255,0.6)' },
                      ].map((m, i) => (
                        <div key={i} style={{ textAlign: 'center', padding: '8px', borderRight: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', letterSpacing: '0.05em' }}>{m.label}</div>
                          <strong style={{ fontSize: '1.4rem', color: m.color, fontFamily: 'monospace' }}>{m.val}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', textAlign: 'center', padding: '30px 0' }}>
                    No hay suficientes datos de rotaciones para evaluar un quinteto estructural.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── OVERLAY STORY ── */}
      {mostrarStory && jugadorSeleccionado && perfil && !perfil.vacio && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.97)', zIndex: 9999, overflowY: 'auto', padding: esMovil ? '10px' : '20px' }}>
          <div style={{ textAlign: 'right', maxWidth: '1200px', margin: '0 auto' }}>
            <button onClick={() => setMostrarStory(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px', marginBottom: '10px' }}>✖ CERRAR STORY</button>
          </div>
          <PlayerReportIGStory jugador={jugadorSeleccionado} perfil={perfil} jugadores={jugadores}
            contexto={partidoFiltro === 'Todos' ? 'TODA LA TEMPORADA' : (() => { const p = partidos.find(p => p.id == partidoFiltro); return p ? `VS ${p.rival?.toUpperCase()} (${p.fecha})` : ''; })()}
          />
        </div>
      )}

      {/* ── OVERLAY REPORTE ── */}
      {mostrarReporte && jugadorSeleccionado && perfil && !perfil.vacio && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.97)', zIndex: 9999, overflowY: 'auto', padding: esMovil ? '10px' : '20px' }}>
          <div style={{ textAlign: 'right', maxWidth: '1200px', margin: '0 auto' }}>
            <button onClick={() => setMostrarReporte(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px', marginBottom: '10px' }}>✖ CERRAR REPORTE</button>
          </div>
          <PlayerReportGenerator jugador={jugadorSeleccionado} perfil={perfil} wellness={metricasWellness} clubInfo={clubInfo} jugadores={jugadores}
            contexto={partidoFiltro === 'Todos' ? 'TODA LA TEMPORADA' : (() => { const p = partidos.find(p => p.id == partidoFiltro); return p ? `VS ${p.rival?.toUpperCase()} (${p.fecha})` : ''; })()}
          />
        </div>
      )}
    </div>
  );
}

export default JugadorPerfil;