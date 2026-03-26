import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES
import { useToast } from '../components/ToastContext';

function ScoutingRivales() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();
  const { showToast } = useToast(); 

  const [rivales, setRivales] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  
  const estadoInicial = { nombre: '', escudo: '', sistema_tactico: '3-1 Clásico', jugadores_claves: '', notas: '', video_url: '' };
  const [formData, setFormData] = useState(estadoInicial);

  // Estados para manejar el historial H2H
  const [historialRival, setHistorialRival] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  
  // Filtro para no mezclar categorías en el historial
  const [filtroCategoriaH2H, setFiltroCategoriaH2H] = useState('Todas');

  useEffect(() => {
    if (clubId) fetchRivales();
  }, [clubId]);

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  const fetchHistorial = async (idRival) => {
    setCargandoHistorial(true);
    const { data } = await supabase
      .from('partidos')
      .select('*')
      .eq('club_id', clubId)
      .eq('rival_id', idRival)
      .in('estado', ['Jugado', 'Finalizado']) 
      .order('fecha', { ascending: false });
    
    if (data) setHistorialRival(data);
    setCargandoHistorial(false);
  };

  // --- FUNCIÓN PARA SUBIR EL ESCUDO A SUPABASE STORAGE ---
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
          throw new Error("Fallo silencioso: La política RLS de tu base de datos bloqueó la actualización.");
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

  const handleGuardar = async () => {
    if (!formData.nombre) return showToast("El nombre del rival es obligatorio.", "warning");
    
    const payload = { 
      nombre: formData.nombre,
      escudo: formData.escudo,
      sistema_tactico: formData.sistema_tactico,
      jugadores_claves: formData.jugadores_claves,
      notas: formData.notas,
      video_url: formData.video_url,
      club_id: clubId 
    };

    if (formData.id) {
      const { error } = await supabase.from('rivales').update(payload).eq('id', formData.id);
      if (error) return showToast("Error al editar en Supabase: " + error.message, "error");
    } else {
      const { error } = await supabase.from('rivales').insert([payload]);
      if (error) return showToast("Error al guardar en Supabase: " + error.message, "error");
    }
    
    showToast("¡Rival guardado con éxito!", "success");
    setMostrarModal(false);
    fetchRivales();
  };

  const abrirPerfilRival = (rival) => {
    setFormData(rival);
    setHistorialRival([]);
    setFiltroCategoriaH2H('Todas'); 
    fetchHistorial(rival.id);
    setMostrarModal(true);
  };

  const abrirNuevoRival = () => {
    setFormData(estadoInicial);
    setHistorialRival([]);
    setMostrarModal(true);
  };

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

  // Función auxiliar para extraer el ID del video de YouTube
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {rivales.map(rival => (
          <div key={rival.id} onClick={() => abrirPerfilRival(rival)} className="bento-card" style={{ cursor: 'pointer', transition: '0.2s', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #444', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {rival.escudo ? <img src={rival.escudo} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 800 }}>ESCUDO</span>}
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

            {/* --- SECCIÓN ESCUDO --- */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '1px solid var(--accent)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {formData.escudo ? <img src={formData.escudo} alt="Preview" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <span style={{fontSize:'0.7rem', color:'#555', fontWeight:800}}>ESCUDO</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div className="section-title" style={{ marginBottom: '5px' }}>ESCUDO DEL CLUB (Cargar Archivo)</div>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleSubirEscudo} 
                  style={{...inputIndustrial, padding: '8px'}} 
                  disabled={subiendoFoto}
                />
                {subiendoFoto && <span style={{fontSize: '0.8rem', color: 'var(--accent)', marginTop: '5px', display: 'block'}}>Subiendo imagen, aguardá...</span>}
              </div>
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
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title" style={{ color: '#ef4444' }}>JUGADORES CLAVE A MARCAR</div>
              <input type="text" value={formData.jugadores_claves} onChange={e => setFormData({...formData, jugadores_claves: e.target.value})} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Ej: El 10 es zurdo, patea fuerte." />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <div className="section-title">NOTAS DEL CUERPO TÉCNICO (PELOTA PARADA, DEFENSAS)</div>
              <textarea value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} style={{...inputIndustrial, height: '80px', resize: 'none'}} placeholder="Ej: En los córners defienden en zona mixta..."></textarea>
            </div>

            {/* --- SECCIÓN VIDEO DE YOUTUBE --- */}
            <div style={{ marginBottom: '25px', background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
              <div className="section-title">ANÁLISIS EN VIDEO (URL DE YOUTUBE)</div>
              <input type="text" value={formData.video_url || ''} onChange={e => setFormData({...formData, video_url: e.target.value})} style={inputIndustrial} placeholder="https://www.youtube.com/watch?v=..." />
              
              {formData.video_url && extractYoutubeId(formData.video_url) && (
                <div style={{ marginTop: '15px', position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '4px' }}>
                  <iframe 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    src={`https://www.youtube.com/embed/${extractYoutubeId(formData.video_url)}`} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen>
                  </iframe>
                </div>
              )}
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

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default ScoutingRivales;