export function generarInsights({
  posesiones,
  transiciones,
  xg,
  goles,
  diccionarios,
  duelos,
  abpMicroZonas
}) {
  const insights = [];

  // 1. ESTILO DE JUEGO (Posicional vs Directo)
  if (posesiones && posesiones.length > 0) {
    const promedioEventos = posesiones.reduce((a, p) => a + p.eventos.length, 0) / posesiones.length;
    if (promedioEventos > 6) {
      insights.push({ tipo: 'estilo', texto: 'Ataque posicional dominante', severidad: 'info' });
    } else if (promedioEventos < 3) {
      insights.push({ tipo: 'estilo', texto: 'Juego directo y vertical', severidad: 'info' });
    } else {
      insights.push({ tipo: 'estilo', texto: 'Juego mixto y transiciones equilibradas', severidad: 'info' });
    }
  }

  // 2. PELIGROSIDAD EN TRANSICIÓN
  if (transiciones && transiciones.length > 0) {
    const transLetales = transiciones.filter(t => t.peligrosidad === 'Alta').length;
    if (transLetales >= 3) {
      insights.push({ tipo: 'alerta', texto: `${transLetales} transiciones letales (<5s) generadas`, severidad: 'positivo' });
    }
  }

  // 3. EFICACIA OFENSIVA vs xG
  if (typeof goles === 'number' && typeof xg === 'number') {
    const diferencia = goles - xg;
    if (diferencia >= 1.0) {
      insights.push({ tipo: 'eficacia', texto: `Alta efectividad ofensiva (+${diferencia.toFixed(1)} sobre xG)`, severidad: 'positivo' });
    } else if (diferencia <= -1.5) {
      insights.push({ tipo: 'eficacia', texto: `Baja definición: ${Math.abs(diferencia).toFixed(1)} goles menos de lo esperado`, severidad: 'alerta' });
    }
  }

  // 4. PRESIÓN ALTA EFECTIVA
  if (diccionarios?.porEquipo?.propio) {
    const recovAltas = diccionarios.porEquipo.propio.filter(e => (e.accion === 'Recuperación' || e.accion === 'Intercepción') && e.zona_x_norm > 66).length;
    if (recovAltas >= 4) {
      insights.push({ tipo: 'tactica', texto: `Pressing alto efectivo: ${recovAltas} recuperaciones en zona rival`, severidad: 'positivo' });
    }
  }

  // 5. RIESGO EN SALIDA (Pérdidas atrás)
  if (diccionarios?.porEquipo?.propio) {
    const perdidasAtras = diccionarios.porEquipo.propio.filter(e => e.accion === 'Pérdida' && e.zona_x_norm < 33).length;
    if (perdidasAtras >= 3) {
      insights.push({ tipo: 'alerta', texto: `${perdidasAtras} pérdidas en zona propia — riesgo inminente de contragolpe`, severidad: 'alerta' });
    }
  }

  // 6. PELIGRO DE ABP (Balón Parado)
  if (abpMicroZonas) {
    const zonasAbp = Object.entries(abpMicroZonas);
    if (zonasAbp.length > 0) {
      // Ordenamos para buscar la que generó más xG
      const mejorZona = zonasAbp.sort((a, b) => b[1].xGTotal - a[1].xGTotal)[0];
      if (mejorZona[1].rematesGenerados > 0 && mejorZona[1].xGTotal > 0.3) {
        insights.push({ tipo: 'abp', texto: `La pelota parada es más peligrosa desde Zona ${mejorZona[0]} (xG: ${mejorZona[1].xGTotal.toFixed(2)})`, severidad: 'info' });
      }
    }
  }

  // 7. DUELOS DEFENSIVOS VULNERABLES
  if (duelos?.defensivos) {
    if (duelos.defensivos.total >= 5 && duelos.defensivos.eficacia < 45) {
      insights.push({ tipo: 'alerta', texto: `Eficacia en duelos defensivos muy baja (${duelos.defensivos.eficacia.toFixed(0)}%)`, severidad: 'alerta' });
    }
  }

  return insights.length > 0 ? insights : [{ tipo: 'info', texto: 'Acumulando datos para extraer patrones tácticos...', severidad: 'info' }];
}

export function generarInsightsArquero(statsArquero) {
  const insights = [];
  if (!statsArquero || statsArquero.tirosRecibidos === 0) return insights;

  const { tirosRecibidos, golesRecibidos, xgRecibido, golesEvitables, porcentajeAtajadas } = statsArquero;

  if (golesEvitables >= 0.8) {
    insights.push(`Rendimiento de élite: Recibió ${tirosRecibidos} remates (xG ${xgRecibido}) y salvó a su equipo de ${golesEvitables} goles.`);
  } else if (golesEvitables <= -0.8) {
    insights.push(`Problemas de eficacia: Concedió ${golesRecibidos} goles con un peligro esperado (xG) de apenas ${xgRecibido}.`);
  } else {
    insights.push(`Actuación esperable: Sus atajadas (${porcentajeAtajadas}%) van acorde a la dificultad de los remates recibidos.`);
  }

  return insights;
}