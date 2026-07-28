import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext'; 
import { calcularXGEvento } from '../analytics/xg'; 
import { TablaResponsive } from '../components/TablaResponsive';
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Line
} from 'recharts';

const InfoBox = ({ texto }) => {
  const [abierto, setAbierto] = useState(false);

  return (
    <div 
      className="tooltip-container" 
      tabIndex="0" 
      onClick={() => setAbierto(!abierto)}
      onBlur={() => setAbierto(false)}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'pointer', verticalAlign: 'middle', outline: 'none' }}
    >
      <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
      <div className="tooltip-text" style={{ 
        visibility: abierto ? 'visible' : 'hidden', 
        opacity: abierto ? 1 : 0, 
        transition: 'all 0.2s ease-in-out',
        position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: 'var(--panel)', color: 'var(--text)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid var(--border)', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' 
      }}>
        {texto}
      </div>
    </div>
  );
};

function OrigenGoles() {
  const { perfil } = useAuth(); 
  
  const rol = (perfil?.rol || '').toLowerCase();
  const esCT = rol === 'ct';
  const esSuperUser = rol === 'superuser';
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
  const clubId = isKioscoMode
    ? localStorage.getItem('kiosco_club_id')
    : (esSuperUser ? localStorage.getItem('club_id') : perfil?.club_id) || '';

  const [eventos, setEventos] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [torneos, setTorneos] = useState([]);
  const [cargando, setCargando] = useState(true); 
  
  const [filtroCategoria, setFiltroCategoria] = useState(() => {
    if (esCT && misCategorias.length > 0) return misCategorias[0];
    return 'Todas';
  });
  
  const [filtroTorneo, setFiltroTorneo] = useState('');
  const [filtroEquipo, setFiltroEquipo] = useState('Propio');

  useEffect(() => {
    if (esCT && misCategorias.length > 0) {
      if (filtroCategoria === 'Todas' || !misCategorias.includes(filtroCategoria)) {
        setFiltroCategoria(misCategorias[0]);
      }
    }
  }, [esCT, misCategorias, filtroCategoria]);

  useEffect(() => {
    async function obtenerDatos() {
      try {
        setCargando(true);
        if (!clubId) { setPartidos([]); setJugadores([]); setEventos([]); setTorneos([]); setCargando(false); return; }
        
        const { data: p } = await supabase.from('partidos').select('id, rival, competicion, categoria, torneo_id').eq('club_id', clubId);
        const { data: j } = await supabase.from('jugadores').select('id, nombre, apellido, dorsal').eq('club_id', clubId);
        const { data: t } = await supabase.from('torneos').select('id, nombre, categoria').eq('club_id', clubId);
        
        let todosLosGoles = [];
        let start = 0;
        const step = 1000;

        while (true) {
          const { data: chunk, error } = await supabase
            .from('eventos')
            .select('*')
            .eq('club_id', clubId)
            .in('accion', ['Gol', 'Remate - Gol'])
            .range(start, start + step - 1);
          
          if (error) break;

          if (chunk && chunk.length > 0) {
            todosLosGoles = [...todosLosGoles, ...chunk];
            if (chunk.length < step) break; 
            start += step;
          } else {
            break;
          }
        }
        
        setPartidos(p || []);
        setJugadores(j || []);
        setTorneos(t || []);
        setEventos(todosLosGoles);
      } catch (error) {
        console.error("Error cargando goles:", error);
      } finally {
        setCargando(false);
      }
    }
    obtenerDatos();
  }, [clubId]);

  const categoriasUnicas = useMemo(() => {
    const catPartidos = [...new Set(partidos.map(p => p.categoria).filter(Boolean))];
    if (esCT && misCategorias.length > 0) {
      return catPartidos.filter(c => misCategorias.includes(c));
    }
    return catPartidos;
  }, [partidos, esCT, misCategorias]);

  const torneosFiltrados = useMemo(() => {
    if (filtroCategoria === 'Todas') return torneos;
    return torneos.filter(t => !t.categoria || t.categoria === filtroCategoria);
  }, [torneos, filtroCategoria]);

  const mapaPartidos = useMemo(() => {
    const m = new Map(); partidos.forEach(p => m.set(p.id, p)); return m;
  }, [partidos]);

  const analizarEquipo = useCallback((equipo) => {
    const vacio = { total: 0, conteoOrigen: {}, macroTactico: { Posicional: 0, Transiciones: 0, ABP: 0 }, dataEfectividadOrigen: [], dataPieOrigen: [], dataBarTiempo: [], topConexiones: [], pctAsistidos: 0, distPromedio: 0, xgTotal: 0, xgPromedio: 0, difDefinicion: 0, contextoBuckets: { Igualdad: 0, Superioridad: 0, Inferioridad: 0 }, modificadores: [], tablaGoles: [], mapaGoles: [] };
    if (!eventos || eventos.length === 0) return vacio;

    const golesFiltrados = eventos.filter(ev => {
      const partido = mapaPartidos.get(ev.id_partido);
      const pasaCat = filtroCategoria === 'Todas' || partido?.categoria === filtroCategoria;
      const pasaTor = !filtroTorneo || partido?.torneo_id === filtroTorneo;
      const pasaEq = ev.equipo === equipo;
      return pasaCat && pasaTor && pasaEq;
    });

    const conteoOrigen = {
      'Ataque Posicional': 0, 'Contraataque': 0, 'Recuperación Alta': 0, 'Error No Forzado': 0,
      'Córner': 0, 'Lateral': 0, 'Tiro Libre': 0, 'Penal / Sexta Falta': 0, '5v4 / 4v3': 0, '4v5 / 3v4': 0, 'No Especificado': 0
    };

    const statsPorOrigen = {};

    const macroTactico = { Posicional: 0, Transiciones: 0, ABP: 0 };

    const binsTiempo = {
      'PT 0-10': 0, 'PT 10-20': 0, 'PT 20+': 0,
      'ST 0-10': 0, 'ST 10-20': 0, 'ST 20+': 0
    };

    const conexiones = {};

    const contextoBuckets = { Igualdad: 0, Superioridad: 0, Inferioridad: 0 };
    const MODIFS = ['2do Palo', 'Mano a Mano', 'Punteo', 'Arq. Adelantado', 'De Espaldas', 'Bajo Presión'];
    const modifBuckets = Object.fromEntries(MODIFS.map(m => [m, 0]));

    let golesAsistidos = 0;
    let sumaDistancia = 0;
    let golesConDistancia = 0;
    let xgTotal = 0;
    let golesConXg = 0;
    const mapaGoles = [];

    golesFiltrados.forEach(gol => {
      const partes = (gol.origen_gol || 'No Especificado').split('|').map(s => s.trim());
      const origen = partes[0] || 'No Especificado';
      
      if (conteoOrigen[origen] !== undefined) conteoOrigen[origen]++;
      else conteoOrigen['No Especificado']++;

      if (origen === 'Ataque Posicional' || origen === '5v4 / 4v3') macroTactico.Posicional++;
      else if (['Contraataque', 'Recuperación Alta', 'Error No Forzado'].includes(origen)) macroTactico.Transiciones++;
      else if (['Córner', 'Lateral', 'Tiro Libre', 'Penal / Sexta Falta'].includes(origen)) macroTactico.ABP++;

      const modsDelGol = partes.slice(1);
      MODIFS.forEach(m => { if (modsDelGol.includes(m)) modifBuckets[m]++; });

      const ctx = gol.contexto_juego || '';
      if (ctx === '5v4' || ctx === '4v3') contextoBuckets.Superioridad++;
      else if (ctx === '4v5' || ctx === '3v4') contextoBuckets.Inferioridad++;
      else contextoBuckets.Igualdad++;

      if (gol.minuto !== null && gol.minuto !== undefined) {
        if (gol.periodo === 'PT') {
          if (gol.minuto <= 10) binsTiempo['PT 0-10']++;
          else if (gol.minuto <= 20) binsTiempo['PT 10-20']++;
          else binsTiempo['PT 20+']++;
        } else {
          if (gol.minuto <= 10) binsTiempo['ST 0-10']++;
          else if (gol.minuto <= 20) binsTiempo['ST 10-20']++;
          else binsTiempo['ST 20+']++;
        }
      }

      if (gol.id_asistencia) {
        golesAsistidos++;
        const key = `${gol.id_asistencia}-${gol.id_jugador}`;
        if (!conexiones[key]) conexiones[key] = { asistidor: gol.id_asistencia, definidor: gol.id_jugador, cantidad: 0 };
        conexiones[key].cantidad++;
      }

      let xNorm = gol.zona_x_norm !== undefined ? gol.zona_x_norm : gol.zona_x;
      let yNorm = gol.zona_y_norm !== undefined ? gol.zona_y_norm : gol.zona_y;
      let xgGol = null;

      if (xNorm != null && yNorm != null) {
        if (gol.equipo === 'Rival') {
          xNorm = 100 - xNorm;
          yNorm = 100 - yNorm;
        }

        const dx = (100 - xNorm) * 0.4; 
        const dy = Math.abs(50 - yNorm) * 0.2;
        const dist = Math.sqrt(dx*dx + dy*dy);
        sumaDistancia += dist;
        golesConDistancia++;

        const esTransicion = origen === 'Contraataque' || origen === 'Recuperación Alta';
        xgGol = calcularXGEvento({ ...gol, zona_x_norm: xNorm, zona_y_norm: yNorm }, esTransicion);
        xgTotal += xgGol;
        golesConXg++;

        mapaGoles.push({ ...gol, x: xNorm, y: yNorm, distancia: dist, xgCalc: xgGol });
      } else {
        mapaGoles.push({ ...gol, x: null, y: null, distancia: null, xgCalc: null });
      }

      if (!statsPorOrigen[origen]) statsPorOrigen[origen] = { name: origen, Goles: 0, xG: 0 };
      statsPorOrigen[origen].Goles++;
      if (xgGol != null) statsPorOrigen[origen].xG += xgGol;
    });

    const dataPieOrigen = Object.entries(conteoOrigen).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const dataEfectividadOrigen = Object.values(statsPorOrigen)
      .map(d => ({ ...d, xG: Number(d.xG.toFixed(2)) }))
      .sort((a, b) => b.Goles - a.Goles);

    const dataBarTiempo = Object.entries(binsTiempo).map(([name, value]) => ({ name, Goles: value }));
    const topConexiones = Object.values(conexiones).sort((a,b) => b.cantidad - a.cantidad).slice(0, 5);

    const total = golesFiltrados.length;
    const pctAsistidos = total > 0 ? ((golesAsistidos / total) * 100).toFixed(0) : 0;
    const distPromedio = golesConDistancia > 0 ? (sumaDistancia / golesConDistancia).toFixed(1) : 0;
    const xgPromedio = golesConXg > 0 ? (xgTotal / golesConXg) : 0;
    const difDefinicion = total - xgTotal;

    const tablaGoles = mapaGoles.map(g => {
      const p = mapaPartidos.get(g.id_partido);
      const jAutor = jugadores.find(jx => jx.id === g.id_jugador);
      const jAsist = jugadores.find(jx => jx.id === g.id_asistencia);
      const partesOrigen = (g.origen_gol || 'No Esp.').split('|').map(s => s.trim());

      return {
        id: g.id,
        rival: p ? p.rival : 'Desconocido',
        competicion: p ? p.competicion : '',
        minuto: g.minuto,
        periodo: g.periodo,
        autor: jAutor ? (jAutor.apellido || jAutor.nombre).toUpperCase() : (g.equipo === 'Rival' ? 'RIVAL' : 'S/D'),
        asistidor: jAsist ? (jAsist.apellido || jAsist.nombre).toUpperCase() : '-',
        origen: partesOrigen[0] || 'No Esp.',
        modificadores: partesOrigen.slice(1).join(' · '),
        contexto: g.contexto_juego || '',
        xg: (g.xgCalc != null) ? Number(g.xgCalc).toFixed(2) : '-',
        distancia: g.distancia ? g.distancia.toFixed(1) + 'm' : '-'
      }
    }).sort((a,b) => b.id - a.id);

    const modificadores = MODIFS.map(m => ({ name: m, value: modifBuckets[m] })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

    return { total, conteoOrigen, macroTactico, dataEfectividadOrigen, dataPieOrigen, dataBarTiempo, topConexiones, pctAsistidos, distPromedio, xgTotal, xgPromedio, difDefinicion, contextoBuckets, modificadores, tablaGoles, mapaGoles };
  }, [eventos, mapaPartidos, jugadores, filtroCategoria, filtroTorneo]);

  const dataAnalizada = useMemo(() => analizarEquipo(filtroEquipo), [analizarEquipo, filtroEquipo]);

  const comparativa = useMemo(() => {
    const af = analizarEquipo('Propio');
    const ec = analizarEquipo('Rival');
    const origenes = [...new Set([...Object.keys(af.conteoOrigen), ...Object.keys(ec.conteoOrigen)])];
    const data = origenes
      .map(o => ({ name: o, 'A favor': af.conteoOrigen[o] || 0, 'En contra': ec.conteoOrigen[o] || 0 }))
      .filter(d => d['A favor'] > 0 || d['En contra'] > 0)
      .sort((a, b) => (b['A favor'] + b['En contra']) - (a['A favor'] + a['En contra']));
    return {
      data,
      totalAF: af.total, totalEC: ec.total,
      xgAF: af.xgTotal, xgEC: ec.xgTotal,
      difAF: af.difDefinicion, difEC: ec.difDefinicion,
    };
  }, [analizarEquipo]);

  const COLORS_ORIGEN = {
    'Ataque Posicional': '#3b82f6', 'Contraataque': '#f59e0b', 'Recuperación Alta': '#10b981', 'Error No Forzado': '#ef4444', 
    'Córner': '#a855f7', 'Lateral': '#06b6d4', 'Tiro Libre': '#f472b6', 'Penal / Sexta Falta': '#ffffff', '5v4 / 4v3': '#0a7fec', '4v5 / 3v4': '#b6df03', 'No Especificado': '#4b5563' 
  };

  const getNombre = (id) => {
    const j = jugadores.find(x => x.id === id);
    return j ? (j.apellido || j.nombre).toUpperCase() : 'DESCONOCIDO';
  };

  const GRUPOS_GOLES = { gen: 'var(--text-dim)', tac: '#f59e0b' };
  const GRUPOS_GOLES_LABEL = { gen: 'DETALLE', tac: 'TÁCTICO' };
  const COLS_GOLES = [
    { k: 'minuto', t: 'MINUTO', g: 'gen', r: g => g.minuto !== null ? `${g.minuto}' ${g.periodo}` : '-' },
    { k: 'asistidor', t: 'ASISTENCIA', g: 'gen', r: g => g.asistidor },
    { k: 'origen', t: 'ORIGEN TÁCTICO', g: 'tac', r: g => (
      <>
        <span style={{ background: COLORS_ORIGEN[g.origen] || '#4b5563', color: g.origen === 'Penal / Sexta Falta' ? '#000' : '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
          {g.origen.toUpperCase()}
        </span>
        {g.modificadores && <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '3px' }}>{g.modificadores}</div>}
      </>
    ) },
    { k: 'xg', t: 'xG', g: 'tac', r: g => g.xg },
    { k: 'distancia', t: 'DISTANCIA', g: 'gen', r: g => g.distancia },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">ORIGEN DE LOS GOLES</div>
            <select value={filtroCategoria} onChange={(e) => { setFiltroCategoria(e.target.value); setFiltroTorneo(''); }} style={selectStyle}>
              {!(esCT && misCategorias.length > 0) && (
                <option value="Todas">TODAS LAS CATEGORÍAS</option>
              )}
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <div className="stat-label">TORNEO</div>
            <select value={filtroTorneo} onChange={(e) => setFiltroTorneo(e.target.value)} style={selectStyle}>
              <option value="">TODOS LOS TORNEOS</option>
              {torneosFiltrados.map(t => <option key={t.id} value={t.id}>{(t.nombre || '').toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <div className="stat-label">EQUIPO</div>
            <select value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)} style={selectStyle}>
              <option value="Propio">NUESTROS GOLES (A FAVOR)</option>
              <option value="Rival">GOLES RECIBIDOS (EN CONTRA)</option>
            </select>
          </div>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', marginTop: '50px', color: 'var(--text-dim)' }}>PROCESANDO DATOS...</div>
      ) : dataAnalizada.total === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '50px', color: 'var(--text-dim)', padding: '40px', background: 'var(--panel)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
          NO HAY GOLES REGISTRADOS CON ESTOS FILTROS.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* MACRO TÁCTICO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '15px', borderTop: '3px solid #3b82f6', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%)' }}>
                <div className="stat-label">ATAQUE POSICIONAL <InfoBox texto="Goles generados construyendo desde nuestra mitad o ataque de 5v4." /></div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#3b82f6' }}>{dataAnalizada.macroTactico.Posicional}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                  {dataAnalizada.total > 0 ? ((dataAnalizada.macroTactico.Posicional / dataAnalizada.total) * 100).toFixed(1) : 0}% DEL TOTAL
                </div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '15px', borderTop: '3px solid #f59e0b', background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, transparent 100%)' }}>
                <div className="stat-label">TRANSICIONES <InfoBox texto="Goles generados de Contraataque, Recuperaciones Altas o Errores del rival." /></div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f59e0b' }}>{dataAnalizada.macroTactico.Transiciones}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                  {dataAnalizada.total > 0 ? ((dataAnalizada.macroTactico.Transiciones / dataAnalizada.total) * 100).toFixed(1) : 0}% DEL TOTAL
                </div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '15px', borderTop: '3px solid #06b6d4', background: 'linear-gradient(180deg, rgba(6, 182, 212, 0.05) 0%, transparent 100%)' }}>
                <div className="stat-label">PELOTA PARADA (ABP) <InfoBox texto="Goles generados de Córner, Lateral, Tiro Libre o Penal." /></div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#06b6d4' }}>{dataAnalizada.macroTactico.ABP}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                  {dataAnalizada.total > 0 ? ((dataAnalizada.macroTactico.ABP / dataAnalizada.total) * 100).toFixed(1) : 0}% DEL TOTAL
                </div>
             </div>
          </div>

          {/* KPIs SUPERIORES */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px', borderTop: '2px solid var(--accent)' }}>
                <div className="stat-label">GOLES TOTALES</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text)' }}>{dataAnalizada.total}</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">ASISTIDOS vs SOLOS <InfoBox texto="Porcentaje de goles que provinieron de una asistencia directa." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: dataAnalizada.pctAsistidos > 50 ? '#00ff88' : '#fbbf24' }}>
                  {dataAnalizada.pctAsistidos}%
                </div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">DISTANCIA PROMEDIO <InfoBox texto="Distancia media estimada desde donde se efectuó el remate goleador." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0ea5e9' }}>{dataAnalizada.distPromedio}m</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">xG ACUMULADO <InfoBox texto="Suma del xG (peligro) de los remates que terminaron en gol. Cuánto valía la chance que se convirtió." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#a855f7' }}>{dataAnalizada.xgTotal.toFixed(1)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>{dataAnalizada.xgPromedio.toFixed(2)} xG/gol</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center', padding: '20px' }}>
                <div className="stat-label">DEFINICIÓN vs xG <InfoBox texto="Goles reales menos xG. Positivo = se definió mejor de lo esperado por la dificultad de las chances; negativo = se convirtieron chances difíciles (o el rival nos pegó por encima de lo esperado)." /></div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: dataAnalizada.difDefinicion >= 0 ? '#00ff88' : '#ef4444' }}>
                  {dataAnalizada.difDefinicion > 0 ? '+' : ''}{dataAnalizada.difDefinicion.toFixed(1)}
                </div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
            
            {/* GOLES VS xG POR ORIGEN */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
                EFECTIVIDAD POR ORIGEN (GOLES VS xG) <InfoBox texto="Cruza los goles marcados (Barras) con el peligro real que acarreaban (Línea). Si la barra está muy por encima de la línea, convertiste chances muy difíciles. Si la línea supera a la barra, generás peligro ahí pero te cuesta embocarla." />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dataAnalizada.dataEfectividadOrigen} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} angle={-25} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--border)" tick={{ fill: '#a855f7', fontSize: 11 }} />
                  <RechartsTooltip cursor={{ fill: 'var(--hover)' }} contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '6px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '15px' }} />
                  <Bar yAxisId="left" dataKey="Goles" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={30} />
                  <Line yAxisId="right" type="monotone" dataKey="xG" stroke="#a855f7" strokeWidth={3} dot={{ r: 5, fill: '#a855f7', stroke: 'var(--panel)' }} activeDot={{ r: 8 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* COMPARATIVA A FAVOR vs EN CONTRA POR ORIGEN */}
            {comparativa.data.length > 0 && (
              <div className="bento-card">
                <div className="stat-label" style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
                  ADN COMPARADO: CÓMO MARCAMOS vs CÓMO NOS HACEN <InfoBox texto="Goles a favor (verde) y en contra (rojo) según cómo se gestaron. El contraste muestra de qué nos hacen daño y de qué lastimamos nosotros." />
                </div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '14px', fontSize: '0.8rem' }}>
                  <span style={{ color: '#00ff88', fontWeight: 800 }}>● A favor: {comparativa.totalAF} goles <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({comparativa.xgAF.toFixed(1)} xG)</span></span>
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>● En contra: {comparativa.totalEC} goles <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({comparativa.xgEC.toFixed(1)} xG)</span></span>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(220, comparativa.data.length * 42)}>
                  <BarChart data={comparativa.data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} width={120} />
                    <RechartsTooltip cursor={{ fill: 'var(--hover)' }} contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border)' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" />
                    <Bar dataKey="A favor" fill="#00ff88" radius={[0, 3, 3, 0]} barSize={13} />
                    <Bar dataKey="En contra" fill="#ef4444" radius={[0, 3, 3, 0]} barSize={13} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>

          {/* CONTEXTO NUMÉRICO + MODIFICADORES DE DEFINICIÓN */}
          {dataAnalizada.total > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

              {/* CONTEXTO NUMÉRICO (POWER PLAY / INFERIORIDAD) */}
              <div className="bento-card">
                <div className="stat-label" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                  CONTEXTO NUMÉRICO <InfoBox texto="Goles según la superioridad/inferioridad de TU equipo en cancha (5v4 = vos con un hombre de más). Para los goles en contra, 'Superioridad' significa que te lo hicieron mientras vos tenías ventaja." />
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '14px' }}>
                  {filtroEquipo === 'Propio' ? 'Cómo aprovechamos cada situación' : 'En qué situación nos hacen daño'}
                </div>
                {(() => {
                  const c = dataAnalizada.contextoBuckets;
                  const items = [
                    { k: 'Superioridad', label: 'SUPERIORIDAD (5v4 · 4v3)', color: '#00ff88', n: c.Superioridad },
                    { k: 'Igualdad', label: 'IGUALDAD (5v5)', color: '#0ea5e9', n: c.Igualdad },
                    { k: 'Inferioridad', label: 'INFERIORIDAD (4v5 · 3v4)', color: '#ef4444', n: c.Inferioridad },
                  ];
                  const tot = items.reduce((a, i) => a + i.n, 0) || 1;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {items.map(it => (
                        <div key={it.k}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.72rem' }}>
                            <span style={{ color: it.color, fontWeight: 800 }}>{it.label}</span>
                            <span style={{ color: 'var(--text)', fontWeight: 900 }}>{it.n} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({((it.n / tot) * 100).toFixed(0)}%)</span></span>
                          </div>
                          <div style={{ height: '8px', background: 'var(--panel)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(it.n / tot) * 100}%`, background: it.color, borderRadius: '4px' }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* MODIFICADORES DE DEFINICIÓN */}
              <div className="bento-card">
                <div className="stat-label" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center' }}>
                  MODIFICADORES DE DEFINICIÓN <InfoBox texto="Detalles del remate cargados en la toma de datos: pelota al 2do palo, mano a mano, arquero adelantado, de espaldas, bajo presión, punteo. Cuántos goles tuvieron cada condición." />
                </div>
                {dataAnalizada.modificadores.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '10px 0' }}>
                    Sin modificadores cargados en estos goles.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {dataAnalizada.modificadores.map(m => {
                      const max = dataAnalizada.modificadores[0].value || 1;
                      return (
                        <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text)', fontWeight: 700, width: '110px', flexShrink: 0 }}>{m.name}</span>
                          <div style={{ flex: 1, height: '14px', background: 'var(--panel)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(m.value / max) * 100}%`, background: 'linear-gradient(90deg, #a855f7, #ec4899)', borderRadius: '4px' }}></div>
                          </div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 900, width: '24px', textAlign: 'right' }}>{m.value}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* ORIGEN DEL GOL - DONA */}
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#f59e0b', display: 'flex', alignItems: 'center' }}>
                ADN DE ANOTACIÓN <InfoBox texto="Distribución táctica de cómo se gestaron los goles." />
              </div>
              <div style={{ flex: 1, minHeight: '250px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dataAnalizada.dataPieOrigen} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                      {dataAnalizada.dataPieOrigen.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS_ORIGEN[entry.name] || '#8884d8'} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px' }} itemStyle={{ color: 'var(--text)', fontSize: '0.8rem', fontWeight: 800 }} />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '0.7rem' }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* DISTRIBUCIÓN TEMPORAL - HISTOGRAMA */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
                DISTRIBUCIÓN TEMPORAL <InfoBox texto="En qué momento de los tiempos marcamos más goles. Ayuda a ver si somos un equipo de reacción o de impacto inicial." />
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dataAnalizada.dataBarTiempo} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 10, fontWeight: 700 }} />
                  <YAxis stroke="var(--border)" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: 'var(--hover)' }} contentStyle={{ backgroundColor: 'var(--panel)', border: '1px solid var(--border)' }} />
                  <Bar dataKey="Goles" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={35} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            
            {/* MAPA DE DISPERSIÓN DE GOLES INTELIGENTE */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
                MAPA DE DISPERSIÓN xG <InfoBox texto="Punto exacto desde donde se pateó. El tamaño de la burbuja refleja la calidad de la chance (xG). Burbujas grandes = goles cantados. Burbujas chicas = goles fuera de contexto o de muy lejos." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px 0' }}>
                <div className="pitch-container" style={{ width: '100%', maxWidth: '500px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative', background: 'var(--panel)', border: '2px solid rgba(255,255,255,0.1)' }}>
                  
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: 'rgba(255,255,255,0.1)', transform: 'translateX(-50%)' }}></div>
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '2px solid rgba(255,255,255,0.1)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }}></div>
                  <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.1)', borderLeft: 'none', borderRadius: '0 100px 100px 0' }}></div>
                  <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '2px solid rgba(255,255,255,0.1)', borderRight: 'none', borderRadius: '100px 0 0 100px' }}></div>

                  {dataAnalizada.mapaGoles.map((g, i) => {
                    if (g.x == null || g.y == null) return null;
                    
                    // Cálculo dinámico del radio en función del xG (mínimo 8px, máximo sumando 20px extra para un gol hecho)
                    const baseSize = 8;
                    const xgMultiplier = g.xgCalc != null ? (g.xgCalc * 25) : 2; 
                    const size = baseSize + xgMultiplier;

                    return (
                      <div 
                        key={i} 
                        title={`Gol vs ${partidos.find(p=>p.id===g.id_partido)?.rival} - xG: ${g.xgCalc?.toFixed(2) || 'S/D'} - ${g.distancia?.toFixed(1)}m`}
                        style={{ 
                          position: 'absolute', 
                          left: `${g.x}%`, top: `${g.y}%`, 
                          width: `${size}px`, height: `${size}px`, 
                          backgroundColor: filtroEquipo === 'Rival' ? '#ef4444' : '#00ff88', 
                          border: '1px solid rgba(0,0,0,0.5)', 
                          borderRadius: '50%', 
                          transform: 'translate(-50%, -50%)', 
                          opacity: 0.85, zIndex: 2, 
                          boxShadow: filtroEquipo === 'Rival' ? '0 0 5px rgba(239,68,68,0.5)' : '0 0 5px rgba(0,255,136,0.5)'
                        }} 
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {/* CONEXIONES LETALES */}
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '20px', color: '#c084fc', display: 'flex', alignItems: 'center' }}>CONEXIONES LETALES <InfoBox texto="Las duplas Asistidor ➔ Goleador más efectivas del equipo." /></div>
              {dataAnalizada.topConexiones.length === 0 ? (
                 <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', marginTop: '30px' }}>No hay goles asistidos registrados.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dataAnalizada.topConexiones.map((con, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(192, 132, 252, 0.05)', border: '1px solid rgba(192, 132, 252, 0.2)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                        <div style={{ flex: 1, textAlign: 'right', fontWeight: 800, fontSize: '0.8rem', color: 'var(--text)' }}>{getNombre(con.asistidor)}</div>
                        <div style={{ color: '#c084fc', fontSize: '1rem' }}>➔</div>
                        <div style={{ flex: 1, textAlign: 'left', fontWeight: 800, fontSize: '0.8rem', color: '#00ff88' }}>{getNombre(con.definidor)}</div>
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', marginLeft: '20px', background: 'var(--bg)', padding: '2px 10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        {con.cantidad}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* TABLA DE DESGLOSE */}
          <div className="bento-card">
            <div className="stat-label" style={{ marginBottom: '20px' }}>REGISTRO DETALLADO DE GOLES</div>
            <TablaResponsive
              filas={dataAnalizada.tablaGoles}
              columnas={COLS_GOLES}
              colsClave={['minuto', 'xg', 'origen']}
              grupos={GRUPOS_GOLES}
              gruposLabel={GRUPOS_GOLES_LABEL}
              titulo="REGISTRO DETALLADO DE GOLES"
              vacio="No hay goles registrados con estos filtros."
              getId={(g) => g.id}
              getTitulo={(g) => `${g.autor}`}
              getSubtitulo={(g) => `vs ${g.rival.toUpperCase()} · ${g.competicion}`}
              colorCelda={(g, col) => {
                if (col.k === 'xg') return '#a855f7';
                if (col.k === 'minuto') return 'var(--accent)';
                if (col.k === 'asistidor') return '#c084fc';
                return 'var(--text)';
              }}
            >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'center', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>PARTIDO</th>
                    <th>MINUTO</th>
                    <th>AUTOR</th>
                    <th>ASISTENCIA</th>
                    <th>ORIGEN TÁCTICO</th>
                    <th>xG</th>
                    <th>DISTANCIA</th>
                  </tr>
                </thead>
                <tbody>
                  {dataAnalizada.tablaGoles.map(g => (
                    <tr key={g.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                      <td style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 700 }}>vs {g.rival.toUpperCase()} <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem', display: 'block' }}>{g.competicion}</span></td>
                      <td style={{ color: 'var(--accent)' }}>{g.minuto !== null ? `${g.minuto}' ${g.periodo}` : '-'}</td>
                      <td style={{ fontWeight: 800, color: filtroEquipo === 'Rival' ? '#ef4444' : '#00ff88' }}>{g.autor}</td>
                      <td style={{ color: '#c084fc', fontWeight: 700 }}>{g.asistidor}</td>
                      <td>
                        <span style={{ background: COLORS_ORIGEN[g.origen] || '#4b5563', color: g.origen === 'Penal / Sexta Falta' ? '#000' : '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                          {g.origen.toUpperCase()}
                        </span>
                        {g.modificadores && <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '3px' }}>{g.modificadores}</div>}
                      </td>
                      <td style={{ color: '#a855f7', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{g.xg}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{g.distancia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </TablaResponsive>
          </div>

        </div>
      )}
    </div>
  );
}

const selectStyle = { 
  padding: '8px 15px', 
  fontSize: '0.85rem', 
  background: 'var(--panel)', 
  color: 'var(--accent)', 
  border: '1px solid var(--border)', 
  borderRadius: '4px', 
  outline: 'none',
  fontWeight: 800,
  cursor: 'pointer'
};

export default OrigenGoles;