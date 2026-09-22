/* ============================================================================
   EL TABLERO DE INICIO
   ----------------------------------------------------------------------------
   Las decisiones del dashboard que se pueden probar, fuera del componente.

   El criterio que ordena todo: la pantalla de inicio tiene que contestar
   "¿qué tengo que hacer hoy?" en lo primero que se ve, sin scrollear. Todo lo
   demás —el balance del año, la forma, las figuras— es consulta, y la consulta
   puede esperar a que bajes.
============================================================================ */

import { sumarDias, diasEntre } from './agenda';

/* ── ALERTAS ───────────────────────────────────────────────────────────────
   El triage cortaba en 6 por orden de llegada. Con varios suspendidos, los
   avisos que se agregan al final —carga en riesgo, menores sin tutor— no
   llegaban a entrar nunca. Ahora se ordena por gravedad primero y el corte
   es de 8: lo grave entra siempre, y entre iguales gana el que llegó antes. */

export const TOPE_TRIAGE = 8;

const PESO_NIVEL = { danger: 0, warning: 1, info: 2 };

export function ordenarAlertas(alertas = [], tope = TOPE_TRIAGE) {
  return [...alertas]
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const px = PESO_NIVEL[x.a?.nivel] ?? 9;
      const py = PESO_NIVEL[y.a?.nivel] ?? 9;
      return px !== py ? px - py : x.i - y.i;   // estable dentro del mismo nivel
    })
    .slice(0, tope)
    .map((x) => x.a);
}

/* ── LA FRANJA DE HOY ──────────────────────────────────────────────────────
   Una sola línea arriba de todo con lo que pasa hoy, lo que viene mañana y
   cuántos avisos hay esperando. No reemplaza a ningún módulo: los resume para
   que no haya que bajar para enterarse. */

export const hoyISO = () => new Date().toISOString().slice(0, 10);

export function franjaDeHoy({ semana = [], triage = [], hoy = hoyISO() } = {}) {
  const manana = sumarDias(hoy, 1);
  const deHoy = semana.filter((e) => e.fecha === hoy);
  const deManana = semana.filter((e) => e.fecha === manana);

  /* El próximo partido puede ser hoy mismo. `semana` ya viene ordenada por
     día y hora, así que el primero que aparece es el más cercano. */
  const partido = semana.find((e) => e.tipo === 'partido') || null;

  const graves = triage.filter((a) => a.nivel === 'danger').length;

  return {
    hoy: deHoy,
    manana: deManana,
    partido,
    diasAlPartido: partido ? diasEntre(hoy, partido.fecha) : null,
    avisos: triage.length,
    graves,
    /* Sin nada hoy, sin partido a la vista y sin avisos no hay nada que decir:
       la franja se esconde sola en vez de ocupar espacio con un "todo en
       orden" que nadie pidió. */
    vacia: deHoy.length === 0 && !partido && triage.length === 0,
  };
}

/** El texto corto de cuándo es el partido, para la franja. */
export function cuandoEsElPartido(dias) {
  if (dias == null) return null;
  if (dias < 0) return null;
  if (dias === 0) return 'HOY';
  if (dias === 1) return 'MAÑANA';
  return `EN ${dias} DÍAS`;
}

/* ── ACCESOS RÁPIDOS APRENDIDOS ────────────────────────────────────────────
   Eran once iconos fijos e iguales para todos. Cada club usa tres o cuatro
   pantallas, siempre las mismas, y las once competían por el mismo espacio.
   Ahora se cuenta cuántas veces se entró a cada una desde acá y las más
   usadas van adelante. */

export const LS_USO_ACCESOS = 'dash_uso_accesos';
export const ACCESOS_VISIBLES = 6;

/**
 * Ordena los accesos por uso, con un desempate estable por el orden original.
 *
 * Los que nunca se usaron NO se mandan al fondo: conservan su lugar de la
 * lista original entre los de uso cero. Si no, una pantalla nueva quedaría
 * enterrada para siempre por no tener historial, que es la trampa clásica de
 * ordenar por uso.
 */
export function rankAccesos(links = [], conteos = {}) {
  return [...links]
    .map((l, i) => ({ l, i, n: Number(conteos[l.ruta]) || 0 }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .map((x) => x.l);
}

/** Lee el contador sin romperse si el storage está bloqueado o corrupto. */
export function leerUso(storage) {
  try {
    const crudo = (storage || window.localStorage).getItem(LS_USO_ACCESOS);
    const obj = crudo ? JSON.parse(crudo) : {};
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}

/** Suma uno y devuelve el mapa nuevo. Devuelve el viejo si no pudo guardar. */
export function anotarUso(ruta, storage) {
  const s = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  const actual = leerUso(s);
  if (!ruta) return actual;
  const nuevo = { ...actual, [ruta]: (Number(actual[ruta]) || 0) + 1 };
  try { s.setItem(LS_USO_ACCESOS, JSON.stringify(nuevo)); } catch { return actual; }
  return nuevo;
}
