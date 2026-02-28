// src/analytics/rating.js

export function calcularRatingJugador(eventosJugador = []) {
  if (!eventosJugador.length) return 0;

  const goles = eventosJugador.filter(e => e.accion === 'Gol' || e.accion === 'Remate - Gol').length;
  const remates = eventosJugador.filter(e => e.accion?.includes('Remate') && !e.accion.includes('Gol')).length;
  const recAltas = eventosJugador.filter(e => e.accion === 'Recuperación' && e.zona_x >= 66).length;
  const recMediasBajas = eventosJugador.filter(e => e.accion === 'Recuperación' && e.zona_x < 66).length;
  const perdidas = eventosJugador.filter(e => e.accion === 'Pérdida').length;
  const faltas = eventosJugador.filter(e => e.accion === 'Falta cometida').length;

  // NUEVO: SISTEMA DE PONDERACIÓN CONTEXTUAL POR ZONA (PROBABILIDAD ESPACIAL)
  let impactoDuelos = 0;

  eventosJugador.forEach(e => {
    // Definir la zona (1: Defensa propia, 2: Medio, 3: Ataque)
    // Asumiendo que ataca de izq (x=0) a der (x=100)
    const zona = e.zona_x < 33 ? 1 : (e.zona_x < 66 ? 2 : 3);

    if (e.accion === 'Duelo DEF Ganado') {
      // Robar cerca de tu arco salva un gol. Robar arriba está bueno, pero la urgencia es menor.
      impactoDuelos += (zona === 1) ? 3 : (zona === 2 ? 2 : 1.5);
    } 
    else if (e.accion === 'Duelo DEF Perdido') {
      // Que te pasen en tu área es letal. Que te pasen arriba te da tiempo a recuperar.
      impactoDuelos -= (zona === 1) ? 3 : (zona === 2 ? 1.5 : 1);
    } 
    else if (e.accion === 'Duelo OFE Ganado') {
      // Pasar a un tipo cerca del área rival rompe la defensa. Pasarlo en tu área es un riesgo tonto.
      impactoDuelos += (zona === 1) ? 1 : (zona === 2 ? 1.5 : 3);
    } 
    else if (e.accion === 'Duelo OFE Perdido') {
      // Perderla en salida (tu área) es gol en contra asegurado. Perderla arriba no duele tanto.
      impactoDuelos -= (zona === 1) ? 3 : (zona === 2 ? 1.5 : 1);
    }
  });

  const impacto =
    goles * 6 +
    remates * 1 +
    recAltas * 3 +
    recMediasBajas * 1.5 -
    perdidas * 3 -
    faltas * 1 +
    impactoDuelos; // <-- SE SUMA AL RATING FINAL

  return impacto / eventosJugador.length;
}