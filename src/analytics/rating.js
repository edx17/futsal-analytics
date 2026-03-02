export function calcularRatingJugador(eventosJugador = [], plusMinusIndividual = 0) {
  if (!eventosJugador.length && plusMinusIndividual === 0) return 0;

  const goles = eventosJugador.filter(e => e.accion === 'Gol' || e.accion === 'Remate - Gol').length;
  const remates = eventosJugador.filter(e => e.accion?.includes('Remate') && !e.accion.includes('Gol')).length;
  const recAltas = eventosJugador.filter(e => e.accion === 'Recuperación' && e.zona_x >= 66).length;
  const recMediasBajas = eventosJugador.filter(e => e.accion === 'Recuperación' && e.zona_x < 66).length;
  const perdidas = eventosJugador.filter(e => e.accion === 'Pérdida').length;
  const faltas = eventosJugador.filter(e => e.accion === 'Falta cometida').length;

  let impactoDuelos = 0;

  eventosJugador.forEach(e => {
    const zona = e.zona_x < 33 ? 1 : (e.zona_x < 66 ? 2 : 3);
    if (e.accion === 'Duelo DEF Ganado') impactoDuelos += (zona === 1) ? 3 : (zona === 2 ? 2 : 1.5);
    else if (e.accion === 'Duelo DEF Perdido') impactoDuelos -= (zona === 1) ? 3 : (zona === 2 ? 1.5 : 1);
    else if (e.accion === 'Duelo OFE Ganado') impactoDuelos += (zona === 1) ? 1 : (zona === 2 ? 1.5 : 3);
    else if (e.accion === 'Duelo OFE Perdido') impactoDuelos -= (zona === 1) ? 3 : (zona === 2 ? 1.5 : 1);
  });

  const divisor = eventosJugador.length > 0 ? eventosJugador.length : 1;

  const impactoBase =
    goles * 6 +
    remates * 1 +
    recAltas * 3 +
    recMediasBajas * 1.5 -
    perdidas * 3 -
    faltas * 2 + 
    impactoDuelos;

  // PONDERACIÓN DEL PLUS/MINUS (+/-) COLECTIVO EN LA NOTA INDIVIDUAL
  const impactoTotal = (impactoBase / divisor) + (plusMinusIndividual * 3);

  return impactoTotal;
}