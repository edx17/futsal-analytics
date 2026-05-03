import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

const IconWellness = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

const IconRendimiento = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);

const IconStats = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
);

const IconPartidos = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const IconSalir = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

export default function LoginKiosco() {
  const [jugadores, setJugadores] = useState([]);
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputCodigo, setInputCodigo] = useState('');
  const [novedadesJugador, setNovedadesJugador] = useState([]);

  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [mostrarMenu, setMostrarMenu] = useState(false);

  const [esMovil, setEsMovil] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [clubId, setClubId] = useState(
    searchParams.get('club') || localStorage.getItem('kiosco_club_id')
  );

  // 🔐 FORZAR SESIÓN KIOSCO REAL
  useEffect(() => {
    const iniciarKiosco = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const emailActual = session?.user?.email;

        if (emailActual !== 'kiosco@virtualstats.com') {
          await supabase.auth.signOut();
          const { error } = await supabase.auth.signInWithPassword({
            email: 'kiosco@virtualstats.com',
            password: 'KioscoTuClub2024!'
          });
          if (error) throw error;
        }

        if (clubId) {
          localStorage.setItem('kiosco_club_id', clubId);
          localStorage.setItem('club_id', clubId);
          fetchPlantel(clubId);
        }
      } catch (err) {
        console.error('Error kiosco:', err);
        showToast('Error iniciando kiosco', 'error');
      }
    };

    iniciarKiosco();
  }, [clubId]);

  const normalizar = (v) => String(v ?? '').trim().toLowerCase();

  // 📰 NOVEDADES KIOSCO
  const fetchNovedadesKiosco = async (idClub, categoriaJugador) => {
    if (!idClub) return;

    let query = supabase
      .from('novedades')
      .select('id, mensaje, publico_objetivo, categorias, fecha_creacion, perfiles(nombre_completo)')
      .eq('club_id', idClub)
      .in('publico_objetivo', ['Jugadores', 'Ambos'])
      .order('fecha_creacion', { ascending: false })
      .limit(5);

    if (categoriaJugador && categoriaJugador !== 'undefined') {
      query = query.contains('categorias', [categoriaJugador]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('fetchNovedadesKiosco:', error.message, error.code);
      setNovedadesJugador([]);
      return;
    }

    setNovedadesJugador(data || []);
  };

  const fetchPlantel = async (id) => {
    setLoading(true);

    const { data, error } = await supabase.rpc('obtener_plantel_kiosco', {
      codigo_club: id
    });

    if (error) {
      showToast(`Error: ${error.message}`, 'error');
      setClubId(null);
    } else {
      const ordenados = data.sort((a, b) =>
        `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`)
      );

      setJugadores(ordenados);

      const savedJugadorId = localStorage.getItem('kiosco_jugador_id');
      const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';

      if (isKioscoMode && savedJugadorId) {
        const jugador = ordenados.find(j => j.id == savedJugadorId);

        if (jugador) {
          setJugadorSeleccionado(jugador);

          const categoria =
            localStorage.getItem('kiosco_categoria') || jugador.categoria;

          fetchNovedadesKiosco(id, categoria);

          setMostrarMenu(true);
        }
      }
    }

    setLoading(false);
  };

  const handleNumpad = (n) => {
    if (pin.length < 4) setPin(prev => prev + n);
  };

  const volverAtras = () => {
    setJugadorSeleccionado(null);
    setPin('');
    setMostrarMenu(false);
    setNovedadesJugador([]);

    localStorage.removeItem('kiosco_jugador_id');
    localStorage.removeItem('kiosco_mode');
    localStorage.removeItem('kiosco_categoria');
  };

  useEffect(() => {
    if (pin.length === 4) ejecutarLogin();
  }, [pin]);

  const ejecutarLogin = async () => {
    setLoading(true);

    const { data, error } = await supabase.rpc('verificar_pin_kiosco', {
      p_jugador_id: jugadorSeleccionado.id,
      p_club_id: clubId,
      p_pin: pin
    });

    if (error || !data) {
      showToast('PIN incorrecto', 'error');
      setPin('');
      setLoading(false);
      return;
    }

    localStorage.setItem('kiosco_mode', 'true');
    localStorage.setItem('kiosco_jugador_id', data.id);

    const categoriaFinal =
      jugadorSeleccionado?.categoria ||
      data.categoria ||
      localStorage.getItem('kiosco_categoria');

    if (categoriaFinal) localStorage.setItem('kiosco_categoria', categoriaFinal);
    await fetchNovedadesKiosco(data.club_id || clubId, categoriaFinal);

    setMostrarMenu(true);
    setLoading(false);
  };

  const categoriasUnicas = useMemo(() => {
    return [...new Set(jugadores.map(j => j.categoria).filter(Boolean))].sort();
  }, [jugadores]);

  const jugadoresFiltrados = useMemo(() => {
    if (filtroCategoria === 'Todas') return jugadores;
    return jugadores.filter(j => j.categoria === filtroCategoria);
  }, [jugadores, filtroCategoria]);

  if (!clubId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: '20px', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box', overflowX: 'hidden' }}>
        <div style={{ background: 'var(--panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '400px', textAlign: 'center', boxSizing: 'border-box' }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 900 }}>VINCULAR <span style={{ color: 'var(--accent)' }}>CLUB</span></h2>
          <form onSubmit={(e) => { e.preventDefault(); setClubId(inputCodigo.trim()); }} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            <input type="text" placeholder="Código UUID..." value={inputCodigo} onChange={(e) => setInputCodigo(e.target.value)} style={inputStyle} required />
            <button type="submit" style={btnSubmit}>VINCULAR</button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }} style={btnSecundario}>VOLVER</button>
          </form>
        </div>
      </div>
    );
  }

  if (mostrarMenu) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: esMovil ? '20px' : '30px', justifyContent: 'center', alignItems: 'center', animation: 'fadeIn 0.3s ease', boxSizing: 'border-box', overflowX: 'hidden' }}>
        
        <style>{`
          .hub-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            width: 100%;
            max-width: 380px;
            box-sizing: border-box;
          }
          .hub-card {
            background: linear-gradient(145deg, #161616 0%, #0a0a0a 100%);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px;
            padding: 25px 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            user-select: none;
            -webkit-tap-highlight-color: transparent;
          }
          .hub-card:active {
            transform: scale(0.94);
            border-color: var(--accent);
            background: linear-gradient(145deg, rgba(0,255,136,0.08) 0%, #0a0a0a 100%);
            box-shadow: 0 0 20px rgba(0,255,136,0.2);
          }
          .hub-icon {
            color: #ffffff;
            transition: all 0.2s ease;
          }
          .hub-card:active .hub-icon {
            color: var(--accent);
            transform: scale(1.1);
          }
          .hub-title {
            color: #fff;
            font-size: 0.85rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            text-align: center;
          }
        `}</style>

        <div style={{ textAlign: 'center', marginBottom: '35px', width: '100%' }}>
          <div style={avatarGigante}>
            {jugadorSeleccionado.foto ? <img src={jugadorSeleccionado.foto} alt="foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{jugadorSeleccionado.nombre.charAt(0)}</span>}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', margin: '15px 0 5px 0', lineHeight: 1 }}>
            HOLA, <span style={{ color: 'var(--accent)' }}>{jugadorSeleccionado.nombre}</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', margin: 0 }}>¿Qué querés hacer hoy?</p>
        </div>

        <div style={{ width: '100%', maxWidth: '380px', marginBottom: '20px', background: 'rgba(250, 204, 21, 0.07)', border: '1px solid rgba(250, 204, 21, 0.25)', borderRadius: '12px', padding: '15px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>📢</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#facc15', letterSpacing: '1px' }}>NOVEDADES DEL CLUB</span>
          </div>
          {novedadesJugador.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0, textAlign: 'center', padding: '8px 0' }}>
              Sin novedades por ahora 👌
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {novedadesJugador.map(n => (
                <div key={n.id} style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.9rem', color: '#fff', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{n.mensaje}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '5px', textAlign: 'right' }}>
                    — {n.perfiles?.nombre_completo || 'Administración'} · {new Date(n.fecha_creacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hub-grid">
          <div className="hub-card" onClick={() => navigate('/kiosco/wellness')}>
            <span className="hub-icon"><IconWellness /></span>
            <span className="hub-title">WELLNESS</span>
          </div>

          <div className="hub-card" onClick={() => navigate('/kiosco/rendimiento')}>
            <span className="hub-icon"><IconRendimiento /></span>
            <span className="hub-title">RENDIMIENTO</span>
          </div>

          <div className="hub-card" onClick={() => navigate('/kiosco/jugador-perfil')}>
            <span className="hub-icon"><IconStats /></span>
            <span className="hub-title">STATS</span>
          </div>

          <div className="hub-card" onClick={() => navigate('/kiosco/resumen')}>
            <span className="hub-icon"><IconPartidos /></span>
            <span className="hub-title">PARTIDOS</span>
          </div>
        </div>

        <button onClick={volverAtras} style={{ ...btnSecundario, width: '100%', maxWidth: '380px', marginTop: '30px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconSalir /></span>
          <span style={{ paddingTop: '2px' }}>CERRAR MI SESIÓN</span>
        </button>
      </div>
    );
  }

  const numpadSize = esMovil ? '70px' : '80px';
  const numpadFont = esMovil ? '1.4rem' : '1.8rem';
  const estiloNumpadDinamico = { ...btnNumpad, width: numpadSize, height: numpadSize, fontSize: numpadFont };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: esMovil ? '15px' : '20px', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: esMovil ? '20px' : '30px', flexWrap: 'wrap', gap: '10px', width: '100%' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {jugadorSeleccionado ? (
            <button onClick={volverAtras} style={btnVolver}>← VOLVER</button>
          ) : (
            <button onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }} style={btnVolver}>← LOGIN</button>
          )}
          {!jugadorSeleccionado && <h2 style={{ fontFamily: 'Outfit', fontWeight: 900, margin: 0, fontSize: esMovil ? '1rem' : '1.2rem' }}>INGRESO <span style={{ color: 'var(--accent)' }}>RÁPIDO</span></h2>}
        </div>
        <button onClick={() => { localStorage.removeItem('kiosco_club_id'); setClubId(null); }} style={btnDesvincular}>Desvincular</button>
      </div>

      {!jugadorSeleccionado ? (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
          
          {categoriasUnicas.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '15px', marginBottom: '5px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
              <button 
                onClick={() => setFiltroCategoria('Todas')} 
                style={{ ...btnFiltroCat, background: filtroCategoria === 'Todas' ? 'var(--accent)' : '#111', color: filtroCategoria === 'Todas' ? '#000' : 'var(--text-dim)' }}
              >
                TODAS
              </button>
              {categoriasUnicas.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setFiltroCategoria(cat)} 
                  style={{ ...btnFiltroCat, background: filtroCategoria === cat ? 'var(--accent)' : '#111', color: filtroCategoria === cat ? '#000' : 'var(--text-dim)' }}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: esMovil ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(100px, 1fr))', 
            gap: esMovil ? '10px' : '20px', 
            overflowY: 'auto', 
            paddingBottom: '20px',
            boxSizing: 'border-box' 
          }}>
            {jugadoresFiltrados.map(j => (
              <div key={j.id} onClick={() => setJugadorSeleccionado(j)} style={{...cardJugador, padding: esMovil ? '10px' : '15px'}}>
                <div style={avatar}>
                  {j.foto ? <img src={j.foto} alt="foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{j.nombre.charAt(0)}</span>}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff', wordBreak: 'break-word', lineHeight: 1.1 }}>{j.apellido?.toUpperCase()}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginTop: '3px' }}>{j.nombre.toUpperCase()}</div>
              </div>
            ))}
            {jugadoresFiltrados.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-dim)', padding: '20px', fontSize: '0.9rem' }}>
                No hay jugadores en esta categoría.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%', boxSizing: 'border-box' }}>
          <div style={{ textAlign: 'center', marginBottom: esMovil ? '20px' : '30px' }}>
            <div style={{ fontSize: esMovil ? '1rem' : '1.2rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Hola <strong>{jugadorSeleccionado.nombre}</strong></div>
            <div style={{ fontSize: esMovil ? '2rem' : '2.5rem', fontWeight: 900, letterSpacing: '15px', color: 'var(--accent)', height: '50px' }}>{pin.padEnd(4, '•')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${numpadSize})`, gap: esMovil ? '10px' : '15px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpad(num.toString())} style={estiloNumpadDinamico}>{num}</button>
            ))}
            <button onClick={volverAtras} style={{ ...estiloNumpadDinamico, background: '#ef4444' }}>✕</button>
            <button onClick={() => handleNumpad('0')} style={estiloNumpadDinamico}>0</button>
            <button onClick={() => setPin('')} style={{ ...estiloNumpadDinamico, background: '#333' }}>⌫</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '15px', background: '#000', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', textAlign: 'center', fontWeight: 800, outline: 'none', boxSizing: 'border-box', width: '100%' };
const btnSubmit = { padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px', width: '100%', boxSizing: 'border-box' };
const btnSecundario = { padding: '15px', background: 'transparent', color: 'var(--text-dim)', fontWeight: 800, border: '1px solid #333', cursor: 'pointer', borderRadius: '4px', width: '100%', boxSizing: 'border-box', transition: 'all 0.2s' };
const btnVolver = { background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '8px 15px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' };
const btnDesvincular = { background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', textDecoration: 'underline', cursor: 'pointer' };

const cardJugador = { background: 'var(--panel)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', border: '1px solid var(--border)', transition: 'transform 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' };
const avatar = { width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', margin: '0 auto 8px auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent)', flexShrink: 0 };
const btnNumpad = { borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--border)', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxSizing: 'border-box', outline: 'none', WebkitTapHighlightColor: 'transparent' };
const btnFiltroCat = { padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s', outline: 'none' };

const avatarGigante = { width: '85px', height: '85px', borderRadius: '50%', background: '#111', border: '3px solid var(--accent)', margin: '0 auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent)', flexShrink: 0, boxShadow: '0 0 25px rgba(0,255,136,0.15)' };