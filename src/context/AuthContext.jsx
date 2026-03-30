import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';

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
        .select(`*, clubes ( nombre, plan_actual, suscripcion_activa, fecha_vencimiento )`)
        .eq('id', userId)
        .maybeSingle(); // Usamos maybeSingle para evitar errores si no existe la fila

      if (data) {
        if (data.rol === 'kiosco') {
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

  return (
    <AuthContext.Provider value={{ user, perfil, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);