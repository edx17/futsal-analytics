// src/analytics/posesiones.js
import { calcularXGEvento } from './xg';

export function generarPosesiones(eventos = []) {
  const posesiones = [];
  let actual = null;

  eventos.forEach(ev => {
    const esRemate = ev.accion?.includes('Remate') || ev.accion === 'Gol';
    const finPosesion = esRemate || ev.accion === 'Pérdida';

    if (!actual) {
      actual = {
        equipo: ev.equipo,
        inicio: ev.minuto,
        eventos: [],
        xgGenerado: 0,
        jugadoresInvolucrados: new Set()
      };
    }

    // Registramos a todos los jugadores que tocan el balón durante esta fase
    if (ev.equipo === actual.equipo) {
      actual.eventos.push(ev);
      if (ev.id_jugador) actual.jugadoresInvolucrados.add(ev.id_jugador);
      if (ev.id_asistencia) actual.jugadoresInvolucrados.add(ev.id_asistencia);
    }

    if (finPosesion) {
      actual.fin = ev.minuto;
      actual.resultado = ev.accion;

      // Si la jugada termina en tiro, asignamos el valor de la jugada
      if (esRemate) {
        actual.xgGenerado = calcularXGEvento(ev);
        actual.rematadorId = ev.id_jugador;
        actual.asistidorId = ev.id_asistencia;
      }

      posesiones.push({
        ...actual,
        // Convertimos el Set a Array para facilitar el manejo posterior
        jugadoresInvolucrados: Array.from(actual.jugadoresInvolucrados)
      });
      
      actual = null;
    }
  });

  return posesiones;
}

// NUEVO MOTOR DE CADENAS DE VALOR (Ciencia de Datos)
// Permite evaluar el impacto ofensivo de los Cierres y defensas.
export function calcularCadenasValor(posesiones, jugadorId) {
  let xgChain = 0;   // xG total de las jugadas donde el jugador participó
  let xgBuildup = 0; // xG de las jugadas donde participó SIN ser el rematador ni el asistidor

  posesiones.forEach(pos => {
    if (pos.xgGenerado > 0 && pos.jugadoresInvolucrados.includes(jugadorId)) {
      xgChain += pos.xgGenerado;
      
      // Si el jugador no es quien patea ni quien asiste, su contribución es de "Construcción" (Buildup)
      if (pos.rematadorId != jugadorId && pos.asistidorId != jugadorId) {
        xgBuildup += pos.xgGenerado;
      }
    }
  });

  return { xgChain, xgBuildup };
}