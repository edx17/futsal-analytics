import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, perfil, loading } = useAuth();

  // 1. Mientras carga, no hacemos nada para evitar saltos
  if (loading) {
    return (
      <div style={{ color: 'var(--accent)', padding: '20px', fontFamily: 'JetBrains Mono', textAlign: 'center', marginTop: '50px' }}>
        VERIFICANDO ACCESO...
      </div>
    );
  }

  // 2. Si no hay usuario logueado en Supabase Auth, al Login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Si hay roles permitidos, comparamos siempre en minúsculas
  if (allowedRoles && perfil) {
    const rolUsuario = (perfil.rol || '').toLowerCase();
    const rolesPermitidos = allowedRoles.map(r => r.toLowerCase());

    if (!rolesPermitidos.includes(rolUsuario)) {
      // Si no tiene permiso, lo mandamos al inicio, NO a la raíz para evitar loops
      return <Navigate to="/inicio" replace />;
    }
  }

  return children;
}