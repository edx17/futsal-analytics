import { calcularXGEvento } from './xg';

export function calcularRatingJugador(jugador, eventosJugador, eventosRivales = [], plusMinus = 0, minutosJugados = 0) {
  if (!jugador) return 0;

  const pos = (jugador.posicion || '').toLowerCase();
  const esArquero = pos.includes('arquero') || pos.includes('portero');
  
  if (esArquero) {
    return calcularRatingArquero(jugador, eventosJugador, eventosRivales, plusMinus);
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

      if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        scoreNeto += 3.0 + (1 - xgDelTiro); // Si era muy difícil (xG bajo), premia más.
      } else if (ev.accion === 'Remate - Atajado') {
        scoreNeto -= (xgDelTiro * 0.4); // Mérito del arquero, pero castigo leve si era muy clara.
      } else if (ev.accion === 'Remate - Desviado' || ev.accion === 'Remate - Rebatido' || ev.accion === 'Ocasión Fallada') {
        scoreNeto -= xgDelTiro; // Castigo directo. Errar un gol hecho duele.
      } else if (ev.accion === 'Recuperación') {
        scoreNeto += esAtaque ? 1.5 : 0.8; 
      } else if (ev.accion === 'Pérdida') {
        scoreNeto -= esSalida ? 1.5 : 0.6; 
      } else if (ev.accion?.includes('Falta recibida')) {
        scoreNeto += 0.4;
      } else if (ev.accion?.includes('Falta cometida')) { 
        scoreNeto -= 0.4; 
      } else if (ev.accion === 'Tarjeta Amarilla') {
        scoreNeto -= 2.0; 
      } else if (ev.accion === 'Tarjeta Roja') {
        scoreNeto -= 5.0; 
      } else if (ev.accion === 'Duelo DEF Ganado' || ev.accion === 'Duelo OFE Ganado') {
        scoreNeto += 0.6; 
      } else if (ev.accion === 'Duelo DEF Perdido' || ev.accion === 'Duelo OFE Perdido') {
        scoreNeto -= 0.4; 
      }
      
      // Premiar pases claves (asistencia en tiros errados) y asistencias directas
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 2.0;
      if (ev.tipoVirtual === 'Pase Clave') scoreNeto += 0.8; 
    });
  }

  let rating = 6.0;

  // Dividimos por 5 para estabilidad
  rating += (scoreNeto / 5); 

  // Topeamos el plusMinus (Max +- 1)
  const impactoPM = Math.max(-1.0, Math.min(1.0, (plusMinus * 0.15)));
  rating += impactoPM;

  if (volumenAcciones < 3 && minutosJugados < 5) {
    rating = 6.0 + impactoPM; 
  }

  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}

export function calcularRatingArquero(jugador, eventosJugador, eventosRivales = [], plusMinus = 0) {
  if (!jugador) return 0;

  let scoreNeto = 0;
  let tirosAlArco = 0;

  if (eventosJugador && eventosJugador.length > 0) {
    eventosJugador.forEach(ev => {
      if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        scoreNeto += 5.0; 
      } else if (ev.accion === 'Pérdida') {
        scoreNeto -= 1.5; 
      } else if (ev.accion === 'Recuperación') {
        scoreNeto += 1.0; 
      } else if (ev.accion?.includes('Falta cometida')) {
        scoreNeto -= 0.8;
      } else if (ev.accion === 'Tarjeta Amarilla') {
        scoreNeto -= 1.5;
      } else if (ev.accion === 'Tarjeta Roja') {
        scoreNeto -= 4.0;
      }
      if (ev.tipoVirtual === 'Asistencia') scoreNeto += 3.0;
    });
  }

  if (eventosRivales && eventosRivales.length > 0) {
    eventosRivales.forEach(ev => {
      if (ev.accion === 'Remate - Atajado') {
        scoreNeto += 1.2; 
        tirosAlArco++;
      } 
      else if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
        scoreNeto -= 0.6; 
        tirosAlArco++;
      }
    });
  }

  let rating = 6.0;
  rating += (scoreNeto / 2.5);
  rating += (plusMinus * 0.2);

  if (tirosAlArco === 0 && eventosJugador.length === 0) {
    rating = 6.0 + (plusMinus * 0.1); 
  }

  return Number(Math.max(1.0, Math.min(10.0, rating)).toFixed(1));
}