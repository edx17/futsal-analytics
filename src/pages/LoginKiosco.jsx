import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useEsMovil } from '../utils/useEsMovil';
import { filtroNoVencidas } from '../utils/novedades';
import {
  abrirSesionKiosco, cerrarSesionKiosco, cargarFichaKiosco, guardarTokenKiosco, tokenKiosco,
} from '../utils/kiosco';
import { activarNotificacionesJugador, navegadorSuscripto } from '../utils/pushNotificaciones';
import {
  disciplinaDe, proximoPartidoDe, wellnessDeHoy, historialWellness, esCumpleHoy, edadQueCumple,
} from '../analytics/fichaKiosco';
import {
  ChipsJugador, TarjetaCumple, TarjetaWellness, TarjetaAgenda, TarjetaDisciplina,
  TarjetaNotificaciones, TarjetaReingresar,
} from '../components/kiosco/TarjetasKiosco';
import { telefonoWhatsApp } from '../utils/telefono';

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

const IconVideos = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"></polygon>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
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

const IconSalud = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>
    <line x1="12" y1="9" x2="12" y2="15"></line>
    <line x1="9" y1="12" x2="15" y2="12"></line>
  </svg>
);

const IconTemporada = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 17 9 11 13 15 21 7"></polyline>
    <polyline points="14 7 21 7 21 14"></polyline>
  </svg>
);

const IconLibro = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
  </svg>
);

const IconTorneo = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8"></path>
    <path d="M12 17v4"></path>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z"></path>
    <path d="M17 5h3v2a3 3 0 0 1-3 3"></path>
    <path d="M7 5H4v2a3 3 0 0 0 3 3"></path>
  </svg>
);

const IconDatos = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <circle cx="9" cy="10" r="2.5"></circle>
    <path d="M5.5 16.5c.8-1.8 2-2.5 3.5-2.5s2.7.7 3.5 2.5"></path>
    <line x1="15" y1="9" x2="19" y2="9"></line>
    <line x1="15" y1="13" x2="19" y2="13"></line>
  </svg>
);

/* Los accesos del menú. Mi estado físico, Temporada, Libro táctico y Torneo
   ya existían como pantallas del kiosco pero no tenían botón. */
const ACCESOS = [
  { ruta: '/kiosco/wellness',       titulo: 'WELLNESS',     icono: IconWellness },
  { ruta: '/kiosco/rendimiento',    titulo: 'RENDIMIENTO',  icono: IconRendimiento },
  { ruta: '/kiosco/enfermeria',     titulo: 'MI ESTADO FÍSICO', icono: IconSalud },
  { ruta: '/kiosco/jugador-perfil', titulo: 'STATS',        icono: IconStats },
  { ruta: '/kiosco/resumen',        titulo: 'PARTIDOS',     icono: IconPartidos },
  { ruta: '/kiosco/torneo',         titulo: 'TORNEO',       icono: IconTorneo },
  { ruta: '/kiosco/temporada',      titulo: 'TEMPORADA',    icono: IconTemporada },
  { ruta: '/kiosco/videoanalisis',  titulo: 'VIDEOS',       icono: IconVideos },
  { ruta: '/kiosco/libro-tactico',  titulo: 'LIBRO TÁCTICO', icono: IconLibro },
  // Ancho, abajo de todo: son diez accesos y en tres columnas quedaba uno suelto.
  { ruta: '/kiosco/mis-datos',      titulo: 'MIS DATOS · CORREGÍ TU CELULAR, EMERGENCIA U OBRA SOCIAL', icono: IconDatos, ancho: true },
];

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

  // Estados Financieros Kiosco
  const [deudaTotal, setDeudaTotal] = useState(0);
  const [detallesDeuda, setDetallesDeuda] = useState([]); // Guarda los conceptos de lo que debe
  const [clubConfig, setClubConfig] = useState(null);

  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [mostrarMenu, setMostrarMenu] = useState(false);

  // La ficha del jugador (kiosco_ficha): agenda, tarjetas, wellness, etc.
  // 'cargando' | 'ok' | 'sin-token' | 'error'
  const [ficha, setFicha] = useState(null);
  const [estadoFicha, setEstadoFicha] = useState('cargando');
  const [push, setPush] = useState({ estado: 'inactivas', mensaje: null });

  const esMovil = useEsMovil();

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

  // 🧾 FICHA DEL JUGADOR: se pide cada vez que se muestra el menú.
  const cargarFicha = async () => {
    setEstadoFicha('cargando');
    const r = await cargarFichaKiosco();
    if (r.noDisponible) {
      setFicha(null);
      setEstadoFicha('no-disponible');
      return;
    }
    if (r.vencida) {
      guardarTokenKiosco(null);
      setFicha(null);
      setEstadoFicha('sin-token');
      return;
    }
    if (r.error) {
      console.error('kiosco_ficha:', r.error.message);
      setFicha(null);
      setEstadoFicha('error');
      return;
    }
    setFicha(r.ficha);
    setEstadoFicha('ok');
  };

  useEffect(() => {
    if (!mostrarMenu) return;
    cargarFicha();
    navegadorSuscripto().then((si) => { if (si) setPush({ estado: 'activas', mensaje: null }); });
  }, [mostrarMenu]);

  const activarPush = async () => {
    setPush({ estado: 'activando', mensaje: null });
    const r = await activarNotificacionesJugador(tokenKiosco());
    if (r.ok) {
      setPush({ estado: 'activas', mensaje: null });
      showToast('Listo, te van a llegar los avisos 🔔', 'success');
    } else {
      setPush({ estado: 'inactivas', mensaje: r.mensaje });
    }
  };

  /* Sesión vieja (de antes del token) o vencida: se vuelve al PIN con el
     jugador ya elegido, una sola vez. */
  const reingresarPin = () => {
    setPin('');
    setMostrarMenu(false);
  };

  // 📰 NOVEDADES KIOSCO
  const fetchNovedadesKiosco = async (idClub, categoriaJugador) => {
    if (!idClub) return;

    let query = supabase
      .from('novedades')
      .select('id, mensaje, publico_objetivo, categorias, fecha_creacion, perfiles(nombre_completo)')
      .eq('club_id', idClub)
      .in('publico_objetivo', ['Jugadores', 'Ambos'])
      .or(filtroNoVencidas())
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

  // 💰 DATOS FINANCIEROS KIOSCO
  const cargarDatosFinancieros = async (idClub, idJugador) => {
    if (!idClub || !idJugador) return;
    
    try {
      // Modificación: Traemos el nombre y escudo para sincronizar variables globales en modo Kiosco
      const { data: cData } = await supabase.from('clubes').select('nombre, escudo_url, alias_cobro, cbu, cvu, whatsapp_tesoreria').eq('id', idClub).single();
      if (cData) {
        setClubConfig(cData);
        if (cData.nombre) localStorage.setItem('mi_club', cData.nombre);
        if (cData.escudo_url) localStorage.setItem('escudo_url', cData.escudo_url);
      }

      // Sumamos 'concepto' al select para darle transparencia al usuario
      const { data: dData } = await supabase.from('tesoreria_deudas')
        .select('monto_original, monto_pagado, concepto')
        .eq('club_id', idClub)
        .eq('jugador_id', idJugador)
        .in('estado', ['Pendiente', 'Parcial']);

      if (dData && dData.length > 0) {
        const total = dData.reduce((acc, curr) => acc + (Number(curr.monto_original) - Number(curr.monto_pagado)), 0);
        setDeudaTotal(total);
        
        // Extraemos los conceptos únicos para mostrarlos en la UI
        const conceptos = dData.map(d => d.concepto).filter(Boolean);
        setDetallesDeuda([...new Set(conceptos)]);
      } else {
        setDeudaTotal(0);
        setDetallesDeuda([]);
      }
    } catch(err) {
      console.error("Error cargando deudas", err);
    }
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

      /* Sin jugador activo no puede quedar el token del anterior. */
      if (!isKioscoMode || !savedJugadorId) guardarTokenKiosco(null);

      if (isKioscoMode && savedJugadorId) {
        const jugador = ordenados.find(j => j.id == savedJugadorId);

        if (jugador) {
          setJugadorSeleccionado(jugador);
          const categoria = localStorage.getItem('kiosco_categoria') || jugador.categoria;
          // CORRECCIÓN: antes esto se calculaba pero nunca se persistía, así que en una
          // reconexión automática (reload) kiosco_categoria quedaba en null aunque el
          // jugador sí tuviera categoría cargada — rompía el matching de playlists compartidas.
          if (categoria) localStorage.setItem('kiosco_categoria', categoria);
          fetchNovedadesKiosco(id, categoria);
          cargarDatosFinancieros(id, jugador.id);
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
    setDeudaTotal(0);
    setDetallesDeuda([]);
    setFicha(null);
    setEstadoFicha('cargando');
    setPush({ estado: 'inactivas', mensaje: null });
    cerrarSesionKiosco();

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

    /* El token de la ficha. Si la migración 20260924120000 no se corrió,
       vuelve null y el menú funciona como antes, sin las tarjetas nuevas. */
    guardarTokenKiosco(await abrirSesionKiosco(data.id, data.club_id || clubId, pin));

    const categoriaFinal = jugadorSeleccionado?.categoria || data.categoria || localStorage.getItem('kiosco_categoria');

    if (categoriaFinal) localStorage.setItem('kiosco_categoria', categoriaFinal);
    
    await fetchNovedadesKiosco(data.club_id || clubId, categoriaFinal);
    await cargarDatosFinancieros(data.club_id || clubId, data.id);

    setMostrarMenu(true);
    setLoading(false);
  };

  const procesarPagoMP = () => {
    if (!clubConfig?.alias_cobro) return showToast('El club no configuró su Alias.', 'info');
    navigator.clipboard.writeText(clubConfig.alias_cobro);
    showToast('Alias copiado. Abriendo MercadoPago...', 'success');
    setTimeout(() => {
      window.location.href = 'mercadopago://';
    }, 1500);
  };

  const procesarEnvioComprobante = () => {
    if (!clubConfig?.whatsapp_tesoreria) return showToast('El club no configuró su WhatsApp de tesorería.', 'info');
    const msj = `Hola, te adjunto el comprobante de pago de mi cuota/deuda. Soy ${jugadorSeleccionado.nombre} ${jugadorSeleccionado.apellido}.`;
    const tel = telefonoWhatsApp(clubConfig.whatsapp_tesoreria) || String(clubConfig.whatsapp_tesoreria).replace(/\D/g, '');
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(msj)}`;
    window.open(url, '_blank');
  };

  /* Lo que el menú pinta, calculado una vez por ficha. */
  const vistaFicha = useMemo(() => {
    if (!ficha) return null;
    const hoy = ficha.hoy;
    const jug = ficha.jugador || {};
    const proximo = proximoPartidoDe(ficha.partidos, {
      miClub: ficha.club?.nombre || localStorage.getItem('mi_club'), jugadorId: jug.id, hoy,
    });
    return {
      jugador: jug,
      cumple: esCumpleHoy(jug.fechanac, hoy),
      edad: edadQueCumple(jug.fechanac, hoy),
      wellnessHoy: wellnessDeHoy(ficha.wellness, hoy),
      historial: historialWellness(ficha.wellness, hoy, 7),
      proximo,
      sesiones: ficha.sesiones || [],
      disciplina: disciplinaDe(ficha.tarjetas, ficha.sanciones),
    };
  }, [ficha]);

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
      /* Arriba y con alto mínimo, no centrado con alto fijo: con todas las
         tarjetas el menú es más alto que la pantalla, y un flex centrado que
         desborda deja la parte de arriba (el saludo) fuera del scroll. */
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', padding: esMovil ? '20px' : '30px', justifyContent: 'flex-start', alignItems: 'center', animation: 'fadeIn 0.3s ease', boxSizing: 'border-box', overflowX: 'hidden' }}>
        
        <style>{`
          .hub-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            width: 100%;
            max-width: 380px;
            box-sizing: border-box;
          }
          .hub-card {
            background: linear-gradient(145deg, #161616 0%, #0a0a0a 100%);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px;
            padding: 18px 6px;
            min-height: 104px;
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
            font-size: 0.68rem;
            font-weight: 900;
            text-transform: uppercase;
            line-height: 1.15;
            letter-spacing: 0.05em;
            text-align: center;
          }
        `}</style>

        <div style={{ textAlign: 'center', marginBottom: '25px', width: '100%', marginTop: '20px' }}>
          <div style={avatarGigante}>
            {jugadorSeleccionado.foto ? <img src={jugadorSeleccionado.foto} alt="foto" style={{width:'100%', height:'100%', objectFit:'cover'}} /> : <span>{jugadorSeleccionado.nombre.charAt(0)}</span>}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', margin: '15px 0 5px 0', lineHeight: 1 }}>
            HOLA, <span style={{ color: 'var(--accent)' }}>{jugadorSeleccionado.nombre}</span>
          </h1>
          <ChipsJugador jugador={vistaFicha?.jugador || jugadorSeleccionado} />
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', margin: '12px 0 0' }}>¿Qué querés hacer hoy?</p>
        </div>

        {vistaFicha?.cumple && <TarjetaCumple nombre={jugadorSeleccionado.nombre} edad={vistaFicha.edad} />}

        {estadoFicha === 'sin-token' && <TarjetaReingresar onReingresar={reingresarPin} />}

        {/* Arriba de todo, si todavía no lo cargó: es lo que más se olvida. */}
        {vistaFicha && !vistaFicha.wellnessHoy.completo && (
          <TarjetaWellness completo={false} historial={vistaFicha.historial} onCargar={() => navigate('/kiosco/wellness')} />
        )}

        {/* 💳 MÓDULO FINANCIERO KIOSCO */}
        {deudaTotal > 0 && (
          <div style={{ width: '100%', maxWidth: '380px', marginBottom: '20px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '15px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>💳</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ef4444', letterSpacing: '1px' }}>ESTADO DE CUENTA</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>
                  ${deudaTotal.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Listado de conceptos adeudados para contexto */}
            {detallesDeuda.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: '15px', lineHeight: 1.3 }}>
                <strong style={{ color: '#ef4444' }}>Conceptos pendientes:</strong> {detallesDeuda.join(' • ')}
              </div>
            )}
            
            {/* Lógica de renderizado condicional de botones */}
            {(!clubConfig?.alias_cobro && !clubConfig?.whatsapp_tesoreria) ? (
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', textAlign: 'center', borderRadius: '6px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                ⚠️ Acercate a Tesorería o hablá con tu técnico para regularizar tu saldo.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '10px', flexDirection: esMovil ? 'column' : 'row' }}>
                  {clubConfig?.alias_cobro && (
                    <button onClick={procesarPagoMP} style={{ flex: 1, padding: '10px', background: '#00b1ea', color: '#000000', border: 'none', borderRadius: '6px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      🤝 PAGAR CON MP
                    </button>
                  )}
                  {clubConfig?.whatsapp_tesoreria && (
                    <button onClick={procesarEnvioComprobante} style={{ flex: 1, padding: '10px', background: '#25D366', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      📤 COMPROBANTE
                    </button>
                  )}
                </div>
                {clubConfig?.alias_cobro && (
                  <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                    Al tocar el botón se copiará el Alias: <strong style={{color: 'var(--text)'}}>{clubConfig.alias_cobro}</strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}

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
                  <div style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{n.mensaje}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '5px', textAlign: 'right' }}>
                    — {n.perfiles?.nombre_completo || 'Administración'} · {new Date(n.fecha_creacion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {vistaFicha && <TarjetaAgenda proximo={vistaFicha.proximo} sesiones={vistaFicha.sesiones} />}

        {vistaFicha && <TarjetaDisciplina disciplina={vistaFicha.disciplina} />}

        {vistaFicha?.wellnessHoy.completo && (
          <TarjetaWellness completo historial={vistaFicha.historial} />
        )}

        {estadoFicha === 'ok' && (
          <TarjetaNotificaciones estado={push.estado} mensaje={push.mensaje} onActivar={activarPush} />
        )}

        <div className="hub-grid">
          {ACCESOS.map(({ ruta, titulo, icono, ancho }) => (
            <div key={ruta} className="hub-card" onClick={() => navigate(ruta)}
              style={ancho ? { gridColumn: '1 / -1', flexDirection: 'row', minHeight: '64px', padding: '12px 16px', justifyContent: 'flex-start', gap: '14px' } : undefined}>
              <span className="hub-icon">{React.createElement(icono)}</span>
              <span className="hub-title" style={ancho ? { textAlign: 'left' } : undefined}>{titulo}</span>
            </div>
          ))}
        </div>

        <button onClick={volverAtras} style={{ ...btnSecundario, width: '100%', maxWidth: '380px', marginTop: '30px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '40px' }}>
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
                style={{ ...btnFiltroCat, background: filtroCategoria === 'Todas' ? 'var(--accent)' : 'var(--panel)', color: filtroCategoria === 'Todas' ? '#000' : 'var(--text-dim)' }}
              >
                TODAS
              </button>
              {categoriasUnicas.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setFiltroCategoria(cat)} 
                  style={{ ...btnFiltroCat, background: filtroCategoria === cat ? 'var(--accent)' : 'var(--panel)', color: filtroCategoria === cat ? '#000' : 'var(--text-dim)' }}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: esMovil ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(min(100px, 100%), 1fr))', 
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
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text)', wordBreak: 'break-word', lineHeight: 1.1 }}>{j.apellido?.toUpperCase()}</div>
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
            <button onClick={() => setPin('')} style={{ ...estiloNumpadDinamico, background: 'var(--border)' }}>⌫</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: '15px', background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text)', borderRadius: '4px', textAlign: 'center', fontWeight: 800, outline: 'none', boxSizing: 'border-box', width: '100%', fontSize: '16px' };
const btnSubmit = { padding: '15px', background: 'var(--accent)', color: '#000', fontWeight: 800, border: 'none', cursor: 'pointer', borderRadius: '4px', width: '100%', boxSizing: 'border-box' };
const btnSecundario = { padding: '15px', background: 'transparent', color: 'var(--text-dim)', fontWeight: 800, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: '4px', width: '100%', boxSizing: 'border-box', transition: 'all 0.2s' };
const btnVolver = { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 15px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' };
const btnDesvincular = { background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '0.7rem', textDecoration: 'underline', cursor: 'pointer' };

const cardJugador = { background: 'var(--panel)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', border: '1px solid var(--border)', transition: 'transform 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' };
const avatar = { width: '50px', height: '50px', borderRadius: '50%', background: 'var(--panel)', border: '2px solid var(--accent)', margin: '0 auto 8px auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 900, color: 'var(--accent)', flexShrink: 0 };
const btnNumpad = { borderRadius: '50%', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxSizing: 'border-box', outline: 'none', WebkitTapHighlightColor: 'transparent' };
const btnFiltroCat = { padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', transition: '0.2s', outline: 'none' };

const avatarGigante = { width: '85px', height: '85px', borderRadius: '50%', background: 'var(--panel)', border: '3px solid var(--accent)', margin: '0 auto', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent)', flexShrink: 0, boxShadow: '0 0 25px rgba(0,255,136,0.15)' };