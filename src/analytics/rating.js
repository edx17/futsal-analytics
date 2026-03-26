export function calcularRatingJugador(jugador, eventosJugador, eventosRivales = [], plusMinus = 0, minutosJugados = 0) {
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
  // 2. MODELO DE CAMPO (BAYESIANO: BASE 6.0)
  // ==========================================
  
  let pesoPositivo = 0;
  let pesoNegativo = 0;
  let volumenAcciones = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      // Usamos la coordenada normalizada para multiplicadores de zona
      const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const esAtaque = x > 66;
      const esSalida = x < 33;
      const pesoAtaque = esAtaque ? 1.5 : 1.0;
      const pesoPeligro = esSalida ? 2.0 : 1.0;

      volumenAcciones++;

      switch (ev.accion) {
        case 'Gol': 
        case 'Remate - Gol':
          pesoPositivo += esCierre ? 3.0 : 2.0; 
          break;
        case 'Remate - Atajado':
        case 'Remate - Rebatido':
        case 'Remate - Desviado':
          // Todo remate que no es gol vale +1 según tu pedido (simplificamos para no penalizar el desvío)
          pesoPositivo += 1.0; 
          break;
        case 'Recuperación': 
          pesoPositivo += (0.5 * pesoAtaque); 
          break;
        case 'Pérdida': 
          pesoNegativo += (0.5 * pesoPeligro); 
          break;
        case 'Falta recibida':
          pesoPositivo += 1.0;
          break;
        case 'Falta cometida': 
          pesoNegativo += (1.0 * pesoPeligro); 
          break;
        case 'Tarjeta Amarilla': 
          pesoNegativo += 1.0; 
          break;
        case 'Tarjeta Roja': 
          pesoNegativo += 3.0; 
          break;
        case 'Duelo DEF Ganado': 
        case 'Duelo OFE Ganado':
          pesoPositivo += 0.5; // (Le doy 0.5 a los duelos para asimilarlos a robos)
          break;
        case 'Duelo DEF Perdido': 
        case 'Duelo OFE Perdido':
          pesoNegativo += 0.5; 
          break;
      }
      if (ev.tipoVirtual === 'Asistencia') pesoPositivo += 1.5;
    });
  }

  // IMPACTO PLUS MINUS SEGÚN TU TABLA (Gol favor +2, Gol contra -2)
  // Como acá el "PlusMinus" ya es la resta cruda (goles a favor que estuvo en cancha - goles en contra)
  // lo multiplicamos por 2 para que respete tu consigna.
  const impactoGolesCancha = (plusMinus * 2);

  let neto = pesoPositivo - pesoNegativo + impactoGolesCancha;

  // Suavizado Bayesiano para estabilizar (Asumimos 15 acciones "neutras" invisibles)
  // Si jugó minutos, le exigimos más volumen para el 10 perfecto
  const volumenSuavizado = volumenAcciones + 15 + (minutosJugados * 0.5); 
  
  let eficiencia = neto / volumenSuavizado;

  // Multiplicamos por 20 la eficiencia para abrir la brecha entre el 1 y el 10
  let score = 6.0 + (eficiencia * 20); 

  // Restricción dura: Entre 1.0 y 10.0
  return Number(Math.max(1, Math.min(10, score)).toFixed(1));
}


// ==========================================
// 3. NUEVO MODELO ESPECÍFICO PARA ARQUEROS (BASE 6.0)
// ==========================================
function calcularRatingArquero(jugador, eventosArquero, eventosRivales, plusMinus) {
  let score = 6.0;

  if (eventosRivales && eventosRivales.length > 0) {
    const rematesRivales = eventosRivales.filter(e => 
      e.accion === 'Remate - Gol' || e.accion === 'Remate - Atajado'
    );

    rematesRivales.forEach(r => {
      const xg = r.xg_ev || r.xg || 0.15; 
      if (r.accion === 'Remate - Gol') {
        // Gol recibido: -2 nominal (agravado si era tiro fácil)
        score -= (1.5 + (1 - xg)); 
      } else if (r.accion === 'Remate - Atajado') {
        // Tiro atajado: (lo tomamos como algo muy positivo)
        score += (0.5 + xg * 2); 
      }
    });
  }

  if (eventosArquero && eventosArquero.length > 0) {
    eventosArquero.forEach(ev => {
      switch (ev.accion) {
        case 'Recuperación': 
        case 'Salida Exitosa':
        case '1v1 Ganado':
          score += 0.5; 
          break;
        case 'Pérdida': 
        case 'Salida Fallida':
        case '1v1 Perdido':
          score -= 0.5; 
          break;
        case 'Falta cometida': 
          score -= 1.0; 
          break;
        case 'Tarjeta Amarilla': 
          score -= 1.0; 
          break;
        case 'Tarjeta Roja': 
          score -= 3.0; 
          break;
      }
      if (ev.tipoVirtual === 'Asistencia') score += 1.5;
    });
  }

  return Number(Math.max(1, Math.min(10, score)).toFixed(1));
}