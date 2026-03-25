import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = async () => {
    // Siempre buscamos la sesión real de Supabase
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
      checkSession();
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const cargarPerfil = async (userId) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select(`*, clubes ( nombre )`)
      .eq('id', userId)
      .single();
      
    if (data) {
      // MAGIA SEGURA: Si la DB dice que esta cuenta es el KIOSCO
      if (data.rol === 'kiosco') {
        const jugadorIdLocal = localStorage.getItem('kiosco_jugador_id');
        
        if (jugadorIdLocal) {
          // Hay un jugador activo en el Kiosco, lo disfrazamos de "jugador"
          setPerfil({
            ...data,
            jugador_id: jugadorIdLocal,
            nombre: localStorage.getItem('kiosco_nombre') || 'Kiosco',
            rol: 'jugador',
            club_id: localStorage.getItem('kiosco_club_id') || data.club_id
          });
        } else {
          // El dispositivo está logueado pero nadie puso PIN todavía
          setPerfil(data);
        }
      } else {
        // Es un Staff normal
        setPerfil(data);
        if (data.club_id) {
          localStorage.setItem('club_id', data.club_id);
          if (data.clubes && data.clubes.nombre) {
            localStorage.setItem('mi_club', data.clubes.nombre);
          }
        }
      }
    } else if (error) {
      console.error("Error cargando perfil:", error.message);
    }
    setLoading(false);
  };

  const logout = async () => {
    const isKioscoMode = localStorage.getItem('kiosco_mode') === 'true';

    if (isKioscoMode) {
      // Si es el kiosco, NO CERRAMOS SESIÓN en Supabase. Solo borramos al jugador actual.
      localStorage.removeItem('kiosco_jugador_id');
      localStorage.removeItem('kiosco_nombre');
      localStorage.removeItem('kiosco_apellido');
      window.location.href = '/kiosco'; 
    } else {
      // Limpieza total para Staff
      localStorage.removeItem('club_id');
      localStorage.removeItem('mi_club');
      await supabase.auth.signOut();
      setUser(null);
      setPerfil(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, perfil, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);