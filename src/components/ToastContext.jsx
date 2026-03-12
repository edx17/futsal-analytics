import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null); // Empezamos en null para detectar errores

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    // Esto te va a decir en la consola si el problema es de ubicación
    throw new Error("useToast debe usarse dentro de un ToastProvider. Revisá que el componente esté envuelto en App.jsx");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getToastStyle = (type) => {
    switch (type) {
      case 'success': return { color: '#00ff88', icon: '✓', border: '#00ff88' };
      case 'error': return { color: '#ef4444', icon: '✕', border: '#ef4444' };
      case 'warning': return { color: '#f59e0b', icon: '⚠', border: '#f59e0b' };
      case 'info': default: return { color: '#3b82f6', icon: 'ℹ', border: '#3b82f6' };
    }
  };

  return (
    // IMPORTANTE: Pasamos un objeto con showToast
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      <div className="toast-wrapper">
        <style>{`
          .toast-wrapper {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 9999999; /* Un número bien alto */
            pointer-events: none;
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
            animation: slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            min-width: 250px;
            max-width: 350px;
            cursor: pointer;
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
        
        {toasts.map((t) => {
          const config = getToastStyle(t.type);
          return (
            <div 
              key={t.id} 
              className="toast-item" 
              style={{ borderLeft: `4px solid ${config.border}` }}
              onClick={() => removeToast(t.id)}
            >
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${config.color}22`, color: config.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, flexShrink: 0 }}>
                {config.icon}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {t.message}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};