import { listarCatalogo } from './god';
import { listarHistorial } from './cartasDestacadas';
import { listarFotos } from './cartasFotos';
import { publicarCatalogo } from './sobres';
import { pendientesDePublicar, completarAtributos } from '../analytics/god';

/* PREMIOS GUARDADOS → CATÁLOGO DE LOS SOBRES
 *
 * Cuando MySquad guarda un premio en el historial, también se publica para los
 * sobres: así aparece enseguida en el Modo GOD (CARTAS) para editarlo y puede
 * salir en un sobre. Publica sólo las que faltan (las mismas que el aviso
 * "PUBLICAR LAS N" del Modo GOD); las que ya estaban no se tocan.
 * `calculadas`: las cartas de MySquad. Con ellas, las nuevas salen con sus
 * atributos (TIR, PAS…) aunque el jugador no tenga carta BASE publicada, y las
 * que ya estaban sin atributos se completan.
 * Devuelve { publicadas, completadas }.
 */
export async function publicarPremiosPendientes(clubId, calculadas = []) {
  if (!clubId) return { publicadas: 0, completadas: 0 };
  const [historial, catalogo, fotos] = await Promise.all([
    listarHistorial(clubId), listarCatalogo(clubId), listarFotos(clubId).catch(() => new Map()),
  ]);
  const pendientes = pendientesDePublicar(historial, catalogo, fotos, calculadas);
  const completar = completarAtributos(catalogo, calculadas);
  const publicadas = pendientes.length ? await publicarCatalogo(clubId, pendientes) : 0;
  const completadas = completar.length ? await publicarCatalogo(clubId, completar) : 0;
  return { publicadas, completadas };
}

/** Cuántas cartas del catálogo se pueden completar con las de MySquad (para el aviso). */
export async function cartasSinAtributos(clubId, calculadas = []) {
  if (!clubId) return 0;
  return completarAtributos(await listarCatalogo(clubId), calculadas).length;
}
