import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis 
} from 'recharts';

import { analizarPartido } from '../analytics/engine'; 
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';
import { calcularCadenasValor } from '../analytics/posesiones';
import InfoBox from '../components/InfoBox';
import { getColorAccion } from '../utils/helpers';
import PlayerReportGenerator from '../components/PlayerReportGenerator';

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

function JugadorPerfil() {
  const [userRol, setUserRol] = useState(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  // --- RESPONSIVE STATE ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [clubInfo, setClubInfo] = useState({ nombre: 'VIRTUAL FUTSAL', escudo: '' });
  
  const [eventos, setEventos] = useState([]);
  const [eventosCompletos, setEventosCompletos] = useState([]);
  
  const [wellnessJugador, setWellnessJugador] = useState([]);
  
  const isKiosco = !!localStorage.getItem('kiosco_jugador_id');
  const [jugadorId, setJugadorId] = useState(localStorage.getItem('kiosco_jugador_id') || ''); 
  
  const [partidoFiltro, setPartidoFiltro] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('calor');
  const [filtroAccionMapa, setFiltroAccionMapa] = useState('Todas');
  
  const [filtroCategoriaGrid, setFiltroCategoriaGrid] = useState('Todas');

  const heatmapRef = useRef(null);

  // --- ESTADO PARA EXPORTAR ---
  const [mostrarReporte, setMostrarReporte] = useState(false);

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
          const { data: perfil } = await supabase.from('usuarios').select('rol, club_id').eq('id', user.id).single();
          if (perfil) {
            setUserRol(perfil.rol);
            // Mockeamos escudo y nombre para el reporte (idealmente traer de tabla clubes)
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

  useEffect(() => {
    async function cargarCatalogos() {
      const { data: j } = await supabase.from('jugadores').select('*').order('apellido', { ascending: true });
      const { data: p } = await supabase.from('partidos').select('*').order('fecha', { ascending: false });
      setJugadores(j || []);
      setPartidos(p || []);
    }
    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function fetchDataJugador() {
      if (!jugadorId) {
        setEventos([]);
        setEventosCompletos([]);
        setWellnessJugador([]);
        return;
      }
      const { data: evsJugador } = await supabase.from('eventos').select('*').or(`id_jugador.eq.${jugadorId},id_asistencia.eq.${jugadorId}`).order('id_partido', { ascending: false });
      setEventos(evsJugador || []);

      const partidosIds = [...new Set((evsJugador || []).map(e => e.id_partido))];
      if (partidosIds.length > 0) {
        const { data: evsFull } = await supabase.from('eventos').select('*').in('id_partido', partidosIds).order('minuto', { ascending: true });
        setEventosCompletos(evsFull || []);
      } else {
        setEventosCompletos([]);
      }

      const { data: well } = await supabase.from('wellness').select('*').eq('jugador_id', jugadorId).order('fecha', { ascending: false }).limit(30);
      setWellnessJugador(well || []);
    }
    fetchDataJugador();
  }, [jugadorId]);

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
      faltasCometidas: 0, faltasRecibidas: 0, amarillas: 0, rojas: 0 
    };
    
    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;
    const resultadosRemates = { Gol: 0, Atajado: 0, Desviado: 0, Rebatido: 0 };
    const accionesDirectas = []; 
    const perfilRemate = { centro: 0, banda: 0, cerca: 0, lejos: 0 };
    const sociosData = {}; 

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const zonaY = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
      const esAtaque = zonaX > 66;
      const esDefensa = zonaX < 33;

      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) {
        stats.asistencias++;
        if (ev.id_jugador) sociosData[ev.id_jugador] = (sociosData[ev.id_jugador] || 0) + 1;
      }

      if (ev.id_jugador == jugadorId) {
        accionesDirectas.push(ev); 
        const xgEvento = calcularXGEvento(ev);

        if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { 
            stats.goles++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Gol++; 
            if (ev.id_asistencia) sociosData[ev.id_asistencia] = (sociosData[ev.id_asistencia] || 0) + 1;
          }
          else if (ev.accion === 'Remate - Atajado') { stats.atajados++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Atajado++; }
          else if (ev.accion === 'Remate - Desviado') { stats.desviados++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Desviado++; }
          else if (ev.accion === 'Remate - Rebatido') { stats.rebatidos++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Rebatido++; }
          
          if (zonaY > 35 && zonaY < 65) perfilRemate.centro++;
          else perfilRemate.banda++;

          const dx = (100 - zonaX) * 0.4;
          const dy = Math.abs(50 - zonaY) * 0.2;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 8) perfilRemate.cerca++;
          else perfilRemate.lejos++;
        }
        else if (ev.accion === 'Recuperación') { stats.recuperaciones++; if (esAtaque) stats.recAltas++; }
        else if (ev.accion === 'Pérdida') { stats.perdidas++; if (esDefensa) stats.perdidasPeligrosas++; }
        else if (ev.accion === 'Duelo DEF Ganado') { stats.duelosDefGanados++; stats.duelosDefTotales++; }
        else if (ev.accion === 'Duelo DEF Perdido') { stats.duelosDefPerdidos++; stats.duelosDefTotales++; }
        else if (ev.accion === 'Duelo OFE Ganado') { stats.duelosOfeGanados++; stats.duelosOfeTotales++; }
        else if (ev.accion === 'Duelo OFE Perdido') { stats.duelosOfePerdidos++; stats.duelosOfeTotales++; }
        else if (ev.accion?.includes('Falta cometida')) { stats.faltasCometidas++; stats.faltas++; }
        else if (ev.accion?.includes('Falta recibida')) { stats.faltasRecibidas++; }
        else if (ev.accion?.toLowerCase().includes('amarilla')) { stats.amarillas++; }
        else if (ev.accion?.toLowerCase().includes('roja')) { stats.rojas++; }
      }
    });

    // Encontrar a los 4 mejores socios para armar el quinteto directo (asistencias)
    const topSociosIds = Object.entries(sociosData)
      .sort((a, b) => b[1] - a[1]) // Ordenamos de mayor a menor cantidad de conexiones
      .slice(0, 4) // Tomamos los 4 mejores
      .map(entry => ({ id: entry[0], conexiones: entry[1] }));

    const topSocios = topSociosIds.map(s => {
      const j = jugadores.find(jug => jug.id == s.id);
      return j ? { ...j, conexiones: s.conexiones } : null;
    }).filter(Boolean);

    let xgBuildup = 0;
    let plusMinus = 0;
    let minutos = 0;
    let transicionesInvolucrado = 0;
    
    // Almacenamos los quintetos consolidados para evaluarlos
    const quintetosAgregados = {};

    if (evCompletosFiltrados.length > 0) {
      const evsPorPartido = {};
      evCompletosFiltrados.forEach(e => {
        if (!evsPorPartido[e.id_partido]) evsPorPartido[e.id_partido] = [];
        evsPorPartido[e.id_partido].push(e);
      });

      let posesionesTotales = [];

      Object.values(evsPorPartido).forEach(evsPartido => {
        const analisis = analizarPartido(evsPartido, 'Propio', false);
        if (analisis) {
          posesionesTotales = [...posesionesTotales, ...analisis.posesiones];
          
          const minsPartido = analisis.minutosJugados ? (analisis.minutosJugados[jugadorId] || analisis.minutosJugados[Number(jugadorId)] || 0) : 0;
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

          // ACUMULAR QUINTETOS DEL JUGADOR
          if (analisis.quintetos) {
            analisis.quintetos.forEach(q => {
              // Verificamos si nuestro jugador está en este quinteto
              if (q.ids.some(id => id == jugadorId)) {
                const key = [...q.ids].sort().join('-');
                if (!quintetosAgregados[key]) {
                  quintetosAgregados[key] = {
                    ids: q.ids,
                    golesFavor: 0, golesContra: 0,
                    rematesFavor: 0, rematesContra: 0,
                    recuperaciones: 0, perdidas: 0,
                    minutos: 0
                  };
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
      });

      const cadenas = calcularCadenasValor(posesionesTotales, jugadorId);
      xgBuildup = cadenas.xgBuildup;
    }

    // Calcular Rating de cada quinteto y sacar el Mejor Quinteto Estructural
    const quintetosFinales = Object.values(quintetosAgregados).map(q => {
      const rating = calcularRatingQuintetoAvanzado(q);
      const diffGoles = q.golesFavor - q.golesContra;
      return { ...q, rating, diffGoles };
    }).filter(q => q.rating !== '-'); // Excluir los que no cumplen el mínimo de tiempo/volumen

    quintetosFinales.sort((a, b) => b.rating - a.rating);
    const mejorQuinteto = quintetosFinales.length > 0 ? quintetosFinales[0] : null;

    const eficacia = stats.remates > 0 ? ((stats.goles / stats.remates) * 100).toFixed(0) : 0;
    const volumenAcciones = stats.recuperaciones + stats.perdidas;
    const ratioSeguridad = volumenAcciones > 0 ? ((stats.recuperaciones / volumenAcciones) * 100).toFixed(0) : 0;
    const proxyPM = (stats.goles + stats.asistencias) - (stats.perdidasPeligrosas * 1.5);
    const impacto = calcularRatingJugador(jugadorSeleccionado, evFiltrados, proxyPM);

    let rol = 'MIXTO';
    const ratioFinalizacion = stats.remates / (xgBuildup || 1);
    if (ratioFinalizacion >= 2.5 && stats.goles > 0) rol = 'FINALIZADOR';
    else if (xgBuildup >= 0.5 && ratioFinalizacion < 1.5) rol = 'GENERADOR';
    else if (stats.duelosDefTotales > 5 && (stats.duelosDefGanados / stats.duelosDefTotales) >= 0.7 && stats.remates <= 3) rol = 'MURO DEFENSIVO';
    else if (stats.asistencias >= 2 && stats.xG < 0.5) rol = 'CREADOR';
    else if (stats.recAltas >= 3) rol = 'PRESIÓN ALTA';

    const norm = (val, max) => Math.min(100, Math.max(0, (val / max) * 100));
    const p40 = minutos > 0 ? (40 / minutos) : 0;

    const dataRadar = [
      { subject: 'Ataque', A: norm((stats.remates * p40 * 2) + (stats.goles * p40 * 5) + (stats.xG * p40 * 10), 25) },
      { subject: 'Defensa', A: norm((stats.recuperaciones * p40 * 2) + (stats.duelosDefGanados * p40 * 3), 30) },
      { subject: 'Creación', A: norm((stats.asistencias * p40 * 10) + (xgBuildup * p40 * 20), 25) },
      { subject: 'Posesión', A: norm(100 - (stats.perdidas * p40 * 2) - (stats.perdidasPeligrosas * p40 * 5), 100) },
      { subject: 'Físico', A: norm((stats.recuperaciones + stats.duelosOfeTotales + stats.duelosDefTotales) * p40, 40) }
    ];

    const dataTortaRemates = Object.keys(resultadosRemates)
      .filter(k => resultadosRemates[k] > 0)
      .map(k => ({ name: k, value: resultadosRemates[k] }));

    return { 
      stats, evFiltrados, accionesDirectas, partidosJugados, 
      eficacia, ratioSeguridad, impacto, dataTortaRemates, perfilRemate,
      xgBuildup, plusMinus, minutos, transicionesInvolucrado, rol, dataRadar, topSocios,
      mejorQuinteto,
      vacio: false 
    };
  }, [eventos, eventosCompletos, partidoFiltro, jugadorId, jugadorSeleccionado, partidos, jugadores]);

  const evMapa = useMemo(() => {
    if (!perfil || perfil.vacio) return [];
    return perfil.accionesDirectas.filter(ev => {
      if (filtroAccionMapa === 'Todas') return true;
      if (filtroAccionMapa === 'Gol' && (ev.accion === 'Gol' || ev.accion === 'Remate - Gol')) return true;
      return ev.accion?.includes(filtroAccionMapa);
    });
  }, [perfil, filtroAccionMapa]);

  useEffect(() => {
    if (tipoMapa !== 'calor' || !heatmapRef.current || !evMapa.length) return;
    const canvas = heatmapRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const dataPoints = evMapa
      .filter(ev => (ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x) != null)
      .map(ev => {
        const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
        const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
        return [ (x / 100) * canvas.width, (y / 100) * canvas.height, 1 ];
      });
      
    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(35, 25); 
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    const dynamicMax = Math.max(3, Math.floor(dataPoints.length / 5));
    heat.max(dynamicMax); 
    heat.draw();
  }, [evMapa, tipoMapa]);

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
        arrayFiltro = wellnessJugador.filter(w => {
          const wd = new Date(w.fecha);
          return wd >= dInicio && wd <= dFin;
        });
      }
    }
    if (arrayFiltro.length === 0) return null;
    const readSum = arrayFiltro.reduce((a,b) => a + (b.readiness_score || 0), 0);
    const readValidCount = arrayFiltro.filter(w => w.readiness_score).length;
    const rpeSum = arrayFiltro.reduce((a,b) => a + (b.rpe || 0), 0);
    const rpeValidCount = arrayFiltro.filter(w => w.rpe).length;

    return {
      avgReadiness: readValidCount > 0 ? Math.round(readSum / readValidCount) : 'S/D',
      avgRPE: rpeValidCount > 0 ? (rpeSum / rpeValidCount).toFixed(1) : 'S/D',
      cargaAguda: arrayFiltro.reduce((a,b) => a + (b.carga_diaria || 0), 0)
    };
  }, [wellnessJugador, partidoFiltro, partidos]);

  const COLORS_REMATES = { 'Gol': '#00ff88', 'Atajado': '#3b82f6', 'Desviado': '#888888', 'Rebatido': '#a855f7' };

  if (cargandoAuth) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>Verificando permisos...</div>;
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
      return (
        <div style={{ animation: 'fadeIn 0.3s' }}>
          <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>DIRECTORIO DE PLANTEL</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un jugador para ver su analítica completa y sus mapas de influencia.</div>
            </div>
            <div style={{ width: esMovil ? '100%' : 'auto' }}>
              <div className="stat-label">FILTRAR POR CATEGORÍA</div>
              <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '100%', minWidth: '200px', background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333', outline: 'none' }}>
                <option value="Todas">TODAS LAS CATEGORÍAS</option>
                {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {jugadoresGrid.map(j => (
              <div key={j.id} className="bento-card player-card" onClick={() => setJugadorId(j.id)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}>
                <div style={{ position: 'absolute', right: '-10px', top: '-20px', fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }}>{j.dorsal}</div>
                
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '15px' }}>
                  {j.foto ? <img src={j.foto} alt="Foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <>{j.apellido ? j.apellido.charAt(0) : ''}{j.nombre ? j.nombre.charAt(0) : ''}</>}
                </div>
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{j.apellido || '-'}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>{j.nombre || '-'}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '15px', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                  <span style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{j.posicion || 'S/P'}</span>
                  <span style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>#{j.dorsal}</span>
                </div>
              </div>
            ))}
          </div>
          <style>{`.player-card:hover { transform: translateY(-5px); border-color: var(--accent); }`}</style>
        </div>
      );
  }

  const factor40 = perfil?.minutos > 0 ? (40 / perfil.minutos) : 1;

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap', width: esMovil ? '100%' : 'auto' }}>
          {!isKiosco && (
            <button onClick={() => setJugadorId('')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flex: esMovil ? '1 1 auto' : 'none' }}>⬅ VOLVER</button>
          )}
          {jugadorId && (
            <div style={{ flex: esMovil ? '1 1 100%' : 'auto' }}>
              <div className="stat-label">CONTEXTO / PARTIDO</div>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ marginTop: '5px', width: '100%', minWidth: '250px', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '8px', borderRadius: '4px', outline: 'none' }}>
                <option value="Todos">TODA LA TEMPORADA</option>
                {partidos.map(p => <option key={p.id} value={p.id}>{p.rival.toUpperCase()} // {p.fecha}</option>)}
              </select>
            </div>
          )}
        </div>

        {jugadorId && perfil && !perfil.vacio && (
          <button onClick={() => setMostrarReporte(true)} className="btn-action" style={{ width: esMovil ? '100%' : 'auto' }}>
            EXPORTAR REPORTE PREMIUM
          </button>
        )}
      </div>

      {perfil?.vacio && <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>El jugador no tiene datos registrados en este filtro.</div>}

      {jugadorSeleccionado && perfil && !perfil.vacio && (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* HEADER JUGADOR */}
          <div className="bento-card" style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', alignItems: 'center', gap: '30px', background: 'linear-gradient(90deg, #111 0%, #000 100%)', borderLeft: '4px solid var(--accent)', flexWrap: 'wrap', textAlign: esMovil ? 'center' : 'left' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                {jugadorSeleccionado.foto ? <img src={jugadorSeleccionado.foto} alt="Foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <>{jugadorSeleccionado.apellido ? jugadorSeleccionado.apellido.charAt(0) : ''}{jugadorSeleccionado.nombre ? jugadorSeleccionado.nombre.charAt(0) : ''}</>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: esMovil ? 'center' : 'flex-start' }}>
              <div style={{ fontSize: esMovil ? '2rem' : '2.5rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1, display: 'flex', flexDirection: esMovil ? 'column' : 'row', alignItems: 'center', gap: '15px' }}>
                {jugadorSeleccionado.apellido}
                <span style={{ background: 'var(--accent)', color: '#000', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '1px' }}>
                  {perfil.rol}
                </span>
              </div>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', marginTop: '5px' }}>{jugadorSeleccionado.nombre} <span className="mono-accent" style={{marginLeft: '10px'}}>#{jugadorSeleccionado.dorsal}</span></div>
            </div>
            <div style={{ marginLeft: esMovil ? '0' : 'auto', display: 'flex', gap: '25px', flexWrap: 'wrap', justifyContent: 'center', width: esMovil ? '100%' : 'auto', borderTop: esMovil ? '1px solid #333' : 'none', paddingTop: esMovil ? '15px' : '0' }}>
               <div style={{ textAlign: 'center' }}>
                 <div className="stat-label">+/-</div>
                 <div className="stat-value" style={{ fontSize: '1.5rem', color: perfil.plusMinus > 0 ? 'var(--accent)' : (perfil.plusMinus < 0 ? '#ef4444' : '#fff') }}>
                   {perfil.plusMinus > 0 ? '+' : ''}{perfil.plusMinus}
                 </div>
               </div>
               <div style={{ textAlign: 'center' }}>
                 <div className="stat-label">MINUTOS</div><div className="stat-value" style={{ fontSize: '1.5rem' }}>{perfil.minutos}'</div>
               </div>
               <div style={{ textAlign: 'center' }}>
                 <div className="stat-label">PARTIDOS</div><div className="stat-value" style={{ fontSize: '1.5rem', color: '#0ea5e9' }}>{perfil.partidosJugados}</div>
               </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">IMPACTO (RATING)</div>
                <div className="stat-value" style={{ color: perfil.impacto > 0 ? 'var(--accent)' : '#ef4444' }}>{perfil.impacto > 0 ? '+' : ''}{perfil.impacto.toFixed(1)}</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">xG BUILDUP <InfoBox texto="Valor que aporta el jugador en la gestación de jugadas que terminan en remate (sin contar tiro ni asistencia)." /></div>
                <div className="stat-value" style={{ color: '#c084fc' }}>{perfil.xgBuildup.toFixed(2)}</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">EFICACIA EN REMATES</div>
                <div className="stat-value" style={{ color: perfil.eficacia >= 15 ? 'var(--accent)' : '#fff' }}>{perfil.eficacia}%</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">RATIO DEFENSIVO <InfoBox texto="Porcentaje de recuperaciones sobre el total de acciones defensivas y pérdidas." /></div>
                <div className="stat-value" style={{ color: perfil.ratioSeguridad > 50 ? '#10b981' : '#ef4444' }}>{perfil.ratioSeguridad}%</div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1.5fr 1fr', gap: '20px' }}>
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="stat-label" style={{ marginBottom: '10px', color: 'var(--accent)', alignSelf: 'flex-start' }}>PERFIL DE RENDIMIENTO (TELA DE ARAÑA)</div>
                <div style={{ width: '100%', height: '280px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={perfil.dataRadar}>
                      <PolarGrid stroke="#333" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 12, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name={jugadorSeleccionado.apellido} dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.5} isAnimationActive={false} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
            </div>

            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="stat-label" style={{ marginBottom: '15px', color: '#facc15' }}>DISCIPLINA Y CONDUCTA</div>
                
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '20px', background: '#0a0a0a', padding: '15px', borderRadius: '10px', border: '1px solid #222' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '30px', height: '45px', background: '#facc15', borderRadius: '4px', margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{perfil.stats.amarillas}</div>
                    </div>
                    <div style={{ width: '1px', background: '#333' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '30px', height: '45px', background: '#ef4444', borderRadius: '4px', margin: '0 auto 8px' }} />
                        <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{perfil.stats.rojas}</div>
                    </div>
                </div>

                <div style={kpiFila}>
                  <span style={{color: '#888'}}>Faltas Cometidas</span>
                  <strong>{perfil.stats.faltasCometidas} <span style={{fontSize:'0.7rem', color:'#555'}}>({(perfil.stats.faltasCometidas * factor40).toFixed(1)} p40)</span></strong>
                </div>
                <div style={kpiFila}>
                  <span style={{color: '#888'}}>Faltas Recibidas</span>
                  <strong>{perfil.stats.faltasRecibidas} <span style={{fontSize:'0.7rem', color:'#555'}}>({(perfil.stats.faltasRecibidas * factor40).toFixed(1)} p40)</span></strong>
                </div>
            </div>
          </div>

          {metricasWellness && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #3b82f6' }}>
              <div className="stat-label" style={{ color: '#3b82f6', marginBottom: '15px' }}>
                🩺 WELLNESS {partidoFiltro === 'Todos' ? '(PROMEDIO ACTUAL)' : '(PROMEDIO SEMANA PREVIA AL PARTIDO)'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1fr 1fr', gap: '20px', textAlign: 'center' }}>
                <div style={{ paddingBottom: esMovil ? '15px' : '0', borderBottom: esMovil ? '1px solid #222' : 'none' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>READINESS PRE-ENTRENO</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: metricasWellness.avgReadiness >= 80 ? '#10b981' : metricasWellness.avgReadiness >= 60 ? '#eab308' : '#ef4444' }}>
                    {metricasWellness.avgReadiness !== 'S/D' ? `${metricasWellness.avgReadiness}/100` : 'S/D'}
                  </div>
                </div>
                <div style={{ borderLeft: esMovil ? 'none' : '1px solid #222', borderRight: esMovil ? 'none' : '1px solid #222', paddingBottom: esMovil ? '15px' : '0', borderBottom: esMovil ? '1px solid #222' : 'none' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>RPE (ESFUERZO) POST-ENTRENO</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: metricasWellness.avgRPE >= 8 ? '#ef4444' : '#eab308' }}>
                    {metricasWellness.avgRPE !== 'S/D' ? `${metricasWellness.avgRPE}/10` : 'S/D'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>CARGA TOTAL ACUMULADA</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: '#3b82f6' }}>
                    {metricasWellness.cargaAguda} UC
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>RADIOGRAFÍA OFENSIVA</div>
              <div style={kpiFila}><span>EXPECTATIVA DE GOL (xG)</span><strong>{perfil.stats.xG.toFixed(2)}</strong></div>
              <div style={kpiFila}><span>ASISTENCIAS A GOL</span><strong style={{color:'var(--accent)'}}>{perfil.stats.asistencias}</strong></div>
              <div style={kpiFila}><span>REMATES TOTALES</span><strong>{perfil.stats.remates} <span style={{fontSize:'0.7rem', color:'#555'}}>({(perfil.stats.remates * factor40).toFixed(1)} p40)</span></strong></div>
              
              <div style={kpiFila}>
                <span>DUELOS OFE. GANADOS</span>
                <strong>
                  {perfil.stats.duelosOfeGanados} / {perfil.stats.duelosOfeTotales} 
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({perfil.stats.duelosOfeTotales > 0 ? ((perfil.stats.duelosOfeGanados / perfil.stats.duelosOfeTotales) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
              <div style={kpiFila}><span>DUELOS OFE. PERDIDOS</span><strong style={{color: '#ef4444'}}>{perfil.stats.duelosOfePerdidos}</strong></div>
            </div>
            
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: '#ef4444' }}>RADIOGRAFIA DEFENSIVA</div>
              <div style={kpiFila}><span>RECUPERACIONES TOTALES</span><strong style={{color: 'var(--accent)'}}>{perfil.stats.recuperaciones} <span style={{fontSize:'0.7rem', color:'#555'}}>({(perfil.stats.recuperaciones * factor40).toFixed(1)} p40)</span></strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Presión Alta (Campo Rival)</span><strong style={{color:'#eab308'}}>{perfil.stats.recAltas}</strong></div>
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{perfil.stats.perdidas}</strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Peligrosas (En salida)</span><strong style={{color:'#ef4444'}}>{perfil.stats.perdidasPeligrosas}</strong></div>
              
              <div style={kpiFila}>
                <span>DUELOS DEF. GANADOS</span>
                <strong>
                  {perfil.stats.duelosDefGanados} / {perfil.stats.duelosDefTotales} 
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({perfil.stats.duelosDefTotales > 0 ? ((perfil.stats.duelosDefGanados / perfil.stats.duelosDefTotales) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
              <div style={kpiFila}><span>DUELOS DEF. PERDIDOS</span><strong style={{color: '#ef4444'}}>{perfil.stats.duelosDefPerdidos}</strong></div>
            </div>

            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#c084fc' }}>PERFIL DE REMATE Y TRANSICIONES</div>
              
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center', marginBottom: '15px' }}>
                 <div style={{...zonePill, background: 'rgba(192, 132, 252, 0.1)'}}>ZONA CENTRAL<br/><strong style={{color:'#c084fc', fontSize:'1.2rem'}}>{perfil.perfilRemate.centro}</strong></div>
                 <div style={{...zonePill, background: 'rgba(255,255,255,0.05)'}}>POR BANDAS<br/><strong style={{color:'#fff', fontSize:'1.2rem'}}>{perfil.perfilRemate.banda}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center', marginBottom: '15px' }}>
                 <div style={{...zonePill, background: 'rgba(0, 255, 136, 0.1)'}}>CERCANOS<br/><strong style={{color:'#00ff88', fontSize:'1.2rem'}}>{perfil.perfilRemate.cerca}</strong></div>
                 <div style={{...zonePill, background: 'rgba(239, 68, 68, 0.1)'}}>MEDIA DISTANCIA<br/><strong style={{color:'#ef4444', fontSize:'1.2rem'}}>{perfil.perfilRemate.lejos}</strong></div>
              </div>

              <div style={{ ...kpiFila, marginTop: 'auto', borderTop: '1px solid #222', paddingTop: '15px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  TRANSICIONES FINALIZADAS 
                  <InfoBox texto="Cantidad de contraataques finalizados en tiro donde el jugador recuperó la pelota o ejecutó el remate." />
                </span>
                <strong style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>{perfil.transicionesInvolucrado}</strong>
              </div>
            </div>

            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#3b82f6' }}>DESTINO DE SUS REMATES</div>
              <div style={{ flex: 1, minHeight: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {perfil.dataTortaRemates && perfil.dataTortaRemates.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={perfil.dataTortaRemates} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                        {perfil.dataTortaRemates.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS_REMATES[entry.name] || '#8884d8'} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }} itemStyle={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem', paddingTop: '10px' }} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No hay remates registrados.</div>
                )}
              </div>
            </div>

          </div>

          {/* 🌟 NUEVA SECCIÓN: QUÍMICA Y SOCIEDADES 🌟 */}
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr 1.5fr', gap: '20px' }}>
            
            {/* CONEXIONES DIRECTAS (Mejores Socios Antiguo) */}
            <div className="bento-card" style={{ borderTop: '3px solid #facc15' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#facc15' }}>MEJORES SOCIOS (ASISTENCIAS) <InfoBox texto="Jugadores que más se asociaron con él para generar un gol directo." /></div>
              {perfil.topSocios.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {perfil.topSocios.map((socio, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px', borderRadius: '6px', border: '1px solid #222' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#222', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff' }}>
                           {socio.apellido ? socio.apellido.charAt(0) : ''}{socio.nombre ? socio.nombre.charAt(0) : ''}
                        </div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{socio.apellido ? socio.apellido.toUpperCase() : socio.nombre.toUpperCase()}</span>
                      </div>
                      <div style={{ fontWeight: 900, color: '#facc15' }}>{socio.conexiones} G</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>No hay conexiones directas de gol suficientes.</div>
              )}
            </div>

            {/* QUINTETO IDEAL ESTRUCTURAL */}
            <div className="bento-card" style={{ borderTop: '3px solid var(--accent)' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>SU QUINTETO IDEAL <InfoBox texto="La alineación de 5 con la que el equipo sacó el mejor Rating Avanzado cuando él estuvo en cancha." /></div>
              {perfil.mejorQuinteto ? (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
                    {perfil.mejorQuinteto.ids.map(id => {
                       const j = jugadores.find(jug => jug.id == id);
                       const esElJugador = id == jugadorId;
                       return j ? (
                         <div key={id} style={{ 
                           background: esElJugador ? 'var(--accent)' : '#111', 
                           color: esElJugador ? '#000' : '#fff',
                           border: `1px solid ${esElJugador ? 'var(--accent)' : '#333'}`,
                           padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800,
                           display: 'flex', alignItems: 'center', gap: '5px'
                         }}>
                           <span className="mono-accent" style={{ opacity: esElJugador ? 1 : 0.5 }}>{j.dorsal}</span> 
                           {j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}
                         </div>
                       ) : null;
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', background: '#0a0a0a', padding: '15px', borderRadius: '6px', border: '1px solid #222' }}>
                    <div style={{ textAlign: 'center', borderRight: '1px solid #333' }}>
                       <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px' }}>RATING ESTRUC.</div>
                       <strong style={{ fontSize: '1.2rem', color: perfil.mejorQuinteto.rating >= 6.0 ? 'var(--accent)' : '#ef4444' }}>{perfil.mejorQuinteto.rating.toFixed(1)}</strong>
                    </div>
                    <div style={{ textAlign: 'center', borderRight: '1px solid #333' }}>
                       <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px' }}>+/- GOLES</div>
                       <strong style={{ fontSize: '1.2rem', color: perfil.mejorQuinteto.diffGoles > 0 ? 'var(--accent)' : '#fff' }}>{perfil.mejorQuinteto.diffGoles > 0 ? '+' : ''}{perfil.mejorQuinteto.diffGoles}</strong>
                    </div>
                    <div style={{ textAlign: 'center', borderRight: '1px solid #333' }}>
                       <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px' }}>REMATES</div>
                       <strong style={{ fontSize: '1.2rem', color: '#3b82f6' }}>{perfil.mejorQuinteto.rematesFavor} - {perfil.mejorQuinteto.rematesContra}</strong>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px' }}>MINUTOS</div>
                       <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{perfil.mejorQuinteto.minutos.toFixed(0)}'</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>No hay suficientes datos de rotaciones para evaluar un quinteto estructural.</div>
              )}
            </div>
            
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', justifyContent: 'space-between', alignItems: esMovil ? 'flex-start' : 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>MAPA DE INFLUENCIA INDIVIDUAL</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '5px' }}>
                  Zonas donde {jugadorSeleccionado.apellido} interviene. (Ataque de izquierda a derecha).
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: esMovil ? '100%' : 'auto' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '8px', flex: esMovil ? '1 1 100%' : 'auto', fontSize: '0.8rem', background: '#111', color: '#fff', border: '1px solid var(--border)', outline: 'none', borderRadius: '4px' }}>
                  <option value="Todas" style={{ background: '#111', color: '#fff' }}>TODAS SUS ACCIONES</option>
                  <option value="Gol" style={{ background: '#111', color: '#fff' }}>SOLO GOLES</option>
                  <option value="Remate" style={{ background: '#111', color: '#fff' }}>SOLO REMATES</option>
                  <option value="Recuperación" style={{ background: '#111', color: '#fff' }}>SOLO RECUPERACIONES</option>
                  <option value="Pérdida" style={{ background: '#111', color: '#fff' }}>SOLO PÉRDIDAS</option>
                  <option value="Duelo" style={{ background: '#111', color: '#fff' }}>SOLO DUELOS</option>
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)', flex: esMovil ? '1 1 100%' : 'auto' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, flex: 1, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>📍 PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, flex: 1, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>🔥 CALOR</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '800px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative', background: '#111', border: '2px solid rgba(255,255,255,0.2)' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: 'rgba(255,255,255,0.2)', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>

                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.2)', borderLeft: 'none', borderRadius: '0 100px 100px 0', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.2)', borderRight: 'none', borderRadius: '100px 0 0 100px', pointerEvents: 'none', zIndex: 0 }}></div>
                
                {tipoMapa === 'calor' && (
                  <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', opacity: 0.85 }} />
                )}

                {tipoMapa === 'puntos' && evMapa.map((ev, i) => {
                  const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
                  const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
                  if (xNorm == null || yNorm == null) return null;
                  
                  return (
                    <div 
                      key={ev.id || i} 
                      title={`${ev.accion}`}
                      style={{ 
                        position: 'absolute', left: `${xNorm}%`, top: `${yNorm}%`, width: '12px', height: '12px', 
                        backgroundColor: getColorAccion(ev.accion), 
                        border: '1px solid #000', borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.85, zIndex: 2,
                        boxShadow: '0 0 5px rgba(0,0,0,0.5)'
                      }} 
                    />
                  )
                })}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 🌟 OVERLAY DEL REPORTE PARA EXPORTAR 🌟 */}
      {mostrarReporte && jugadorSeleccionado && perfil && !perfil.vacio && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.95)', zIndex: 9999, overflowY: 'auto', padding: esMovil ? '10px' : '20px'
        }}>
          <div style={{ textAlign: 'right', maxWidth: '1200px', margin: '0 auto' }}>
            <button 
              onClick={() => setMostrarReporte(false)} 
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px', marginBottom: '10px' }}
            >
              ✖
            </button>
          </div>
          
<PlayerReportGenerator 
  jugador={jugadorSeleccionado} 
  perfil={perfil} 
  wellness={metricasWellness}
  clubInfo={clubInfo}
  jugadores={jugadores}  // <--- ¡AGREGÁ ESTA LÍNEA ACÁ!
  contexto={
    partidoFiltro === 'Todos' 
      ? 'TODA LA TEMPORADA' 
      : (() => {
          const p = partidos.find(p => p.id == partidoFiltro);
          return p ? `VS ${p.rival.toUpperCase()} (${p.fecha})` : '';
        })()
  }
/>
        </div>
      )}

    </div>
  );
}

const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontSize: '0.9rem', alignItems: 'center' };
const kpiSubFila = { display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 15px', fontSize: '0.75rem', color: 'var(--text-dim)', alignItems: 'center' };
const zonePill = { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '10px 5px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default JugadorPerfil;