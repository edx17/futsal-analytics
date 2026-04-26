import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

// IMPORTAMOS NOTIFICACIONES Y AUTH
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';

function ScoutingRivales() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();
  const { showToast } = useToast(); 
  const { perfil } = useAuth(); // <-- GRAN FILTRO

  // --- GRAN FILTRO ---
  const misCategorias = perfil?.categorias_asignadas || [];
  const categoriaInicial = misCategorias.length > 0 ? misCategorias[0] : 'Primera';

  const [rivales, setRivales] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  
  // Categoría activa para ver/editar info táctica (por defecto la del DT)
  const [categoriaScouting, setCategoriaScouting] = useState(categoriaInicial);

  const estadoInicial = { 
    nombre: '', 
    escudo: '', 
    datos_tacticos: {} // <-- ESTRUCTURA JSON PARA GUARDAR INFO POR CATEGORÍA
  };
  const [formData, setFormData] = useState(estadoInicial);

  // Estados para manejar el historial H2H
  const [historialRival, setHistorialRival] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    if (clubId) fetchRivales();
  }, [clubId]);

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) {
      // Migración silenciosa en memoria por si traen datos viejos planos
      const rivalesAdaptados = data.map(r => ({
        ...r,
        datos_tacticos: r.datos_tacticos || {
          'Primera': {
            sistema_tactico: r.sistema_tactico || '3-1 Clásico',
            jugadores_claves: r.jugadores_claves || '',
            notas: r.notas || '',
            video_url: r.video_url || ''
          }
        }
      }));
      setRivales(rivalesAdaptados);
    }
  };

  const fetchHistorial = async (idRival) => {
    setCargandoHistorial(true);
    let query = supabase
      .from('partidos')
      .select('*')
      .eq('club_id', clubId)
      .eq('rival_id', idRival)
      .in('estado', ['Jugado', 'Finalizado']) 
      .order('fecha', { ascending: false });
    
    // Si el usuario tiene categorías asignadas, solo traemos el historial de SUS categorías
    if (misCategorias.length > 0) {
      query = query.in('categoria', misCategorias);
    }

    const { data } = await query;
    if (data) setHistorialRival(data);
    setCargandoHistorial(false);
  };

  // --- FUNCIÓN PARA SUBIR EL ESCUDO ---
  const handleSubirEscudo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSubiendoFoto(true);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `escudo_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      const { data, error } = await supabase.storage.from('escudos').upload(filePath, file);
      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from('escudos').getPublicUrl(filePath);
      const urlFinal = publicUrlData.publicUrl;

      setFormData(prev => ({ ...prev, escudo: urlFinal }));

      if (formData.id) {
        const { data: updateData, error: updateError } = await supabase
          .from('rivales')
          .update({ escudo: urlFinal })
          .eq('id', formData.id)
          .select();

        if (updateError) throw updateError;
        if (!updateData || updateData.length === 0) {
          throw new Error("Fallo silencioso: La política RLS bloqueó la actualización.");
        }
      }

      showToast("¡Escudo subido y guardado!", "success");
      fetchRivales(); 

    } catch (error) {
      console.error("Error completo:", error);
      showToast("Error al guardar el escudo: " + error.message, "error");
    } finally {
      setSubiendoFoto(false);
    }
  };

  // --- MANEJO DE CAMBIOS TÁCTICOS POR CATEGORÍA ---
  const handleTacticoChange = (campo, valor) => {
    setFormData(prev => ({
      ...prev,
      datos_tacticos: {
        ...prev.datos_tacticos,
        [categoriaScouting]: {
          ...(prev.datos_tacticos?.[categoriaScouting] || {}),
          [campo]: valor
        }
      }
    }));
  };

  const infoTactivaActiva = formData.datos_tacticos?.[categoriaScouting] || {
    sistema_tactico: '3-1 Clásico', jugadores_claves: '', notas: '', video_url: ''
  };

  const handleGuardar = async () => {
    if (!formData.nombre) return showToast("El nombre del rival es obligatorio.", "warning");
    
    const payload = { 
      nombre: formData.nombre,
      escudo: formData.escudo,
      datos_tacticos: formData.datos_tacticos,
      club_id: clubId 
    };

    if (formData.id) {
      const { error } = await supabase.from('rivales').update(payload).eq('id', formData.id);
      if (error) return showToast("Error al editar en Supabase: " + error.message, "error");
    } else {
      const { error } = await supabase.from('rivales').insert([payload]);
      if (error) return showToast("Error al guardar en Supabase: " + error.message, "error");
    }
    
    showToast("¡Rival y scouting guardados con éxito!", "success");
    setMostrarModal(false);
    fetchRivales();
  };

  const abrirPerfilRival = (rival) => {
    setFormData(rival);
    setHistorialRival([]);
    setCategoriaScouting(categoriaInicial);
    fetchHistorial(rival.id);
    setMostrarModal(true);
  };

  const abrirNuevoRival = () => {
    setFormData(estadoInicial);
    setHistorialRival([]);
    setCategoriaScouting(categoriaInicial);
    setMostrarModal(true);
  };

  // Filtramos visualmente el H2H por la categoría seleccionada en el tab
  const historialFiltrado = historialRival.filter(p => p.categoria === categoriaScouting);

  const statsH2H = historialFiltrado.reduce((acc, p) => {
    acc.pj++;
    acc.gf += Number(p.goles_propios);
    acc.gc += Number(p.goles_rival);
    if (p.goles_propios > p.goles_rival) acc.pg++;
    else if (p.goles_propios === p.goles_rival) acc.pe++;
    else acc.pp++;
    return acc;
  }, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });

  const extractYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

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

      {/* --- CARDS DE RIVALES --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {rivales.map(rival => {
          const tacticoResumen = rival.datos_tacticos?.[categoriaInicial] || {};
          
          return (
            <div key={rival.id} onClick={() => abrirPerfilRival(rival)} className="bento-card" style={{ cursor: 'pointer', transition: '0.2s', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #444', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  {rival.escudo ? <img src={rival.escudo} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 800 }}>ESCUDO</span>}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{rival.nombre.toUpperCase()}</div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #333', paddingTop: '10px', fontSize: '0.8rem' }}>
                <div><span style={{ color: 'var(--text-dim)' }}>Sistema ({categoriaInicial}):</span> <strong style={{ color: 'var(--accent)' }}>{tacticoResumen.sistema_tactico || 'N/A'}</strong></div>
              </div>
              
              {tacticoResumen.jugadores_claves && (
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#ccc', background: '#111', padding: '8px', borderRadius: '4px', borderLeft: '2px solid #ef4444' }}>
                  <strong style={{ color: '#ef4444' }}>CLAVES:</strong> {tacticoResumen.jugadores_claves}
                </div>
              )}
            </div>
          );
        })}
        {rivales.length === 0 && <p style={{ color: 'var(--text-dim)', gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>No hay rivales cargados. Agregá uno para empezar a armar tu torneo.</p>}
      </div>

      {/* --- MODAL DE PERFIL Y EDICIÓN --- */}
      {mostrarModal && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div className="stat-label" style={{ color: '#fff' }}>{formData.id ? 'PERFIL Y SCOUTING DEL RIVAL' : 'NUEVO RIVAL'}</div>
              <button onClick={() => setMostrarModal(false)} className="close-btn">×</button>
            </div>

            {/* SECCIÓN CLUB (GLOBAL) */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '1px solid var(--accent)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {formData.escudo ? <img src={formData.escudo} alt="Preview" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <span style={{fontSize:'0.7rem', color:'#555', fontWeight:800}}>ESCUDO</span>}
              </div>
              <div style={{ flex: 1, display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <div className="section-title" style={{ marginBottom: '5px' }}>NOMBRE DEL CLUB</div>
                  <input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Boca Juniors" />
                </div>
                <div style={{ width: '150px' }}>
                  <div className="section-title" style={{ marginBottom: '5px' }}>SUBIR ESCUDO</div>
                  <input type="file" accept="image/*" onChange={handleSubirEscudo} style={{...inputIndustrial, padding: '8px', fontSize: '0.7rem'}} disabled={subiendoFoto} />
                </div>
              </div>
            </div>

            {/* TABS DE CATEGORÍA (GRAN FILTRO) */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
              {misCategorias.length === 0 ? (
                <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>No tenés categorías asignadas.</span>
              ) : (
                misCategorias.map(cat => (
                  <button 
                    key={cat} 
                    onClick={() => setCategoriaScouting(cat)}
                    style={{ 
                      padding: '8px 15px', borderRadius: '4px', border: 'none', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0,
                      background: categoriaScouting === cat ? 'var(--accent)' : '#222',
                      color: categoriaScouting === cat ? '#000' : '#fff'
                    }}
                  >
                    SCOUTING {cat.toUpperCase()}
                  </button>
                ))
              )}
            </div>

            {/* SECCIÓN TÁCTICA (ESPECÍFICA DE LA CATEGORÍA ACTIVA) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <div className="section-title">SISTEMA TÁCTICO BASE ({categoriaScouting})</div>
                <select value={infoTactivaActiva.sistema_tactico || '3-1 Clásico'} onChange={e => handleTacticoChange('sistema_tactico', e.target.value)} style={inputIndustrial}>
                  <option value="3-1 Clásico">3-1 Clásico</option>
                  <option value="4-0 Universal">4-0 Universal</option>
                  <option value="Arquero Jugador Frecuente">Arquero Jugador Frecuente</option>
                  <option value="Desconocido">Desconocido</option>
                </select>
              </div>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title" style={{ color: '#ef4444' }}>JUGADORES CLAVE A MARCAR ({categoriaScouting})</div>
              <input type="text" value={infoTactivaActiva.jugadores_claves || ''} onChange={e => handleTacticoChange('jugadores_claves', e.target.value)} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Ej: El 10 es zurdo, patea fuerte." />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <div className="section-title">NOTAS DEL CUERPO TÉCNICO ({categoriaScouting})</div>
              <textarea value={infoTactivaActiva.notas || ''} onChange={e => handleTacticoChange('notas', e.target.value)} style={{...inputIndustrial, height: '80px', resize: 'none'}} placeholder="Ej: En los córners defienden en zona mixta..."></textarea>
            </div>

            <div style={{ marginBottom: '25px', background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
              <div className="section-title">ANÁLISIS EN VIDEO (URL DE YOUTUBE)</div>
              <input type="text" value={infoTactivaActiva.video_url || ''} onChange={e => handleTacticoChange('video_url', e.target.value)} style={inputIndustrial} placeholder="https://www.youtube.com/watch?v=..." />
              
              {infoTactivaActiva.video_url && extractYoutubeId(infoTactivaActiva.video_url) && (
                <div style={{ marginTop: '15px', position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px' }}>
                  <iframe 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    src={`https://www.youtube.com/embed/${extractYoutubeId(infoTactivaActiva.video_url)}`} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen>
                  </iframe>
                </div>
              )}
            </div>

            <button onClick={handleGuardar} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>GUARDAR CAMBIOS</button>

            {/* SECCIÓN H2H (FILTRADA POR LA CATEGORÍA ACTIVA) */}
            {formData.id && (
              <div style={{ marginTop: '30px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div className="stat-label" style={{ color: 'var(--accent)' }}>HISTORIAL DE ENFRENTAMIENTOS ({categoriaScouting})</div>
                </div>
                
                {cargandoHistorial ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>Cargando historial...</div>
                ) : historialFiltrado.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', background: '#111', padding: '15px', borderRadius: '4px' }}>
                    No hay registros contra este rival en la categoría {categoriaScouting}.
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
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{p.fecha} | {p.competicion}</div>
                                <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{p.goles_propios} - {p.goles_rival}</div>
                              </div>
                            </div>
                            {/* CORRECCIÓN: Pasamos el ID del partido al resumen */}
                            <button onClick={() => navigate(`/resumen/${p.id}`)} className="btn-secondary" style={{ fontSize: '0.65rem', padding: '6px 10px' }}>📊 REPORTE</button>
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
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase; }
        .close-btn { background: transparent; border: none; color: #fff; font-size: 1.8rem; cursor: pointer; line-height: 1; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default ScoutingRivales;