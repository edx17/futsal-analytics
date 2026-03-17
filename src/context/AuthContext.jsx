import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Buscamos si hay alguien logueado en Supabase al abrir la app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        cargarPerfil(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Escuchamos activamente los cambios (Login / Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        cargarPerfil(session.user.id);
      } else {
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  // 3. Traemos los datos reales y EL NOMBRE DEL CLUB
  const cargarPerfil = async (userId) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select(`
        *,
        clubes ( nombre )
      `) // <--- ACÁ ESTÁ LA MAGIA: Traemos el nombre real del club
      .eq('id', userId)
      .single();
      
    if (data) {
      setPerfil(data);
      // Guardamos el ID y el NOMBRE en el navegador para que cargue rápido
      if (data.club_id) {
        localStorage.setItem('club_id', data.club_id);
        if (data.clubes && data.clubes.nombre) {
          localStorage.setItem('mi_club', data.clubes.nombre);
        }
      }
    } else if (error) {
      console.error("Error cargando perfil:", error.message);
    }
    setLoading(false);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('club_id');
    localStorage.removeItem('mi_club'); // Limpiamos el nombre al salir
  };

  return (
    <AuthContext.Provider value={{ user, perfil, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);