import { listarCatalogo } from './god';
import { listarHistorial } from './cartasDestacadas';
import { listarFotos } from './cartasFotos';
import { publicarCatalogo } from './sobres';
import { pendientesDePublicar } from '../analytics/god';

/* PREMIOS GUARDADOS → CATÁLOGO DE LOS SOBRES
 *
 * Cuando MySquad guarda un premio en el historial, también se publica para los
 * sobres: así aparece enseguida en el Modo GOD (CARTAS) para editarlo y puede
 * salir en un sobre. Publica sólo las que faltan (las mismas que el aviso
 * "PUBLICAR LAS N" del Modo GOD); las que ya estaban no se tocan.
 * Devuelve cuántas cartas se publicaron.
 */
export async function publicarPremiosPendientes(clubId) {
  if (!clubId) return 0;
  const [historial, catalogo, fotos] = await Promise.all([
    listarHistorial(clubId), listarCatalogo(clubId), listarFotos(clubId).catch(() => new Map()),
  ]);
  const pendientes = pendientesDePublicar(historial, catalogo, fotos);
  if (pendientes.length === 0) return 0;
  return publicarCatalogo(clubId, pendientes);
}
