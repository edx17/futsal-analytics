import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function Torneos() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();

  const [torneos, setTorneos] = useState([]);
  const [rivales, setRivales] = useState([]);
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [fixture, setFixture] = useState([]);
  
  const [mostrarModalTorneo, setMostrarModalTorneo] = useState(false);
  const [mostrarModalFixture, setMostrarModalFixture] = useState(false);
  
  const [formTorneo, setFormTorneo] = useState({ nombre: '', categoria: 'Primera' });
  const [formFixture, setFormFixture] = useState({
    rival_id: '', jornada: '', fecha_partido: '', condicion: 'Local', estado: 'Pendiente', goles_propios: 0, goles_rival: 0
  });

  useEffect(() => {
    if (clubId) {
      fetchTorneos();
      fetchRivales();
    }
  }, [clubId]);

  const fetchTorneos = async () => {
    const { data } = await supabase.from('torneos').select('*').eq('club_id', clubId).order('id', { ascending: false });
    if (data) {
      setTorneos(data);
      if (data.length > 0 && !torneoActivo) setTorneoActivo(data[0]);
    }
  };

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  // --- EL FILTRO ESTRICTO DE CATEGORÍA ESTÁ ACÁ ---
  const fetchFixture = async (idTorneo, categoriaTorneo) => {
    const { data } = await supabase
      .from('partidos')
      .select('*, rivales(nombre, escudo)')
      .eq('torneo_id', idTorneo)
      .eq('categoria', categoriaTorneo) // Candado: Solo trae los de esta categoría
      .order('jornada', { ascending: true });
    if (data) setFixture(data);
  };

  useEffect(() => {
    if (torneoActivo) fetchFixture(torneoActivo.id, torneoActivo.categoria);
  }, [torneoActivo]);

  const handleGuardarTorneo = async () => {
    if (!formTorneo.nombre) return alert("El nombre es obligatorio");
    const { error } = await supabase.from('torneos').insert([{ ...formTorneo, club_id: clubId }]);
    if (!error) {
      setMostrarModalTorneo(false);
      setFormTorneo({ nombre: '', categoria: 'Primera' });
      fetchTorneos();
      alert("¡Torneo guardado con éxito!");
    } else alert("Error de Supabase: " + error.message);
  };

  const handleGuardarFixture = async () => {
    if (!formFixture.rival_id || !formFixture.jornada) return alert("Rival y Jornada son obligatorios");
    
    const rivalSeleccionado = rivales.find(r => r.id === formFixture.rival_id);

    const nuevoPartido = {
      club_id: clubId,
      torneo_id: torneoActivo.id,
      rival_id: formFixture.rival_id,
      rival: rivalSeleccionado ? rivalSeleccionado.nombre : '',
      jornada: formFixture.jornada,
      fecha: formFixture.fecha_partido, 
      condicion: formFixture.condicion,
      estado: formFixture.estado,
      goles_propios: formFixture.goles_propios,
      goles_rival: formFixture.goles_rival,
      categoria: torneoActivo.categoria, 
      competicion: 'TORNEO'
    };

    const { error } = await supabase.from('partidos').insert([nuevoPartido]);
    
    if (!error) {
      setMostrarModalFixture(false);
      fetchFixture(torneoActivo.id, torneoActivo.categoria);
      alert("¡Fecha agregada al fixture!");
    } else alert("Error de Supabase: " + error.message);
  };

  const actualizarResultado = async (id, goles_propios, goles_rival, estado) => {
    await supabase.from('partidos').update({ goles_propios, goles_rival, estado }).eq('id', id);
    fetchFixture(torneoActivo.id, torneoActivo.categoria);
  };

  // --- EL SEGURO ANTI-CAGADAS ESTÁ ACÁ ---
  const eliminarPartido = async (idPartido) => {
    // 1. Contamos si hay eventos asociados a este partido
    const { count, error: errorEventos } = await supabase
      .from('eventos')
      .select('*', { count: 'exact', head: true })
      .eq('id_partido', idPartido);

    if (errorEventos) {
      return alert("Error al verificar los datos del partido: " + errorEventos.message);
    }

    // 2. Si hay eventos, frenamos la eliminación para no perder datos
    if (count > 0) {
      return alert(`⚠️ BLOQUEO DE SEGURIDAD: Este partido tiene ${count} acciones trackeadas. No podés borrarlo desde acá para no perder los datos. Si ves un duplicado, probá borrando el otro que debería estar vacío.`);
    }

    // 3. Si está vacío, confirmamos y borramos tranquilos
    if (window.confirm("✅ Este partido está completamente vacío (0 datos trackeados). ¿Estás seguro de que querés eliminar este duplicado del fixture?")) {
      const { error } = await supabase.from('partidos').delete().eq('id', idPartido);
      if (!error) {
        fetchFixture(torneoActivo.id, torneoActivo.categoria);
      } else {
        alert("Error al eliminar: " + error.message);
      }
    }
  };

  const irATrackear = (partido) => {
    navigate('/toma-datos', { state: { partido } });
  };

  const stats = fixture.filter(f => f.estado === 'Jugado').reduce((acc, f) => {
    acc.pj++;
    acc.gf += Number(f.goles_propios);
    acc.gc += Number(f.goles_rival);
    if (f.goles_propios > f.goles_rival) acc.pg++;
    else if (f.goles_propios === f.goles_rival) acc.pe++;
    else acc.pp++;
    return acc;
  }, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });
  const pts = (stats.pg * 3) + (stats.pe * 1);

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🏆</div>
          <div>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>GESTOR DE COMPETICIÓN</div>
            <select 
              value={torneoActivo?.id || ''} 
              onChange={(e) => setTorneoActivo(torneos.find(t => t.id === e.target.value))}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', fontWeight: 900, outline: 'none', cursor: 'pointer', appearance: 'none' }}
            >
              {torneos.length === 0 && <option value="">NO HAY TORNEOS...</option>}
              {torneos.map(t => <option key={t.id} value={t.id} style={{ background: '#000' }}>{t.nombre.toUpperCase()} ({t.categoria})</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => setMostrarModalTorneo(true)} className="btn-secondary" style={{ fontSize: '0.8rem' }}>+ NUEVO TORNEO</button>
      </div>

      {torneoActivo ? (
        <>
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '15px', marginBottom: '20px', textAlign: 'center' }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>{pts}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PUNTOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.pj}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>JUGADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#00ff88' }}>{stats.pg}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GANADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fbbf24' }}>{stats.pe}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>EMPATADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{stats.pp}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PERDIDOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.gf}:{stats.gc}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GOLES (DIF {stats.gf - stats.gc})</div></div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="stat-label">FIXTURE Y RESULTADOS - {torneoActivo.categoria.toUpperCase()}</div>
              <button onClick={() => setMostrarModalFixture(true)} className="btn-action" style={{ background: 'var(--accent)', color: '#000', fontSize: '0.75rem', padding: '8px 15px' }}>+ AGREGAR FECHA</button>
            </div>

            {fixture.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay partidos programados en este torneo para la categoría {torneoActivo.categoria}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {fixture.map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: f.estado === 'Jugado' ? 'rgba(0, 255, 136, 0.05)' : '#111', padding: '15px', borderRadius: '6px', border: f.estado === 'Jugado' ? '1px solid var(--accent)' : '1px solid #333', flexWrap: 'wrap', gap: '10px' }}>
                    
                    <div style={{ minWidth: '150px' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800 }}>{f.jornada?.toUpperCase()} // {f.condicion}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {f.rivales?.nombre?.toUpperCase() || f.rival?.toUpperCase() || 'RIVAL DESCONOCIDO'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>📅 {f.fecha || 'A definir'}</div>
                    </div>

                    {f.estado === 'Pendiente' ? (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button onClick={() => irATrackear(f)} className="btn-action" style={{ fontSize: '0.75rem', padding: '8px 15px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                          ⚡ TRACKEAR
                        </button>
                        <div style={{ height: '20px', width: '1px', background: '#333' }}></div>
                        <button onClick={() => actualizarResultado(f.id, 0, 0, 'Jugado')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px' }}>
                          CARGA MANUAL
                        </button>
                        
                        {/* BOTÓN ELIMINAR CON SEGURO */}
                        <button onClick={() => eliminarPartido(f.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', marginLeft: '5px' }} title="Eliminar partido duplicado">
                          🗑️
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>MI EQUIPO</span>
                            <input type="number" value={f.goles_propios} onChange={(e) => actualizarResultado(f.id, e.target.value, f.goles_rival, 'Jugado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                          </div>
                          <span style={{ fontWeight: 900 }}>-</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>RIVAL</span>
                            <input type="number" value={f.goles_rival} onChange={(e) => actualizarResultado(f.id, f.goles_propios, e.target.value, 'Jugado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                          </div>
                          <button onClick={() => actualizarResultado(f.id, 0, 0, 'Pendiente')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.9rem', marginLeft: '5px' }}>↺</button>
                        </div>

                        <button onClick={() => navigate('/resumen')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px', display: 'flex', gap: '5px' }}>
                          📊 REPORTE
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>Creá tu primer torneo para empezar.</div>
      )}

      {/* --- MODALES --- */}
      {mostrarModalTorneo && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>NUEVO TORNEO</div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">NOMBRE</div><input type="text" value={formTorneo.nombre} onChange={e => setFormTorneo({...formTorneo, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Copa Argentina" /></div>
            <div style={{ marginBottom: '20px' }}><div className="section-title">CATEGORÍA</div>
              <select value={formTorneo.categoria} onChange={e => setFormTorneo({...formTorneo, categoria: e.target.value})} style={inputIndustrial}>
                <option value="Primera">Primera</option><option value="Tercera">Tercera</option>
                <option value="Cuarta">Cuarta</option><option value="Quinta">Quinta</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setMostrarModalTorneo(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarTorneo} className="btn-action" style={{ flex: 1 }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalFixture && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>AGREGAR FECHA AL FIXTURE</div>
            
            <div style={{ marginBottom: '15px' }}><div className="section-title">RIVAL</div>
              <select value={formFixture.rival_id} onChange={e => setFormFixture({...formFixture, rival_id: e.target.value})} style={inputIndustrial}>
                <option value="">SELECCIONAR RIVAL...</option>
                {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}><div className="section-title">JORNADA / FASE</div><input type="text" value={formFixture.jornada} onChange={e => setFormFixture({...formFixture, jornada: e.target.value})} style={inputIndustrial} placeholder="Ej: Fecha 1 o Semifinal" /></div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">FECHA DEL PARTIDO</div><input type="date" value={formFixture.fecha_partido} onChange={e => setFormFixture({...formFixture, fecha_partido: e.target.value})} style={inputIndustrial} /></div>
            
            <div style={{ marginBottom: '20px' }}><div className="section-title">CONDICIÓN</div>
              <select value={formFixture.condicion} onChange={e => setFormFixture({...formFixture, condicion: e.target.value})} style={inputIndustrial}>
                <option value="Local">Local</option><option value="Visitante">Visitante</option><option value="Neutral">Neutral</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setMostrarModalFixture(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarFixture} className="btn-action" style={{ flex: 1 }}>AGREGAR FECHA</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', fontFamily: 'JetBrains Mono' };

export default Torneos;