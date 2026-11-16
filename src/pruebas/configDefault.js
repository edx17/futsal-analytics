import { PUESTOS, bloquesDePuesto } from './rubrica';

/* PRUEBAS · CONFIGURACIÓN POR DEFECTO Y SU RESOLUCIÓN
 *
 * Son sólo los valores iniciales: el motor (evaluacionPrueba.js) no tiene
 * números adentro, recibe la configuración. Se usan cuando el club no
 * configuró nada.
 *
 * Resolución: la de la categoría > la del club (categoria null) > estos.
 * Los transversales (inteligencia_juego, actitud) entran en el puntaje final
 * con su peso, igual que los bloques (por defecto 1.0).
 *
 * ligas: las ligas del club con el puntaje mínimo para sugerirlas en el cierre
 *        ([{ nombre: 'AFA', minimo: 3.8 }]). Si la categoría tiene su lista, manda la suya.
 * evaluadores_puesto: por puesto, { min, asignado }. `min` pisa a
 *        umbrales.evaluadores_min para ese puesto; `asignado` (id de perfil) es el
 *        único que evalúa ese puesto (con asignado y sin min, alcanza con 1).
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
    Arquero: {
      arq_activacion: 0.9, arq_paradas: 1.4, arq_uno_contra_uno: 1.3, arq_juego_pies: 1.1, arq_saque: 1.0,
      arq_transiciones: 1.1, arq_tarea_jugada: 1.1, juego_real: 1.3, inteligencia_juego: 1.0, actitud: 1.0,
    },
  },
  // evaluadores_min: cuántos evaluadores hacen falta para cerrar la carga (1 = alcanza con el DT).
  umbrales: { incorporar: 3.8, seguir_observando: 3.0, bloque_clave_max: 2, divergencia_min: 2, evaluadores_min: 2 },
  bloques_clave: { Cierre: 'transiciones', Ala: 'con_pelota', Pivot: 'finalizacion', Arquero: 'arq_paradas' },
  ligas: [],
  evaluadores_puesto: { Cierre: { min: null, asignado: null }, Ala: { min: null, asignado: null }, Pivot: { min: null, asignado: null }, Arquero: { min: null, asignado: null } },
});

const clon = (x) => JSON.parse(JSON.stringify(x));

/** El bloque clave de un puesto tiene que ser uno de sus bloques (no un transversal). */
export const bloquesClaveDe = (puesto) => bloquesDePuesto(puesto).filter((b) => !b.transversal);
const esClaveValida = (puesto, id) => bloquesClaveDe(puesto).some((b) => b.id === id);

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
    if (clave && esClaveValida(p, clave)) r.bloques_clave[p] = clave;
  });
  Object.keys(r.umbrales).forEach((k) => {
    const v = Number(fila.umbrales?.[k]);
    if (Number.isFinite(v)) r.umbrales[k] = v;
  });
  if (Array.isArray(fila.ligas) && fila.ligas.length) {
    r.ligas = fila.ligas.filter((l) => l && String(l.nombre || '').trim())
      .map((l) => ({ nombre: String(l.nombre).trim(), minimo: Number(l.minimo) }));
  }
  PUESTOS.forEach((p) => {
    const e = fila.evaluadores_puesto?.[p];
    if (!e) return;
    const min = e.min === '' || e.min == null ? null : Number(e.min);
    r.evaluadores_puesto[p] = { min: Number.isFinite(min) ? min : null, asignado: e.asignado || null };
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
    if (!esClaveValida(p, config?.bloques_clave?.[p])) e[`clave.${p}`] = 'Elegí el bloque clave.';
  });
  const u = config?.umbrales || {};
  const enRango = (k, min, max) => { const n = Number(u[k]); if (!Number.isFinite(n) || n < min || n > max) e[`umbrales.${k}`] = `Va de ${min} a ${max}.`; };
  enRango('incorporar', 1, 5); enRango('seguir_observando', 1, 5); enRango('bloque_clave_max', 1, 5); enRango('divergencia_min', 1, 4);
  enRango('evaluadores_min', 1, 5);
  if (!e['umbrales.evaluadores_min'] && !Number.isInteger(Number(u.evaluadores_min))) e['umbrales.evaluadores_min'] = 'Tiene que ser un número entero.';
  if (!e['umbrales.incorporar'] && !e['umbrales.seguir_observando'] && Number(u.incorporar) <= Number(u.seguir_observando)) {
    e['umbrales.incorporar'] = 'Tiene que ser mayor que el umbral de seguir observando.';
  }
  const vistas = new Set();
  (config?.ligas || []).forEach((l, i) => {
    const nombre = String(l?.nombre || '').trim();
    if (!nombre) e[`liga.${i}`] = 'Poné el nombre de la liga.';
    else if (vistas.has(nombre.toLowerCase())) e[`liga.${i}`] = 'Esa liga ya está.';
    vistas.add(nombre.toLowerCase());
    const m = Number(l?.minimo);
    if (!e[`liga.${i}`] && (!Number.isFinite(m) || m < 1 || m > 5)) e[`liga.${i}`] = 'El mínimo va de 1 a 5.';
  });
  PUESTOS.forEach((p) => {
    const min = config?.evaluadores_puesto?.[p]?.min;
    if (min != null && min !== '' && (!Number.isInteger(Number(min)) || Number(min) < 1 || Number(min) > 5)) e[`evaluadores.${p}`] = 'Entre 1 y 5 (vacío = el general).';
  });
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
  PUESTOS.forEach((p) => {
    const e = config.evaluadores_puesto?.[p] || {};
    if (e.min != null || e.asignado) r.add(`evaluadores.${p}`);
  });
  return r;
}

/** Restaurar defaults: todo, o sólo un puesto (sus pesos y su bloque clave). */
export function restaurar(config, puesto = null) {
  // Las ligas y los evaluadores por puesto son datos del club, no pesos: no se restauran.
  if (!puesto) return { ...clon(CONFIG_DEFAULT), ligas: clon(config.ligas || []), evaluadores_puesto: clon(config.evaluadores_puesto || CONFIG_DEFAULT.evaluadores_puesto) };
  const r = clon(config);
  r.ponderaciones[puesto] = clon(CONFIG_DEFAULT.ponderaciones[puesto]);
  r.bloques_clave[puesto] = CONFIG_DEFAULT.bloques_clave[puesto];
  return r;
}

/** Redondea a un decimal (los sliders van de a 0.1). */
export const aPaso = (v) => Math.round(Number(v) * 10) / 10;

/** Cuántos evaluadores hacen falta para cerrar un candidato de ese puesto. */
export function minimoDelPuesto(config, puesto) {
  const e = config?.evaluadores_puesto?.[puesto] || {};
  const min = Number(e.min);
  if (e.min != null && e.min !== '' && Number.isInteger(min) && min >= 1) return min;
  if (e.asignado) return 1;
  const n = Number(config?.umbrales?.evaluadores_min);
  return Number.isInteger(n) && n >= 1 ? n : 2;
}

/** Quién tiene asignado el puesto (id de perfil) o null si evalúa cualquiera. */
export const asignadoDelPuesto = (config, puesto) => config?.evaluadores_puesto?.[puesto]?.asignado || null;

/** Las ligas que la app sugiere para un resultado: las que alcanza con el puntaje final
 *  (nunca si la recomendación es "No incorporar"). */
export function ligasSugeridas(config, resultado) {
  if (!resultado || resultado.puntaje == null || resultado.recomendacion === 'no_incorporar') return [];
  return (config?.ligas || []).filter((l) => Number(resultado.puntaje) >= Number(l.minimo)).map((l) => l.nombre);
}
