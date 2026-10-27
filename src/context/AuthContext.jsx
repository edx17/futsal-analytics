import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';
import { miCuentaJuego, tomarPendiente, resolverPendiente } from '../utils/cuentasJuego';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      setUser(session.user);
      await cargarPerfil(session.user.id);
    } else {
      setUser(null);
      setPerfil(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setPerfil(null);
        setLoading(false);
      } else {
        checkSession();
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const cargarPerfil = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select(`*, clubes ( nombre, escudo_url, plan_actual, suscripcion_activa, fecha_vencimiento )`)
        .eq('id', userId)
        .maybeSingle(); // Usamos maybeSingle para evitar errores si no existe la fila

      /* JUEGOS CON GMAIL: una cuenta sin rol en un club (las de Google nacen
         'jugador' y sin club) puede ser un jugador vinculado o un hincha. Con
         esa cuenta se ven sólo los juegos (rol 'juego'). Al volver de Google
         primero se hace lo pendiente (vincular el PIN o unirse con el link). */
      const enKiosco = localStorage.getItem('kiosco_mode') === 'true';
      // Siempre se resuelve: con un Gmail del cuerpo técnico la base dice que no y queda el motivo.
      if (!enKiosco) await resolverPendiente(tomarPendiente());
      const sinRolDeClub = !data || String(data.rol || '').toLowerCase() === 'jugador';
      if (sinRolDeClub && !enKiosco) {
        const cuenta = await miCuentaJuego();
        if (cuenta) {
          setPerfil({
            id: userId,
            rol: 'juego',
            club_id: cuenta.club_id,
            nombre_completo: cuenta.nombre,
            jugador_id: cuenta.jugador_id || null,
            clubes: { nombre: cuenta.club_nombre, escudo_url: cuenta.escudo_url },
            cuenta,
          });
          return;
        }
      }

      if (data) {
        const esSesionKiosco = data.rol === 'kiosco' || localStorage.getItem('kiosco_mode') === 'true';
        if (esSesionKiosco) {
          const jugadorIdLocal = localStorage.getItem('kiosco_jugador_id');
          setPerfil({
            ...data,
            jugador_id: jugadorIdLocal,
            nombre: localStorage.getItem('kiosco_nombre') || 'Kiosco',
            rol: 'jugador',
            club_id: localStorage.getItem('kiosco_club_id') || data.club_id
          });
        } else {
          setPerfil(data);
          if (data.club_id) localStorage.setItem('club_id', data.club_id);
          // Nombre del club propio para todos los módulos (antes solo lo seteaba Visión Global,
          // por eso el CT caía en 'TU CLUB' y no matcheaba sus partidos).
          if (data.clubes?.nombre) localStorage.setItem('mi_club', data.clubes.nombre);
          // El escudo sólo lo dejaba Configuración al guardar, así que hasta que
          // alguien no entrara ahí las placas salían con las iniciales.
          if (data.clubes?.escudo_url) localStorage.setItem('escudo_url', data.clubes.escudo_url);
        }
      }
    } catch (err) {
      console.error("Error crítico en perfil:", err);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';
    if (isKioscoMode) {
      localStorage.removeItem('kiosco_jugador_id');
      window.location.href = '/kiosco'; 
    } else {
      localStorage.clear();
      await supabase.auth.signOut();
      setUser(null);
      setPerfil(null);
    }
  };

  // Después de unirse con un link estando ya logueado: vuelve a leer quién es.
  const recargarPerfil = async () => { if (user?.id) await cargarPerfil(user.id); };

  return (
    <AuthContext.Provider value={{ user, perfil, logout, loading, recargarPerfil }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);