import React, { createContext, useContext, useState, useCallback } from 'react';

// 1. Creamos el Contexto
const ToastContext = createContext();

// 2. Hook personalizado para usarlo fácil en cualquier lado
export const useToast = () => useContext(ToastContext);

// 3. El Provider que envuelve la app
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now(); // ID único rápido
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-eliminar después de 3 segundos
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Diccionario de colores y símbolos según el tipo
  const getToastStyle = (type) => {
    switch (type) {
      case 'success': return { color: '#00ff88', icon: '✓', border: '#00ff88' };
      case 'error': return { color: '#ef4444', icon: '✕', border: '#ef4444' };
      case 'warning': return { color: '#f59e0b', icon: '⚠', border: '#f59e0b' };
      case 'info': default: return { color: '#3b82f6', icon: 'ℹ', border: '#3b82f6' };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Contenedor fijo donde se renderizan los Toasts */}
      <div className="toast-wrapper">
        <style>{`
          .toast-wrapper {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 999999;
            pointer-events: none; /* Para no bloquear clics atrás si está vacío */
          }
          .toast-item {
            background: #111;
            color: #fff;
            padding: 12px 20px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.8);
            pointer-events: auto;
            animation: slideInBottom 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            min-width: 250px;
            max-width: 350px;
            cursor: pointer;
            transition: transform 0.2s, opacity 0.2s;
          }
          .toast-item:hover {
            opacity: 0.8;
          }
          @keyframes slideInBottom {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        
        {toasts.map((t) => {
          const config = getToastStyle(t.type);
          return (
            <div 
              key={t.id} 
              className="toast-item" 
              style={{ borderLeft: `4px solid ${config.border}` }}
              onClick={() => removeToast(t.id)} // Click para cerrar antes
            >
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${config.color}22`, color: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0 }}>
                {config.icon}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>
                {t.message}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};