import { calcularXGEvento } from './xg';

// Normalizador de posiciones (por si escriben "Ala Ofensivo", "Pívot", etc.)
const normalizarPosicion = (pos) => {
  if (!pos) return 'universal';
  const p = pos.toLowerCase();
  if (p.includes('arquero') || p.includes('portero')) return 'arquero';
  if (p.includes('pivot') || p.includes('pívot')) return 'pivot';
  if (p.includes('cierre') || p.includes('ultimo') || p.includes('último')) return 'cierre';
  if (p.includes('ala')) return 'ala';
  return 'universal';
};

// PIM: Positional Impact Metric (Pesos específicos por posición)
const PESOS = {
  pivot: {
    'Gol': 4.5, 'Remate - Gol': 4.5,
    'Remate - Atajado': -0.2, 'Remate - Desviado': -0.4, 'Remate - Rebatido': -0.3,
    'Pérdida': -1.5, 'Recuperación': 0.8,
    'Duelo OFE Ganado': 1.2, 'Duelo OFE Perdido': -0.8,
    'Duelo DEF Ganado': 0.5, 'Duelo DEF Perdido': -0.3,
    'Falta recibida': 0.8, 'Falta cometida': -0.4,
    'Pase Clave': 1.5, 'Asistencia': 3.5,
    'Tarjeta Amarilla': -2.0, 'Tarjeta Roja': -5.0,
    divisor: 4.5
  },
  ala: {
    'Gol': 3.5, 'Remate - Gol': 3.5,
    'Remate - Atajado': -0.1, 'Remate - Desviado': -0.3, 'Remate - Rebatido': -0.2,
    'Recuperación': 1.2, 'Intercepción': 1.2, 'Pérdida': -1.2,
    'Duelo OFE Ganado': 1.0, 'Duelo OFE Perdido': -0.6,
    'Duelo DEF Ganado': 1.0, 'Duelo DEF Perdido': -0.6,
    'Falta recibida': 0.5, 'Falta cometida': -0.5,
    'Pase Clave': 1.8, 'Asistencia': 3.0,
    'Tarjeta Amarilla': -2.0, 'Tarjeta Roja': -5.0,
    divisor: 5.0
  },
  cierre: {
    'Gol': 3.0, 'Remate - Gol': 3.0,
    'Remate - Atajado': 0.0, 'Remate - Desviado': -0.2, 'Remate - Rebatido': -0.1,
    'Recuperación': 1.8, 'Intercepción': 2.0, 'Pérdida': -2.5,
    'Duelo DEF Ganado': 1.5, 'Duelo DEF Perdido': -1.5,
    'Duelo OFE Ganado': 0.6, 'Duelo OFE Perdido': -0.4,
    'Falta recibida': 0.3, 'Falta cometida': -1.0,
    'Pase Clave': 1.2, 'Asistencia': 2.5,
    'Tarjeta Amarilla': -2.5, 'Tarjeta Roja': -6.0,
    divisor: 4.0
  },
  universal: {
    'Gol': 3.5, 'Remate - Gol': 3.5,
    'Remate - Atajado': -0.1, 'Remate - Desviado': -0.3, 'Remate - Rebatido': -0.2,
    'Recuperación': 1.2, 'Intercepción': 1.2, 'Pérdida': -1.5,
    'Duelo DEF Ganado': 1.0, 'Duelo DEF Perdido': -0.8,
    'Duelo OFE Ganado': 0.8, 'Duelo OFE Perdido': -0.6,
    'Falta recibida': 0.5, 'Falta cometida': -0.6,
    'Pase Clave': 1.5, 'Asistencia': 3.0,
    'Tarjeta Amarilla': -2.0, 'Tarjeta Roja': -5.0,
    divisor: 4.5
  }
};

export function calcularRatingJugador(
  jugador,
  eventosJugador,
  arg3 = [],
  arg4 = 0,
  arg5 = 0
) {
  if (!jugador) return 0;

  // Auto-corrección de firma para soportar legacy y nueva versión
  let eventosRivales = [];
  let plusMinus = 0;
  let minutosJugados = 0;

  if (Array.isArray(arg3)) {
    eventosRivales = arg3;
    plusMinus = Number(arg4) || 0;
    minutosJugados = Number(arg5) || 0;
  } else if (typeof arg3 === 'number') {
    plusMinus = arg3;
    minutosJugados = Number(arg4) || 0;
  }

  const posNormalizada = normalizarPosicion(jugador.posicion);

  if (posNormalizada === 'arquero') {
    return calcularRatingArquero(jugador, eventosJugador, eventosRivales, plusMinus, minutosJugados);
  }

  let scoreNeto = 0;
  const pesos = PESOS[posNormalizada] || PESOS.universal;

  // 1. Acciones Propias
  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      const accion = ev.accion || '';
      if (pesos[accion] !== undefined) {
        scoreNeto += pesos[accion];
      }
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += (pesos['Asistencia'] || 3.0);
      if (ev.tipoVirtual === 'Pase Clave') scoreNeto += (pesos['Pase Clave'] || 1.0);
    });
  }

  // 2. Modificador por Contexto de Equipo (Plus/Minus)
  // Si ganan 8 a 4 y él estuvo en cancha, su PM empuja la nota para arriba.
  const impactoPM = plusMinus * 0.4; 
  scoreNeto += impactoPM;

  // 3. Modificador por Eficacia de Tiro vs xG
  let xgTotal = 0;
  let golesMarcados = 0;
  if (eventosJugador) {
    eventosJugador.forEach(ev => {
      if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
        xgTotal += calcularXGEvento(ev);
        if (ev.accion === 'Remate - Gol' || ev.accion === 'Gol') golesMarcados++;
      }
    });
  }
  if (xgTotal > 0.5) {
    const deltaGoles = golesMarcados - xgTotal;
    scoreNeto += (deltaGoles * 0.5); // Premia a los letales, castiga a los que fallan
  }

  // 4. Normalización Logarítmica Suavizada
  const volumenReal = eventosJugador ? eventosJugador.length : 0;
  const volumenSuavizado = volumenReal + 8; // Evita notas extremas con pocos eventos
  
  let ratingFinal = 6.0 + (scoreNeto / (pesos.divisor || 4.5));

  return Number(Math.max(1, Math.min(10, ratingFinal)).toFixed(1));
}

function calcularRatingArquero(jugador, eventosPropios, eventosRivales = [], plusMinus = 0, minutosJugados = 0) {
  let scoreNeto = 0;
  let golesRecibidos = 0;
  let atajadas = 0;

  // 1. Lo que atajó
  if (eventosPropios && eventosPropios.length > 0) {
    eventosPropios.forEach(ev => {
      if (ev.accion === 'Atajada') { atajadas++; scoreNeto += 1.5; }
      else if (ev.accion === 'Recuperación' || ev.accion === 'Intercepción') scoreNeto += 1.0;
      else if (ev.accion === 'Pérdida') scoreNeto -= 2.0;
      else if (ev.accion === 'Gol Recibido') golesRecibidos++;
      
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 3.5;
      if (ev.tipoVirtual === 'Pase Clave') scoreNeto += 1.5;
    });
  }

  // 2. Lo que le patearon (eventos del rival estando él en cancha)
  if (Array.isArray(eventosRivales)) {
    eventosRivales.forEach(ev => {
      if (ev.accion === 'Remate - Atajado') {
        atajadas++;
        scoreNeto += 1.2;
      } else if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        golesRecibidos++;
        // Penalización Fuerte por goles recibidos (ajustado por el reclamo de 8 a 4)
        scoreNeto -= 2.5; 
      }
    });
  }

  // 3. Impacto Global del Partido (Plus/Minus)
  // El PM afecta al arquero pero se suaviza un poco (si el equipo es un colador, no lo matamos tanto por el PM general)
  scoreNeto += (plusMinus * 0.2);

  // 4. Lógica de "El arquero que se come 4 goles no puede tener 9"
  // Si recibió muchos goles, le aplicamos un techo al rating, sin importar cuántas atajó
  let capMaximo = 10;
  if (golesRecibidos >= 4) capMaximo = 6.5;
  if (golesRecibidos >= 6) capMaximo = 5.0;

  const tirosAlArco = atajadas + golesRecibidos;
  const volumenSuavizado = Math.max(10, tirosAlArco + 5); 
  let eficiencia = scoreNeto / (volumenSuavizado * 0.6);

  let ratingFinal = 6.0 + (eficiencia * 10);
  
  ratingFinal = Math.min(ratingFinal, capMaximo); // Aplicamos el techo por goles concedidos

  return Number(Math.max(1, Math.min(10, ratingFinal)).toFixed(1));
}