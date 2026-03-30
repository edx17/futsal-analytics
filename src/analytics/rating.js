export function calcularRatingJugador(jugador, eventosJugador, eventosRivales = [], plusMinus = 0, minutosJugados = 0) {
  if (!jugador) return 0;

  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');
  
  if (esArquero) {
    return calcularRatingArquero(jugador, eventosJugador, eventosRivales, plusMinus);
  }

  // === SISTEMA DE PUNTOS FUTSAL ===
  let scoreNeto = 0;
  let volumenAcciones = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      volumenAcciones++;
      const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const esAtaque = x > 66;
      const esSalida = x < 33;

      switch (ev.accion) {
        case 'Gol': 
        case 'Remate - Gol':
          scoreNeto += 3.0; // El gol es lo que más vale
          break;
        case 'Remate - Atajado':
          scoreNeto += 0.3; // Buen tiro, mérito del arquero rival
          break;
        case 'Remate - Desviado':
        case 'Remate - Rebatido':
          scoreNeto -= 0.1; // Ligera penalidad por mala decisión/ejecución
          break;
        case 'Recuperación': 
          scoreNeto += esAtaque ? 1.0 : 0.5; // Robar alto vale más
          break;
        case 'Pérdida': 
          scoreNeto -= esSalida ? 1.0 : 0.5; // Perderla en salida es letal
          break;
        case 'Falta recibida':
          scoreNeto += 0.5;
          break;
        case 'Falta cometida': 
          scoreNeto -= 0.5; 
          break;
        case 'Tarjeta Amarilla': 
          scoreNeto -= 1.5; 
          break;
        case 'Tarjeta Roja': 
          scoreNeto -= 4.0; // Expulsión arruina el partido
          break;
        case 'Duelo DEF Ganado': 
        case 'Duelo OFE Ganado':
          scoreNeto += 0.5; 
          break;
        case 'Duelo DEF Perdido': 
        case 'Duelo OFE Perdido':
          scoreNeto -= 0.3; 
          break;
      }
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 1.5;
    });
  }

  // 1. Base inicial estandar
  let rating = 6.0;

  // 2. Sumamos el rendimiento individual
  // Dividimos por 3 para que aprox 3 buenas acciones equivalgan a +1 en la nota
  rating += (scoreNeto / 3); 

  // 3. Impacto del Plus/Minus (Contexto de equipo)
  // Cada gol de diferencia con él en cancha mueve la nota un 0.3 (Ayuda, pero no domina)
  rating += (plusMinus * 0.3);

  // 4. Si el jugador casi no tocó la pelota, lo acercamos al 6.0 por "falta de datos"
  if (volumenAcciones < 3 && minutosJugados < 5) {
    rating = 6.0 + (plusMinus * 0.1); 
  }

  // Restricción dura: La nota nunca baja de 1 ni sube de 10
  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}
// === SISTEMA DE PUNTOS PARA ARQUEROS ===
export function calcularRatingArquero(jugador, eventosJugador, eventosRivales = [], plusMinus = 0) {
  if (!jugador) return 0;

  let scoreNeto = 0;
  let tirosAlArco = 0;

  // 1. Acciones del propio arquero con la pelota
  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      switch (ev.accion) {
        case 'Gol':
        case 'Remate - Gol':
          scoreNeto += 5.0; // Un gol de arquero es épico
          break;
        case 'Pérdida':
          scoreNeto -= 1.5; // Perderla en salida siendo arquero es letal
          break;
        case 'Recuperación':
          scoreNeto += 1.0; // Anticipos o cortar pases filtrados
          break;
        case 'Falta cometida':
          scoreNeto -= 0.8;
          break;
        case 'Tarjeta Amarilla':
          scoreNeto -= 1.5;
          break;
        case 'Tarjeta Roja':
          scoreNeto -= 4.0;
          break;
      }
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 3.0;
    });
  }

  // 2. Análisis del asedio rival (Atajadas vs Goles recibidos)
  if (eventosRivales && eventosRivales.length > 0) {
    eventosRivales.forEach(ev => {
      if (ev.accion === 'Remate - Atajado') {
        scoreNeto += 1.2; // Mucho mérito por salvar al equipo
        tirosAlArco++;
      } 
      else if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        scoreNeto -= 0.6; // Penalidad ligera (a veces los goles son culpa de la defensa, no solo de él)
        tirosAlArco++;
      }
    });
  }

  // 3. Base inicial estándar
  let rating = 6.0;

  // Sumamos el rendimiento individual
  // Dividimos por 2.5 para que las atajadas impacten rápido en la nota
  rating += (scoreNeto / 2.5);

  // 4. Impacto del Plus/Minus (Contexto de equipo)
  // El arquero es muy responsable del resultado general mientras está en cancha
  rating += (plusMinus * 0.2);

  // 5. Ajuste por falta de acción (Partido aburrido para el arquero)
  if (tirosAlArco === 0 && eventosJugador.length === 0) {
    rating = 6.0 + (plusMinus * 0.1); 
  }

  // Restricción dura: La nota nunca baja de 1 ni sube de 10
  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}