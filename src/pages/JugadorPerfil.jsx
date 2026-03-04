import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';

// IMPORTAMOS LOS MOTORES
import { calcularRatingJugador } from '../analytics/rating';
import { calcularXGEvento } from '../analytics/xg';

// --- COMPONENTE TOOLTIP UX ---
const InfoBox = ({ texto }) => (
  <div className="tooltip-container" tabIndex="0" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '6px', position: 'relative', cursor: 'help', verticalAlign: 'middle', outline: 'none' }}>
    <div style={{ width: '15px', height: '15px', borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>!</div>
    <div className="tooltip-text" style={{ position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', width: '220px', textAlign: 'center', border: '1px solid #333', zIndex: 100, pointerEvents: 'none', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', fontFamily: 'Inter', textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', lineHeight: '1.4' }}>
      {texto}
    </div>
  </div>
);

function JugadorPerfil() {
  const [jugadores, setJugadores] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [eventos, setEventos] = useState([]);
  
  const [jugadorId, setJugadorId] = useState('');
  const [partidoFiltro, setPartidoFiltro] = useState('Todos');
  const [tipoMapa, setTipoMapa] = useState('puntos');
  const [eventoHover, setEventoHover] = useState(null);
  
  // NUEVO ESTADO PARA LA GRILLA
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

  const jugadorSeleccionado = useMemo(() => jugadores.find(j => j.id == jugadorId), [jugadores, jugadorId]);

  // CATEGORÍAS ÚNICAS PARA EL FILTRO DE LA GRILLA
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

    const evFiltrados = partidoFiltro === 'Todos' 
      ? eventos 
      : eventos.filter(ev => ev.id_partido == partidoFiltro);

    if (!evFiltrados.length) return { vacio: true };

    const stats = {
      goles: 0, asistencias: 0, atajados: 0, desviados: 0, rebatidos: 0, remates: 0,
      recuperaciones: 0, recAltas: 0, perdidas: 0, perdidasPeligrosas: 0,
      faltas: 0, xG: 0, amarillas: 0, rojas: 0
    };

    const partidosJugados = new Set(evFiltrados.map(e => e.id_partido)).size;

    evFiltrados.forEach(ev => {
      const zonaX = ev.zona_x || 0;
      const esAtaque = zonaX > 66;
      const esDefensa = zonaX < 33;

      if (ev.id_asistencia == jugadorId && (ev.accion === 'Remate - Gol' || ev.accion === 'Gol')) {
        stats.asistencias++;
      }

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

  const getColorAccion = (acc) => {
    const col = { 'Remate - Gol': '#00ff88', 'Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7', 'Recuperación': '#eab308', 'Pérdida': '#ef4444' };
    return col[acc] || '#fff';
  };

  // --- VISTA 1: DIRECTORIO DE JUGADORES (GRILLA) ---
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
            <select value={filtroCategoriaGrid} onChange={(e) => setFiltroCategoriaGrid(e.target.value)} style={{ marginTop: '5px', width: '200px' }}>
              <option value="Todas">TODAS LAS CATEGORÍAS</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
          {jugadoresGrid.map(j => (
            <div 
              key={j.id} 
              className="bento-card player-card" 
              onClick={() => setJugadorId(j.id)}
              style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s, border-color 0.2s', padding: '20px' }}
            >
              {/* DORSAL MARCA DE AGUA */}
              <div style={{ position: 'absolute', right: '-10px', top: '-20px', fontSize: '6rem', fontWeight: 900, color: 'rgba(255,255,255,0.03)', fontFamily: 'JetBrains Mono', pointerEvents: 'none' }}>
                {j.dorsal}
              </div>

              {/* FOTO PLACEHOLDER */}
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '15px' }}>
                {j.apellido ? j.apellido.charAt(0) : ''}{j.nombre ? j.nombre.charAt(0) : ''}
              </div>

              {/* INFO TEXTUAL */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>{j.apellido || '-'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginTop: '4px' }}>{j.nombre || '-'}</div>
              </div>

              {/* BADGES */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '15px', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                <span style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                  {j.puesto || 'S/P'}
                </span>
                <span style={{ background: '#222', color: '#aaa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                  {j.perfil || 'S/Perfil'}
                </span>
                <span style={{ background: '#222', color: '#aaa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                  #{j.dorsal}
                </span>
              </div>
            </div>
          ))}
          {jugadoresGrid.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
              No hay jugadores en esta categoría.
            </div>
          )}
        </div>
        
        {/* Agrego un hover state rapido en linea para las cards */}
        <style>{`
          .player-card:hover { transform: translateY(-5px); border-color: var(--accent); }
        `}</style>
      </div>
    );
  }

  // --- VISTA 2: PERFIL ANALÍTICO (EL CÓDIGO ANTERIOR) ---
  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      
      <style>{`
        .tooltip-text { visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
        .tooltip-container:hover .tooltip-text, .tooltip-container:focus .tooltip-text { visibility: visible; opacity: 1; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setJugadorId('')} 
            style={{ padding: '8px 15px', background: 'transparent', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            ⬅ VOLVER A LA GRILLA
          </button>
          
          {jugadorId && (
            <div>
              <div className="stat-label">FILTRO DE PARTIDO</div>
              <select value={partidoFiltro} onChange={(e) => setPartidoFiltro(e.target.value)} style={{ marginTop: '5px', width: '250px' }}>
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
          
          {/* HEADER DEL JUGADOR */}
          <div className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: '30px', background: 'linear-gradient(90deg, #111 0%, #000 100%)', borderLeft: '4px solid var(--accent)' }}>
            
            {/* Foto Real (Cuando la tengas, reemplazás el div por un <img src={jugadorSeleccionado.foto} />) */}
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                {jugadorSeleccionado.apellido ? jugadorSeleccionado.apellido.charAt(0) : ''}{jugadorSeleccionado.nombre ? jugadorSeleccionado.nombre.charAt(0) : ''}
            </div>

            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', color: '#fff', lineHeight: 1 }}>{jugadorSeleccionado.apellido}</div>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', marginTop: '5px' }}>{jugadorSeleccionado.nombre} <span className="mono-accent" style={{marginLeft: '10px'}}>#{jugadorSeleccionado.dorsal}</span></div>
            </div>
            
            <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', gap: '20px' }}>
               <div style={{ textAlign: 'right' }}>
                 <div className="stat-label">PUESTO</div>
                 <div className="stat-value" style={{ fontSize: '1.2rem', color: '#00ff88' }}>{jugadorSeleccionado.puesto || '-'}</div>
               </div>
               <div style={{ textAlign: 'right' }}>
                 <div className="stat-label">PARTIDOS ANALIZADOS</div>
                 <div className="stat-value" style={{ fontSize: '1.2rem' }}>{perfil.partidosJugados}</div>
               </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">
                  IMPACTO (RATING) 
                  <InfoBox texto="Algoritmo global que califica al jugador sumando sus acciones positivas y restando las negativas, ajustado por su rol táctico." />
                </div>
                <div className="stat-value" style={{ color: perfil.impacto > 0 ? 'var(--accent)' : '#ef4444' }}>{perfil.impacto > 0 ? '+' : ''}{perfil.impacto.toFixed(1)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Algoritmo de rendimiento contextual</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">
                  EFICACIA EN REMATES 
                  <InfoBox texto="Porcentaje de remates que terminan en gol. Arriba del 20% es nivel élite en futsal." />
                </div>
                <div className="stat-value" style={{ color: '#fff' }}>{perfil.eficacia}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>{perfil.stats.goles} Goles / {perfil.stats.remates} Tiros</div>
             </div>
             <div className="bento-card" style={{ textAlign: 'center' }}>
                <div className="stat-label">
                  RATIO DEFENSIVO 
                  <InfoBox texto="De todas las intervenciones divididas del jugador (Robos + Pérdidas), qué porcentaje son positivas. Mide la seguridad con el balón." />
                </div>
                <div className="stat-value" style={{ color: perfil.ratioSeguridad > 50 ? 'var(--accent)' : '#ef4444' }}>{perfil.ratioSeguridad}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>Recuperaciones vs Pérdidas</div>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="bento-card">
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>RADIOGRAFÍA OFENSIVA</div>
              <div style={kpiFila}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  EXPECTATIVA DE GOL (xG) 
                  <InfoBox texto="Mide la probabilidad matemática (0 a 1) de que un remate sea gol en función de su distancia al arco y su ángulo." />
                </span>
                <strong>{perfil.stats.xG.toFixed(2)}</strong>
              </div>
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
              <div style={kpiSubFila}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  ↳ Presión Alta (Campo Rival) 
                  <InfoBox texto="Robos de pelota efectuados en el último tercio de la cancha. Generan transiciones altamente peligrosas." />
                </span>
                <strong style={{color:'#eab308'}}>{perfil.stats.recAltas}</strong>
              </div>
              
              <div style={kpiFila}><span>PERDIDAS DE BALÓN</span><strong style={{color: '#ef4444'}}>{perfil.stats.perdidas}</strong></div>
              <div style={kpiSubFila}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  ↳ Peligrosas (En propia salida) 
                  <InfoBox texto="Pérdidas de pelota en el primer tercio defensivo. Suelen terminar en tiros peligrosos en contra." />
                </span>
                <strong style={{color:'#ef4444'}}>{perfil.stats.perdidasPeligrosas}</strong>
              </div>
              
              <div style={kpiFila}><span>FALTAS COMETIDAS</span><strong>{perfil.stats.faltas}</strong></div>
            </div>
          </div>

          <div className="bento-card">
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div className="stat-label" style={{ display: 'flex', alignItems: 'center' }}>
                  MAPA DE ACCIONES ({tipoMapa.toUpperCase()})
                  <InfoBox texto="Visualización espacial. Pasa el mouse sobre un punto para ver en qué minuto exacto ocurrió esa acción." />
                </div>
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

const kpiFila = { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #222', fontFamily: 'JetBrains Mono', fontSize: '0.9rem', alignItems: 'center' };
const kpiSubFila = { display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 15px', fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: 'var(--text-dim)', alignItems: 'center' };
const btnTab = { border: 'none', padding: '8px 15px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, borderRadius: '2px', transition: '0.2s' };

export default JugadorPerfil;