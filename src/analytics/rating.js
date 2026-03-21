export function calcularRatingJugador(jugador, eventosJugador, eventosRivales = [], plusMinus = 0) {
  if (!jugador) return 0;

  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');
  const esCierre = pos.includes('cierre');

  // ==========================================
  // 1. SI ES ARQUERO, USAMOS SU PROPIO MODELO
  // ==========================================
  if (esArquero) {
    return calcularRatingArquero(jugador, eventosJugador, eventosRivales, plusMinus);
  }

  // ==========================================
  // 2. MODELO ORIGINAL PARA JUGADORES DE CAMPO
  // ==========================================
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
          // Eliminada la contaminación del +10 al arquero
          score += esCierre ? 6.0 : 4.0; 
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
          // Por si un jugador de campo salva una en la línea
          score += 2.0; 
          break;
      }
    });
  }

  // Multiplicador de Contexto (Plus/Minus)
  if (esCierre) score += (plusMinus * 1.5);
  else score += (plusMinus * 1.0);

  return Number(score.toFixed(1));
}

// ==========================================
// 3. NUEVO MODELO ESPECÍFICO PARA ARQUEROS
// ==========================================
function calcularRatingArquero(jugador, eventosArquero, eventosRivales, plusMinus) {
  let score = 6.0; // El arquero parte de un rating base de 6.0

  // A. Evaluamos el impacto de los tiros que recibió (Eventos del Rival)
  if (eventosRivales && eventosRivales.length > 0) {
    const rematesRivales = eventosRivales.filter(e => 
      e.accion === 'Remate - Gol' || e.accion === 'Remate - Atajado'
    );

    rematesRivales.forEach(r => {
      // Usamos el xG del tiro. Si no hay (datos viejos), le damos un valor por defecto de 0.15
      const xg = r.xg_ev || r.xg || 0.15; 

      if (r.accion === 'Remate - Gol') {
        // Le hicieron gol: Penaliza más si era un tiro fácil (xG bajo)
        score -= (1 + (1 - xg) * 2); 
      } else if (r.accion === 'Remate - Atajado') {
        // La atajó: Premia más si era un tiro muy difícil (xG alto)
        score += (1 + xg * 5); 
      }
    });
  }

  // B. Evaluamos sus propias acciones (Juego con los pies, salidas, etc.)
  if (eventosArquero && eventosArquero.length > 0) {
    eventosArquero.forEach(ev => {
      if (ev.tipoVirtual === 'Asistencia') { score += 2.5; return; }
      
      switch (ev.accion) {
        case 'Recuperación': 
        case 'Salida Exitosa':
        case '1v1 Ganado':
          score += 1.0; 
          break;
        case 'Pérdida': 
        case 'Salida Fallida':
        case '1v1 Perdido':
          score -= 1.5; 
          break;
        case 'Pase Exitoso':
          score += 0.1;
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
      }
    });
  }

  // C. El Plus/Minus impacta mucho menos porque ya lo evaluamos directo por goles recibidos
  score += (plusMinus * 0.5);

  // Aseguramos que el puntaje del arquero no rompa la escala del 1 al 10
  return Number(Math.max(1, Math.min(10, score)).toFixed(1));
}