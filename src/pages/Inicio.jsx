import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; 

function Inicio() {
  const navigate = useNavigate();
  const { perfil } = useAuth(); 
  
  // --- LÓGICA DE ROLES ---
  const rol = perfil?.rol?.toLowerCase();
  const esSuperUser = rol === 'superuser';
  const esAdmin = rol === 'admin';
  const esCT = rol === 'ct';
  const esJugador = rol === 'jugador';

  // --- LA MAGIA ACÁ ---
  const [clubMaster, setClubMaster] = useState(localStorage.getItem('club_id') || '');
  const clubActivo = esSuperUser ? clubMaster : (perfil?.club_id || '');

  // Estado para el nombre del club y el escudo
  const [nombreClub, setNombreClub] = useState(
    esSuperUser 
      ? (clubMaster ? (localStorage.getItem('mi_club') || 'CARGANDO...') : 'VISTA GLOBAL MASTER') 
      : (perfil?.clubes?.nombre || localStorage.getItem('mi_club') || 'CARGANDO...')
  );
  const [escudoClub, setEscudoClub] = useState(localStorage.getItem('escudo_url') || '');

  const [ultimoPartido, setUltimoPartido] = useState(null);
  const [proximoPartido, setProximoPartido] = useState(null); 
  const [estadisticas, setEstadisticas] = useState({ jugados: 0, victorias: 0, plantel: 0 });
  const [cargando, setCargando] = useState(true);
  
  // Lista de clubes (Solo para SuperUser)
  const [listaClubes, setListaClubes] = useState([]);

  // 1. Cargar la lista de clubes disponibles (SOLO SUPERUSER)
  useEffect(() => {
    if (esSuperUser) {
      async function fetchClubes() {
        // Pedimos el escudo, pero si hay un error (ej. falta la columna), pedimos solo id y nombre en modo seguro
        let { data, error } = await supabase.from('clubes').select('id, nombre, escudo_url').order('nombre');
        
        if (error) {
          console.warn("🚨 No se encontró escudo_url, cargando lista de clubes en modo seguro...");
          const fallback = await supabase.from('clubes').select('id, nombre').order('nombre');
          data = fallback.data;
        }
        
        if (data) setListaClubes(data);
      }
      fetchClubes();
    }
  }, [esSuperUser]);

  // 2. Cargar los datos del Dashboard según el club activo
  useEffect(() => {
    async function cargarDashboard() {
      setCargando(true);
      
      // SI NO HAY CLUB (y no es Master), FRENAMOS
      if (!clubActivo && !esSuperUser) {
        setCargando(false);
        return;
      }

      // --- BUSCAR EL NOMBRE REAL Y ESCUDO EN LA TABLA CLUBES ---
      if (clubActivo) {
        // Intentamos traer el escudo, si la columna no existe fallará silenciosamente y no lo seteará
        const { data: clubData, error } = await supabase
          .from('clubes')
          .select('nombre, escudo_url')
          .eq('id', clubActivo)
          .single();
          
        if (error) {
          console.error("🚨 Error al buscar el club activo:", error);
        }
          
        if (clubData) {
          if (clubData.nombre) {
            setNombreClub(clubData.nombre);
            localStorage.setItem('mi_club', clubData.nombre);
          }
          if (clubData.escudo_url) {
            setEscudoClub(clubData.escudo_url);
            localStorage.setItem('escudo_url', clubData.escudo_url);
          } else {
            setEscudoClub('');
            localStorage.removeItem('escudo_url');
          }
        }
      } else if (esSuperUser) {
        setNombreClub('VISTA GLOBAL MASTER');
        setEscudoClub('');
      }

      const hoyStr = new Date().toISOString().split('T')[0];

      // Traer el ÚLTIMO partido jugado
      let queryUltimo = supabase.from('partidos').select('*').in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false }).limit(1);
      if (clubActivo) queryUltimo = queryUltimo.eq('club_id', clubActivo);
      const { data: dataUltimo } = await queryUltimo;
      setUltimoPartido(dataUltimo && dataUltimo.length > 0 ? dataUltimo[0] : null);

      // Traer el PRÓXIMO partido a jugarse (Pendiente y fecha >= hoy)
      let queryProximo = supabase.from('partidos').select('*').eq('estado', 'Pendiente').gte('fecha', hoyStr).order('fecha', { ascending: true }).limit(1);
      if (clubActivo) queryProximo = queryProximo.eq('club_id', clubActivo);
      const { data: dataProximo } = await queryProximo;
      setProximoPartido(dataProximo && dataProximo.length > 0 ? dataProximo[0] : null);

      // Traer stats rápidas
      let queryJugadores = supabase.from('jugadores').select('*', { count: 'exact', head: true });
      let queryPartidos = supabase.from('partidos').select('*', { count: 'exact', head: true });

      if (clubActivo) {
        queryJugadores = queryJugadores.eq('club_id', clubActivo);
        queryPartidos = queryPartidos.eq('club_id', clubActivo);
      }

      const { count: countJugadores } = await queryJugadores;
      const { count: countPartidos } = await queryPartidos;

      setEstadisticas({
        jugados: countPartidos || 0,
        plantel: countJugadores || 0
      });
      setCargando(false);
    }
    cargarDashboard();
  }, [clubActivo, esSuperUser]);

  // Función para que el Master cambie de club en vivo
  const handleCambioClub = (e) => {
    const nuevoId = e.target.value;
    if (nuevoId === '') {
      localStorage.removeItem('club_id');
      localStorage.removeItem('mi_club');
      localStorage.removeItem('escudo_url');
      setClubMaster('');
      setNombreClub('VISTA GLOBAL MASTER');
      setEscudoClub('');
    } else {
      const clubSeleccionado = listaClubes.find(c => c.id === nuevoId);
      if (!clubSeleccionado) return; // Evita que explote si no encuentra el club

      localStorage.setItem('club_id', nuevoId);
      localStorage.setItem('mi_club', clubSeleccionado.nombre);
      
      // Seteamos el escudo al cambiar si es que el club lo tiene
      if (clubSeleccionado.escudo_url) {
        localStorage.setItem('escudo_url', clubSeleccionado.escudo_url);
        setEscudoClub(clubSeleccionado.escudo_url);
      } else {
        localStorage.removeItem('escudo_url');
        setEscudoClub('');
      }
      
      setClubMaster(nuevoId);
      setNombreClub(clubSeleccionado.nombre);
    }
  };

  // --- VISTA ALTERNATIVA: SI NO TIENE CLUB CONFIGURADO ---
  if (!cargando && !clubActivo && !esSuperUser) {
    if (esAdmin) {
      return (
        <div style={{ animation: 'fadeIn 0.3s', padding: '50px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🏟️</div>
          <h2 style={{ color: 'var(--accent)', fontWeight: 900 }}>¡BIENVENIDO A VIRTUAL.STATS!</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '30px', lineHeight: '1.6' }}>
            Para empezar a registrar entrenamientos, convocatorias y estadísticas, primero necesitamos crear el perfil de tu equipo.
          </p>
          <button onClick={() => navigate('/configuracion')} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.1rem' }}>
            CONFIGURAR MI CLUB AHORA
          </button>
        </div>
      );
    } else {
      return (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>
          <h2>El club aún no está configurado.</h2>
          <p>Por favor, contactá a la administración del club para que completen la configuración inicial.</p>
        </div>
      );
    }
  }   

  return (
    <div style={{ animation: 'fadeIn 0.3s', paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* HEADER DEL CLUB */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          
          {/* ACÁ SE RENDERIZA EL ESCUDO O EL ICONO POR DEFECTO */}
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem', overflow: 'hidden' }}>
            {esSuperUser && !clubActivo ? '👑' : 
              escudoClub ? <img src={escudoClub} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : 
              nombreClub.substring(0, 2).toUpperCase()}
          </div>
          
          <div>
            <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>CENTRO DE MANDO • {rol?.toUpperCase()}</div>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>
              {nombreClub}
            </h1>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 800 }}>{perfil?.nombre_completo?.toUpperCase() || 'USUARIO'}</div>
            
            {/* SELECTOR DE CLUBES (SOLO PARA MASTER) */}
            {esSuperUser && (
              <select 
                value={clubActivo} 
                onChange={handleCambioClub}
                style={{ padding: '8px 12px', background: '#111', border: '1px solid #c084fc', color: '#c084fc', borderRadius: '4px', outline: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem' }}
              >
                <option value="">🌍 VISIÓN GLOBAL (TODOS)</option>
                {listaClubes.map(c => (
                  <option key={c.id} value={c.id}>🏢 GESTIONAR: {c.nombre}</option>
                ))}
              </select>
            )}
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '50px' }}>CARGANDO DATOS...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          {/* BLOQUE: ACCESO MASTER (SOLO SUPERUSER) */}
          {esSuperUser && (
            <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid #c084fc', background: 'linear-gradient(180deg, rgba(192,132,252,0.05) 0%, rgba(0,0,0,0) 100%)' }} onClick={() => navigate('/usuarios')}>
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>👑</div>
              <div className="stat-label" style={{ color: '#c084fc', fontSize: '1.2rem' }}>GESTIÓN DE USUARIOS</div>
              <p style={{ color: 'var(--text-dim)', marginTop: '10px', fontSize: '0.85rem' }}>Administrar todos los usuarios, permisos y accesos de los clubes.</p>
            </div>
          )}

          {/* Acción para Cuerpo Técnico o SuperUser */}
          {(esCT || (esSuperUser && clubActivo)) && (
            <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid var(--accent)', background: 'linear-gradient(180deg, rgba(0,255,136,0.05) 0%, rgba(0,0,0,0) 100%)' }} onClick={() => navigate('/nuevo-partido')}>
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚡</div>
              <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>NUEVO PARTIDO</div>
              <p style={{ color: 'var(--text-dim)', marginTop: '10px', fontSize: '0.85rem' }}>Crear convocatoria e iniciar toma de datos en vivo.</p>
            </div>
          )}

          {/* Acción para Institucional/Admin */}
          {((esAdmin || (esSuperUser && clubActivo)) && !esCT) && (
            <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid #3b82f6', background: 'linear-gradient(180deg, rgba(59,130,246,0.05) 0%, rgba(0,0,0,0) 100%)' }} onClick={() => navigate('/tesoreria')}>
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>💰</div>
              <div className="stat-label" style={{ color: '#3b82f6', fontSize: '1.2rem' }}>TESORERÍA</div>
              <p style={{ color: 'var(--text-dim)', marginTop: '10px', fontSize: '0.85rem' }}>Gestionar ingresos, pagos de cuotas y saldos de caja.</p>
            </div>
          )}

          {/* Acción para Jugadores */}
          {esJugador && (
            <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid #f59e0b', background: 'linear-gradient(180deg, rgba(245,158,11,0.05) 0%, rgba(0,0,0,0) 100%)' }} onClick={() => navigate('/wellness')}>
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🌡️</div>
              <div className="stat-label" style={{ color: '#f59e0b', fontSize: '1.2rem' }}>MI WELLNESS</div>
              <p style={{ color: 'var(--text-dim)', marginTop: '10px', fontSize: '0.85rem' }}>Cargar reporte de fatiga, sueño y estado físico de hoy.</p>
            </div>
          )}

          {/* CONTENEDOR DE PARTIDOS (PRÓXIMO Y ÚLTIMO) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', gridColumn: '1 / -1' }}>
            
            {/* TARJETA: PRÓXIMO PARTIDO */}
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '2px solid #3b82f6' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: '#3b82f6' }}>PRÓXIMO PARTIDO {(!clubActivo && esSuperUser) ? 'GLOBAL' : ''}</div>
              {proximoPartido ? (
                <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 'bold' }}>📅 {proximoPartido.fecha?.split('-').reverse().join('/')}</span>
                    <span style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{proximoPartido.competicion}</span>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, textAlign: 'center', margin: '15px 0', color: '#fff' }}>
                    vs {proximoPartido.rival?.toUpperCase()}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                    📍 CONDICIÓN: {proximoPartido.condicion?.toUpperCase()}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px', background: '#111', borderRadius: '6px', border: '1px dashed #333' }}>No hay partidos programados próximamente.</div>
              )}
            </div>

            {/* TARJETA: ÚLTIMO PARTIDO */}
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', borderTop: '2px solid var(--accent)' }}>
              <div className="stat-label" style={{ marginBottom: '15px', color: 'var(--accent)' }}>ÚLTIMO REGISTRO {(!clubActivo && esSuperUser) ? 'GLOBAL' : ''}</div>
              {ultimoPartido ? (
                <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{ultimoPartido.fecha?.split('-').reverse().join('/')}</span>
                    <span style={{ background: '#222', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{ultimoPartido.competicion}</span>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, textAlign: 'center', margin: '15px 0' }}>
                    vs {ultimoPartido.rival?.toUpperCase()}
                  </div>
                  <button onClick={() => navigate(`/resumen/${ultimoPartido.id}`)} className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>
                    VER REPORTE ANALÍTICO
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px', background: '#111', borderRadius: '6px', border: '1px dashed #333' }}>No hay partidos registrados aún.</div>
              )}
            </div>
          </div>

          {/* TARJETA 3: ESTADO DE LA BASE */}
          {!esJugador && (
            <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'center', gridColumn: '1 / -1' }}>
              <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{estadisticas.plantel}</div>
                <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>JUGADORES {(!clubActivo && esSuperUser) ? 'TOTALES' : 'EN PLANTEL'}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>{estadisticas.jugados}</div>
                <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>PARTIDOS TRACKEADOS</div>
              </div>
              <button onClick={() => navigate('/temporada')} className="btn-action" style={{ gridColumn: 'span 2', padding: '15px', fontSize: '0.85rem' }}>
                VER RENDIMIENTO {(!clubActivo && esSuperUser) ? 'GLOBAL' : 'DE TEMPORADA'}
              </button>
            </div>
          )}

          {/* TARJETA 3: ESTADO DEL JUGADOR */}
          {esJugador && (
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gridColumn: '1 / -1' }}>
               <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🏃‍♂️</div>
               <div className="stat-label" style={{ marginBottom: '10px' }}>MIS ESTADÍSTICAS</div>
               <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: '20px' }}>Accedé a tus métricas individuales, minutos jugados y mapas de calor.</p>
               <button onClick={() => navigate('/perfil-jugador')} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '0.85rem' }}>
                VER MI PERFIL
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default Inicio;