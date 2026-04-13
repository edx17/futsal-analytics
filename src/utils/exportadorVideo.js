// src/utils/exportadorVideo.js

export function exportarEventosCSV(eventos, nombrePartido) {
  if (!eventos || eventos.length === 0) return;

  const cabeceras = ['ID_Muestra', 'Periodo', 'Tiempo_Absoluto_Seg', 'Minuto', 'Segundo', 'Equipo', 'Jugador_ID', 'Accion', 'Contexto', 'Coordenada_X', 'Coordenada_Y'];
  
  const filas = eventos.map((ev, index) => {
    const tiempoAbs = (ev.minuto * 60) + (ev.segundos || 0);
    return [
      index + 1,
      ev.periodo,
      tiempoAbs,
      ev.minuto,
      ev.segundos || 0,
      ev.equipo,
      ev.id_jugador || 'N/A',
      ev.accion,
      ev.contexto_juego || '5v5',
      ev.zona_x ? ev.zona_x.toFixed(2) : '',
      ev.zona_y ? ev.zona_y.toFixed(2) : ''
    ].join(',');
  });

  const contenidoCSV = [cabeceras.join(','), ...filas].join('\n');
  const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `tracking_${(nombrePartido || 'partido').replace(/\s+/g, '_')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}