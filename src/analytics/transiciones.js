// src/analytics/transiciones.js

export function detectarTransiciones(eventos = [], ventana = 5) {
  const transiciones = [];

  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];

    if (ev.accion === 'Recuperación') {
      const equipo = ev.equipo;

      for (let j = i + 1; j < eventos.length; j++) {
        const siguiente = eventos[j];

        if (siguiente.minuto - ev.minuto > ventana) break;

        if (
          siguiente.equipo === equipo &&
          siguiente.accion?.includes('Remate')
        ) {
          transiciones.push({
            recuperacion: ev,
            remate: siguiente
          });
          break;
        }
      }
    }
  }

  return transiciones;
}