import { calcularXGEvento } from './xg';

/**
 * calcularRatingJugador
 *
 * FIRMA CANÓNICA — siempre usar en este orden:
 *   calcularRatingJugador(jugador, eventosJugador, eventosRivales, plusMinus, minutosJugados)
 *
 * Historial de bugs corregidos:
 *  - JugadorPerfil pasaba proxyPM como 3er argumento (eventosRivales), dejando plusMinus en 0.
 *  - Resumen pasaba TODOS los eventos rivales del partido a cada jugador/arquero.
 *  - Resumen contaba atajadas del arquero dos veces (dos bloques forEach solapados).
 *
 * Solución: la función acepta que eventosRivales llegue vacío o null sin romper,
 * y el caller de JugadorPerfil debe pasar plusMinus en la posición correcta.
 */
export function calcularRatingJugador(
  jugador,
  eventosJugador,
  eventosRivales = [],   // ← SIEMPRE array. Si no tenés rivales, pasá []
  plusMinus = 0,         // ← el +/− real del engine, NO un proxy inventado
  minutosJugados = 0
) {
  if (!jugador) return 0;

  // Guardia: si por accidente llega un número en eventosRivales (bug legacy),
  // lo descartamos silenciosamente en lugar de explotar en runtime.
  const rivalesSeguros = Array.isArray(eventosRivales) ? eventosRivales : [];

  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');

  if (esArquero) {
    return calcularRatingArquero(jugador, eventosJugador, rivalesSeguros, plusMinus);
  }

  let scoreNeto = 0;
  let volumenAcciones = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      volumenAcciones++;
      const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
      const esAtaque = x > 66;
      const esSalida = x < 33;

      const xgDelTiro = ev.xg || calcularXGEvento(ev);

      switch (ev.accion) {
        case 'Gol':
        case 'Remate - Gol':
          scoreNeto += 3.0 + (1 - xgDelTiro);
          break;
        case 'Remate - Atajado':
          scoreNeto -= (xgDelTiro * 0.4);
          break;
        case 'Remate - Desviado':
        case 'Remate - Rebatido':
          scoreNeto -= xgDelTiro;
          break;
        case 'Recuperación':
          scoreNeto += esAtaque ? 1.5 : 0.8;
          break;
        case 'Pérdida':
          scoreNeto -= esSalida ? 1.5 : 0.6;
          break;
        case 'Falta recibida':
          scoreNeto += 0.4;
          break;
        case 'Falta cometida':
          scoreNeto -= 0.4;
          break;
        case 'Tarjeta Amarilla':
          scoreNeto -= 2.0;
          break;
        case 'Tarjeta Roja':
          scoreNeto -= 5.0;
          break;
        case 'Duelo DEF Ganado':
        case 'Duelo OFE Ganado':
          scoreNeto += 0.6;
          break;
        case 'Duelo DEF Perdido':
        case 'Duelo OFE Perdido':
          scoreNeto -= 0.4;
          break;
      }

      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 2.0;
      if (ev.tipoVirtual === 'Pase Clave')  scoreNeto += 0.8;
    });
  }

  let rating = 6.0;
  rating += (scoreNeto / 5);

  const impactoPM = Math.max(-1.0, Math.min(1.0, (plusMinus * 0.15)));
  rating += impactoPM;

  if (volumenAcciones < 3 && minutosJugados < 5) {
    rating = 6.0 + impactoPM;
  }

  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}

export function calcularRatingArquero(jugador, eventosJugador, eventosRivales = [], plusMinus = 0) {
  if (!jugador) return 0;

  const rivalesSeguros = Array.isArray(eventosRivales) ? eventosRivales : [];

  let scoreNeto = 0;
  let tirosAlArco = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      switch (ev.accion) {
        case 'Gol':
        case 'Remate - Gol':
          scoreNeto += 5.0;
          break;
        case 'Pérdida':
          scoreNeto -= 1.5;
          break;
        case 'Recuperación':
          scoreNeto += 1.0;
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
        case 'Atajada':
          scoreNeto += 1.5;
          break;
      }
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 3.0;
    });
  }

  rivalesSeguros.forEach(ev => {
    if (ev.accion === 'Remate - Atajado') {
      scoreNeto += 1.2;
      tirosAlArco++;
    } else if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
      scoreNeto -= 0.6;
      tirosAlArco++;
    }
  });

  let rating = 6.0;
  rating += (scoreNeto / 2.5);
  rating += (plusMinus * 0.2);

  if (tirosAlArco === 0 && (!eventosJugador || eventosJugador.length === 0)) {
    rating = 6.0 + (plusMinus * 0.1);
  }

  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}