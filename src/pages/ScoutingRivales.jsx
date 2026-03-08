import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function ScoutingRivales() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();

  const [rivales, setRivales] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  
  const estadoInicial = { nombre: '', escudo: '', sistema_tactico: '3-1 Clásico', jugadores_claves: '', notas: '' };
  const [formData, setFormData] = useState(estadoInicial);

  // Estados para manejar el historial H2H
  const [historialRival, setHistorialRival] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  
  // NUEVO: Filtro para no mezclar categorías en el historial
  const [filtroCategoriaH2H, setFiltroCategoriaH2H] = useState('Primera');

  useEffect(() => {
    if (clubId) fetchRivales();
  }, [clubId]);

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  const fetchHistorial = async (idRival) => {
    setCargandoHistorial(true);
    // Traemos TODOS los partidos jugados contra este rival
    const { data } = await supabase
      .from('partidos')
      .select('*')
      .eq('club_id', clubId)
      .eq('rival_id', idRival)
      .eq('estado', 'Jugado') 
      .order('fecha', { ascending: false });
    
    if (data) setHistorialRival(data);
    setCargandoHistorial(false);
  };

  const handleGuardar = async () => {
    if (!formData.nombre) return alert("El nombre del rival es obligatorio.");
    
    const payload = { 
      nombre: formData.nombre,
      escudo: formData.escudo,
      sistema_tactico: formData.sistema_tactico,
      jugadores_claves: formData.jugadores_claves,
      notas: formData.notas,
      club_id: clubId 
    };

    if (formData.id) {
      const { error } = await supabase.from('rivales').update(payload).eq('id', formData.id);
      if (error) return alert("Error al editar en Supabase: " + error.message);
    } else {
      const { error } = await supabase.from('rivales').insert([payload]);
      if (error) return alert("Error al guardar en Supabase: " + error.message);
    }
    
    alert("¡Rival guardado con éxito!");
    setMostrarModal(false);
    fetchRivales();
  };

  const abrirPerfilRival = (rival) => {
    setFormData(rival);
    setHistorialRival([]);
    setFiltroCategoriaH2H('Primera'); // Por defecto arranca analizando Primera
    fetchHistorial(rival.id);
    setMostrarModal(true);
  };

  const abrirNuevoRival = () => {
    setFormData(estadoInicial);
    setHistorialRival([]);
    setMostrarModal(true);
  };

  // NUEVO: Filtramos el historial antes de calcular las estadísticas
  const historialFiltrado = historialRival.filter(p => 
    filtroCategoriaH2H === 'Todas' ? true : p.categoria === filtroCategoriaH2H
  );

  const statsH2H = historialFiltrado.reduce((acc, p) => {
    acc.pj++;
    acc.gf += Number(p.goles_propios);
    acc.gc += Number(p.goles_rival);
    if (p.goles_propios > p.goles_rival) acc.pg++;
    else if (p.goles_propios === p.goles_rival) acc.pe++;
    else acc.pp++;
    return acc;
  }, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div className="stat-label" style={{ color: 'var(--text-dim)' }}>DEPARTAMENTO DE ANÁLISIS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>SCOUTING RIVALES</div>
        </div>
        <button onClick={abrirNuevoRival} className="btn-action" style={{ background: '#00ff88', color: '#000', fontSize: '0.8rem' }}>+ NUEVO RIVAL</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {rivales.map(rival => (
          <div key={rival.id} onClick={() => abrirPerfilRival(rival)} className="bento-card" style={{ cursor: 'pointer', transition: '0.2s', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #444', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {rival.escudo ? <img src={rival.escudo} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 800 }}>FOTO</span>}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{rival.nombre.toUpperCase()}</div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #333', paddingTop: '10px', fontSize: '0.8rem' }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Sistema Frecuente:</span> <strong style={{ color: 'var(--accent)' }}>{rival.sistema_tactico || 'N/A'}</strong></div>
            </div>
            
            {rival.jugadores_claves && (
              <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#ccc', background: '#111', padding: '8px', borderRadius: '4px', borderLeft: '2px solid #ef4444' }}>
                <strong style={{ color: '#ef4444' }}>ATENCIÓN:</strong> {rival.jugadores_claves}
              </div>
            )}
          </div>
        ))}
        {rivales.length === 0 && <p style={{ color: 'var(--text-dim)', gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>No hay rivales cargados. Agregá uno para empezar a armar tu torneo.</p>}
      </div>

      {mostrarModal && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div className="stat-label" style={{ color: '#fff' }}>{formData.id ? 'PERFIL Y SCOUTING DEL RIVAL' : 'NUEVO RIVAL'}</div>
              <button onClick={() => setMostrarModal(false)} className="close-btn">×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div><div className="section-title">NOMBRE DEL RIVAL</div><input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Boca Juniors" /></div>
              <div><div className="section-title">SISTEMA TÁCTICO BASE</div>
                <select value={formData.sistema_tactico} onChange={e => setFormData({...formData, sistema_tactico: e.target.value})} style={inputIndustrial}>
                  <option value="3-1 Clásico">3-1 Clásico</option><option value="4-0 Universal">4-0 Universal</option>
                  <option value="Arquero Jugador Frecuente">Arquero Jugador Frecuente</option><option value="Desconocido">Desconocido</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">URL DEL ESCUDO (Opcional)</div><input type="text" value={formData.escudo} onChange={e => setFormData({...formData, escudo: e.target.value})} style={inputIndustrial} placeholder="https://..." /></div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title" style={{ color: '#ef4444' }}>JUGADORES CLAVE A MARCAR</div>
              <input type="text" value={formData.jugadores_claves} onChange={e => setFormData({...formData, jugadores_claves: e.target.value})} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Ej: El 10 es zurdo, patea fuerte." />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <div className="section-title">NOTAS DEL CUERPO TÉCNICO (PELOTA PARADA, DEFENSAS)</div>
              <textarea value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} style={{...inputIndustrial, height: '80px', resize: 'none'}} placeholder="Ej: En los córners defienden en zona mixta..."></textarea>
            </div>

            <button onClick={handleGuardar} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>GUARDAR DATOS TÁCTICOS</button>

            {/* SECCIÓN H2H CON FILTRO DE CATEGORÍA */}
            {formData.id && (
              <div style={{ marginTop: '30px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div className="stat-label" style={{ color: 'var(--accent)' }}>HISTORIAL DE ENFRENTAMIENTOS</div>
                  <select 
                    value={filtroCategoriaH2H} 
                    onChange={(e) => setFiltroCategoriaH2H(e.target.value)}
                    style={{ background: '#111', color: '#fff', border: '1px solid var(--accent)', padding: '5px 10px', borderRadius: '4px', outline: 'none', fontSize: '0.8rem' }}
                  >
                    <option value="Todas">Todas las categorías</option>
                    <option value="Primera">Primera</option>
                    <option value="Tercera">Tercera</option>
                    <option value="Cuarta">Cuarta</option>
                    <option value="Quinta">Quinta</option>
                  </select>
                </div>
                
                {cargandoHistorial ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>Cargando historial de partidos...</div>
                ) : historialFiltrado.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', background: '#111', padding: '15px', borderRadius: '4px' }}>
                    No hay registros contra este rival en la categoría seleccionada.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', textAlign: 'center', marginBottom: '20px' }}>
                      <div style={{ background: '#111', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.pj}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>PJ</div></div>
                      <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid var(--accent)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent)' }}>{statsH2H.pg}</div><div style={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800 }}>PG</div></div>
                      <div style={{ background: '#111', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24' }}>{statsH2H.pe}</div><div style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: 800 }}>PE</div></div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#ef4444' }}>{statsH2H.pp}</div><div style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 800 }}>PP</div></div>
                      <div style={{ background: '#111', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.gf}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>GF</div></div>
                      <div style={{ background: '#111', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.gc}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>GC</div></div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                      {historialFiltrado.map(p => {
                        let resultadoColor = '#555'; let textoR = 'E';
                        if (p.goles_propios > p.goles_rival) { resultadoColor = 'var(--accent)'; textoR = 'V'; }
                        if (p.goles_propios < p.goles_rival) { resultadoColor = '#ef4444'; textoR = 'D'; }

                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#000', border: '1px solid #333', padding: '10px', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <div style={{ background: resultadoColor, color: '#000', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px', fontWeight: 900, fontSize: '0.7rem' }}>{textoR}</div>
                              <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.fecha} | {p.competicion} ({p.categoria})</div>
                                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{p.goles_propios} - {p.goles_rival}</div>
                              </div>
                            </div>
                            <button onClick={() => navigate('/resumen')} className="btn-secondary" style={{ fontSize: '0.65rem', padding: '6px 10px' }}>📊 REPORTE</button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); max-height: 90vh; overflow-y: auto; }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; }
        .close-btn { background: transparent; border: none; color: #fff; font-size: 1.8rem; cursor: pointer; line-height: 1; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', fontFamily: 'JetBrains Mono' };

export default ScoutingRivales;