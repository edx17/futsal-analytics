import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Buscamos si ya tenía un tema guardado, si no, arranca en dark por defecto
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('virtualpro-theme') || 'dark';
  });

  useEffect(() => {
    // Le clavamos el atributo al <html> para que el CSS lo detecte
    document.documentElement.setAttribute('data-theme', theme);
    // Lo guardamos en caché para la próxima sesión
    localStorage.setItem('virtualpro-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook personalizado para usarlo rápido en cualquier lado
export const useTheme = () => useContext(ThemeContext);