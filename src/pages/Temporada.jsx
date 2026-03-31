import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase';
import simpleheat from 'simpleheat';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Legend, ScatterChart, Scatter, ZAxis, Label,
  PieChart, Pie, Cell, ComposedChart
} from 'recharts';

import { analizarTemporadaGlobal } from '../analytics/seasonEngine';
import InfoBox from '../components/InfoBox';
import { getColorAccion } from '../utils/helpers';
import ReportGenerator from '../components/ReportGenerator';

function Temporada() {
  const [partidos, setPartidos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroCompeticion, setFiltroCompeticion] = useState('Todas'); 
  const [filtroAccionMapa, setFiltroAccionMapa] = useState(''); 
  const [tipoMapa, setTipoMapa] = useState('calor'); 

  // 🌟 ESTADO PARA MOSTRAR/OCULTAR EL REPORTE 🌟
  const [mostrarReporte, setMostrarReporte] = useState(false);

  // --- ESTADO RESPONSIVE ---
  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);

  const heatmapRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    async function obtenerDatosGlobales() {
      const { data: p } = await supabase
        .from('partidos')
        .select('*')
        .in('estado', ['Finalizado', 'Jugado'])
        .order('fecha', { ascending: false });
        
      const { data: j } = await supabase.from('jugadores').select('*');
      
      const clubId = localStorage.getItem('club_id');
      let escudoMiClub = null;
      if (clubId) {
          const { data: c } = await supabase.from('clubes').select('escudo_url').eq('id', clubId).single();
          if (c) escudoMiClub = c.escudo_url;
      }
      
      const { data: r } = await supabase.from('rivales').select('id, escudo');

      const pConEscudos = (p || []).map(part => {
           const rivalInfo = (r || []).find(riv => riv.id === part.rival_id);
           return {
               ...part,
               escudo_propio: escudoMiClub,
               escudo_rival: part.escudo_rival || rivalInfo?.escudo || null
           };
      });

      let todosLosEventos = [];
      let start = 0;
      const step = 1000;

      while (true) {
        const { data: chunk, error } = await supabase
          .from('eventos')
          .select('*')
          .range(start, start + step - 1);
        
        if (error) {
          console.error("Error cargando eventos", error);
          break;
        }

        if (chunk && chunk.length > 0) {
          todosLosEventos = [...todosLosEventos, ...chunk];
          if (chunk.length < step) break; 
          start += step;
        } else {
          break;
        }
      }
      
      setPartidos(pConEscudos);
      setJugadores(j || []);
      setEventos(todosLosEventos);
    }
    obtenerDatosGlobales();
  }, []);

  const analiticaGlobal = useMemo(() => {
    const baseAnalytics = analizarTemporadaGlobal(partidos, eventos, jugadores, {
      categoria: filtroCategoria,
      competicion: filtroCompeticion
    });

    if (!baseAnalytics) return null;

    const abp = {
      corners: { favor: 0, contra: 0, rematesGenerados: 0 },
      laterales: { favor: 0, contra: 0, rematesGenerados: 0 },
      zonasLatFavor: { z1: 0, z2: 0, z3: 0, z4: 0 }
    };

    const statsAdicionales = {
      duelosOfeGanados: 0,
      duelosOfeTotales: 0,
      duelosDefGanados: 0,
      duelosDefTotales: 0,
      recuperaciones: 0,
      recuperacionesAltas: 0,
      perdidasPeligrosas: 0
    };

    const perfilRemate = { centro: 0, banda: 0, cerca: 0, lejos: 0 };
    const desgloseRemates = {
      propio: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0 },
      rival: { goles: 0, atajados: 0, desviados: 0, rebatidos: 0 }
    };

    const origenGoles = {
      'Ataque Posicional': 0, 'Contraataque': 0, 'Recuperación Alta': 0, 'Error No Forzado': 0,
      'Córner': 0, 'Lateral': 0, 'Tiro Libre': 0, 'Penal / Sexta Falta': 0, 'No Especificado': 0
    };
    
    const origenGolesRival = {
      'Ataque Posicional': 0, 'Contraataque': 0, 'Recuperación Alta': 0, 'Error No Forzado': 0,
      'Córner': 0, 'Lateral': 0, 'Tiro Libre': 0, 'Penal / Sexta Falta': 0, 'No Especificado': 0
    };

    let accionesCampoRival = 0;
    let totalAccionesPropias = 0;
    let rematesPropiosTotales = 0;
    let golesPropiosTotales = 0;
    let golesRivalesTotales = 0;

    baseAnalytics.evFiltrados.forEach((ev, i) => {
      const p = ev.equipo === 'Propio';
      
      const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
      
      if (p) {
        totalAccionesPropias++;
        if (xNorm > 50) accionesCampoRival++;

        if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
          rematesPropiosTotales++;
          if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
              golesPropiosTotales++;
              
              const origen = ev.origen_gol || 'No Especificado';
              if (origenGoles[origen] !== undefined) {
                origenGoles[origen]++;
              } else {
                origenGoles['No Especificado']++;
              }
          }

          if (yNorm > 35 && yNorm < 65) perfilRemate.centro++;
          else perfilRemate.banda++;

          const dx = (100 - xNorm) * 0.4;
          const dy = Math.abs(50 - yNorm) * 0.2;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 8) perfilRemate.cerca++;
          else perfilRemate.lejos++;
        }

        if (ev.accion === 'Pérdida') { 
          for(let j=1; j<=3 && i+j < baseAnalytics.evFiltrados.length; j++) {
              if (baseAnalytics.evFiltrados[i+j].id_partido === ev.id_partido) {
                  if (baseAnalytics.evFiltrados[i+j].equipo === 'Rival' && baseAnalytics.evFiltrados[i+j].accion?.includes('Remate')) {
                      statsAdicionales.perdidasPeligrosas++;
                      break;
                  }
              } else break;
          }
        }
        else if (ev.accion === 'Recuperación') { 
          statsAdicionales.recuperaciones++; 
          if (xNorm > 66) statsAdicionales.recuperacionesAltas++;
        }
        else if (ev.accion === 'Duelo OFE Ganado') { statsAdicionales.duelosOfeGanados++; statsAdicionales.duelosOfeTotales++; }
        else if (ev.accion === 'Duelo OFE Perdido') { statsAdicionales.duelosOfeTotales++; }
        else if (ev.accion === 'Duelo DEF Ganado') { statsAdicionales.duelosDefGanados++; statsAdicionales.duelosDefTotales++; }
        else if (ev.accion === 'Duelo DEF Perdido') { statsAdicionales.duelosDefTotales++; }
      } else {
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
           golesRivalesTotales++;
           const origen = ev.origen_gol || 'No Especificado';
           if (origenGolesRival[origen] !== undefined) {
             origenGolesRival[origen]++;
           } else {
             origenGolesRival['No Especificado']++;
           }
        }
      }

      if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') {
        p ? desgloseRemates.propio.goles++ : desgloseRemates.rival.goles++;
      } else if (ev.accion === 'Remate - Atajado') {
        p ? desgloseRemates.propio.atajados++ : desgloseRemates.rival.atajados++;
      } else if (ev.accion === 'Remate - Desviado') {
        p ? desgloseRemates.propio.desviados++ : desgloseRemates.rival.desviados++;
      } else if (ev.accion === 'Remate - Rebatido') {
        p ? desgloseRemates.propio.rebatidos++ : desgloseRemates.rival.rebatidos++;
      }

      if (ev.accion === 'Córner') {
        if (p) {
          abp.corners.favor++;
          for(let j=1; j<=2 && i+j < baseAnalytics.evFiltrados.length; j++) {
              if (baseAnalytics.evFiltrados[i+j].id_partido === ev.id_partido) {
                  if (baseAnalytics.evFiltrados[i+j].equipo === 'Propio' && baseAnalytics.evFiltrados[i+j].accion?.includes('Remate')) {
                      abp.corners.rematesGenerados++; break;
                  }
              } else break;
          }
        } else {
          abp.corners.contra++;
        }
      }
      if (ev.accion === 'Lateral') {
        if (p) {
          abp.laterales.favor++;
          if (xNorm < 25) abp.zonasLatFavor.z1++;
          else if (xNorm < 50) abp.zonasLatFavor.z2++;
          else if (xNorm < 75) abp.zonasLatFavor.z3++;
          else abp.zonasLatFavor.z4++;

          for(let j=1; j<=2 && i+j < baseAnalytics.evFiltrados.length; j++) {
            if (baseAnalytics.evFiltrados[i+j].id_partido === ev.id_partido) {
                if (baseAnalytics.evFiltrados[i+j].equipo === 'Propio' && baseAnalytics.evFiltrados[i+j].accion?.includes('Remate')) {
                    abp.laterales.rematesGenerados++; break;
                }
            } else break;
          }
        } else {
          abp.laterales.contra++;
        }
      }
    });

    const territoryPct = totalAccionesPropias > 0 ? ((accionesCampoRival / totalAccionesPropias) * 100).toFixed(0) : 50;

    const dataOrigenGol = Object.entries(origenGoles)
      .filter(([_, valor]) => valor > 0)
      .map(([nombre, valor]) => ({ name: nombre, value: valor }));
      
    const dataOrigenGolRival = Object.entries(origenGolesRival)
      .filter(([_, valor]) => valor > 0)
      .map(([nombre, valor]) => ({ name: nombre, value: valor }));

    return { 
      ...baseAnalytics, 
      abp, 
      statsAdicionales,
      perfilRemate, 
      desgloseRemates,
      territoryPct, 
      rematesPropiosTotales, 
      golesPropiosTotales,
      golesRivalesTotales,
      dataOrigenGol,
      dataOrigenGolRival
    };
  }, [partidos, eventos, jugadores, filtroCategoria, filtroCompeticion]);

  const evMapa = analiticaGlobal?.evFiltrados.filter(ev => {
    if (!filtroAccionMapa) return ev.equipo === 'Propio';
    
    if (filtroAccionMapa === 'Falta recibida') {
      return ev.equipo === 'Rival' && ev.accion === 'Falta cometida';
    }
    if (filtroAccionMapa === 'Gol') {
      return ev.equipo === 'Propio' && (ev.accion === 'Gol' || ev.accion === 'Remate - Gol');
    }
    
    return ev.equipo === 'Propio' && ev.accion?.includes(filtroAccionMapa);
  }) || [];

  useEffect(() => {
    if (tipoMapa !== 'calor') return;
    if (!heatmapRef.current) return;
    
    const canvas = heatmapRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!evMapa.length) return;

    const dataPoints = evMapa
      .filter(ev => (ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x) != null)
      .map(ev => {
        const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
        const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
        return [ (x / 100) * canvas.width, (y / 100) * canvas.height, 1 ];
      });

    const heat = simpleheat(canvas);
    heat.data(dataPoints);
    heat.radius(45, 30);
    heat.gradient({ 0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red' });
    const dynamicMax = Math.max(5, Math.floor(dataPoints.length / 15));
    heat.max(dynamicMax);
    heat.draw();
  }, [evMapa, tipoMapa]);

  const dataLineas = useMemo(() => {
    if (!analiticaGlobal) return [];
    return [...analiticaGlobal.historialPartidos].reverse().map(p => ({
      name: p.rival.substring(0, 10),
      xG: Number(p.xg.toFixed(2)),
      Goles: p.golesPropio
    }));
  }, [analiticaGlobal]);

  const dataRadar = useMemo(() => {
    if (!analiticaGlobal || analiticaGlobal.statsEquipo.partidosJugados === 0) return [];
    const stats = analiticaGlobal.statsEquipo;
    const pj = stats.partidosJugados;

    const ofensiva = Math.min(100, (stats.xgTotal / pj) * 25); 
    const solidez = 100 - Math.min(100, (stats.xgRival / pj) * 25); 
    const presion = Math.min(100, (stats.recuperacionesAltas / pj) * 20); 
    const friccion = stats.duelosDefTotales > 0 ? (stats.duelosDefGanados / stats.duelosDefTotales) * 100 : 0;
    const construccion = Math.min(100, (stats.asistenciasTotales / pj) * 30); 

    return [
      { subject: 'Ataque (xG)', A: ofensiva },
      { subject: 'Presión Alta', A: presion },
      { subject: 'Fricción (Duelos)', A: friccion },
      { subject: 'Construcción', A: construccion },
      { subject: 'Solidez Def.', A: solidez }
    ];
  }, [analiticaGlobal]);

  const dataDesgaste = useMemo(() => {
    if (!analiticaGlobal) return [];
    const s = analiticaGlobal.statsEquipo;
    return [
      { name: 'PRIMER TIEMPO', Anotados: s.golesFavorPT, Recibidos: s.golesContraPT },
      { name: 'SEGUNDO TIEMPO', Anotados: s.golesFavorST, Recibidos: s.golesContraST },
    ];
  }, [analiticaGlobal]);

  const dataCreacionFin = useMemo(() => {
    if (!analiticaGlobal || !analiticaGlobal.matrizTalento) return [];
    
    const dataLimpia = analiticaGlobal.matrizTalento
      .filter(j => j.creacion > 0 || j.finalizacion > 0)
      .map(j => ({
        nombre: j.nombre.substring(0, 10), 
        Creación: Number(j.creacion.toFixed(2)),
        Finalización: Number(j.finalizacion.toFixed(2)),
        total: j.creacion + j.finalizacion
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8); 

    return dataLimpia;
  }, [analiticaGlobal]);

  // ==========================================
  // 🚀 ARMADO DINÁMICO DE DATOS PARA EXPORTACIÓN TEMPORADA
  // ==========================================
  const datosParaReporte = useMemo(() => {
    if (!analiticaGlobal || partidos.length === 0) return null;
    const stats = analiticaGlobal.statsEquipo;
    const miClubGlobal = localStorage.getItem('mi_club') || 'MI EQUIPO';

    return {
      isTemporada: true,
      equipos: {
        local: { nombre: miClubGlobal, escudo: partidos[0]?.escudo_propio || null },
        visitante: { nombre: 'RIVALES MÚLTIPLES', escudo: null }
      },
      resultado: {
        final: `${analiticaGlobal.golesPropiosTotales} - ${analiticaGlobal.golesRivalesTotales}`,
        primerTiempo: `${stats.golesFavorPT} - ${stats.golesContraPT}`
      },
      info: {
        fecha: 'Resumen de Temporada',
        torneo: filtroCompeticion === 'Todas' ? 'Todas las Competencias' : filtroCompeticion,
        estadio: '-',
        categoria: filtroCategoria === 'Todas' ? 'Todas las Categorías' : filtroCategoria,
        balanceTemporada: `${stats.victorias}V - ${stats.empates}E - ${stats.derrotas}D`
      },
      stats: {
        local: { 
          xg: Number(stats.xgTotal.toFixed(2)), 
          remates: analiticaGlobal.rematesPropiosTotales, 
          rematesAlArco: analiticaGlobal.golesPropiosTotales + analiticaGlobal.desgloseRemates.propio.atajados, 
          recuperaciones: analiticaGlobal.statsAdicionales.recuperaciones, 
          perdidas: analiticaGlobal.statsAdicionales.perdidasPeligrosas, 
          faltas: 0 
        },
        visitante: { 
          xg: Number(stats.xgRival.toFixed(2)), 
          remates: 0, 
          rematesAlArco: analiticaGlobal.golesRivalesTotales + analiticaGlobal.desgloseRemates.rival.atajados, 
          recuperaciones: 0, 
          perdidas: 0, 
          faltas: 0 
        },
        topJugadores: analiticaGlobal.topGoleadores.slice(0, 5).map(j => ({ nombre: `${j.dorsal || '-'} - ${(j.nombre || 'S/N').toUpperCase()}`, rating: j.goles })),
        topJugadoresExt: analiticaGlobal.topAsistidores.slice(0, 5).map(j => ({ nombre: `${j.dorsal || '-'} - ${(j.nombre || 'S/N').toUpperCase()}`, rec: 0, remates: 0, goles: j.asistencias }))
      },
      tiros: [], 
      xgFlow: [], 
      recYPer: [], 
      golesOrigen: { local: analiticaGlobal.dataOrigenGol.length > 0 ? analiticaGlobal.dataOrigenGol : [{name: 'Sin Goles', value: 1}] }
    };
  }, [analiticaGlobal, partidos, filtroCategoria, filtroCompeticion]);
  // ==========================================

  const COLORS_ORIGEN = {
    'Ataque Posicional': '#3b82f6', 
    'Contraataque': '#f59e0b', 
    'Recuperación Alta': '#10b981', 
    'Error No Forzado': '#ef4444', 
    'Córner': '#a855f7', 
    'Lateral': '#06b6d4', 
    'Tiro Libre': '#f472b6', 
    'Penal / Sexta Falta': '#ffffff', 
    'No Especificado': '#4b5563' 
  };

  if (!partidos || partidos.length === 0) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>AÚN NO HAY PARTIDOS CREADOS O FINALIZADOS.</div>;
  if (!analiticaGlobal) return <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-dim)' }}>CARGANDO RESUMEN DE TEMPORADA...</div>;

  const stats = analiticaGlobal.statsEquipo;
  const eficaciaGlobalDefensiva = stats.duelosDefTotales > 0 ? ((stats.duelosDefGanados / stats.duelosDefTotales) * 100).toFixed(1) : 0;
  const eficaciaTiro = analiticaGlobal.rematesPropiosTotales > 0 ? ((analiticaGlobal.golesPropiosTotales / analiticaGlobal.rematesPropiosTotales) * 100).toFixed(1) : 0;
  const xgDiff = (stats.xgTotal - stats.xgRival).toFixed(2);
  
  const xgPorRemate = analiticaGlobal.rematesPropiosTotales > 0 ? (stats.xgTotal / analiticaGlobal.rematesPropiosTotales).toFixed(2) : 0;
  const golesVsXg = (analiticaGlobal.golesPropiosTotales - stats.xgTotal).toFixed(2);

  const categoriasUnicas = [...new Set(partidos.map(p => p.categoria))].filter(Boolean);
  const competicionesUnicas = [...new Set(partidos.map(p => p.competicion))].filter(Boolean); 

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <style>{`
        .custom-scroll { -webkit-overflow-scrolling: touch; }
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: var(--accent); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: esMovil ? '1 1 100%' : 'auto' }}>
            <div className="stat-label">RESUMEN DE TEMPORADA</div>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ marginTop: '5px', width: esMovil ? '100%' : '200px', background: '#111', color: 'var(--accent)', borderColor: 'var(--accent)', outline: 'none', padding: '8px', borderRadius: '4px' }}>
              <option value="Todas" style={{ background: '#111', color: '#fff' }}>TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c} style={{ background: '#111', color: '#fff' }}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={{ flex: esMovil ? '1 1 100%' : 'auto' }}>
            <div className="stat-label">COMPETICIÓN</div>
            <select value={filtroCompeticion} onChange={(e) => setFiltroCompeticion(e.target.value)} style={{ marginTop: '5px', width: esMovil ? '100%' : '200px', background: '#111', color: 'var(--accent)', borderColor: 'var(--accent)', outline: 'none', padding: '8px', borderRadius: '4px' }}>
              <option value="Todas" style={{ background: '#111', color: '#fff' }}>TODAS LAS COMPETENCIAS</option>
              {competicionesUnicas.map(c => <option key={c} value={c} style={{ background: '#111', color: '#fff' }}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        
        <button onClick={() => setMostrarReporte(true)} className="btn-action" style={{ width: esMovil ? '100%' : 'auto' }}>
          EXPORTAR REPORTE
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '20px' }}>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px', background: 'linear-gradient(180deg, #111 0%, #000 100%)', borderTop: '2px solid var(--accent)' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>PARTIDOS (V-E-D) <InfoBox texto="Victorias, Empates y Derrotas en la temporada actual." /></div>
                <div className="stat-value" style={{ color: 'var(--text)' }}>
                  <span style={{color: 'var(--accent)'}}>{stats.victorias}</span>-
                  <span style={{color: '#888'}}>{stats.empates}</span>-
                  <span style={{color: '#ef4444'}}>{stats.derrotas}</span>
                </div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>xG DIF (Dominio) <InfoBox texto="Diferencia neta de goles esperados (+ a favor, - en contra). Refleja el dominio táctico real más allá de los goles marcados." /></div>
                <div className="stat-value" style={{ color: xgDiff > 0 ? 'var(--accent)' : '#ef4444' }}>{xgDiff > 0 ? '+' : ''}{xgDiff}</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>DOMINIO TERRITORIAL <InfoBox texto="Porcentaje total de acciones de tu equipo que suceden en la mitad de la cancha del rival." /></div>
                <div className="stat-value" style={{ color: analiticaGlobal.territoryPct > 50 ? '#0ea5e9' : 'var(--text-dim)' }}>{analiticaGlobal.territoryPct}%</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>EFECTIVIDAD EN REMATES <InfoBox texto="Porcentaje general de remates que terminaron en gol." /></div>
                <div className="stat-value" style={{ color: eficaciaTiro >= 15 ? 'var(--accent)' : '#fff' }}>{eficaciaTiro}%</div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>BALANCE DE PRESIÓN <InfoBox texto="Recuperaciones Altas (en ataque) versus Pérdidas Peligrosas (en defensa). Mide qué tanto rinde asumir riesgos." /></div>
                <div className="stat-value" style={{ color: stats.recuperacionesAltas >= analiticaGlobal.statsAdicionales.perdidasPeligrosas ? '#00aaff' : '#ef4444' }}>
                  {stats.recuperacionesAltas} / {analiticaGlobal.statsAdicionales.perdidasPeligrosas}
                </div>
            </div>
            <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>DUELOS DEFENSIVOS <InfoBox texto="Eficacia general del equipo al disputar la pelota 1v1." /></div>
                <div className="stat-value" style={{ color: eficaciaGlobalDefensiva > 50 ? '#10b981' : '#ef4444' }}>{eficaciaGlobalDefensiva}%</div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '20px' }}>
            
            <div className="bento-card" style={{ borderTop: '3px solid #f59e0b', display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                ADN DEL GOL<InfoBox texto="El contexto táctico desde el cual marcamos los goles. Ayuda a ver nuestra principal arma ofensiva a lo largo de los partidos." />
              </div>
              <div style={{ flex: 1, minHeight: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {analiticaGlobal.dataOrigenGol && analiticaGlobal.dataOrigenGol.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analiticaGlobal.dataOrigenGol}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analiticaGlobal.dataOrigenGol.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS_ORIGEN[entry.name] || '#8884d8'} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }}
                          itemStyle={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}
                        />
                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem', paddingTop: '10px' }} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', marginTop: '-15px' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{analiticaGlobal.golesPropiosTotales}</span><br/>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>A FAVOR</span>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>No hay goles registrados.</div>
                )}
              </div>
            </div>

            {/* GRÁFICO NUEVO: ADN GOL RIVAL */}
            <div className="bento-card" style={{ borderTop: '3px solid #ef4444', display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '5px', color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                ADN DEL GOL RIVAL<InfoBox texto="El contexto táctico desde el cual nos marcan los goles." />
              </div>
              <div style={{ flex: 1, minHeight: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                {analiticaGlobal.dataOrigenGolRival && analiticaGlobal.dataOrigenGolRival.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analiticaGlobal.dataOrigenGolRival}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analiticaGlobal.dataOrigenGolRival.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS_ORIGEN[entry.name] || '#8884d8'} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }}
                          itemStyle={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800 }}
                        />
                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem', paddingTop: '10px' }} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', marginTop: '-15px' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{analiticaGlobal.golesRivalesTotales}</span><br/>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>EN CONTRA</span>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>No nos marcaron goles.</div>
                )}
              </div>
            </div>

            <div className="bento-card" style={{ padding: '20px', borderTop: '3px solid #00ff88' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#00ff88', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                EFICIENCIA OFENSIVA <InfoBox texto="Métricas avanzadas para entender la calidad y rentabilidad de los ataques a lo largo del torneo." />
              </div>
              <div style={kpiFila}>
                <span>xG / REMATE <InfoBox texto="Promedio de peligrosidad por tiro. Arriba de 0.15 significa que elegimos muy bien de dónde patear."/></span>
                <strong style={{color: xgPorRemate > 0.15 ? '#00ff88' : '#fff'}}>{xgPorRemate}</strong>
              </div>
              <div style={kpiFila}>
                <span>GOLES vs xG <InfoBox texto="Positivo: Anotamos más goles de lo que la probabilidad marcaba. Negativo: Desperdiciamos situaciones claras."/></span>
                <strong style={{color: golesVsXg > 0 ? '#00ff88' : (golesVsXg < 0 ? '#ef4444' : '#fff')}}>{golesVsXg > 0 ? '+' : ''}{golesVsXg}</strong>
              </div>
              <div style={kpiFila}>
                <span>REMATES ACUMULADOS</span>
                <strong style={{color: '#fff'}}>{analiticaGlobal.rematesPropiosTotales}</strong>
              </div>
              <div style={kpiFila}>
                <span>DUELOS OFE. GANADOS</span>
                <strong>
                  {analiticaGlobal.statsAdicionales.duelosOfeGanados} / {analiticaGlobal.statsAdicionales.duelosOfeTotales} 
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({analiticaGlobal.statsAdicionales.duelosOfeTotales > 0 ? ((analiticaGlobal.statsAdicionales.duelosOfeGanados / analiticaGlobal.statsAdicionales.duelosOfeTotales) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
            </div>

            <div className="bento-card" style={{ padding: '20px', borderTop: '3px solid #ef4444' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                EFICIENCIA DEFENSIVA <InfoBox texto="Métricas avanzadas sobre la capacidad de recuperación y contención a lo largo de la temporada." />
              </div>
              <div style={kpiFila}>
                <span>DUELOS DEF. GANADOS</span>
                <strong>
                  {analiticaGlobal.statsAdicionales.duelosDefGanados} / {analiticaGlobal.statsAdicionales.duelosDefTotales}
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({analiticaGlobal.statsAdicionales.duelosDefTotales > 0 ? ((analiticaGlobal.statsAdicionales.duelosDefGanados / analiticaGlobal.statsAdicionales.duelosDefTotales) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
              <div style={kpiFila}><span>RECUPERACIONES TOTALES</span><strong>{analiticaGlobal.statsAdicionales.recuperaciones}</strong></div>
              <div style={kpiFila}><span>RECUPERACIONES ALTAS</span><strong>{analiticaGlobal.statsAdicionales.recuperacionesAltas}</strong></div>
              <div style={kpiFila}><span>PÉRDIDAS PELIGROSAS</span><strong style={{ color: analiticaGlobal.statsAdicionales.perdidasPeligrosas > (analiticaGlobal.statsEquipo.partidosJugados * 3) ? '#ef4444' : '#00ff88' }}>{analiticaGlobal.statsAdicionales.perdidasPeligrosas}</strong></div>
            </div>

            <div className="bento-card" style={{ padding: '20px', borderTop: '3px solid #06b6d4' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                EFECTIVIDAD ABP <InfoBox texto="Resumen de eficacia ofensiva en pelota parada en toda la temporada. Las zonas de los laterales van de la Z1 (Defensa) a la Z4 (Ataque)." />
              </div>
              <div style={kpiFila}>
                <span>CÓRNERS (TIRO GENERADO)</span>
                <strong>
                  {analiticaGlobal.abp.corners.rematesGenerados} / {analiticaGlobal.abp.corners.favor}
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({analiticaGlobal.abp.corners.favor > 0 ? ((analiticaGlobal.abp.corners.rematesGenerados / analiticaGlobal.abp.corners.favor) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
              <div style={kpiFila}>
                <span>LATERALES (TIRO GENERADO)</span>
                <strong>
                  {analiticaGlobal.abp.laterales.rematesGenerados} / {analiticaGlobal.abp.laterales.favor}
                  <span style={{ color: 'var(--text-dim)', marginLeft: '5px' }}>
                    ({analiticaGlobal.abp.laterales.favor > 0 ? ((analiticaGlobal.abp.laterales.rematesGenerados / analiticaGlobal.abp.laterales.favor) * 100).toFixed(0) : 0}%)
                  </span>
                </strong>
              </div>
              <div style={kpiFila}><span>GOLES DE TIRO LIBRE</span><strong>{analiticaGlobal.dataOrigenGol?.find(d => d.name === 'Tiro Libre')?.value || 0}</strong></div>
              
              <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px dashed #333' }}>
                <div className="stat-label" style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '8px', textAlign: 'center' }}>LATERALES FAVOR POR ZONAS</div>
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between' }}>
                   <div style={zonePill}>Z1 (0-10) <br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analiticaGlobal.abp.zonasLatFavor.z1}</strong></div>
                   <div style={zonePill}>Z2 (10-20)<br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analiticaGlobal.abp.zonasLatFavor.z2}</strong></div>
                   <div style={zonePill}>Z3 (20-30)<br/><strong style={{color:'#fff', fontSize:'1rem'}}>{analiticaGlobal.abp.zonasLatFavor.z3}</strong></div>
                   <div style={zonePill}>Z4 (30-40)<br/><strong style={{color:'#00ff88', fontSize:'1rem'}}>{analiticaGlobal.abp.zonasLatFavor.z4}</strong></div>
                </div>
              </div>
            </div>

            <div className="bento-card" style={{ padding: '20px', borderTop: '3px solid #c084fc' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                PERFIL DE REMATE (TENDENCIA) <InfoBox texto="Agrupación de todos los tiros del equipo en el torneo. Ayuda a ver si somos un equipo que finaliza por el medio o por las alas." />
              </div>
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center', marginBottom: '15px' }}>
                 <div style={{...zonePill, background: 'rgba(192, 132, 252, 0.1)'}}>ZONA CENTRAL<br/><strong style={{color:'#c084fc', fontSize:'1.2rem'}}>{analiticaGlobal.perfilRemate.centro}</strong></div>
                 <div style={{...zonePill, background: 'rgba(255,255,255,0.05)'}}>POR BANDAS<br/><strong style={{color:'#fff', fontSize:'1.2rem'}}>{analiticaGlobal.perfilRemate.banda}</strong></div>
              </div>
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', textAlign: 'center' }}>
                 <div style={{...zonePill, background: 'rgba(0, 255, 136, 0.1)'}}>ZONA CERCANA<br/><strong style={{color:'#00ff88', fontSize:'1.2rem'}}>{analiticaGlobal.perfilRemate.cerca}</strong></div>
                 <div style={{...zonePill, background: 'rgba(239, 68, 68, 0.1)'}}>MEDIA DISTANCIA<br/><strong style={{color:'#ef4444', fontSize:'1.2rem'}}>{analiticaGlobal.perfilRemate.lejos}</strong></div>
              </div>
            </div>

        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
              APORTE OFENSIVO TOTAL <InfoBox texto="Suma del xG Buildup (Creación) y Goles Anotados (Finalización). Muestra quiénes son los motores ofensivos del equipo y en qué rol destacan." />
            </div>
            
            {dataCreacionFin.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={dataCreacionFin} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={true} vertical={false} />
                  <XAxis type="number" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                  <YAxis dataKey="nombre" type="category" stroke="#555" tick={{ fill: '#fff', fontSize: 10, fontWeight: 700 }} width={80} />
                  <RechartsTooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '4px' }}
                    itemStyle={{ fontSize: '0.8rem', fontWeight: 800 }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#888', paddingTop: '10px' }} />
                  
                  {/* Barra de Creación (xG Buildup) */}
                  <Bar dataKey="Creación" stackId="a" fill="#c084fc" barSize={15} />
                  {/* Barra de Finalización (Goles) */}
                  <Bar dataKey="Finalización" stackId="a" fill="#00ff88" barSize={15} radius={[0, 4, 4, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '250px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                No hay datos suficientes de creación y finalización.
              </div>
            )}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>GOLES PT VS ST <InfoBox texto="Compara desgaste físico y táctico. Si recibís muchos más goles en el ST, puede haber un déficit de resistencia aeróbica en el plantel." /></div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dataDesgaste} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11, fontWeight: 700 }} />
                <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#888' }} />
                <Bar dataKey="Anotados" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar dataKey="Recibidos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '10px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>ADN DEL EQUIPO <InfoBox texto="Perfil táctico general del equipo normalizado de 0 a 100. Ayuda a entender cuál es tu modelo de juego predominante real." /></div>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={dataRadar}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Equipo" dataKey="A" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '20px' }}>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>TOP GOLEADORES <InfoBox texto="Máximos anotadores del equipo." /></div>
            {analiticaGlobal.topGoleadores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#fff', zIndex: 1 }}>{j.goles}</strong>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: 'var(--accent)', opacity: 0.1, width: `${(j.goles / Math.max(1, analiticaGlobal.topGoleadores[0]?.goles)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#00ff88', display: 'flex', alignItems: 'center' }}>TOP ASISTIDORES <InfoBox texto="Máximos repartidores de asistencias que terminaron en gol." /></div>
            {analiticaGlobal.topAsistidores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <strong style={{ fontSize: '1.2rem', color: '#00ff88', zIndex: 1 }}>{j.asistencias}</strong>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#00ff88', opacity: 0.1, width: `${(j.asistencias / Math.max(1, analiticaGlobal.topAsistidores[0]?.asistencias)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>
          
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#c084fc', display: 'flex', alignItems: 'center' }}>TOP CREADORES (xG) <InfoBox texto="xG Buildup: Valor que aportan los jugadores en la construcción de jugadas que terminan en tiro (excluyendo el tiro final y la asistencia)." /></div>
            {analiticaGlobal.topCreadores.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <div style={{ textAlign: 'right', zIndex: 1 }}>
                  <strong style={{ fontSize: '1.2rem', color: '#c084fc' }}>{j.xgBuildup.toFixed(1)}</strong>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#c084fc', opacity: 0.1, width: `${(j.xgBuildup / Math.max(0.1, analiticaGlobal.topCreadores[0]?.xgBuildup)) * 100}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '15px', color: '#10b981', display: 'flex', alignItems: 'center' }}>TOP DUELOS <InfoBox texto="Jugadores con el mejor porcentaje de éxito al disputar la pelota (mínimo 5 duelos totales en la temporada)." /></div>
            {analiticaGlobal.topMuros.map((j, i) => (
              <div key={j.id} style={{...rankingRow, position: 'relative', overflow: 'hidden'}}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', zIndex: 1 }}><span style={{ color: 'var(--text-dim)', fontWeight: 800, width: '15px' }}>{i+1}</span><span className="mono-accent" style={{ fontSize: '0.8rem' }}>{j.dorsal}</span><span style={{ fontWeight: 700 }}>{j.apellido ? j.apellido.toUpperCase() : j.nombre.toUpperCase()}</span></div>
                <div style={{ textAlign: 'right', zIndex: 1 }}>
                  <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{j.eficaciaDefensiva.toFixed(0)}%</strong>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, background: '#10b981', opacity: 0.1, width: `${j.eficaciaDefensiva}%`, zIndex: 0 }} />
              </div>
            ))}
          </div>

        </div>

        {/* --- INICIO ZONA DE QUINTETOS --- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '20px', marginBottom: '10px' }}>
          
          {/* MEJORES QUINTETOS */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
              MEJORES QUINTETOS 
              <InfoBox texto="Rendimiento del equipo al jugar con estas combinaciones específicas de 5 jugadores. Todas las estadísticas están contempladas." />
            </div>
            <div className="table-wrapper custom-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    <th style={{ textAlign: 'left', padding: '10px' }}>QUINTETO</th>
                    <th style={{ color: '#00ff88' }} title="Goles a Favor / En Contra">GOL</th>
                    <th style={{ color: '#3b82f6' }} title="Remates Realizados / Concedidos">REMATES</th>
                    <th style={{ color: '#f59e0b' }} title="Recuperaciones / Pérdidas">REC-PERD</th>
                    <th style={{ color: '#c084fc' }} title="Faltas Recibidas / Cometidas">FALTAS</th>
                    <th title="Amarillas / Rojas">🟨/🟥</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {analiticaGlobal.topQuintetos && analiticaGlobal.topQuintetos.map((q, idx) => {
                    const diffGoles = q.balanceRating;
                    
                    const remF = q.rematesFavor || 0;
                    const remC = q.rematesContra || 0;
                    const rec = q.recuperaciones || 0;
                    const per = q.perdidas || 0;
                    const fltR = q.faltasRecibidas || 0;
                    const fltC = q.faltasCometidas || 0;
                    const ama = q.amarillas || 0;
                    const roj = q.rojas || 0;

                    const nombresQuinteto = q.ids.map(id => {
                      const jug = jugadores.find(j => j.id === id);
                      if (!jug) return '?';
                      return jug.apellido ? jug.apellido.toUpperCase() : jug.nombre.toUpperCase();
                    }).join(' - ');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ textAlign: 'left', padding: '12px 10px', fontWeight: 800, color: '#fff', fontSize: '0.75rem' }}>
                          [{nombresQuinteto}]
                        </td>
                        <td style={{ fontSize: '0.85rem', fontWeight: 700 }}><span style={{color: '#00ff88'}}>{q.golesFavor}</span> - <span style={{color: '#ef4444'}}>{q.golesContra}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#3b82f6'}}>{remF}</span> - <span style={{color: '#ef4444'}}>{remC}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#f59e0b'}}>{rec}</span> - <span style={{color: '#ef4444'}}>{per}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#c084fc'}}>{fltR}</span> - <span style={{color: '#ef4444'}}>{fltC}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#fbbf24'}}>{ama}</span> / <span style={{color: '#ef4444'}}>{roj}</span></td>
                        <td>
                          <div style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', background: diffGoles >= 5.5 ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.1)', color: diffGoles >= 5.5 ? 'var(--accent)' : '#ef4444', fontWeight: 800 }}>
                            {diffGoles}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {(!analiticaGlobal.topQuintetos || analiticaGlobal.topQuintetos.length === 0) && (
                    <tr><td colSpan="7" style={{ padding: '20px', color: 'var(--text-dim)' }}>No hay suficientes datos de rotaciones.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PEORES QUINTETOS */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px', color: '#ef4444', display: 'flex', alignItems: 'center' }}>
              PEORES QUINTETOS 
              <InfoBox texto="Combinaciones de jugadores con el peor Rating Promedio en cancha (con al menos 5 acciones registradas)." />
            </div>
            <div className="table-wrapper custom-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    <th style={{ textAlign: 'left', padding: '10px' }}>QUINTETO</th>
                    <th style={{ color: '#00ff88' }} title="Goles a Favor / En Contra">GOL</th>
                    <th style={{ color: '#3b82f6' }} title="Remates Realizados / Concedidos">REMATES</th>
                    <th style={{ color: '#f59e0b' }} title="Recuperaciones / Pérdidas">REC-PERD</th>
                    <th style={{ color: '#c084fc' }} title="Faltas Recibidas / Cometidas">FALTAS</th>
                    <th title="Amarillas / Rojas">🟨/🟥</th>
                    <th>BALANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {analiticaGlobal.peoresQuintetos && analiticaGlobal.peoresQuintetos.map((q, idx) => {
                    const diffGoles = q.balanceRating;
                    
                    const remF = q.rematesFavor || 0;
                    const remC = q.rematesContra || 0;
                    const rec = q.recuperaciones || 0;
                    const per = q.perdidas || 0;
                    const fltR = q.faltasRecibidas || 0;
                    const fltC = q.faltasCometidas || 0;
                    const ama = q.amarillas || 0;
                    const roj = q.rojas || 0;

                    const nombresQuinteto = q.ids.map(id => {
                      const jug = jugadores.find(j => j.id === id);
                      if (!jug) return '?';
                      return jug.apellido ? jug.apellido.toUpperCase() : jug.nombre.toUpperCase();
                    }).join(' - ');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #222' }}>
                        <td style={{ textAlign: 'left', padding: '12px 10px', fontWeight: 800, color: '#fff', fontSize: '0.75rem' }}>
                          [{nombresQuinteto}]
                        </td>
                        <td style={{ fontSize: '0.85rem', fontWeight: 700 }}><span style={{color: '#00ff88'}}>{q.golesFavor}</span> - <span style={{color: '#ef4444'}}>{q.golesContra}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#3b82f6'}}>{remF}</span> - <span style={{color: '#ef4444'}}>{remC}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#f59e0b'}}>{rec}</span> - <span style={{color: '#ef4444'}}>{per}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#c084fc'}}>{fltR}</span> - <span style={{color: '#ef4444'}}>{fltC}</span></td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 600 }}><span style={{color: '#fbbf24'}}>{ama}</span> / <span style={{color: '#ef4444'}}>{roj}</span></td>
                        <td>
                          <div style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', background: diffGoles >= 5.5 ? 'rgba(0,255,136,0.1)' : 'rgba(239,68,68,0.1)', color: diffGoles >= 5.5 ? 'var(--accent)' : '#ef4444', fontWeight: 800 }}>
                            {diffGoles}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {(!analiticaGlobal.peoresQuintetos || analiticaGlobal.peoresQuintetos.length === 0) && (
                    <tr><td colSpan="7" style={{ padding: '20px', color: 'var(--text-dim)' }}>No hay suficientes datos de rotaciones.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
        {/* --- FIN ZONA DE QUINTETOS --- */}

        {/* --- ZONA INFERIOR CON FLEXBOX PARA INVERTIR EL ORDEN EN MÓVILES --- */}
        <div style={{ display: 'flex', flexDirection: esMovil ? 'column' : 'row', gap: '20px' }}>
          
          {/* HISTORIAL DE PARTIDOS (Aparece abajo en móvil, izquierda en PC) */}
          <div className="bento-card" style={{ flex: 1, order: esMovil ? 2 : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
             <div className="stat-label" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
               HISTORIAL DE PARTIDOS 
               <InfoBox texto="Registro de los últimos encuentros filtrados. Arriba podés ver la racha de forma (últimos 10 partidos, el de más a la derecha es el más reciente)." />
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, marginRight: '5px' }}>RACHA (ÚLT. 10):</span>
                {analiticaGlobal.historialPartidos.slice(0, 10).reverse().map((p, idx) => {
                   let color = '#333';
                   let textColor = '#fff';
                   let text = 'E';
                   if (p.resultado === 'V') { color = 'var(--accent)'; textColor = '#000'; text = 'G'; }
                   if (p.resultado === 'D') { color = '#ef4444'; textColor = '#fff'; text = 'P'; }
                   
                   return (
                     <div 
                       key={idx} 
                       title={`vs ${p.rival} (${p.golesPropio}-${p.golesRival})`}
                       style={{ width: '24px', height: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: color, color: textColor, fontSize: '0.75rem', fontWeight: 900, borderRadius: '3px', cursor: 'help' }} 
                     >
                       {text}
                     </div>
                   )
                })}
                {analiticaGlobal.historialPartidos.length === 0 && <span style={{ fontSize: '0.7rem', color: '#555' }}>S/D</span>}
             </div>

             <div className="custom-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', maxHeight: esMovil ? '400px' : 'auto', paddingRight: '5px' }}>
                {analiticaGlobal.historialPartidos.map(p => {
                  let badgeColor = '#333'; 
                  let textColor = 'var(--text-dim)';
                  let text = 'E';
                  let bgTinte = 'transparent';
                  let borderLeft = '4px solid #333';

                  if (p.resultado === 'V') { 
                    badgeColor = 'rgba(0, 255, 136, 0.15)'; 
                    textColor = 'var(--accent)'; 
                    text = 'G'; 
                    bgTinte = 'linear-gradient(90deg, rgba(0,255,136,0.05) 0%, transparent 100%)';
                    borderLeft = '4px solid var(--accent)';
                  }
                  if (p.resultado === 'D') { 
                    badgeColor = 'rgba(239, 68, 68, 0.15)'; 
                    textColor = '#ef4444'; 
                    text = 'P'; 
                    bgTinte = 'linear-gradient(90deg, rgba(239,68,68,0.05) 0%, transparent 100%)';
                    borderLeft = '4px solid #ef4444';
                  }

                  let convocados = 0;
                  try {
                    if (p.plantilla) {
                      const parsed = typeof p.plantilla === 'string' ? JSON.parse(p.plantilla) : p.plantilla;
                      if (Array.isArray(parsed)) convocados = parsed.length;
                    }
                  } catch (e) {}

                  const partidoOriginal = partidos.find(part => part.id === p.id);
                  const escudoPropio = partidoOriginal?.escudo_propio;
                  const escudoRival = partidoOriginal?.escudo_rival;

                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0a0a0a', backgroundImage: bgTinte, padding: '12px 15px', border: '1px solid var(--border)', borderLeft: borderLeft, borderRadius: '6px', transition: 'transform 0.2s', cursor: 'default' }} onMouseOver={e => e.currentTarget.style.transform = 'translateX(5px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateX(0px)'}>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: badgeColor, color: textColor, fontWeight: 900, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '1rem', border: `1px solid ${textColor}`, flexShrink: 0 }}>
                          {text}
                        </div>
                        
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            {escudoPropio ? <img src={escudoPropio} style={{width:'20px',height:'20px',objectFit:'contain', filter:'grayscale(1) brightness(2)'}} alt="MI" /> : <div style={{width:'20px',height:'20px',borderRadius:'50%',background:'#222',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.55rem',border:'1px solid var(--accent)',color:'var(--accent)'}}>MI</div>}
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', letterSpacing: '0.5px' }}>
                              vs {p.rival.toUpperCase()}
                            </div>
                            {escudoRival ? <img src={escudoRival} style={{width:'20px',height:'20px',objectFit:'contain', filter:'grayscale(1) brightness(2)'}} alt="RIVAL" /> : <div style={{width:'20px',height:'20px',borderRadius:'50%',background:'#222',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.55rem',border:'1px solid #555',color:'#fff'}}>{p.rival?.substring(0,2).toUpperCase()}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                              {p.fechaCorta} • {p.categoria || 'S/C'} • {p.competicion || 'Amistoso'} • J{p.jornada || '-'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '4px', fontWeight: 600 }}>
                            👥 {convocados} CONVOCADOS
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '1px', marginBottom: '2px' }}>RESULTADO</div>
                        <div style={{ background: '#000', border: '1px solid #222', padding: '4px 10px', borderRadius: '4px', fontSize: '1.3rem', fontWeight: 900, color: '#fff', display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: p.golesPropio > p.golesRival ? 'var(--accent)' : '#fff' }}>{p.golesPropio}</span>
                          <span style={{ color: '#555', fontSize: '1rem' }}>-</span>
                          <span style={{ color: p.golesRival > p.golesPropio ? '#ef4444' : '#fff' }}>{p.golesRival}</span>
                        </div>
                      </div>

                    </div>
                  )
                })}
             </div>
          </div>
          
          {/* MAPEO ACUMULADO (Aparece arriba en móvil, derecha en PC) */}
          <div className="bento-card" style={{ flex: 1, order: esMovil ? 1 : 2, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>MAPEO ACUMULADO <InfoBox texto="Visualización espacial de todas las acciones ofensivas del equipo a lo largo de la temporada. Útil para detectar zonas preferenciales de ataque." /></div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroAccionMapa} onChange={(e) => setFiltroAccionMapa(e.target.value)} disabled={tipoMapa === 'transiciones'} style={{ padding: '8px', fontSize: '0.8rem', width: 'auto', background: '#111', color: '#fff', border: '1px solid var(--border)', opacity: tipoMapa === 'transiciones' ? 0.3 : 1, outline: 'none', borderRadius: '4px' }}>
                  <option value="" style={{ background: '#111', color: '#fff' }}>TODAS LAS ACCIONES</option>
                  <option value="Gol" style={{ background: '#111', color: '#fff' }}>SOLO GOLES</option>
                  <option value="Remate" style={{ background: '#111', color: '#fff' }}>SOLO REMATES</option>
                  <option value="Recuperación" style={{ background: '#111', color: '#fff' }}>SOLO RECUPERACIONES</option>
                  <option value="Duelo" style={{ background: '#111', color: '#fff' }}>SOLO DUELOS</option>
                  <option value="Falta cometida" style={{ background: '#111', color: '#fff' }}>FALTAS COMETIDAS</option>
                  <option value="Falta recibida" style={{ background: '#111', color: '#fff' }}>FALTAS RECIBIDAS</option>
                </select>

                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>PUNTOS</button>
                  <button onClick={() => setTipoMapa('calor')} style={{ ...btnTab, background: tipoMapa === 'calor' ? '#333' : 'transparent', color: tipoMapa === 'calor' ? 'var(--accent)' : 'var(--text-dim)' }}>CALOR</button>
                  <button onClick={() => setTipoMapa('transiciones')} style={{ ...btnTab, background: tipoMapa === 'transiciones' ? 'var(--accent)' : 'transparent', color: tipoMapa === 'transiciones' ? '#000' : 'var(--text-dim)' }}>TRANSICIONES</button>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: esMovil ? 'auto' : 'calc(100% - 90px)' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '100%', aspectRatio: '2/1', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', zIndex: 0 }}></div>
                
                {tipoMapa === 'calor' && (
                  <canvas ref={heatmapRef} width={800} height={400} style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', opacity: 0.85 }} />
                )}

                {tipoMapa === 'puntos' && evMapa.map((ev, i) => {
                  const xNorm = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
                  const yNorm = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;
                  if (xNorm == null) return null;
                  
                  return (
                    <div 
                      key={ev.id || i} 
                      title={`${ev.accion}`}
                      style={{ 
                        position: 'absolute', left: `${xNorm}%`, top: `${yNorm}%`, width: '10px', height: '10px', 
                        backgroundColor: getColorAccion(ev.accion), 
                        border: '1px solid #000', borderRadius: '50%', transform: 'translate(-50%, -50%)', opacity: 0.8, zIndex: 2
                      }} 
                    />
                  )
                })}

                {tipoMapa === 'transiciones' && (
                  <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}>
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
                      </marker>
                    </defs>
                    {analiticaGlobal.transicionesLetales && analiticaGlobal.transicionesLetales.map((t, i) => {
                      const recX = t.recuperacion.zona_x_norm !== undefined ? t.recuperacion.zona_x_norm : t.recuperacion.zona_x;
                      const recY = t.recuperacion.zona_y_norm !== undefined ? t.recuperacion.zona_y_norm : t.recuperacion.zona_y;
                      const remX = t.remate.zona_x_norm !== undefined ? t.remate.zona_x_norm : t.remate.zona_x;
                      const remY = t.remate.zona_y_norm !== undefined ? t.remate.zona_y_norm : t.remate.zona_y;
                      
                      if (recX == null || remX == null) return null;
                      
                      return (
                        <g key={i}>
                          <circle cx={`${recX}%`} cy={`${recY}%`} r="4" fill="var(--accent)" />
                          <line 
                            x1={`${recX}%`} y1={`${recY}%`} 
                            x2={`${remX}%`} y2={`${remY}%`} 
                            stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="5 5"
                            markerEnd="url(#arrowhead)" opacity="0.85"
                          />
                          <circle cx={`${remX}%`} cy={`${remY}%`} r="5" fill="#fff" stroke="#000" strokeWidth="2" />
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 🌟 OVERLAY DEL REPORTE PARA EXPORTAR 🌟 */}
      {mostrarReporte && datosParaReporte && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.95)', zIndex: 9999, overflowY: 'auto', padding: '20px'
        }}>
          <div style={{ textAlign: 'right', maxWidth: '1000px', margin: '0 auto' }}>
            <button 
              onClick={() => setMostrarReporte(false)} 
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px', marginBottom: '10px' }}
            >
              CERRAR VISTA PREVIA ✖
            </button>
          </div>
          <ReportGenerator data={datosParaReporte} />
        </div>
      )}

    </div>
  );
}

const rankingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 10px', borderBottom: '1px solid #222' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };
const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontSize: '0.9rem', alignItems: 'center' };
const zonePill = { flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '10px 5px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' };

export default Temporada;