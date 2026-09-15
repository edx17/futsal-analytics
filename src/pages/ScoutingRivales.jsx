import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

// IMPORTAMOS NOTIFICACIONES Y AUTH
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import ModalVideoRival from '../components/ModalVideoRival';
import { fetchPaginado } from '../utils/supaPaginado';
import { categoriasVisiblesPara, unirCategorias, mismaCategoria, ordenarCategorias } from '../utils/categorias';

/* Valor centinela del selector: "ver todas" no es una categoría real, así que
 * nunca puede viajar a datos_tacticos ni a un filtro de la base. */
const TODAS = '__todas__';

function ScoutingRivales() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();
  const { showToast } = useToast(); 
  const { perfil } = useAuth(); // <-- GRAN FILTRO

  // --- GRAN FILTRO ---
  // Las categorías asignadas al CT mandan. Pero antes esta lista ERA la única
  // fuente: un superuser (o un CT sin configurar) quedaba con el array vacío,
  // el selector no se dibujaba nunca y toda la pantalla caía al 'Primera'
  // hardcodeado. Ahora la lista base son las categorías reales del club y las
  // asignadas sólo recortan.
  const misCategorias = useMemo(
    () => (Array.isArray(perfil?.categorias_asignadas) ? perfil.categorias_asignadas : []),
    [perfil?.categorias_asignadas]
  );

  const [rivales, setRivales] = useState([]);
  const [categoriasClub, setCategoriasClub] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  
  // Categoría activa para ver/editar info táctica dentro del modal.
  // null = "todavía no elegí", se resuelve contra la categoría por defecto.
  const [categoriaScouting, setCategoriaScouting] = useState(null);

  const estadoInicial = { 
    nombre: '', 
    escudo: '', 
    datos_tacticos: {} // <-- ESTRUCTURA JSON PARA GUARDAR INFO POR CATEGORÍA
  };
  const [formData, setFormData] = useState(estadoInicial);

  // Estados para manejar el historial H2H
  const [historialRival, setHistorialRival] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Rival cuyo dossier de video esta abierto (null = cerrado) + la categoria
  // con la que se abrio. Nunca se abre "para todas": el video de Primera y el de
  // Tercera son material distinto y mezclarlos no sirve para nada.
  const [rivalVideo, setRivalVideo] = useState(null);
  const [categoriaVideo, setCategoriaVideo] = useState(null);

  // Categoría activa en la GRILLA (fuera del modal de edición). Manda sobre el
  // resumen de cada card y sobre el dossier de video que se abre desde ahí.
  const [categoriaVista, setCategoriaVista] = useState(null);

  /* Categorías que existen de verdad en el club. Se juntan de tres lados
   * porque ninguno solo alcanza: los jugadores (igual que en Mi Staff), los
   * partidos jugados (una categoría puede tener fixture y todavía no plantel)
   * y las claves ya guardadas en datos_tacticos (si alguien cargó scouting de
   * una división que después se vació, no queremos que desaparezca). */
  const categoriasVisibles = useMemo(() => {
    const deRivales = rivales.flatMap(r => Object.keys(r.datos_tacticos || {}));
    return categoriasVisiblesPara(unirCategorias(categoriasClub, deRivales), misCategorias);
  }, [categoriasClub, rivales, misCategorias]);

  const categoriaPorDefecto = categoriasVisibles[0] || 'Primera';
  const catVista = categoriaVista ?? categoriaPorDefecto;
  const catScouting = categoriaScouting ?? categoriaPorDefecto;
  const viendoTodas = catVista === TODAS;
  const editandoTodas = catScouting === TODAS;

  useEffect(() => {
    if (clubId) { fetchRivales(); fetchCategoriasClub(); }
  }, [clubId]);

  /* Mismo criterio que Mi Staff: las categorías del club salen de la plantilla,
   * más las que ya tienen partidos jugados. */
  const fetchCategoriasClub = async () => {
    const [{ data: jug }, { data: par }] = await Promise.all([
      supabase.from('jugadores').select('categoria').eq('club_id', clubId),
      supabase.from('partidos').select('categoria').eq('club_id', clubId),
    ]);
    setCategoriasClub(unirCategorias(
      (jug || []).map(j => j.categoria),
      (par || []).map(x => x.categoria),
    ));
  };

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
    // Paginado: el historial contra un rival puede pasar las 1000 filas que
    // PostgREST devuelve como maximo (recorta sin avisar).
    // El .order('id') secundario es el desempate que .range() necesita para no
    // repetir ni saltear filas cuando hay fechas iguales.
    const data = await fetchPaginado(() => {
      let query = supabase
        .from('partidos')
        .select('*')
        .eq('club_id', clubId)
        .eq('rival_id', idRival)
        .in('estado', ['Jugado', 'Finalizado'])
        .order('fecha', { ascending: false })
        .order('id', { ascending: false });

      // Si el usuario tiene categorías asignadas, solo traemos el historial de SUS categorías
      if (misCategorias.length > 0) {
        query = query.in('categoria', misCategorias);
      }
      return query;
    }).catch(() => []);

    // Los cruces entre terceros del fixture tambien se guardan bajo tu club_id
    // y con rival_id apuntando a uno de los dos equipos, asi que sin este filtro
    // el H2H contaba partidos que nunca jugaste. Criterio: un partido es ajeno
    // si el equipo de `nombre_propio` figura en tu tabla de rivales.
    const nombresRivales = new Set(rivales.map(r => r.nombre).filter(Boolean));
    const soloMios = (data || []).filter(p =>
      !p.local_rival_id && (!p.nombre_propio || !nombresRivales.has(p.nombre_propio))
    );

    setHistorialRival(soloMios);
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
    // Guarda dura: el centinela TODAS no es una categoría y no puede terminar
    // como clave dentro de datos_tacticos.
    if (editandoTodas) return;
    setFormData(prev => ({
      ...prev,
      datos_tacticos: {
        ...prev.datos_tacticos,
        [catScouting]: {
          ...(prev.datos_tacticos?.[catScouting] || {}),
          [campo]: valor
        }
      }
    }));
  };

  const infoTactivaActiva = formData.datos_tacticos?.[catScouting] || {
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

  const abrirPerfilRival = (rival, categoria = null) => {
    setFormData(rival);
    setHistorialRival([]);
    setCategoriaScouting(categoria || catVista);
    fetchHistorial(rival.id);
    setMostrarModal(true);
  };

  const abrirNuevoRival = () => {
    setFormData(estadoInicial);
    setHistorialRival([]);
    // Un rival nuevo se carga siempre contra una categoría concreta.
    setCategoriaScouting(categoriaPorDefecto);
    setMostrarModal(true);
  };

  // Filtramos visualmente el H2H por la categoría del tab. En TODAS no se
  // filtra: ese cruce entre divisiones es justamente el dato que no existía.
  const historialFiltrado = editandoTodas
    ? historialRival
    : historialRival.filter(p => mismaCategoria(p.categoria, catScouting));

  const acumularH2H = (partidos) => partidos.reduce((acc, p) => {
    const gf = Number(p.goles_propios) || 0;
    const gc = Number(p.goles_rival) || 0;
    acc.pj++;
    acc.gf += gf;
    acc.gc += gc;
    if (gf > gc) acc.pg++;
    else if (gf === gc) acc.pe++;
    else acc.pp++;
    return acc;
  }, { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });

  const statsH2H = acumularH2H(historialFiltrado);

  // Desglose por categoría, sólo para el tab TODAS.
  const h2hPorCategoria = useMemo(() => {
    if (!editandoTodas) return [];
    const grupos = new Map();
    historialRival.forEach(p => {
      const cat = p.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(p);
    });
    return ordenarCategorias([...grupos.keys()])
      .map(cat => ({ cat, ...acumularH2H(grupos.get(cat)) }));
  }, [editandoTodas, historialRival]);

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
        <button onClick={abrirNuevoRival} className="btn-action" style={{ background: 'var(--accent)', color: '#000', fontSize: '0.8rem' }}>+ NUEVO RIVAL</button>
      </div>

      {/* SELECTOR DE CATEGORÍA (manda sobre las cards Y sobre el dossier de video).
          Antes esto sólo existía adentro del modal de edición, y encima salía de
          las categorías asignadas al usuario: con un superuser sin asignaciones
          no se dibujaba nunca. */}
      {categoriasVisibles.length > 1 && (
        <div className="bento-card" style={{ marginBottom: '20px', padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="stat-label" style={{ margin: 0, color: 'var(--text-dim)' }}>CATEGORÍA</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[...categoriasVisibles, TODAS].map(cat => {
              const activa = catVista === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoriaVista(cat)}
                  style={{
                    padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 900,
                    border: `1px solid ${activa ? 'var(--accent)' : 'var(--border)'}`,
                    background: activa ? 'var(--accent)' : 'transparent',
                    color: activa ? '#000' : 'var(--text-dim)'
                  }}
                >
                  {cat === TODAS ? 'TODAS' : cat.toUpperCase()}
                </button>
              );
            })}
          </div>
          {misCategorias.length > 0 && (
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
              Mostrando sólo tus categorías asignadas
            </div>
          )}
        </div>
      )}

      {/* --- CARDS DE RIVALES --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {rivales.map(rival => {
          const tacticoResumen = rival.datos_tacticos?.[catVista] || {};
          // En modo TODAS la card no muestra un sistema suelto (sería el de una
          // categoría cualquiera): muestra en cuántas divisiones hay scouting.
          const conScouting = viendoTodas
            ? categoriasVisibles.filter(c => {
                const d = rival.datos_tacticos?.[c];
                return d && (d.sistema_tactico || d.jugadores_claves || d.notas || d.video_url);
              })
            : [];

          return (
            <div key={rival.id} onClick={() => abrirPerfilRival(rival)} className="bento-card" style={{ cursor: 'pointer', transition: '0.2s', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  {rival.escudo ? <img src={rival.escudo} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>ESCUDO</span>}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>{rival.nombre.toUpperCase()}</div>
              </div>

              {viendoTodas ? (
                <>
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '10px', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Scouting en </span>
                    <strong style={{ color: conScouting.length > 0 ? 'var(--accent)' : 'var(--text-dim)' }}>
                      {conScouting.length} de {categoriasVisibles.length}
                    </strong>
                    <span style={{ color: 'var(--text-dim)' }}> categoría{categoriasVisibles.length === 1 ? '' : 's'}</span>
                  </div>
                  {conScouting.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                      {conScouting.map(cat => (
                        <button
                          key={cat}
                          onClick={(e) => { e.stopPropagation(); abrirPerfilRival(rival, cat); }}
                          title={`Ver el scouting de ${cat}`}
                          style={{
                            padding: '4px 9px', borderRadius: '3px', cursor: 'pointer', fontSize: '0.62rem', fontWeight: 900,
                            border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', letterSpacing: '0.04em'
                          }}
                        >
                          {cat.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '10px', fontSize: '0.8rem' }}>
                    <div><span style={{ color: 'var(--text-dim)' }}>Sistema ({catVista}):</span> <strong style={{ color: 'var(--accent)' }}>{tacticoResumen.sistema_tactico || 'N/A'}</strong></div>
                  </div>

                  {tacticoResumen.jugadores_claves && (
                    <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-dim)', background: 'var(--panel)', padding: '8px', borderRadius: '4px', borderLeft: '2px solid #ef4444' }}>
                      <strong style={{ color: '#ef4444' }}>CLAVES:</strong> {tacticoResumen.jugadores_claves}
                    </div>
                  )}

                  {/* Atajo directo al dossier de video, sin pasar por el modal de edición */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCategoriaVideo(catVista); setRivalVideo(rival); }}
                    className="btn-secondary"
                    style={{ marginTop: '12px', width: '100%', fontSize: '0.7rem', padding: '8px', fontWeight: 800 }}
                  >
                    🎬 VER VIDEO ({catVista.toUpperCase()})
                  </button>
                </>
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
              <div className="stat-label" style={{ color: 'var(--text)' }}>{formData.id ? 'PERFIL Y SCOUTING DEL RIVAL' : 'NUEVO RIVAL'}</div>
              <button onClick={() => setMostrarModal(false)} className="close-btn">×</button>
            </div>

            {/* SECCIÓN CLUB (GLOBAL) */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', background: 'var(--panel)', padding: '15px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--accent)', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {formData.escudo ? <img src={formData.escudo} alt="Preview" style={{width:'100%', height:'100%', objectFit:'cover'}}/> : <span style={{fontSize:'0.7rem', color:'var(--text-dim)', fontWeight:800}}>ESCUDO</span>}
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

            {/* TABS DE CATEGORÍA. El tab TODAS es sólo de lectura: el scouting de
                Primera y el de Cuarta son material distinto y mezclarlos al
                escribir pisaría datos. Sirve para mirar el historial cruzado. */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {[
                ...categoriasVisibles,
                ...(formData.id && categoriasVisibles.length > 1 ? [TODAS] : []),
              ].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoriaScouting(cat)}
                  style={{
                    padding: '8px 15px', borderRadius: '4px', border: 'none', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0,
                    background: catScouting === cat ? 'var(--accent)' : 'var(--panel)',
                    color: catScouting === cat ? '#000' : 'var(--text)'
                  }}
                >
                  {cat === TODAS ? 'TODAS' : cat.toUpperCase()}
                </button>
              ))}
            </div>

            {editandoTodas ? (
              /* TODAS es sólo de lectura: mezclar categorías al escribir pisaría
                 el scouting de una división con el de otra. */
              <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '15px', marginBottom: '25px' }}>
                <div className="section-title" style={{ marginBottom: '12px' }}>SCOUTING CARGADO POR CATEGORÍA</div>
                {categoriasVisibles.map(cat => {
                  const d = formData.datos_tacticos?.[cat] || {};
                  const tieneAlgo = d.sistema_tactico || d.jugadores_claves || d.notas || d.video_url;
                  return (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: '0.8rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: '0.7rem', letterSpacing: '0.05em', color: tieneAlgo ? 'var(--accent)' : 'var(--text-dim)' }}>{cat.toUpperCase()}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                          {tieneAlgo ? (d.sistema_tactico || 'Sistema sin definir') : 'Sin scouting cargado'}
                          {d.video_url ? ' · 🎬 con video' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => setCategoriaScouting(cat)}
                        className="btn-secondary"
                        style={{ fontSize: '0.65rem', padding: '6px 10px', fontWeight: 800, flexShrink: 0 }}
                      >
                        {tieneAlgo ? 'VER / EDITAR' : 'CARGAR'}
                      </button>
                    </div>
                  );
                })}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '12px' }}>
                  Elegí una categoría arriba para cargar o editar el scouting. Acá abajo, el historial contra este rival en todas las divisiones.
                </div>
              </div>
            ) : (
              <>
              {/* SECCIÓN TÁCTICA (ESPECÍFICA DE LA CATEGORÍA ACTIVA) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="section-title">SISTEMA TÁCTICO BASE ({catScouting})</div>
                  <select value={infoTactivaActiva.sistema_tactico || '3-1 Clásico'} onChange={e => handleTacticoChange('sistema_tactico', e.target.value)} style={inputIndustrial}>
                    <option value="3-1 Clásico">3-1 Clásico</option>
                    <option value="4-0 Universal">4-0 Universal</option>
                    <option value="Arquero Jugador Frecuente">Arquero Jugador Frecuente</option>
                    <option value="Desconocido">Desconocido</option>
                  </select>
                </div>
              </div>
            
              <div style={{ marginBottom: '15px' }}>
                <div className="section-title" style={{ color: '#ef4444' }}>JUGADORES CLAVE A MARCAR ({catScouting})</div>
                <input type="text" value={infoTactivaActiva.jugadores_claves || ''} onChange={e => handleTacticoChange('jugadores_claves', e.target.value)} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Ej: El 10 es zurdo, patea fuerte." />
              </div>

              <div style={{ marginBottom: '25px' }}>
                <div className="section-title">NOTAS DEL CUERPO TÉCNICO ({catScouting})</div>
                <textarea value={infoTactivaActiva.notas || ''} onChange={e => handleTacticoChange('notas', e.target.value)} style={{...inputIndustrial, height: '80px', resize: 'none'}} placeholder="Ej: En los córners defienden en zona mixta..."></textarea>
              </div>

              <div style={{ marginBottom: '25px', background: 'var(--panel)', padding: '15px', borderRadius: '4px', border: '1px solid var(--border)' }}>
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
              </>
            )}

            {/* SECCIÓN H2H (FILTRADA POR LA CATEGORÍA ACTIVA) */}
            {formData.id && (
              <div style={{ marginTop: '30px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', gap: '10px', flexWrap: 'wrap' }}>
                  <div className="stat-label" style={{ color: 'var(--accent)' }}>
                    HISTORIAL DE ENFRENTAMIENTOS ({editandoTodas ? 'TODAS LAS CATEGORÍAS' : catScouting})
                  </div>
                  {/* El dossier de video es siempre de una categoría: no hay
                      "video de todas" que abrir. */}
                  {!editandoTodas && (
                    <button
                      onClick={() => { setCategoriaVideo(catScouting); setRivalVideo(formData); }}
                      className="btn-action"
                      style={{ background: 'var(--accent)', color: '#000', fontSize: '0.7rem', padding: '8px 14px', fontWeight: 900 }}
                    >
                      🎬 DOSSIER DE VIDEO ({catScouting})
                    </button>
                  )}
                </div>
                
                {cargandoHistorial ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>Cargando historial...</div>
                ) : historialFiltrado.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', background: 'var(--panel)', padding: '15px', borderRadius: '4px' }}>
                    {editandoTodas
                      ? 'No hay registros contra este rival en ninguna categoría.'
                      : `No hay registros contra este rival en la categoría ${catScouting}.`}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '10px', textAlign: 'center', marginBottom: '20px' }}>
                      <div style={{ background: 'var(--panel)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.pj}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>PJ</div></div>
                      <div style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid var(--accent)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent)' }}>{statsH2H.pg}</div><div style={{ fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 800 }}>PG</div></div>
                      <div style={{ background: 'var(--panel)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24' }}>{statsH2H.pe}</div><div style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: 800 }}>PE</div></div>
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#ef4444' }}>{statsH2H.pp}</div><div style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 800 }}>PP</div></div>
                      <div style={{ background: 'var(--panel)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.gf}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>GF</div></div>
                      <div style={{ background: 'var(--panel)', padding: '10px 5px', borderRadius: '4px' }}><div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{statsH2H.gc}</div><div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontWeight: 800 }}>GC</div></div>
                    </div>

                    {/* El cruce entre divisiones: cómo nos fue contra este rival
                        en cada categoría. Antes no existía en ningún lado. */}
                    {editandoTodas && h2hPorCategoria.length > 1 && (
                      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px', marginBottom: '20px' }}>
                        <div className="section-title" style={{ marginBottom: '10px' }}>DESGLOSE POR CATEGORÍA</div>
                        {h2hPorCategoria.map(r => (
                          <div key={r.cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '6px 0', fontSize: '0.78rem', borderBottom: '1px dashed var(--border)' }}>
                            <span style={{ fontWeight: 900, fontSize: '0.68rem', letterSpacing: '0.05em' }}>{r.cat.toUpperCase()}</span>
                            <span style={{ whiteSpace: 'nowrap' }}>
                              <strong style={{ color: 'var(--accent)' }}>{r.pg}</strong>
                              <span style={{ color: 'var(--text-dim)' }}>-</span>
                              <strong style={{ color: '#fbbf24' }}>{r.pe}</strong>
                              <span style={{ color: 'var(--text-dim)' }}>-</span>
                              <strong style={{ color: '#ef4444' }}>{r.pp}</strong>
                              <span style={{ color: 'var(--text-dim)', marginLeft: '10px' }}>{r.gf}:{r.gc}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                      {historialFiltrado.map(p => {
                        let resultadoColor = '#555'; let textoR = 'E';
                        if (p.goles_propios > p.goles_rival) { resultadoColor = 'var(--accent)'; textoR = 'V'; }
                        if (p.goles_propios < p.goles_rival) { resultadoColor = '#ef4444'; textoR = 'D'; }

                        return (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', padding: '10px', borderRadius: '4px' }}>
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

      {/* DOSSIER DE VIDEO DEL RIVAL */}
      {rivalVideo && (
        <ModalVideoRival
          rival={rivalVideo}
          clubId={clubId}
          categoria={categoriaVideo}
          onCerrar={() => setRivalVideo(null)}
        />
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); max-height: 90vh; overflow-y: auto; }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; text-transform: uppercase; }
        .close-btn { background: transparent; border: none; color: var(--text); font-size: 1.8rem; cursor: pointer; line-height: 1; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', outline: 'none', fontSize: '16px' };

export default ScoutingRivales;