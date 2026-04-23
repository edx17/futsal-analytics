import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

export default function LoginKiosco() {
  const [jugadores, setJugadores] = useState([]);
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputCodigo, setInputCodigo] = useState('');
  
  // 🔥 NUEVO ESTADO: Controla si mostramos el teclado numérico o el menú de opciones
  const [mostrarMenu, setMostrarMenu] = useState(false);
  
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [clubId, setClubId] = useState(searchParams.get('club') || localStorage.getItem('kiosco_club_id'));

  // Logueamos al dispositivo en Supabase con la cuenta genérica del Kiosco
  useEffect(() => {
    const loginDispositivo = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInWithPassword({
          email: 'kiosco@virtualstats.com',
          password: 'KioscoTuClub2024!' // <--- Asegurate de que esto coincida con tu base
        });
      }
    };
    loginDispositivo();
  }, []);

  useEffect(() => {
    if (clubId) {
      localStorage.setItem('kiosco_club_id', clubId);
      localStorage.setItem('club_id', clubId); // <-- CLAVE PARA EL RESTO DE LA APP
      fetchPlantel(clubId);
    }
  }, [clubId]);

  const fetchPlantel = async (id) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('obtener_plantel_kiosco', { codigo_club: id });
    
    if (error) {
      showToast(`Error: ${error.message}`, 'error');
      localStorage.removeItem('kiosco_club_id');
      setClubId(null);
    } else if (!data || data.length === 0) {
      showToast('No hay jugadores en este club.', 'warning');
      setClubId(null);
    } else {
      const dataOrdenada = data.sort((a, b) => {
        const textoA = `${a.apellido || ''} ${a.nombre || ''}`.trim().toLowerCase();
        const textoB = `${b.apellido || ''} ${b.nombre || ''}`.trim().toLowerCase();
        return textoA.localeCompare(textoB);
      });
      setJugadores(dataOrdenada);
    }
    setLoading(false);
  };

  const handleNumpad = (numero) => {
    if (pin.length < 4) setPin(prev => prev + numero);
  };

  const volverAtras = () => {
    setJugadorSeleccionado(null);
    setPin('');
    setMostrarMenu(false);
    localStorage.removeItem('kiosco_jugador_id');
    localStorage.removeItem('kiosco_mode');
  };

  useEffect(() => {
    if (pin.length === 4) ejecutarLogin();
  }, [pin]);

  const ejecutarLogin = async () => {
    try {
      if (!jugadorSeleccionado?.id || !clubId) {
        showToast('No se pudo identificar al jugador.', 'error');
        setPin('');
        return;
      }

      setLoading(true);

      const { data, error } = await supabase.rpc('verificar_pin_kiosco', {
        p_jugador_id: jugadorSeleccionado.id,
        p_club_id: clubId,
        p_pin: pin.trim()
      });

      if (error || !data) {
        showToast('PIN incorrecto.', 'error');
        setPin('');
        setLoading(false);
        return;
      }

      localStorage.setItem('kiosco_mode', 'true');
      localStorage.setItem('kiosco_club_id', data.club_id);
      localStorage.setItem('club_id', data.club_id); 
      localStorage.setItem('kiosco_jugador_id', data.id);
      localStorage.setItem('kiosco_nombre', data.nombre || '');
      localStorage.setItem('kiosco_apellido', data.apellido || '');
      
      showToast(`¡Bienvenido ${data.nombre}!`, 'success');
      
      setLoading(false);
      setMostrarMenu(true);

    } catch (err) {
      console.error("🚨 EXPLOTÓ ALGO EN EL FRONTEND:", err);
      showToast('Error de sistema', 'error');
      setPin('');
      setLoading(false);
    }
  };

  if (!clubId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: '20px', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: 'var(--panel)', padding: '40px', borderRadius: '8px', border: '1px solid var(--border)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
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

  // 🔥 NUEVA PANTALLA: HUB DE NAVEGACIÓN DEL JUGADOR
  if (mostrarMenu) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: '20px', justifyContent: 'center', alignItems: 'center', animation: 'fadeIn 0.3s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={avatarGigante}>
            {jugadorSeleccionado.foto ? <img src={jugadorSeleccionado.foto} alt="foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{jugadorSeleccionado.nombre.charAt(0)}</span>}
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#fff', textTransform: 'uppercase', margin: '15px 0 5px 0' }}>
            ¡HOLA, <span style={{ color: 'var(--accent)' }}>{jugadorSeleccionado.nombre}</span>!
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '1rem' }}>¿Qué querés hacer hoy?</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '350px' }}>
          {/* 🔥 RUTAS CORREGIDAS AL FORMATO DEL KIOSCO */}
          <button onClick={() => navigate('/kiosco/wellness')} style={btnHub}>
            🩺 CARGAR WELLNESS
          </button>
          <button onClick={() => navigate('/kiosco/rendimiento')} style={btnHub}>
            🏋️ CARGAR RENDIMIENTO
          </button>
          <button onClick={() => navigate('/kiosco/jugador-perfil')} style={btnHub}>
            📊 VER MI PERFIL / STATS
          </button>
          <button onClick={() => navigate('/kiosco/resumen')} style={btnHub}>
            🗓️ VER PARTIDOS / RESUMEN
          </button>

          <button onClick={volverAtras} style={{ ...btnSecundario, marginTop: '20px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
            🚪 SALIR / CERRAR SESIÓN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {jugadorSeleccionado ? (
            <button onClick={volverAtras} style={btnVolver}>← VOLVER</button>
          ) : (
            <button onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }} style={btnVolver}>← VOLVER AL LOGIN</button>
          )}
          {!jugadorSeleccionado && <h2 style={{ fontFamily: 'Outfit', fontWeight: 900, margin: 0, fontSize: '1.2rem' }}>INGRESO <span style={{ color: 'var(--accent)' }}>RÁPIDO</span></h2>}
        </div>
        <button onClick={() => { localStorage.removeItem('kiosco_club_id'); setClubId(null); }} style={btnDesvincular}>Desvincular</button>
      </div>

      {!jugadorSeleccionado ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '20px', maxWidth: '800px', margin: '0 auto' }}>
          {jugadores.map(j => (
            <div key={j.id} onClick={() => setJugadorSeleccionado(j)} style={cardJugador}>
              <div style={avatar}>
                {j.foto ? <img src={j.foto} alt="foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{j.nombre.charAt(0)}</span>}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff' }}>{j.apellido?.toUpperCase()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>{j.nombre.toUpperCase()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ fontSize: '1.2rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Hola <strong>{jugadorSeleccionado.nombre}</strong></div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '15px', color: 'var(--accent)', height: '50px' }}>{pin.padEnd(4, '•')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 80px)', gap: '15px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumpad(num.toString())} style={btnNumpad}>{num}</button>
            ))}
            <button onClick={volverAtras} style={{ ...btnNumpad, background: '#ef4444' }}>✕</button>
            <button onClick={() => handleNumpad('0')} style={btnNumpad}>0</button>
            <button onClick={() => setPin('')} style={{ ...btnNumpad, background: '#333' }}>⌫</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '15px', background: '#000', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', textAlign: 'center', fontWeight: 800, outline: 'none' };
const btnSubmit = { padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px' };
const btnSecundario = { padding: '15px', background: 'transparent', color: 'var(--text-dim)', fontWeight: 800, border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' };
const btnVolver = { background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '8px 15px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' };
const btnDesvincular = { background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', textDecoration: 'underline', cursor: 'pointer' };

// Estilos de las cards y numpad
const cardJugador = { background: 'var(--panel)', padding: '15px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', border: '1px solid var(--border)', transition: 'transform 0.1s' };
const avatar = { width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', margin: '0 auto 10px auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent)' };
const btnNumpad = { width: '80px', height: '80px', borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--border)', color: '#fff', fontSize: '1.8rem', fontWeight: 800, cursor: 'pointer' };

// Estilos para el nuevo HUB de Jugador
const avatarGigante = { width: '90px', height: '90px', borderRadius: '50%', background: '#222', border: '3px solid var(--accent)', margin: '0 auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent)' };
const btnHub = { padding: '18px', background: 'var(--panel)', color: '#fff', fontWeight: 900, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' };