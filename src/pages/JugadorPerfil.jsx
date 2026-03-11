import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';

// IMPORTAMOS LOS MOTORES
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';

const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', verticalAlign: 'middle', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
    <div className="tooltip-text" style={{ position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' }}>
      {texto}
    </div>
  </div>
);

function JugadorPerfil() {
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  // --- NUEVO ESTADO WELLNESS ---
  const [wellnessJugador, setWellnessJugador] = useState([]);
  
  const [jugadorId, setJugadorId] = useState('');
  const [partidoFiltro, setPartidoFiltro] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('puntos');
  const [eventoHover, setEventoHover] = useState(null);
  
  const [filtroCategoriaGrid, setFiltroCategoriaGrid] = useState('Todas');

  useEffect(() => {
    async function cargarCatalogos() {
      const { data: j } = await supabase.from('jugadores').select('*').order('dorsal');
      const { data: p } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      setJugadores(j || []);
      setPartidos(p || []);
    }
    cargarCatalogos();
  }, []);

  // CARGAMOS EVENTOS TÁCTICOS Y WELLNESS DEL JUGADOR
  useEffect(() => {
    async function fetchDataJugador() {
      if (!jugadorId) {
        setEventos([]);
        setWellnessJugador([]);
        return;
      }
      // 1. Táctico
      const { data: evs } = await supabase.from('eventos').select('*').or(`id_jugador.eq.${jugadorId},id_asistencia.eq.${jugadorId}`).order('id_partido', { ascending: false });
      setEventos(evs || []);

      // 2. Físico / Cargas (Últimos 30 registros)
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

    if (!evFiltrados.length) return { vacio: true };

    const stats = { goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0, recuperaciones: 0, recAltas: 0, perdidas: 0, perdidasPeligrosas: 0, faltas: 0, xG: 0, amarillas: 0, rojas: 0 };
    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x || 0;
      const esAtaque = zonaX > 66;
      const esDefensa = zonaX < 33;

      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) stats.asistencias++;

      if (ev.id_jugador == jugadorId) {
        const xgEvento = calcularXGEvento(ev);
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { stats.goles++; stats.remates++; stats.xG += xgEvento; }
        else if (ev.accion === 'Remate - Atajado') { stats.atajados++; stats.remates++; stats.xG += xgEvento; }
        else if (ev.accion === 'Remate - Desviado') { stats.desviados++; stats.remates++; stats.xG += xgEvento; }
        else if (ev.accion === 'Remate - Rebatido') { stats.rebatidos++; stats.remates++; stats.xG += xgEvento; }
        else if (ev.accion === 'Recuperación') { stats.recuperaciones++; if (esAtaque) stats.recAltas++; }
        else if (ev.accion === 'Pérdida') { stats.perdidas++; if (esDefensa) stats.perdidasPeligrosas++; }
        else if (ev.accion === 'Falta cometida') stats.faltas++;
      }
    });

    const eficacia = stats.remates > 0 ? ((stats.goles / stats.remates) * 100).toFixed(0) : 0;
    const volumenAcciones = stats.recuperaciones + stats.perdidas;
    const ratioSeguridad = volumenAcciones > 0 ? ((stats.recuperaciones / volumenAcciones) * 100).toFixed(0) : 0;
    const proxyPM = (stats.goles + stats.asistencias) - (stats.perdidasPeligrosas * 1.5);
    const impacto = calcularRatingJugador(jugadorSeleccionado, evFiltrados, proxyPM);

    return { stats, evFiltrados, partidosJugados, eficacia, ratioSeguridad, impacto, vacio: false };
  }, [eventos, partidoFiltro, jugadorId, jugadorSeleccionado]);

  // --- CÁLCULO DE MÉTRICAS WELLNESS DE LA SEMANA SEGÚN EL FILTRO ---
  const metricasWellness = useMemo(() => {
    if (!wellnessJugador.length) return null;

    let arrayFiltro = [];
    
    if (partidoFiltro === 'Todos') {
      // Si ve la temporada, le mostramos el promedio de los últimos 7 días como su foto actual.
      arrayFiltro = wellnessJugador.slice(0, 7);
    } else {
      // Si ve un partido específico, mostramos los 7 días previos a ESE partido.
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
      cargaAguda: arrayFiltro.reduce((a,b) => a + (b.carga_diaria || 0), 0) // Carga semanal acumulada
    };
  }, [wellnessJugador, partidoFiltro, partidos]);

  const getColorAccion = (acc) => {
    const col = { 'Remate - Gol': '#00ff88', 'Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7', 'Recuperación': '#eab308', 'Pérdida': '#ef4444' };
    return col[acc] || '#fff';
  };

  if (!jugadorId) {
     return (
       <div style={{ animation: 'fadeIn 0.3s' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
           <div>
             <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>DIRECTORIO DE PLANTEL</div>
             <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '5px' }}>Seleccioná un jugador para ver su analítica completa.</div>
           </div>
           <div>
             <div className="stat-label">FILTRAR POR CATEGORÍA</div>
             <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '200px', background: '#000', color: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #333' }}>
               <option value="Todas">TODAS LAS CATEGORÍAS</option>
               {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
             </select>
           </div>
         </div>

         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
           {jugadoresGrid.map(j => (
             <div key={j.id} className="bento-card player-card" onClick={() => setJugadorId(j.id)} style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}>
               <div style={{ position: 'absolute', right: '-10px', top: '-20px', fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }}>{j.dorsal}</div>
               <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '15px' }}>
                 {j.apellido ? j.apellido.charAt(0) : ''}{j.nombre ? j.nombre.charAt(0) : ''}
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
      
      <style>{`
        .tooltip-text { visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => setJugadorId('')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>⬅ VOLVER A LA GRILLA</button>
          {jugadorId && (
            <div>
              <div className="stat-label">FILTRO DE PARTIDO</div>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ marginTop: '5px', width: '250px', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '8px', borderRadius: '4px' }}>
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
          
          <div className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: '30px', background: 'linear-gradient(90deg, #111 0%, #000 100%)', borderLeft: '4px solid var(--accent)' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                {jugadorSeleccionado.apellido ? jugadorSeleccionado.apellido.charAt(0) : ''}{jugadorSeleccionado.nombre ? jugadorSeleccionado.nombre.charAt(0) : ''}
            </div>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1 }}>{jugadorSeleccionado.apellido}</div>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', marginTop: '5px' }}>{jugadorSeleccionado.nombre} <span className="mono-accent" style={{marginLeft: '10px'}}>#{jugadorSeleccionado.dorsal}</span></div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', gap: '20px' }}>
               <div style={{ textAlign: 'right' }}>
                 <div className="stat-label">PUESTO</div><div className="stat-value" style={{ fontSize: '1.2rem', color: '#00ff88' }}>{jugadorSeleccionado.posicion || '-'}</div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div className="stat-label">PARTIDOS</div><div className="stat-value" style={{ fontSize: '1.2rem' }}>{perfil.partidosJugados}</div>
               </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">IMPACTO (RATING)</div>
                <div className="stat-value" style={{ color: perfil.impacto > 0 ? 'var(--accent)' : '#ef4444' }}>{perfil.impacto > 0 ? '+' : ''}{perfil.impacto.toFixed(1)}</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">EFICACIA EN REMATES</div>
                <div className="stat-value" style={{ color: '#fff' }}>{perfil.eficacia}%</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">RATIO DEFENSIVO</div>
                <div className="stat-value" style={{ color: perfil.ratioSeguridad > 50 ? 'var(--accent)' : '#ef4444' }}>{perfil.ratioSeguridad}%</div>
             </div>
          </div>

          {/* --- NUEVO BLOQUE: CRUCE DE WELLNESS AL MEDIO DEL SCOUTING --- */}
          {metricasWellness && (
            <div className="bento-card" style={{ background: '#0a0a0a', border: '1px solid #3b82f6' }}>
              <div className="stat-label" style={{ color: '#3b82f6', marginBottom: '15px' }}>
                🩺 CONTEXTO DE CARGAS {partidoFiltro === 'Todos' ? '(PROMEDIO ACTUAL)' : '(PROMEDIO SEMANA PREVIA)'}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>RADIOGRAFÍA OFENSIVA</div>
              <div style={kpiFila}><span style={{ display: 'flex', alignItems: 'center' }}>EXPECTATIVA DE GOL (xG)</span><strong>{perfil.stats.xG.toFixed(2)}</strong></div>
              <div style={kpiFila}><span>ASISTENCIAS</span><strong style={{color:'var(--accent)'}}>{perfil.stats.asistencias}</strong></div>
              <div style={kpiFila}><span>REMATES TOTALES</span><strong>{perfil.stats.remates}</strong></div>
              {perfil.stats.remates > 0 && (
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid #222' }}>
                  <div style={kpiSubFila}><span>↳ Goles</span><strong style={{color:'var(--accent)'}}>{perfil.stats.goles}</strong></div>
                  <div style={kpiSubFila}><span>↳ Atajados por rival</span><strong style={{color:'#3b82f6'}}>{perfil.stats.atajados}</strong></div>
                  <div style={kpiSubFila}><span>↳ Desviados (Fuera)</span><strong style={{color:'#888888'}}>{perfil.stats.desviados}</strong></div>
                  <div style={kpiSubFila}><span>↳ Rebatidos (Bloqueados)</span><strong style={{color:'#a855f7'}}>{perfil.stats.rebatidos}</strong></div>
                </div>
              )}
            </div>
            
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: '#eab308' }}>RADIOGRAFIA DEFENSIVA</div>
              <div style={kpiFila}><span>RECUPERACIONES</span><strong style={{color: 'var(--accent)'}}>{perfil.stats.recuperaciones}</strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Presión Alta (Campo Rival)</span><strong style={{color:'#eab308'}}>{perfil.stats.recAltas}</strong></div>
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{perfil.stats.perdidas}</strong></div>
              <div style={kpiSubFila}><span style={{ display: 'flex', alignItems: 'center' }}>↳ Peligrosas (En propia salida)</span><strong style={{color:'#ef4444'}}>{perfil.stats.perdidasPeligrosas}</strong></div>
              <div style={kpiFila}><span>FALTAS COMETIDAS</span><strong>{perfil.stats.faltas}</strong></div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontSize: '0.9rem', alignItems: 'center' };
const kpiSubFila = { display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 15px', fontSize: '0.75rem', color: 'var(--text-dim)', alignItems: 'center' };

export default JugadorPerfil;