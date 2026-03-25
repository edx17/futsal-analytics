import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend 
} from 'recharts';

import { analizarPartido } from '../analytics/engine'; 
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';
import { calcularCadenasValor } from '../analytics/posesiones';
import InfoBox from '../components/InfoBox';
import { getColorAccion } from '../utils/helpers';

function JugadorPerfil() {
  const [userRol, setUserRol] = useState(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  
  const [eventos, setEventos] = useState([]);
  const [eventosCompletos, setEventosCompletos] = useState([]);
  
  const [wellnessJugador, setWellnessJugador] = useState([]);
  
  const isKiosco = !!localStorage.getItem('kiosco_jugador_id'); // <-- CONTROL DE KIOSCO AÑADIDO
  const [jugadorId, setJugadorId] = useState(localStorage.getItem('kiosco_jugador_id') || ''); // <-- VA DIRECTO AL PERFIL DEL JUGADOR
  
  const [partidoFiltro, setPartidoFiltro] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('calor');
  const [filtroAccionMapa, setFiltroAccionMapa] = useState('Todas');
  
  const [filtroCategoriaGrid, setFiltroCategoriaGrid] = useState('Todas');

  const heatmapRef = useRef(null);

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
          const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
          if (perfil) {
            setUserRol(perfil.rol);
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
      const { data: j } = await supabase.from('jugadores').select('*').order('dorsal');
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
      duelosOfeGanados: 0, duelosOfePerdidos: 0, duelosOfeTotales: 0
    };
    
    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;
    const resultadosRemates = { Gol: 0, Atajado: 0, Desviado: 0, Rebatido: 0 };
    const accionesDirectas = []; 
    const perfilRemate = { centro: 0, banda: 0, cerca: 0, lejos: 0 };

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const zonaY = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
      const esAtaque = zonaX > 66;
      const esDefensa = zonaX < 33;

      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) {
        stats.asistencias++;
      }

      if (ev.id_jugador == jugadorId) {
        accionesDirectas.push(ev); 
        const xgEvento = calcularXGEvento(ev);

        if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { stats.goles++; stats.remates++; stats.xG += xgEvento; resultadosRemates.Gol++; }
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
        else if (ev.accion === 'Falta cometida') { stats.faltas++; }
        else if (ev.accion === 'Duelo DEF Ganado') { stats.duelosDefGanados++; stats.duelosDefTotales++; }
        else if (ev.accion === 'Duelo DEF Perdido') { stats.duelosDefPerdidos++; stats.duelosDefTotales++; }
        else if (ev.accion === 'Duelo OFE Ganado') { stats.duelosOfeGanados++; stats.duelosOfeTotales++; }
        else if (ev.accion === 'Duelo OFE Perdido') { stats.duelosOfePerdidos++; stats.duelosOfeTotales++; }
      }
    });

    let xgBuildup = 0;
    let plusMinus = 0;
    let minutos = 0;
    let transicionesInvolucrado = 0;

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
        }
      });

      const cadenas = calcularCadenasValor(posesionesTotales, jugadorId);
      xgBuildup = cadenas.xgBuildup;
    }

    const eficacia = stats.remates > 0 ? ((stats.goles / stats.remates) * 100).toFixed(0) : 0;
    const volumenAcciones = stats.recuperaciones + stats.perdidas;
    const ratioSeguridad = volumenAcciones > 0 ? ((stats.recuperaciones / volumenAcciones) * 100).toFixed(0) : 0;
    const proxyPM = (stats.goles + stats.asistencias) - (stats.perdidasPeligrosas * 1.5);
    const impacto = calcularRatingJugador(jugadorSeleccionado, evFiltrados, proxyPM);

    let rol = 'MIXTO';
    const ratioFinalizacion = stats.remates / (xgBuildup || 1);
    if (ratioFinalizacion >= 2.5) rol = 'FINALIZADOR';
    else if (xgBuildup >= 0.5 && ratioFinalizacion < 1.5) rol = 'GENERADOR';
    if (stats.duelosDefTotales > 5 && (stats.duelosDefGanados / stats.duelosDefTotales) >= 0.7 && stats.remates <= 3) rol = 'MURO DEFENSIVO';
    if (stats.asistencias >= 2 && stats.xG < 0.5) rol = 'CREADOR';

    const dataTortaRemates = Object.keys(resultadosRemates)
      .filter(k => resultadosRemates[k] > 0)
      .map(k => ({ name: k, value: resultadosRemates[k] }));

    return { 
      stats, evFiltrados, accionesDirectas, partidosJugados, 
      eficacia, ratioSeguridad, impacto, dataTortaRemates, perfilRemate,
      xgBuildup, plusMinus, minutos, transicionesInvolucrado, rol,
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>DIRECTORIO DE PLANTEL</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un jugador para ver su analítica completa y sus mapas de influencia.</div>
            </div>
            <div>
              <div className="stat-label">FILTRAR POR CATEGORÍA</div>
              <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '200px', background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333', outline: 'none' }}>
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
                  <span style={{ background: '#222', color: '#aaa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>#{j.dorsal}</span>
                </div>
              </div>
            ))}
          </div>
          <style>{`.player-card:hover { transform: translateY(-5px); border-color: var(--accent); }`}</style>
        </div>
      );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {!isKiosco && (
            <button onClick={() => setJugadorId('')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>⬅ VOLVER AL PLANTEL</button>
          )}
          {jugadorId && (
            <div>
              <div className="stat-label">CONTEXTO / PARTIDO</div>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ marginTop: '5px', width: '250px', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '8px', borderRadius: '4px', outline: 'none' }}>
                <option value="Todos">TODA LA TEMPORADA</option>
                {partidos.map(p => <option key={p.id} value={p.id}>{p.rival.toUpperCase()} // {p.fecha}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {perfil?.vacio && <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>El jugador no tiene datos registrados en este filtro.</div>}

      {jugadorSeleccionado && perfil && !perfil.vacio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* HEADER JUGADOR */}
          <div className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: '30px', background: 'linear-gradient(90deg, #111 0%, #000 100%)', borderLeft: '4px solid var(--accent)', flexWrap: 'wrap' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                {jugadorSeleccionado.foto ? <img src={jugadorSeleccionado.foto} alt="Foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <>{jugadorSeleccionado.apellido ? jugadorSeleccionado.apellido.charAt(0) : ''}{jugadorSeleccionado.nombre ? jugadorSeleccionado.nombre.charAt(0) : ''}</>}
            </div>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                {jugadorSeleccionado.apellido}
                <span style={{ background: 'var(--accent)', color: '#000', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 900, letterSpacing: '1px' }}>
                  {perfil.rol}
                </span>
              </div>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', marginTop: '5px' }}>{jugadorSeleccionado.nombre} <span className="mono-accent" style={{marginLeft: '10px'}}>#{jugadorSeleccionado.dorsal}</span></div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
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

          {metricasWellness && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #3b82f6' }}>
              <div className="stat-label" style={{ color: '#3b82f6', marginBottom: '15px' }}>
                🩺 WELLNESS {partidoFiltro === 'Todos' ? '(PROMEDIO ACTUAL)' : '(PROMEDIO SEMANA PREVIA AL PARTIDO)'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>READINESS PRE-ENTRENO</div>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: metricasWellness.avgReadiness >= 80 ? '#10b981' : metricasWellness.avgReadiness >= 60 ? '#eab308' : '#ef4444' }}>
                    {metricasWellness.avgReadiness !== 'S/D' ? `${metricasWellness.avgReadiness}/100` : 'S/D'}
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid #222', borderRight: '1px solid #222' }}>
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
              <div style={kpiFila}><span>REMATES TOTALES</span><strong>{perfil.stats.remates}</strong></div>
              
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
              <div style={kpiFila}><span>RECUPERACIONES TOTALES</span><strong style={{color: 'var(--accent)'}}>{perfil.stats.recuperaciones}</strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Presión Alta (Campo Rival)</span><strong style={{color:'#eab308'}}>{perfil.stats.recAltas}</strong></div>
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{perfil.stats.perdidas}</strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Peligrosas (En propia salida)</span><strong style={{color:'#ef4444'}}>{perfil.stats.perdidasPeligrosas}</strong></div>
              
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
                  TRANSICIONES LETALES 
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

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>MAPA DE INFLUENCIA INDIVIDUAL</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '5px' }}>
                  Zonas donde {jugadorSeleccionado.apellido} interviene. (Ataque de izquierda a derecha).
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} style={{ padding: '8px', fontSize: '0.8rem', background: '#111', color: '#fff', border: '1px solid var(--border)', outline: 'none', borderRadius: '4px' }}>
                  <option value="Todas" style={{ background: '#111', color: '#fff' }}>TODAS SUS ACCIONES</option>
                  <option value="Gol" style={{ background: '#111', color: '#fff' }}>SOLO GOLES</option>
                  <option value="Remate" style={{ background: '#111', color: '#fff' }}>SOLO REMATES</option>
                  <option value="Recuperación" style={{ background: '#111', color: '#fff' }}>SOLO RECUPERACIONES</option>
                  <option value="Pérdida" style={{ background: '#111', color: '#fff' }}>SOLO PÉRDIDAS</option>
                  <option value="Duelo" style={{ background: '#111', color: '#fff' }}>SOLO DUELOS</option>
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>📍 PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>🔥 CALOR</button>
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
    </div>
  );
}

const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontSize: '0.9rem', alignItems: 'center' };
const kpiSubFila = { display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 15px', fontSize: '0.75rem', color: 'var(--text-dim)', alignItems: 'center' };
const zonePill = { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '10px 5px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default JugadorPerfil;