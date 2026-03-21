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

export function generarInsightsArquero(statsArquero) {
  const insights = [];
  if (!statsArquero || statsArquero.tirosRecibidos === 0) return insights;

  const { tirosRecibidos, golesRecibidos, xgRecibido, golesEvitables, porcentajeAtajadas } = statsArquero;

  if (golesEvitables < -0.5) {
    insights.push(`Rendimiento de élite: Recibió ${tirosRecibidos} remates (xG ${xgRecibido}) y concedió solo ${golesRecibidos} goles.`);
  } else if (golesEvitables > 0.5) {
    insights.push(`Problemas de eficacia: Concedió ${golesRecibidos} goles con un peligro esperado (xG) de apenas ${xgRecibido}.`);
  }

  if (tirosRecibidos < 5 && golesRecibidos >= 2) {
    insights.push(`Vulnerabilidad defensiva: Bajo volumen de llegadas del rival pero altísima conversión en contra.`);
  } else if (tirosRecibidos >= 15 && porcentajeAtajadas > 80) {
    insights.push(`Arquero figura: Sometido a alto volumen de tiros, sostuvo al equipo atajando el ${porcentajeAtajadas}% de las pelotas al arco.`);
  }

  return insights;
}