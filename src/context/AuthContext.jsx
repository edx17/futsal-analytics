import React, { createContext, useContext } from 'react';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // Simulamos un usuario siempre conectado (Hardcoded)
  const user = { id: 'dev-mode-user', email: 'dev@local.com' };
  
  // Le pasamos el ID de tu club exacto para que el frontend siga funcionando
  const perfil = { 
    rol: 'admin', 
    club_id: 'a3666c8b-fae1-4685-8d84-f53d34693b27' 
  };

  // Retornamos el contexto instantáneamente sin consultar a Supabase
  return (
    <AuthContext.Provider value={{ user, perfil, loading: false, logout: () => {} }}>
      {children}
    </AuthContext.Provider>
  );
};