import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, perfil, loading } = useAuth();

  if (loading) {
    return <div style={{ color: 'var(--accent)', padding: '20px', fontFamily: 'JetBrains Mono', textAlign: 'center', marginTop: '50px' }}>VERIFICANDO ACCESO...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && perfil && !allowedRoles.includes(perfil.rol)) {
    return <Navigate to="/" replace />;
  }

  return children;
}