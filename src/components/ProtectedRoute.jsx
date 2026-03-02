import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, perfil, loading } = useAuth();

  if (loading) {
    return <div style={{ color: 'var(--accent)', padding: '20px', fontFamily: 'JetBrains Mono' }}>VERIFICANDO CREDENCIALES...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && perfil && !allowedRoles.includes(perfil.rol)) {
    // Si no tiene permiso, lo enviamos al dashboard global (lectura)
    return <Navigate to="/temporada" replace />;
  }

  return children;
}