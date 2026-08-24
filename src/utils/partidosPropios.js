/* ═══════════════════════════════════════════════════════════════════════════
   ¿ESTE PARTIDO ES MÍO?

   `partidos.club_id` NO alcanza para saberlo. Cuando se carga el fixture de
   un torneo, TODOS los cruces quedan con el club_id del que los cargó,
   incluidos los que se juegan entre dos equipos ajenos. Filtrar sólo por
   club_id devuelve el torneo entero.

   Así los escribe el fixture de Torneos:

     · partido tuyo   → nombre_propio = tu club, rival_id = el rival,
                        condición Local o Visitante, SIN local_rival_id
     · cruce ajeno    → nombre_propio = el local (un rival), local_rival_id
                        con su id, condición Neutral

   Por eso `local_rival_id` es el discriminador bueno. Las reglas que siguen
   son la red de seguridad para las filas viejas, cargadas antes de que esa
   columna existiera, donde el local ajeno quedaba guardado sólo por nombre.
   ═══════════════════════════════════════════════════════════════════════════ */

export function esPartidoPropio(partido, { miClub = null, nombresRivales = null } = {}) {
  if (!partido) return false;

  /* El local es un rival: el cruce es entre terceros. */
  if (partido.local_rival_id) return false;

  /* Cargado a mano: no lleva nombre_propio y siempre es tuyo. */
  const propio = partido.nombre_propio;
  if (!propio) return true;

  /* Figurás de un lado o del otro. Va antes que la lista de rivales por si
     tu propio club está cargado también como rival. */
  if (miClub && (propio === miClub || partido.rival === miClub)) return true;

  /* Fila vieja sin local_rival_id: si el "propio" es uno de tus rivales, el
     cruce es ajeno. */
  if (nombresRivales && nombresRivales.has(propio)) return false;

  /* Sabemos cómo te llamás y este no sos vos. */
  if (miClub) return false;

  /* Sin nombre de club no hay forma de decidir: no escondemos nada. */
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
