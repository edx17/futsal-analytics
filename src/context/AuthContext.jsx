import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión actual
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchPerfil(session.user.id);
      } else {
        setLoading(false);
      }
    };

    checkUser();

    // Escuchar cambios de autenticación (Login/Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchPerfil(session.user.id);
      } else {
        setUser(null);
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const fetchPerfil = async (userId) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('rol, club_id')
      .eq('id', userId)
      .single();
      
    if (!error && data) {
      setPerfil(data);
    }
    setLoading(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, perfil, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};