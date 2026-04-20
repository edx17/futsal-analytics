export const getColorAccion = (acc) => {
  if (!acc) return '#888';
  
  const coloresExactos = {
    'Remate - Gol': '#00ff88', 'Gol': '#00ff88', 'Remate - Atajado': '#3b82f6', 'Remate - Desviado': '#888888', 'Remate - Rebatido': '#a855f7',
    'Recuperación': '#eab308', 'Pérdida': '#ef4444', 'Pase Incompleto': '#f59e0b',
    'Duelo DEF Ganado': '#10b981', 'Duelo DEF Perdido': '#dc2626', 
    'Duelo OFE Ganado': '#0ea5e9', 'Duelo OFE Perdido': '#f97316',
    'Lateral': '#06b6d4', 'Córner': '#f97316', 'Falta cometida': '#ec4899', 'Falta recibida': '#ec4899', 'Tarjeta Amarilla': '#facc15', 'Tarjeta Roja': '#991b1b',
    'Asistencia': '#06b6d4', 'Penal a favor': '#10b981', 'Penal en contra': '#ef4444'
  };

  if (coloresExactos[acc]) return coloresExactos[acc];

  // Fallbacks genéricos (los que usaba TomaDatos)
  if (acc.includes('Gol')) return '#00ff88';
  if (acc.includes('Ganado')) return '#3b82f6';
  if (acc.includes('Perdido')) return '#ef4444';
  
  return '#ffffff';
};