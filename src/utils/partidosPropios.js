/* ═══════════════════════════════════════════════════════════════════════════
   ¿ESTE PARTIDO ES MÍO?

   `partidos.club_id` NO alcanza. Cuando se carga el fixture de un torneo,
   TODOS los cruces quedan con el club_id del que los cargó, incluidos los
   que juegan dos equipos ajenos entre sí. Un torneo entero son cientos de
   partidos de los que sólo un puñado son tuyos.

   Lo que de verdad distingue un partido propio es el NOMBRE: en un cruce
   entre terceros ni `nombre_propio` ni `rival` sos vos. Todo lo demás
   (local_rival_id, la condición Neutral) son señales de apoyo para las
   filas viejas o mal cargadas.

   La comparación de nombres va normalizada —sin acentos, sin mayúsculas,
   sin espacios de más— porque "Segundo Palo", "SEGUNDO PALO" y
   "Segundo  Palo " son el mismo club y antes no matcheaban.
   ═══════════════════════════════════════════════════════════════════════════ */

export const normalizarNombre = (s) =>
  (s == null ? '' : String(s))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')                        // puntos, guiones, etc.
    .trim();

const mismoClub = (a, b) => {
  const na = normalizarNombre(a);
  const nb = normalizarNombre(b);
  return !!na && !!nb && na === nb;
};

/* Cuál es mi club, según los propios partidos.

   El nombre guardado en el navegador puede estar vacío, viejo o escrito
   distinto de como figura en los partidos. Cuando no matchea con ninguna
   fila, lo deducimos: el equipo que más veces aparece como `nombre_propio`
   en partidos que NO son cruces ajenos es, sin margen de duda, el nuestro. */
export function deducirMiClub(partidos = [], candidato = null) {
  const hayMatch = candidato && partidos.some(p =>
    mismoClub(p?.nombre_propio, candidato) || mismoClub(p?.rival, candidato));
  if (hayMatch) return { nombre: candidato, deducido: false };

  const cuenta = new Map();
  partidos.forEach(p => {
    /* Un cruce ajeno se guarda con la FK del local puesta y condición
       Neutral. Los que quedan afuera de eso son los tuyos. */
    if (p?.local_rival_id) return;
    if ((p?.condicion || '') === 'Neutral') return;
    const n = p?.nombre_propio;
    if (!n) return;
    const clave = normalizarNombre(n);
    if (!clave) return;
    const actual = cuenta.get(clave) || { nombre: n, veces: 0 };
    actual.veces += 1;
    cuenta.set(clave, actual);
  });

  let mejor = null;
  cuenta.forEach(v => { if (!mejor || v.veces > mejor.veces) mejor = v; });
  if (mejor) return { nombre: mejor.nombre, deducido: true, veces: mejor.veces };

  return { nombre: candidato || null, deducido: false };
}

/* El nombre manda. Recién si no reconocemos ninguno de los dos equipos
   miramos las señales de apoyo. */
export function esPartidoPropio(partido, { miClub = null, nombresRivales = null } = {}) {
  if (!partido) return false;

  /* Sos uno de los dos equipos: es tuyo, tenga la FK que tenga. */
  if (miClub && (mismoClub(partido.nombre_propio, miClub) || mismoClub(partido.rival, miClub))) {
    return true;
  }

  /* Sabemos cómo te llamás y no figurás en este cruce. */
  if (miClub && partido.nombre_propio) return false;

  /* Sin nombre_propio es un partido cargado a mano: siempre tuyo. */
  if (!partido.nombre_propio) return !partido.local_rival_id;

  /* De acá para abajo no sabemos tu nombre: las señales de apoyo. */
  if (partido.local_rival_id) return false;
  if ((partido.condicion || '') === 'Neutral') return false;
  if (nombresRivales && nombresRivales.has(partido.nombre_propio)) return false;

  return true;
}

/* Nombre del equipo rival. `partidos` tiene DOS claves foráneas hacia
   `rivales` (rival_id y local_rival_id), así que PostgREST no puede embeber
   la relación: falla con "more than one relationship was found". El nombre
   se resuelve en JS, que además es la convención del proyecto. */
export function nombreDelRival(partido, mapaRivales = null) {
  if (!partido) return 'Rival';
  const r = partido.rival_id && mapaRivales ? mapaRivales.get(partido.rival_id) : null;
  return r?.nombre || partido.rival || 'Rival';
}
