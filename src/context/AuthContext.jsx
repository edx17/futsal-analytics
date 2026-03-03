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
      // Extraemos la sesión y el objeto de error
      const { data, error } = await supabase.auth.getSession();
      
      // Si hay un error (como "Refresh Token Not Found"), limpiamos el estado forzosamente
      if (error) {
        console.warn("Sesión expirada o token inválido. Forzando cierre...", error.message);
        await supabase.auth.signOut(); // Limpiamos la caché de Supabase
        setUser(null);
        setPerfil(null);
        setLoading(false);
        return;
      }

      // Si todo está bien, cargamos el usuario
      if (data?.session?.user) {
        setUser(data.session.user);
        await fetchPerfil(data.session.user.id);
      } else {
        setLoading(false);
      }
    };

    checkUser();

    // Escuchar cambios de autenticación (Login/Logout y Refresh de token)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Token renovado exitosamente');
      }
      
      // Manejamos explícitamente el deslogueo o la falta de sesión
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
        setPerfil(null);
        setLoading(false);
      } else if (session?.user) {
        setUser(session.user);
        await fetchPerfil(session.user.id);
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