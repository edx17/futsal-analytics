export function calcularRatingJugador(jugador, eventosJugador, plusMinus = 0) {
  if (!jugador) return 0;

  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');
  const esCierre = pos.includes('cierre');

  let score = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      if (ev.tipoVirtual === 'Asistencia') { score += 2.5; return; }

      // PUNTO 7: RATING CONTEXTUAL
      // Usamos la coordenada normalizada (si existe) para saber dónde está realmente.
      const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      
      // Zonas de la cancha (0 a 100, donde 100 es el arco rival)
      const esAtaque = x > 66;
      const esSalida = x < 33;
      
      // Multiplicadores de zona
      const pesoAtaque = esAtaque ? 1.5 : 1.0;
      const pesoPeligro = esSalida ? 2.0 : 1.0;

      switch (ev.accion) {
        case 'Remate - Gol':
        case 'Gol': 
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
          // Un robo arriba vale mucho más que uno atrás
          score += (1.0 * pesoAtaque); 
          break;
        case 'Pérdida': 
          // Perderla saliendo es letal
          score -= (0.8 * pesoPeligro); 
          break;
        case 'Duelo DEF Ganado': 
          score += 1.5; 
          break;
        case 'Duelo DEF Perdido': 
          score -= (1.0 * pesoPeligro); 
          break;
        case 'Duelo OFE Ganado': 
          score += (1.0 * pesoAtaque); 
          break;
        case 'Duelo OFE Perdido': 
          score -= 0.5; 
          break;
        case 'Falta cometida': 
          score -= (1.0 * pesoPeligro); 
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

  // Multiplicador de Contexto (Plus/Minus)
  if (esArquero) score += (plusMinus * 2.5);
  else if (esCierre) score += (plusMinus * 1.5);
  else score += (plusMinus * 1.0);

  return Number(score.toFixed(1));
}