// Normalizador de posiciones
const normalizarPosicion = (pos) => {
  if (!pos) return 'universal';
  const p = pos.toLowerCase();
  if (p.includes('arquero') || p.includes('portero')) return 'arquero';
  if (p.includes('pivot') || p.includes('pívot')) return 'pivot';
  if (p.includes('cierre') || p.includes('ultimo') || p.includes('último')) return 'cierre';
  if (p.includes('ala')) return 'ala';
  return 'universal';
};

// Tus pesos calibrados
const PESOS = {
  pivot: {
    'Gol': 4.0, 'Remate - Gol': 4.0, 'Asistencia': 2.5, 'Pase Clave': 1.0,
    'Remate - Atajado': 0.2, 'Remate - Desviado': -0.2,
    'Pérdida': -1.0, 'Recuperación': 0.8,
    'Duelo OFE Ganado': 1.2, 'Duelo OFE Perdido': -0.5,
    'Duelo DEF Ganado': 0.5, 'Duelo DEF Perdido': -0.3,
    'Falta recibida': 0.8, 'Falta cometida': -0.5,
    'Tarjeta Amarilla': -1.5, 'Tarjeta Roja': -4.0
  },
  cierre: {
    'Gol': 5.0, 'Remate - Gol': 5.0, 'Asistencia': 3.0, 'Pase Clave': 1.0,
    'Remate - Atajado': 0.2, 'Remate - Desviado': -0.1,
    'Pérdida': -2.5, 'Recuperación': 1.5, 'Intercepción': 1.5,
    'Duelo OFE Ganado': 0.5, 'Duelo OFE Perdido': -0.5,
    'Duelo DEF Ganado': 1.5, 'Duelo DEF Perdido': -1.5,
    'Falta recibida': 0.5, 'Falta cometida': -0.5,
    'Tarjeta Amarilla': -1.5, 'Tarjeta Roja': -4.0
  },
  ala: {
    'Gol': 4.0, 'Remate - Gol': 4.0, 'Asistencia': 3.0, 'Pase Clave': 1.5,
    'Remate - Atajado': 0.2, 'Remate - Desviado': -0.2,
    'Pérdida': -1.5, 'Recuperación': 1.2, 'Intercepción': 1.2,
    'Duelo OFE Ganado': 1.2, 'Duelo OFE Perdido': -0.8,
    'Duelo DEF Ganado': 1.0, 'Duelo DEF Perdido': -1.0,
    'Falta recibida': 0.6, 'Falta cometida': -0.5,
    'Tarjeta Amarilla': -1.5, 'Tarjeta Roja': -4.0
  },
  arquero: {
    'Gol': 6.0, 'Remate - Gol': 6.0, 'Asistencia': 4.0, 'Pase Clave': 2.0,
    'Atajada': 1.2, 'Gol Recibido': -2.5,
    'Pérdida': -3.0, 'Recuperación': 1.0, 'Intercepción': 1.5,
    'Pase Incompleto': -0.5,
    'Falta recibida': 0.5, 'Falta cometida': -1.0,
    'Tarjeta Amarilla': -1.5, 'Tarjeta Roja': -5.0
  },
  universal: {
    'Gol': 4.0, 'Remate - Gol': 4.0, 'Asistencia': 2.5, 'Pase Clave': 1.0,
    'Pérdida': -1.5, 'Recuperación': 1.0, 'Intercepción': 1.0,
    'Duelo OFE Ganado': 1.0, 'Duelo OFE Perdido': -0.5,
    'Duelo DEF Ganado': 1.0, 'Duelo DEF Perdido': -0.5,
    'Tarjeta Amarilla': -1.5, 'Tarjeta Roja': -4.0
  }
};

export function calcularRatingJugador(jugador, eventosJugador = [], arg3 = [], arg4 = 0, arg5 = 0) {
  let eventosRivales = [];
  let plusMinus = 0;
  let minutosJugados = 0;

  // Escudo de parámetros (para que nunca de NaN)
  if (Array.isArray(arg3)) {
    eventosRivales = arg3;
    plusMinus = Number(arg4) || 0;
    minutosJugados = Number(arg5) || 0;
  } else {
    plusMinus = Number(arg3) || 0;
    minutosJugados = Number(arg4) || 0;
    eventosRivales = Array.isArray(arg5) ? arg5 : [];
  }

  const pos = normalizarPosicion(jugador.posicion);
  const pesosPosicion = PESOS[pos] || PESOS['universal'];
  
  let scoreNeto = 0;
  let atajadas = 0;
  let golesRecibidos = 0;

  // Penalización por baja participación (menor a 15 mins)
  const factorTiempo = minutosJugados > 0 ? Math.min(1.0, minutosJugados / 15.0) : 0.5;

  eventosJugador.forEach(ev => {
    const accion = ev.accion;
    if (pesosPosicion[accion] !== undefined) scoreNeto += pesosPosicion[accion];
    else if (accion === 'Ocasión Fallada') scoreNeto -= 1.0;

    if (ev.tipoVirtual === 'Asistencia') scoreNeto += pesosPosicion['Asistencia'] || 2.5;
    if (ev.tipoVirtual === 'Pase Clave') scoreNeto += pesosPosicion['Pase Clave'] || 1.0;
  });

  if (pos === 'arquero' && Array.isArray(eventosRivales)) {
    eventosRivales.forEach(ev => {
      if (ev.accion === 'Remate - Atajado') { atajadas++; scoreNeto += 1.2; } 
      else if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') { golesRecibidos++; scoreNeto -= 2.5; }
    });
  }

  // Impacto global
  scoreNeto += (plusMinus * 0.4);

  // Compensador de tiempo jugado
  scoreNeto = scoreNeto * factorTiempo;

  // --- CURVA ASINTÓTICA (Evita los 10 fáciles) ---
  let ratingFinal = 6.0;
  if (scoreNeto > 0) {
    ratingFinal += 4.0 * (scoreNeto / (scoreNeto + 15)); // Requiere sumar MUCHOS puntos para acercarse a 10
  } else if (scoreNeto < 0) {
    ratingFinal -= 5.0 * (Math.abs(scoreNeto) / (Math.abs(scoreNeto) + 15));
  }

  // Castigos de oro
  if (pos === 'arquero' && golesRecibidos >= 4) ratingFinal = Math.min(ratingFinal, 6.5);
  if (eventosJugador.some(e => e.accion === 'Tarjeta Roja')) ratingFinal = Math.min(ratingFinal, 3.5);

  if (ratingFinal > 10) ratingFinal = 10.0;
  if (ratingFinal < 1) ratingFinal = 1.0;

  return Number(ratingFinal.toFixed(1));
}