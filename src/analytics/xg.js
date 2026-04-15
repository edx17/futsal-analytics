// src/analytics/xg.js

export function calcularXGEvento(ev, esTransicion = false) {
  // Usamos la coordenada normalizada
  const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
  const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;

  if (x == null || y == null) return 0;

  // Analizamos los modificadores guardados en TomaDatos
  const origen = ev.origen_gol || ev.contexto_juego || '';
  
  // Modificadores de situación
  const asistenciaSegundoPalo = origen.includes('2do Palo');
  const manoAMano = origen.includes('Mano a Mano');
  const punteo = origen.includes('Punteo');
  const arqueroAdelantado = origen.includes('Arq. Adelantado');

  // FASE 3: Modificadores de Postura y Presión
  const deEspaldas = origen.includes('De Espaldas');
  const bajoPresion = origen.includes('Bajo Presión');

  const distToGoalX = 100 - x; 
  
  // Escala Futsal: 40m largo x 20m ancho
  const dxMetros = distToGoalX * 0.4; 
  const dyMetros = Math.abs(50 - y) * 0.2; 
  const distMetros = Math.sqrt(Math.pow(dxMetros, 2) + Math.pow(dyMetros, 2));

  // 1. Curva de Distancia
  let xgBase = 0;
  if (distMetros < 4) xgBase = 0.45;       // Abajo del arco
  else if (distMetros < 8) xgBase = 0.20;  // Media distancia
  else if (distMetros < 12) xgBase = 0.08; // Lejos / Tiro libre
  else if (distMetros < 20) xgBase = 0.02; // Propia cancha
  else xgBase = 0.005;

  // 2. Penalización por Ángulo
  const anguloRadianes = Math.atan2(dxMetros, dyMetros);
  const factorAngulo = Math.sin(anguloRadianes);
  let xgFinal = xgBase * Math.pow(factorAngulo, 2); 

  // 3. Contexto Táctico Futsal
  if (esTransicion) xgFinal *= 1.45; 
  if (punteo) xgFinal *= 1.15; 
  
  // FASE 3: Aplicar multiplicadores de Postura y Presión
  if (deEspaldas) {
    xgFinal *= 0.60; // Fuerte penalización: patear o girar de espaldas es muy difícil
  }
  
  if (bajoPresion) {
    xgFinal *= 0.75; // Penalización media: defensor incomodando el remate
  }

  // 4. Sobreescrituras Letales (Modificadores Absolutos)
  if (asistenciaSegundoPalo) {
    xgFinal = 0.85; // Pase de la muerte cruzado
  } else if (manoAMano) {
    xgFinal = 0.65; // Enfrentamiento directo
  } else if (arqueroAdelantado) {
    xgFinal = distMetros < 20 ? 0.90 : 0.40; // Sin arquero es casi gol
  }

  // 5. Clamping final para asegurar validez matemática
  return Number(Math.max(0.01, Math.min(0.99, xgFinal)).toFixed(3));
}

export function calcularXGPartido(eventos = []) {
  if (!eventos || eventos.length === 0) return 0;
  const xgTotal = eventos.reduce((total, ev) => {
    if (ev.accion?.includes('Remate') || ev.accion === 'Gol') {
      return total + calcularXGEvento(ev);
    }
    return total;
  }, 0);
  return Number(xgTotal.toFixed(2));
}