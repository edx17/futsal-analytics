/* DE DÓNDE SALE EL NOMBRE DEL CLUB
 *
 * De `clubes.nombre`, que es lo que se edita en Configuración. Hasta ahora
 * cada placa lo resolvía a su manera y no daban lo mismo: los partidos
 * guardan `nombre_propio` con el sufijo de categoría —"LIBERTADORES SC
 * (AFA - Masc)"— y ese texto terminaba impreso en la imagen. El nombre
 * limpio vive en la tabla `clubes`, y el AuthContext ya lo deja en
 * localStorage para todos los módulos.
 *
 * El escudo sale del bucket `escudos` de Storage; la URL pública está en
 * `clubes.escudo_url`.
 */

export function datosDelClub(perfil) {
  const nombre =
    perfil?.clubes?.nombre ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('mi_club')) ||
    'MI CLUB';

  const escudo =
    perfil?.clubes?.escudo_url ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('escudo_url')) ||
    null;

  return { nombre: String(nombre).toUpperCase(), escudo: escudo || null };
}

/* Las dos primeras iniciales, para cuando no hay escudo. */
export const iniciales = (s) =>
  String(s || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/* LA CLAVE CON LA QUE MI EQUIPO APARECE EN LA TABLA
 *
 * En la tabla de posiciones los equipos se identifican por el texto que traen
 * los partidos, y ahí mi club viene como `nombre_propio`: "LIBERTADORES SC
 * (AFA - Masc)", con el sufijo de categoría. Para BUSCAR mi fila hay que usar
 * ese texto; para MOSTRARLA, el nombre limpio de `clubes.nombre`. Confundir
 * los dos deja la placa sin destacar ninguna fila.
 */
export function claveDeTabla(partidos = [], respaldo) {
  const propio = (partidos || []).find((f) => f && f.condicion !== 'Neutral' && f.nombre_propio);
  return propio?.nombre_propio || respaldo || null;
}
