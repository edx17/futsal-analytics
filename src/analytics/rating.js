// src/analytics/rating.js

export function calcularRatingJugador(jugador, eventosJugador, plusMinus = 0) {
  if (!jugador) return 0;

  // Inferimos la posición (asegúrate de tener una columna 'posicion' en la tabla jugadores)
  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');
  const esCierre = pos.includes('cierre');

  let score = 0;

  // 1. Ponderación Matemática de Eventos Activos
  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      // Recompensamos la construcción de la cadena de posesión detectada en fases anteriores
      if (ev.tipoVirtual === 'Asistencia') { score += 2.5; return; }

      const esAtaque = ev.zona_x > 66;
      const esDefensa = ev.zona_x < 33;

      switch (ev.accion) {
        case 'Remate - Gol':
        case 'Gol': 
          // Un gol de un arquero o cierre es estadísticamente más raro y valioso
          score += esArquero ? 10.0 : (esCierre ? 6.0 : 4.0); 
          break;
        case 'Remate - Atajado':
        case 'Remate - Rebatido': 
          score += 0.5; 
          break;
        case 'Remate - Desviado': 
          score -= 0.2; 
          break;
        case 'Recuperación': 
          score += esAtaque ? 1.5 : 1.0; 
          break;
        case 'Pérdida': 
          // Una pérdida en salida en Futsal es letal
          score -= esDefensa ? 2.5 : 0.5; 
          break;
        case 'Duelo DEF Ganado': 
          score += 1.5; 
          break;
        case 'Duelo DEF Perdido': 
          score -= esDefensa ? 1.5 : 0.8; 
          break;
        case 'Duelo OFE Ganado': 
          score += 1.0; 
          break;
        case 'Duelo OFE Perdido': 
          score -= 0.5; 
          break;
        case 'Falta cometida': 
          score -= 1.0; 
          break;
        case 'Tarjeta Amarilla': 
          score -= 2.0; 
          break;
        case 'Tarjeta Roja': 
          score -= 5.0; 
          break;
        case 'Atajada': 
          score += 2.0; 
          break;
      }
    });
  }

  // 2. Multiplicador de Contexto (Plus/Minus)
  // El PM responsabiliza directamente al arquero y al cierre del flujo del partido
  if (esArquero) score += (plusMinus * 2.5);
  else if (esCierre) score += (plusMinus * 1.5);
  else score += (plusMinus * 1.0);

  return Number(score.toFixed(1));
}