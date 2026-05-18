import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { createClient } from '@supabase/supabase-js';

function Usuarios() {
  const { perfil } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [clubes, setClubes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingClubes, setLoadingClubes] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [procesandoClub, setProcesandoClub] = useState(false);

  const esSuperUser = perfil?.rol === 'superuser';

  // --- ESTADOS USUARIOS ---
  const [nuevoUser, setNuevoUser] = useState({
    username: '',
    password: '',
    email: '',
    nombre_completo: '',
    rol: 'jugador',
    club_id: esSuperUser ? '' : (perfil?.club_id || '')
  });
  const [usuarioEnEdicion, setUsuarioEnEdicion] = useState(null);

  // --- ESTADOS CLUBES (SOLO SUPERUSER) ---
  const [nuevoClub, setNuevoClub] = useState({
    nombre: '',
    plan_actual: 'Básico',
    suscripcion_activa: true,
    fecha_vencimiento: '',
    escudo_url: ''
  });
  const [clubEnEdicion, setClubEnEdicion] = useState(null);

  // --- TABS PARA SUPERUSER ---
  const [tabActiva, setTabActiva] = useState('usuarios'); // 'usuarios' | 'clubes'

  useEffect(() => {
    fetchUsuarios();
    if (esSuperUser) fetchClubes();
  }, [perfil]);

  async function fetchUsuarios() {
    setLoading(true);
    let query = supabase.from('perfiles').select(`
      id, username, nombre_completo, email, rol, club_id, categorias_asignadas,
      clubes ( nombre )
    `);

    // Si NO es superuser, solo ve los de su club
    if (!esSuperUser) {
      query = query.eq('club_id', perfil.club_id);
    }

    const { data, error } = await query.order('rol', { ascending: true });
    if (!error) setUsuarios(data || []);
    setLoading(false);
  }

  async function fetchClubes() {
    setLoadingClubes(true);
    const { data, error } = await supabase.from('clubes').select('*').order('fecha_creacion', { ascending: false });
    if (!error) setClubes(data || []);
    setLoadingClubes(false);
  }

  // ==========================================
  // GESTIÓN DE USUARIOS
  // ==========================================
  const crearUsuario = async (e) => {
    e.preventDefault();
    setProcesando(true);

    const emailFicticio = `${nuevoUser.username.trim()}@virtualstats.com`;

    // --- EL TRUCO PARA NO DESLOGUEARTE ---
    const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await tempSupabase.auth.signUp({
      email: nuevoUser.email || emailFicticio,
      password: nuevoUser.password,
    });

    if (authError) {
      alert("Error al crear credenciales: " + authError.message);
      setProcesando(false);
      return;
    }

    const { error: profileError } = await supabase.from('perfiles').upsert([
      {
        id: authData.user.id,
        username: nuevoUser.username.trim(),
        nombre_completo: nuevoUser.nombre_completo,
        email: nuevoUser.email,
        rol: nuevoUser.rol,
        club_id: nuevoUser.club_id || null
      }
    ]);

    if (profileError) {
      alert("Error al guardar el perfil: " + profileError.message);
    } else {
      alert("¡Usuario creado con éxito!");
      setNuevoUser({
        username: '', password: '', email: '', nombre_completo: '',
        rol: 'jugador', club_id: esSuperUser ? '' : (perfil?.club_id || '')
      });
      fetchUsuarios();
    }
    setProcesando(false);
  };

  const eliminarUsuario = async (idAEliminar, username) => {
    if (idAEliminar === perfil.id) {
      alert("No podés eliminar tu propia cuenta mientras estás logueado.");
      return;
    }

    const confirmar = window.confirm(`¿Estás seguro que querés eliminar el acceso del usuario "${username}"?\n\nEsto le quitará el acceso a la plataforma.`);
    if (!confirmar) return;

    setLoading(true);
    const { error } = await supabase.from('perfiles').delete().eq('id', idAEliminar);

    if (error) {
      alert("Error al eliminar el usuario: " + error.message);
    } else {
      fetchUsuarios();
    }
    setLoading(false);
  };

  const abrirEdicionUsuario = (usuario) => {
    setUsuarioEnEdicion({
      id: usuario.id,
      username: usuario.username || '',
      email: usuario.email || '',
      nombre_completo: usuario.nombre_completo || '',
      rol: usuario.rol || 'jugador',
      club_id: usuario.club_id || '',
      categorias_asignadas: usuario.categorias_asignadas || []
    });
  };

  const guardarEdicionUsuario = async (e) => {
    e.preventDefault();
    setProcesando(true);

    if (usuarioEnEdicion.id === perfil.id && usuarioEnEdicion.rol !== 'superuser' && esSuperUser) {
      alert("Por seguridad, no podés quitarte el rol de SuperUser a vos mismo.");
      setProcesando(false);
      return;
    }

    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre_completo: usuarioEnEdicion.nombre_completo,
        rol: usuarioEnEdicion.rol,
        club_id: usuarioEnEdicion.club_id || null,
        categorias_asignadas: usuarioEnEdicion.categorias_asignadas 
      })
      .eq('id', usuarioEnEdicion.id);

    if (error) {
      alert("Error al actualizar perfil: " + error.message);
    } else {
      alert("¡Usuario actualizado con éxito!");
      setUsuarioEnEdicion(null);
      fetchUsuarios();
    }
    setProcesando(false);
  };

  const handleCategoriaChange = (cat, isChecked) => {
    const actuales = usuarioEnEdicion.categorias_asignadas || [];
    if (isChecked) {
      setUsuarioEnEdicion({ ...usuarioEnEdicion, categorias_asignadas: [...actuales, cat] });
    } else {
      setUsuarioEnEdicion({ ...usuarioEnEdicion, categorias_asignadas: actuales.filter(c => c !== cat) });
    }
  };

  // ==========================================
  // GESTIÓN DE CLUBES (MASTER)
  // ==========================================
  const crearClub = async (e) => {
    e.preventDefault();
    setProcesandoClub(true);

    const dataAInsertar = {
      nombre: nuevoClub.nombre,
      plan_actual: nuevoClub.plan_actual,
      suscripcion_activa: nuevoClub.suscripcion_activa,
      escudo_url: nuevoClub.escudo_url || null
    };

    if (nuevoClub.fecha_vencimiento) {
      dataAInsertar.fecha_vencimiento = nuevoClub.fecha_vencimiento;
    }

    const { error } = await supabase.from('clubes').insert([dataAInsertar]);

    if (error) {
      alert("Error al crear el club: " + error.message);
    } else {
      alert("¡Club creado exitosamente!");
      setNuevoClub({ nombre: '', plan_actual: 'Básico', suscripcion_activa: true, fecha_vencimiento: '', escudo_url: '' });
      fetchClubes();
    }
    setProcesandoClub(false);
  };

  const eliminarClub = async (idAEliminar, nombre) => {
    const confirmar = window.confirm(`⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Estás a punto de borrar TODO el club "${nombre}"?\nEsto eliminará en cascada (si está configurado) jugadores, partidos y finanzas. ¿Continuar?`);
    if (!confirmar) return;

    setLoadingClubes(true);
    const { error } = await supabase.from('clubes').delete().eq('id', idAEliminar);

    if (error) {
      alert("Error al eliminar el club. Verificá que no tenga usuarios o partidos asociados: " + error.message);
    } else {
      fetchClubes();
      fetchUsuarios(); // Refrescar lista por si se borraron usuarios en cascada
    }
    setLoadingClubes(false);
  };

  const abrirEdicionClub = (club) => {
    setClubEnEdicion({
      id: club.id,
      nombre: club.nombre || '',
      plan_actual: club.plan_actual || 'Básico',
      suscripcion_activa: club.suscripcion_activa ?? true,
      fecha_vencimiento: club.fecha_vencimiento || '',
      escudo_url: club.escudo_url || ''
    });
  };

  const guardarEdicionClub = async (e) => {
    e.preventDefault();
    setProcesandoClub(true);

    const { error } = await supabase
      .from('clubes')
      .update({
        nombre: clubEnEdicion.nombre,
        plan_actual: clubEnEdicion.plan_actual,
        suscripcion_activa: clubEnEdicion.suscripcion_activa,
        fecha_vencimiento: clubEnEdicion.fecha_vencimiento || null,
        escudo_url: clubEnEdicion.escudo_url || null
      })
      .eq('id', clubEnEdicion.id);

    if (error) {
      alert("Error al actualizar club: " + error.message);
    } else {
      alert("¡Club actualizado con éxito!");
      setClubEnEdicion(null);
      fetchClubes();
    }
    setProcesandoClub(false);
  };


  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <div className="stat-label" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>CONFIGURACIÓN DEL SISTEMA</div>
          <h2 style={{ margin: 0, fontWeight: 900, color: esSuperUser ? '#c084fc' : 'var(--accent)' }}>
            {esSuperUser ? '👑 GESTIÓN MASTER DEL SISTEMA' : '👥 GESTIÓN DE PLANTEL Y STAFF'}
          </h2>
        </div>
        
        {/* SELECTOR DE TABS PARA EL SUPERUSER */}
        {esSuperUser && (
          <div style={{ display: 'flex', background: '#000', borderRadius: '8px', padding: '5px', border: '1px solid #333' }}>
            <button 
              onClick={() => setTabActiva('usuarios')} 
              style={{ ...tabBtnStyle, background: tabActiva === 'usuarios' ? '#c084fc' : 'transparent', color: tabActiva === 'usuarios' ? '#000' : '#888' }}
            >
              👥 Usuarios ({usuarios.length})
            </button>
            <button 
              onClick={() => setTabActiva('clubes')} 
              style={{ ...tabBtnStyle, background: tabActiva === 'clubes' ? '#c084fc' : 'transparent', color: tabActiva === 'clubes' ? '#000' : '#888' }}
            >
              🛡️ Clubes ({clubes.length})
            </button>
          </div>
        )}
      </div>

      {/* =========================================================
          PANTALLA: GESTIÓN DE USUARIOS
      ========================================================= */}
      {(!esSuperUser || tabActiva === 'usuarios') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', animation: 'fadeIn 0.3s' }}>
          
          {/* FORMULARIO CREAR USUARIO */}
          <div className="bento-card" style={{ height: 'fit-content' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>Crear Nuevo Acceso</div>

            <form onSubmit={crearUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={labelStyle}>USUARIO (LOGIN)</label>
                  <input type="text" required value={nuevoUser.username} onChange={e => setNuevoUser({ ...nuevoUser, username: e.target.value })} placeholder="ej: jperez" style={inputStyle} />
                </div>
                <div className="input-field">
                  <label style={labelStyle}>CONTRASEÑA</label>
                  <input type="text" required value={nuevoUser.password} onChange={e => setNuevoUser({ ...nuevoUser, password: e.target.value })} placeholder="Mínimo 6 caracteres" style={inputStyle} />
                </div>
              </div>

              <div className="input-field">
                <label style={labelStyle}>NOMBRE COMPLETO</label>
                <input type="text" required value={nuevoUser.nombre_completo} onChange={e => setNuevoUser({ ...nuevoUser, nombre_completo: e.target.value })} placeholder="Juan Perez" style={inputStyle} />
              </div>

              <div className="input-field">
                <label style={labelStyle}>EMAIL (OPCIONAL)</label>
                <input type="email" value={nuevoUser.email} onChange={e => setNuevoUser({ ...nuevoUser, email: e.target.value })} placeholder="juan@ejemplo.com" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: esSuperUser ? '1fr 1fr' : '1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={labelStyle}>ROL EN EL SISTEMA</label>
                  <select value={nuevoUser.rol} onChange={e => setNuevoUser({ ...nuevoUser, rol: e.target.value })} style={inputStyle}>
                    <option value="jugador">Jugador</option>
                    <option value="ct">Cuerpo Técnico</option>
                    <option value="manager">Manager / Coordinador</option>
                    {esSuperUser && <option value="admin">Administrativo (Dirigente)</option>}
                    <option value="tesorero">Tesorero</option>
                    {esSuperUser && <option value="superuser">Super User</option>}
                  </select>
                </div>

                {esSuperUser && (
                  <div className="input-field">
                    <label style={labelStyle}>ASIGNAR A CLUB</label>
                    <select required={nuevoUser.rol !== 'superuser'} value={nuevoUser.club_id} onChange={e => setNuevoUser({ ...nuevoUser, club_id: e.target.value })} style={inputStyle}>
                      <option value="">Ninguno / Seleccionar...</option>
                      {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <button type="submit" className="btn-action" disabled={procesando} style={{ marginTop: '15px', padding: '15px' }}>
                {procesando ? 'CREANDO CREDENCIALES...' : 'CREAR USUARIO'}
              </button>
            </form>
          </div>

          {/* LISTADO DE USUARIOS */}
          <div className="bento-card" style={{ gridColumn: esSuperUser ? 'span 2' : 'span 1' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>Cuentas Activas ({usuarios.length})</div>

            {loading ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Cargando usuarios...</div>
            ) : (
              <div className="table-wrapper">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>USUARIO / EMAIL</th>
                      <th style={{ padding: '10px' }}>NOMBRE</th>
                      <th style={{ padding: '10px' }}>ROL</th>
                      {esSuperUser && <th style={{ padding: '10px' }}>CLUB</th>}
                      <th style={{ padding: '10px', textAlign: 'center' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--accent)' }}>{u.username || 'Sin Username'}</div>
                          {u.email && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{u.email}</div>}
                        </td>
                        <td style={{ padding: '12px 10px', fontWeight: 600 }}>{u.nombre_completo?.toUpperCase() || '-'}</td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{
                            fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 800,
                            background: u.rol === 'superuser' ? '#c084fc' : u.rol === 'manager' ? '#f97316' : u.rol === 'admin' ? '#3b82f6' : u.rol === 'ct' ? '#10b981' : '#222',
                            color: u.rol === 'jugador' ? 'var(--text-dim)' : '#000'
                          }}>
                            {u.rol?.toUpperCase()}
                          </span>
                        </td>
                        {esSuperUser && (
                          <td style={{ padding: '12px 10px', color: 'var(--text-dim)' }}>
                            {u.clubes?.nombre || <span style={{ color: '#888', fontStyle: 'italic' }}>Sin club</span>}
                          </td>
                        )}
                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => abrirEdicionUsuario(u)} style={btnIconoClaro} title="Editar">✏️</button>
                            <button onClick={() => eliminarUsuario(u.id, u.username || u.email)} style={{ ...btnIconoRojo, opacity: u.id === perfil.id ? 0.3 : 1, cursor: u.id === perfil.id ? 'not-allowed' : 'pointer' }} title="Eliminar">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          PANTALLA: GESTIÓN DE CLUBES (SOLO SUPERUSER)
      ========================================================= */}
      {esSuperUser && tabActiva === 'clubes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '30px', animation: 'fadeIn 0.3s' }}>
          
          {/* FORMULARIO CREAR CLUB */}
          <div className="bento-card" style={{ height: 'fit-content' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>Dar de Alta Nuevo Club</div>

            <form onSubmit={crearClub} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="input-field">
                <label style={labelStyle}>NOMBRE DE LA INSTITUCIÓN</label>
                <input type="text" required value={nuevoClub.nombre} onChange={e => setNuevoClub({ ...nuevoClub, nombre: e.target.value })} placeholder="Ej: Boca Juniors Futsal" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={labelStyle}>PLAN ACTUAL</label>
                  <select value={nuevoClub.plan_actual} onChange={e => setNuevoClub({ ...nuevoClub, plan_actual: e.target.value })} style={inputStyle}>
                    <option value="Básico">Básico</option>
                    <option value="Pro">Pro</option>
                    <option value="Premium Master">Premium Master</option>
                  </select>
                </div>
                
                <div className="input-field">
                  <label style={labelStyle}>VENCIMIENTO</label>
                  <input type="date" value={nuevoClub.fecha_vencimiento} onChange={e => setNuevoClub({ ...nuevoClub, fecha_vencimiento: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <div className="input-field">
                <label style={labelStyle}>URL DEL ESCUDO (OPCIONAL)</label>
                <input type="url" value={nuevoClub.escudo_url} onChange={e => setNuevoClub({ ...nuevoClub, escudo_url: e.target.value })} placeholder="https://..." style={inputStyle} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', background: '#111', padding: '15px', borderRadius: '8px' }}>
                <input 
                  type="checkbox" 
                  id="suscripcion_activa"
                  checked={nuevoClub.suscripcion_activa} 
                  onChange={e => setNuevoClub({ ...nuevoClub, suscripcion_activa: e.target.checked })} 
                  style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                />
                <label htmlFor="suscripcion_activa" style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Suscripción Habilitada</label>
              </div>

              <button type="submit" style={{ background: '#c084fc', color: '#000', padding: '15px', fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '15px' }} disabled={procesandoClub}>
                {procesandoClub ? 'CREANDO...' : '🛡️ REGISTRAR CLUB'}
              </button>
            </form>
          </div>

          {/* LISTADO DE CLUBES */}
          <div className="bento-card" style={{ gridColumn: 'span 2' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>Clubes Registrados ({clubes.length})</div>

            {loadingClubes ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>Cargando clubes...</div>
            ) : (
              <div className="table-wrapper">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>CLUB</th>
                      <th style={{ padding: '10px' }}>ESTADO / PLAN</th>
                      <th style={{ padding: '10px' }}>VENCIMIENTO</th>
                      <th style={{ padding: '10px' }}>ID SISTEMA</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubes.map(c => {
                      const estaVencido = c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date();
                      const estadoAprobado = c.suscripcion_activa && !estaVencido;
                      
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                          <td style={{ padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {c.escudo_url ? (
                              <img src={c.escudo_url} alt="Escudo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                            ) : (
                              <div style={{ width: '24px', height: '24px', background: '#333', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.6rem' }}>?</div>
                            )}
                            <div style={{ fontWeight: 800, color: '#fff' }}>{c.nombre}</div>
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: '#333', color: '#c084fc', width: 'fit-content', fontWeight: 'bold' }}>{c.plan_actual}</span>
                              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: estadoAprobado ? '#10b98122' : '#ef444422', color: estadoAprobado ? '#10b981' : '#ef4444', width: 'fit-content' }}>
                                {c.suscripcion_activa ? 'Activo' : 'Suspendido'}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 10px', color: estaVencido ? '#ef4444' : 'var(--text-dim)' }}>
                            {c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-AR') : 'Sin Límite'}
                          </td>
                          <td style={{ padding: '12px 10px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#666' }}>
                            {c.id.split('-')[0]}...
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button onClick={() => abrirEdicionClub(c)} style={btnIconoClaro} title="Editar">✏️</button>
                              <button onClick={() => eliminarClub(c.id, c.nombre)} style={btnIconoRojo} title="Eliminar Club">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL DE EDICIÓN DE USUARIO
      ========================================================= */}
      {usuarioEnEdicion && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', animation: 'fadeIn 0.2s' }}>
          <div className="bento-card custom-scroll" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--accent)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>EDITAR USUARIO</div>
              <button onClick={() => setUsuarioEnEdicion(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            
            <form onSubmit={guardarEdicionUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {/* Contenido del modal (igual al que ya tenías) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: '#0a0a0a', padding: '15px', borderRadius: '4px', border: '1px dashed #333' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block' }}>USERNAME</label>
                  <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '0.9rem' }}>{usuarioEnEdicion.username || '-'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 800, display: 'block' }}>EMAIL REGISTRADO</label>
                  <div style={{ color: '#fff', fontSize: '0.8rem', wordBreak: 'break-all' }}>{usuarioEnEdicion.email || '-'}</div>
                </div>
              </div>

              <div className="input-field">
                <label style={labelStyle}>NOMBRE COMPLETO</label>
                <input type="text" required value={usuarioEnEdicion.nombre_completo} onChange={e => setUsuarioEnEdicion({ ...usuarioEnEdicion, nombre_completo: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: esSuperUser ? '1fr 1fr' : '1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={labelStyle}>NUEVO ROL</label>
                  <select value={usuarioEnEdicion.rol} onChange={e => setUsuarioEnEdicion({ ...usuarioEnEdicion, rol: e.target.value })} style={inputStyle}>
                    <option value="jugador">Jugador</option>
                    <option value="ct">Cuerpo Técnico</option>
                    <option value="manager">Manager / Coordinador</option>
                    {esSuperUser && <option value="admin">Administrativo (Dirigente)</option>}
                    <option value="tesorero">Tesorero</option>
                    {esSuperUser && <option value="superuser">Super User</option>}
                  </select>
                </div>

                {esSuperUser && (
                  <div className="input-field">
                    <label style={labelStyle}>MOVER DE CLUB</label>
                    <select value={usuarioEnEdicion.club_id} onChange={e => setUsuarioEnEdicion({ ...usuarioEnEdicion, club_id: e.target.value })} style={inputStyle}>
                      <option value="">Ninguno / Quitar Club</option>
                      {clubes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {usuarioEnEdicion.rol === 'ct' && (
                <div className="input-field" style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>CATEGORÍAS ASIGNADAS (Filtra la vista del CT)</label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: '#0a0a0a', padding: '10px', borderRadius: '4px', border: '1px solid #333' }}>
                    {['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava', '2016', '2017', '2018', '2019'].map(cat => {
                      const checked = (usuarioEnEdicion.categorias_asignadas || []).includes(cat);
                      return (
                        <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', padding: '4px 8px', background: checked ? '#10b98122' : 'transparent', borderRadius: '4px', border: checked ? '1px solid #10b981' : '1px solid transparent' }}>
                          <input type="checkbox" checked={checked} onChange={(e) => handleCategoriaChange(cat, e.target.checked)} style={{ cursor: 'pointer' }} />
                          {cat}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="submit" disabled={procesando} style={{ background: 'var(--accent)', color: '#000', padding: '15px', fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>
                {procesando ? 'GUARDANDO CAMBIOS...' : '💾 APLICAR CAMBIOS'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL DE EDICIÓN DE CLUB (SOLO SUPERUSER)
      ========================================================= */}
      {clubEnEdicion && esSuperUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', animation: 'fadeIn 0.2s' }}>
          <div className="bento-card custom-scroll" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #c084fc', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#c084fc' }}>EDITAR CLUB</div>
              <button onClick={() => setClubEnEdicion(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>
            
            <form onSubmit={guardarEdicionClub} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="input-field">
                <label style={labelStyle}>NOMBRE DE LA INSTITUCIÓN</label>
                <input type="text" required value={clubEnEdicion.nombre} onChange={e => setClubEnEdicion({ ...clubEnEdicion, nombre: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="input-field">
                  <label style={labelStyle}>PLAN ACTUAL</label>
                  <select value={clubEnEdicion.plan_actual} onChange={e => setClubEnEdicion({ ...clubEnEdicion, plan_actual: e.target.value })} style={inputStyle}>
                    <option value="Básico">Básico</option>
                    <option value="Pro">Pro</option>
                    <option value="Premium Master">Premium Master</option>
                  </select>
                </div>
                
                <div className="input-field">
                  <label style={labelStyle}>VENCIMIENTO</label>
                  <input type="date" value={clubEnEdicion.fecha_vencimiento} onChange={e => setClubEnEdicion({ ...clubEnEdicion, fecha_vencimiento: e.target.value })} style={inputStyle} />
                </div>
              </div>

              <div className="input-field">
                <label style={labelStyle}>URL DEL ESCUDO</label>
                <input type="url" value={clubEnEdicion.escudo_url} onChange={e => setClubEnEdicion({ ...clubEnEdicion, escudo_url: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', background: '#111', padding: '15px', borderRadius: '8px' }}>
                <input 
                  type="checkbox" 
                  id="suscripcion_activa_edit"
                  checked={clubEnEdicion.suscripcion_activa} 
                  onChange={e => setClubEnEdicion({ ...clubEnEdicion, suscripcion_activa: e.target.checked })} 
                  style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                />
                <label htmlFor="suscripcion_activa_edit" style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Suscripción Habilitada</label>
              </div>

              <button type="submit" disabled={procesandoClub} style={{ background: '#c084fc', color: '#000', padding: '15px', fontWeight: 900, border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>
                {procesandoClub ? 'GUARDANDO CAMBIOS...' : '💾 GUARDAR DATOS DEL CLUB'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Estilos reutilizables
const labelStyle = { fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '5px', display: 'block', fontWeight: 'bold' };
const inputStyle = { width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };
const btnIconoClaro = { background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' };
const btnIconoRojo = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' };
const tabBtnStyle = { padding: '8px 15px', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' };

export default Usuarios;