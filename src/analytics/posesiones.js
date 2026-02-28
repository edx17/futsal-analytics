// src/analytics/posesiones.js

export function generarPosesiones(eventos = []) {
  const posesiones = [];
  let actual = null;

  eventos.forEach(ev => {
    const finPosesion =
      ev.accion?.includes('Remate') ||
      ev.accion === 'Pérdida' ||
      ev.accion === 'Gol';

    if (!actual) {
      actual = {
        equipo: ev.equipo,
        inicio: ev.minuto,
        eventos: []
      };
    }

    actual.eventos.push(ev);

    if (finPosesion) {
      actual.fin = ev.minuto;
      actual.resultado = ev.accion;
      posesiones.push(actual);
      actual = null;
    }
  });

  return posesiones;
}