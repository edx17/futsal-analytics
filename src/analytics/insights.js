// src/analytics/insights.js

export function generarInsights({
  posesiones,
  transiciones,
  xg,
  goles
}) {
  const insights = [];

  if (posesiones.length) {
    const promedioEventos =
      posesiones.reduce((a, p) => a + p.eventos.length, 0) /
      posesiones.length;

    if (promedioEventos > 8) insights.push('Ataque posicional');
    else insights.push('Partido de transición');
  }

  if (transiciones.length > 5)
    insights.push('Alta peligrosidad en transición');

  if (goles - xg > 1)
    insights.push('Eficiencia ofensiva alta');

  if (xg - goles > 1)
    insights.push('Baja eficacia de definición');

  return insights;
}