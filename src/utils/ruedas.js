/* ══════════════════════════════════════════════════════════════════════
   src/utils/ruedas.js
   Resolución de Primera / Segunda Rueda a partir de la jornada del partido.

   La configuración vive en `torneos.fechas_primera_rueda` (integer, nullable).
   Si el torneo no tiene el corte configurado, todo devuelve null y las
   pantallas simplemente no ofrecen el filtro.

   Migración necesaria en Supabase:
     alter table torneos add column if not exists fechas_primera_rueda integer;
   ══════════════════════════════════════════════════════════════════════ */

/* "Fecha 7" -> 7 · "7ma Fecha" -> 7 · "Cuartos" -> null */
export const numeroJornada = (jornada) => {
  const m = String(jornada || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

/* ¿Es una jornada de playoff? ("Cuartos de final · Ida", "Semifinal", "Final"…) */
const FASES_PLAYOFF = [['octavo', 1], ['cuarto', 2], ['semi', 3], ['tercer', 4], ['final', 5], ['playoff', 0]];
export const fasePlayoff = (jornada) => {
  const t = String(jornada || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bfecha\b|\d/.test(t)) return null;
  const hit = FASES_PLAYOFF.find(([k]) => t.includes(k));
  return hit ? hit[1] : null;
};

/* Lista única de jornadas ordenada naturalmente (Fecha 2 antes que Fecha 10);
   los playoffs van después, de octavos a la final, la ida antes que la vuelta. */
export const ordenarJornadas = (jornadas) =>
  [...new Set((jornadas || []).filter(Boolean))]
    .sort((a, b) => {
      const fa = fasePlayoff(a);
      const fb = fasePlayoff(b);
      if (fa === null && fb === null) return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      if (fa === null) return -1;
      if (fb === null) return 1;
      const iv = (j) => (/vuelta/i.test(j) ? 1 : 0);
      return fa - fb || iv(a) - iv(b) || String(a).localeCompare(String(b));
    });

/* Devuelve 1 (primera rueda), 2 (segunda) o null si no se puede determinar.
   Estrategia: primero el número escrito en la jornada; si la jornada no tiene
   número (copas, "Ida", "Vuelta"), se usa su posición en el orden natural. */
export const ruedaDeJornada = (jornada, fechasPrimeraRueda, jornadasOrdenadas) => {
  const corte = Number(fechasPrimeraRueda) || 0;
  if (corte <= 0) return null;

  const n = numeroJornada(jornada);
  if (n != null) return n <= corte ? 1 : 2;
  if (fasePlayoff(jornada) !== null) return null;   // los playoffs no son de ninguna rueda

  if (Array.isArray(jornadasOrdenadas)) {
    const idx = jornadasOrdenadas.indexOf(jornada);
    if (idx >= 0) return (idx + 1) <= corte ? 1 : 2;
  }
  return null;
};

export const ruedaDePartido = (partido, torneo, jornadasOrdenadas) =>
  ruedaDeJornada(partido?.jornada, torneo?.fechas_primera_rueda, jornadasOrdenadas);

export const tieneRuedasConfiguradas = (torneo) => (Number(torneo?.fechas_primera_rueda) || 0) > 0;

export const etiquetaRueda = (r) =>
  r === 1 ? 'PRIMERA RUEDA' : r === 2 ? 'SEGUNDA RUEDA' : 'SIN RUEDA';

export const colorRueda = (r) => (r === 1 ? '#0ea5e9' : r === 2 ? '#a855f7' : 'var(--text-dim)');