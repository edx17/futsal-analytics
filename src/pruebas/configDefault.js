import { PUESTOS, TODOS_LOS_BLOQUES } from './rubrica';

/* PRUEBAS · CONFIGURACIÓN POR DEFECTO Y SU RESOLUCIÓN
 *
 * Son sólo los valores iniciales: el motor (evaluacionPrueba.js) no tiene
 * números adentro, recibe la configuración. Se usan cuando el club no
 * configuró nada.
 *
 * Resolución: la de la categoría > la del club (categoria null) > estos.
 * Los transversales (inteligencia_juego, actitud) entran en el puntaje final
 * con su peso, igual que los bloques (por defecto 1.0).
 */

export const RANGO_PESO = { min: 0, max: 2, paso: 0.1 };

const pesos = (sin, con, fin, tra, tar, real) => ({
  sin_pelota: sin, con_pelota: con, finalizacion: fin, transiciones: tra, tarea_jugada: tar, juego_real: real,
  inteligencia_juego: 1.0, actitud: 1.0,
});

export const CONFIG_DEFAULT = Object.freeze({
  ponderaciones: {
    Cierre: pesos(1.0, 1.1, 0.7, 1.3, 1.2, 1.3),
    Ala: pesos(1.0, 1.2, 1.0, 1.1, 1.1, 1.1),
    Pivot: pesos(1.0, 1.0, 1.4, 0.9, 1.1, 1.1),
  },
  umbrales: { incorporar: 3.8, seguir_observando: 3.0, bloque_clave_max: 2, divergencia_min: 2 },
  bloques_clave: { Cierre: 'transiciones', Ala: 'con_pelota', Pivot: 'finalizacion' },
});

const clon = (x) => JSON.parse(JSON.stringify(x));

/** Mezcla una fila guardada sobre una base (sólo pisa lo que trae y es válido en forma). */
function sobre(base, fila) {
  const r = clon(base);
  if (!fila) return r;
  PUESTOS.forEach((p) => {
    Object.keys(r.ponderaciones[p]).forEach((b) => {
      const v = Number(fila.ponderaciones?.[p]?.[b]);
      if (Number.isFinite(v)) r.ponderaciones[p][b] = v;
    });
    const clave = fila.bloques_clave?.[p];
    if (clave && TODOS_LOS_BLOQUES.some((b) => b.id === clave)) r.bloques_clave[p] = clave;
  });
  Object.keys(r.umbrales).forEach((k) => {
    const v = Number(fila.umbrales?.[k]);
    if (Number.isFinite(v)) r.umbrales[k] = v;
  });
  return r;
}

/**
 * La configuración que vale para una categoría.
 * `filas`: las de pruebas_config del club. Devuelve { config, fuente, fila }:
 * fuente 'categoria' | 'club' | 'default'; `fila` la que manda (para versión y quién la tocó).
 */
export function resolverConfig(filas = [], categoria) {
  const delClub = filas.find((f) => f.categoria == null) || null;
  const deCat = categoria ? filas.find((f) => f.categoria === categoria) || null : null;
  if (deCat) return { config: sobre(sobre(CONFIG_DEFAULT, delClub), deCat), fuente: 'categoria', fila: deCat };
  if (delClub) return { config: sobre(CONFIG_DEFAULT, delClub), fuente: 'club', fila: delClub };
  return { config: clon(CONFIG_DEFAULT), fuente: 'default', fila: null };
}

/** Qué está mal: { 'Cierre.sin_pelota': texto, 'umbrales.incorporar': texto, … } (vacío si se puede guardar). */
export function erroresDeConfig(config) {
  const e = {};
  PUESTOS.forEach((p) => {
    Object.entries(config?.ponderaciones?.[p] || {}).forEach(([b, v]) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < RANGO_PESO.min || n > RANGO_PESO.max) e[`${p}.${b}`] = `El peso va de ${RANGO_PESO.min.toFixed(1)} a ${RANGO_PESO.max.toFixed(1)}.`;
    });
    if (!TODOS_LOS_BLOQUES.some((b) => b.id === config?.bloques_clave?.[p])) e[`clave.${p}`] = 'Elegí el bloque clave.';
  });
  const u = config?.umbrales || {};
  const enRango = (k, min, max) => { const n = Number(u[k]); if (!Number.isFinite(n) || n < min || n > max) e[`umbrales.${k}`] = `Va de ${min} a ${max}.`; };
  enRango('incorporar', 1, 5); enRango('seguir_observando', 1, 5); enRango('bloque_clave_max', 1, 5); enRango('divergencia_min', 1, 4);
  if (!e['umbrales.incorporar'] && !e['umbrales.seguir_observando'] && Number(u.incorporar) <= Number(u.seguir_observando)) {
    e['umbrales.incorporar'] = 'Tiene que ser mayor que el umbral de seguir observando.';
  }
  return e;
}

/** Las claves que se alejan del default (para marcarlas en la pantalla). */
export function distintosDelDefault(config) {
  const r = new Set();
  PUESTOS.forEach((p) => {
    Object.entries(CONFIG_DEFAULT.ponderaciones[p]).forEach(([b, v]) => { if (Number(config.ponderaciones[p][b]) !== v) r.add(`${p}.${b}`); });
    if (config.bloques_clave[p] !== CONFIG_DEFAULT.bloques_clave[p]) r.add(`clave.${p}`);
  });
  Object.entries(CONFIG_DEFAULT.umbrales).forEach(([k, v]) => { if (Number(config.umbrales[k]) !== v) r.add(`umbrales.${k}`); });
  return r;
}

/** Restaurar defaults: todo, o sólo un puesto (sus pesos y su bloque clave). */
export function restaurar(config, puesto = null) {
  if (!puesto) return clon(CONFIG_DEFAULT);
  const r = clon(config);
  r.ponderaciones[puesto] = clon(CONFIG_DEFAULT.ponderaciones[puesto]);
  r.bloques_clave[puesto] = CONFIG_DEFAULT.bloques_clave[puesto];
  return r;
}

/** Redondea a un decimal (los sliders van de a 0.1). */
export const aPaso = (v) => Math.round(Number(v) * 10) / 10;
