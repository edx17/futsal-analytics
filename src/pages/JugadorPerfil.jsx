import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';

// IMPORTAMOS EL NUEVO MOTOR DE RATING
import { calcularRatingJugador } from '../analytics/rating';

function JugadorPerfil() {
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  const [jugadorId, setJugadorId] = useState('');
  const [partidoFiltro, setPartidoFiltro] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('puntos');
  const [eventoHover, setEventoHover] = useState(null);

  // 1. Carga inicial de catálogos
  useEffect(() => {
    async function cargarCatalogos() {
      const { data: j } = await supabase.from('jugadores').select('*').order('dorsal');
      const { data: p } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      setJugadores(j || []);
      setPartidos(p || []);
    }
    cargarCatalogos();
  }, []);

  // 2. Cargar eventos cuando se elige un jugador (MODIFICADO PARA ASISTENCIAS)
  useEffect(() => {
    async function fetchEventosJugador() {
      if (!jugadorId) {
        setEventos([]);
        return;
      }
      const { data } = await supabase.from('eventos')
        .select('*')
        .or(`id_jugador.eq.${jugadorId},id_asistencia.eq.${jugadorId}`)
        .order('id_partido', { ascending: false });
      setEventos(data || []);
    }
    fetchEventosJugador();
  }, [jugadorId]);

  // Identificamos al jugador seleccionado antes del useMemo para pasarlo al motor
  const jugadorSeleccionado = useMemo(() => jugadores.find(j => j.id == jugadorId), [jugadores, jugadorId]);

  // --- MOTOR ANALÍTICO INDIVIDUAL ---
  const perfil = useMemo(() => {
    if (!jugadorId || !eventos.length || !jugadorSeleccionado) return null;

    // Filtramos por partido si corresponde
    const evFiltrados = partidoFiltro === 'Todos' 
      ? eventos 
      : eventos.filter(ev => ev.id_partido == partidoFiltro);

    if (!evFiltrados.length) return { vacio: true };

    const stats = {
      goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0,
      recuperaciones: 0, recAltas: 0, perdidas: 0, perdidasPeligrosas: 0,
      faltas: 0, xG: 0, amarillas: 0, rojas: 0
    };

    // Partidos únicos jugados
    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x || 0;
      const zonaY = ev.zona_y || 0;
      const esAtaque = zonaX > 66;
      const esDefensa = zonaX < 33;
      const esCentroArea = zonaX > 80 && zonaY > 30 && zonaY < 70;

      // Evaluar Asistencia
      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) {
        stats.asistencias++;
      }

      // Evaluar acciones como ejecutor principal
      if (ev.id_jugador == jugadorId) {
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') { stats.goles++; stats.remates++; stats.xG += (esCentroArea ? 0.25 : (esAtaque ? 0.12 : 0.05)); }
        else if (ev.accion === 'Remate - Atajado') { stats.atajados++; stats.remates++; stats.xG += (esCentroArea ? 0.15 : (esAtaque ? 0.05 : 0.02)); }
        else if (ev.accion === 'Remate - Desviado') { stats.desviados++; stats.remates++; stats.xG += (esCentroArea ? 0.15 : (esAtaque ? 0.05 : 0.02)); }
        else if (ev.accion === 'Remate - Rebatido') { stats.rebatidos++; stats.remates++; stats.xG += (esCentroArea ? 0.15 : (esAtaque ? 0.05 : 0.02)); }
        else if (ev.accion === 'Recuperación') { stats.recuperaciones++; if (esAtaque) stats.recAltas++; }
        else if (ev.accion === 'Pérdida') { stats.perdidas++; if (esDefensa) stats.perdidasPeligrosas++; }
        else if (ev.accion === 'Falta cometida') stats.faltas++;
        else if (ev.accion === 'Tarjeta Amarilla') stats.amarillas++;
        else if (ev.accion === 'Tarjeta Roja') stats.rojas++;
      }
    });

    // Ratios Pro
    const eficacia = stats.remates > 0 ? ((stats.goles / stats.remates) * 100).toFixed(0) : 0;
    const volumenAcciones = stats.recuperaciones + stats.perdidas;
    const ratioSeguridad = volumenAcciones > 0 ? ((stats.recuperaciones / volumenAcciones) * 100).toFixed(0) : 0;

    // 🔥 NUEVO CÁLCULO DE RATING CONTEXTUALIZADO 🔥
    // Creamos un proxy de Plus/Minus basado en sus aciertos y errores graves,
    // y llamamos a la misma función universal que usan Resumen y Temporada.
    const proxyPM = (stats.goles + stats.asistencias) - (stats.perdidasPeligrosas * 1.5);
    const impacto = calcularRatingJugador(jugadorSeleccionado, evFiltrados, proxyPM);

    return { stats, evFiltrados, partidosJugados, eficacia, ratioSeguridad, impacto, vacio: false };
  }, [eventos, partidoFiltro, jugadorId, jugadorSeleccionado]);

  // --- DICCIONARIO Y COLORES ---
  const getColorAccion = (acc) => {
    const col = { 'Remate - Gol': '#00ff88', 'Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7', 'Recuperación': '#eab308', 'Pérdida': '#ef4444' };
    return col[acc] || '#fff';
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      {/* HEADER Y FILTROS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="stat-label">RESUMEN INDIVIDUAL</div>
            <select value={jugadorId} onChange={(e) => setJugadorId(e.target.value)} style={{ marginTop: '5px', width: '250px', borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}>
              <option value="">-- SELECCIONAR JUGADOR --</option>
             {jugadores.map(j => (
                <option key={j.id} value={j.id}>{j.dorsal} - {j.apellido ? j.apellido.toUpperCase() + ', ' + j.nombre : j.nombre}</option>
              ))}
            </select>
          </div>
          
          {jugadorId && (
            <div>
              <div className="stat-label">FILTRO DE PARTIDO</div>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ marginTop: '5px', width: '200px' }}>
                <option value="Todos">TODA LA TEMPORADA</option>
                {partidos.map(p => <option key={p.id} value={p.id}>{p.rival.toUpperCase()} // {p.fecha}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {perfil?.vacio && (
        <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          El jugador no tiene datos registrados en este filtro.
        </div>
      )}

      {jugadorSeleccionado && perfil && !perfil.vacio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* TARJETA DE IDENTIFICACIÓN */}
          <div className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: '30px', background: 'linear-gradient(90deg, #111 0%, #000 100%)', borderLeft: '4px solid var(--accent)' }}>
            <div style={{ fontSize: '5rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>{jugadorSeleccionado.dorsal}</div>
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>{jugadorSeleccionado.apellido}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', letterSpacing: '2px' }}>{partidoFiltro === 'Todos' ? 'MÉTRICAS ACUMULADAS' : 'MÉTRICAS DEL PARTIDO'}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
               <div className="stat-label">PARTIDOS ANALIZADOS</div>
               <div className="stat-value">{perfil.partidosJugados}</div>
            </div>
          </div>

          {/* KPIs RÁPIDOS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">IMPACTO (RATING)</div>
                <div className="stat-value" style={{ color: perfil.impacto > 0 ? 'var(--accent)' : '#ef4444' }}>{perfil.impacto > 0 ? '+' : ''}{perfil.impacto}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Algoritmo de rendimiento contextual</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">EFICACIA EN REMATES</div>
                <div className="stat-value" style={{ color: '#fff' }}>{perfil.eficacia}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>{perfil.stats.goles} Goles / {perfil.stats.remates} Tiros</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">RATIO DEFENSIVO</div>
                <div className="stat-value" style={{ color: perfil.ratioSeguridad > 50 ? 'var(--accent)' : '#ef4444' }}>{perfil.ratioSeguridad}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Recuperaciones vs Pérdidas</div>
             </div>
          </div>

          {/* RADIOGRAFÍA TÁCTICA */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>RADIOGRAFÍA OFENSIVA</div>
              <div style={kpiFila}><span>EXPECTATIVA DE GOL (xG)</span><strong>{perfil.stats.xG.toFixed(2)}</strong></div>
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
              <div style={kpiSubFila}><span>↳ Presión Alta (Campo Rival)</span><strong style={{color:'#eab308'}}>{perfil.stats.recAltas}</strong></div>
              
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{perfil.stats.perdidas}</strong></div>
              <div style={kpiSubFila}><span>↳ Peligrosas (En propia salida)</span><strong style={{color:'#ef4444'}}>{perfil.stats.perdidasPeligrosas}</strong></div>
              
              <div style={kpiFila}><span>FALTAS COMETIDAS</span><strong>{perfil.stats.faltas}</strong></div>
            </div>
          </div>

          {/* MAPA DE ACCIONES DEL JUGADOR */}
          <div className="bento-card">
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div className="stat-label">MAPA DE ACCIONES ({tipoMapa.toUpperCase()})</div>
                <div style={{ display: 'flex', gap: '5px', background: '#000', padding: '3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <button onClick={() => setTipoMapa('puntos')} style={{ ...btnTab, background: tipoMapa === 'puntos' ? '#333' : 'transparent', color: tipoMapa === 'puntos' ? 'var(--accent)' : 'var(--text-dim)' }}>TODOS</button>
                  <button onClick={() => setTipoMapa('remates')} style={{ ...btnTab, background: tipoMapa === 'remates' ? '#333' : 'transparent', color: tipoMapa === 'remates' ? 'var(--accent)' : 'var(--text-dim)' }}>SÓLO REMATES</button>
                </div>
             </div>
             
             <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="pitch-container" style={{ width: '100%', maxWidth: '800px', aspectRatio: '2/1', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: 'var(--border)', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: '1px solid var(--border)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', zIndex: 0 }}></div>
                <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: '1px solid var(--border)', borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', zIndex: 0 }}></div>

                {perfil.evFiltrados
                  .filter(ev => tipoMapa === 'puntos' || ev.accion.includes('Remate'))
                  .map(ev => ev.zona_x && (
                  <div 
                    key={ev.id} 
                    onMouseEnter={() => setEventoHover(ev)}
                    onMouseLeave={() => setEventoHover(null)}
                    style={{ 
                      position: 'absolute', left: `${ev.zona_x}%`, top: `${ev.zona_y}%`, 
                      width: '14px', height: '14px', backgroundColor: getColorAccion(ev.accion), 
                      border: '1px solid #000', borderRadius: '50%', transform: 'translate(-50%, -50%)',
                      cursor: 'pointer', zIndex: 2, opacity: 0.85
                    }} 
                  />
                ))}

                {eventoHover && (
                  <div style={{ position: 'absolute', bottom: '15px', left: '50%', transform: 'translateX(-50%)', background: '#111', border: `1px solid ${getColorAccion(eventoHover.accion)}`, padding: '10px', borderRadius: '4px', zIndex: 10, textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ color: getColorAccion(eventoHover.accion), fontWeight: 800, fontSize: '0.8rem' }}>{eventoHover.accion.toUpperCase()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '5px' }}>MIN: {eventoHover.minuto}'</div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontFamily: 'JetBrains Mono', fontSize: '0.9rem' };
const kpiSubFila = { display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 15px', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: 'var(--text-dim)' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default JugadorPerfil;