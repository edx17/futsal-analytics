/* CONFIGURADOR GOD: qué secciones hay y quién ve cada una.
 *
 * El superusuario ve todo. El manager sólo da de alta cartas de premio (y las
 * básicas que salen de los partidos), les pone foto y publica las placas: lo
 * que antes hacía desde MySquad. Lo demás lo cuidan también las políticas de la
 * base; esto sólo decide qué se muestra.
 *
 * `god`: la pestaña de PanelGod que muestra la sección (si la tiene).
 * `pronto`: todavía no está; se muestra qué va a hacer (ver docs/CONFIGURADOR_GOD.md).
 */

const SUPER = ['superuser'];
const AMBOS = ['superuser', 'manager'];

export const SECCIONES_GOD = [
  { id: 'probar', grupo: 'CARTAS Y SOBRES', titulo: 'Probar', texto: 'Abrí cualquier sobre o cinemática sin gastar nada.', roles: SUPER, god: 'probar' },
  { id: 'alta', grupo: 'CARTAS Y SOBRES', titulo: 'Alta de cartas', texto: 'Básicas (salen de los partidos) y especiales.', roles: AMBOS },
  { id: 'modificar', grupo: 'CARTAS Y SOBRES', titulo: 'Modificar y baja', texto: 'Foto, media, suspender o eliminar cartas.', roles: AMBOS },
  { id: 'placas', grupo: 'CARTAS Y SOBRES', titulo: 'Placas', texto: 'Las placas con cartas para publicar en redes.', roles: AMBOS },
  { id: 'eventos', grupo: 'CARTAS Y SOBRES', titulo: 'Eventos', texto: 'Sobres de evento con fechas, reglas y escena.', roles: SUPER, god: 'eventos' },
  { id: 'sobres', grupo: 'CARTAS Y SOBRES', titulo: 'Sobres', texto: 'Qué trae cada sobre, cuánto cuesta y cómo se ve.', roles: SUPER, god: 'sobres' },
  { id: 'usuarios', grupo: 'JUGADORES', titulo: 'Usuarios', texto: 'Suspender, V-Coins y eventos multiplicadores.', roles: SUPER, god: 'usuarios' },
  { id: 'misiones', grupo: 'JUGADORES', titulo: 'Misiones', texto: 'Las misiones diarias: qué hay que hacer, cuánto paga y qué días.', roles: SUPER },
  { id: 'vcoins', grupo: 'JUGADORES', titulo: 'V-Coins', texto: 'Lo que paga cada juego: penales, V-Draft, desafío, duelos y repetidas.', roles: SUPER },
  { id: 'torneo', grupo: 'JUEGOS', titulo: 'Torneo V-Draft', texto: 'Entrada, partidas y premio extra.', roles: SUPER, god: 'torneo' },
  { id: 'gmail', grupo: 'JUEGOS', titulo: 'Gmail · Hinchas', texto: 'Vincular Gmail y las invitaciones a hinchas.', roles: SUPER, god: 'gmail' },
];

/* Los tipos de alta: las básicas y los premios los puede dar el manager; las
   ediciones especiales, sólo el superusuario. `god`: la pestaña de PanelGod. */
export const ALTAS_GOD = [
  { id: 'basicas', titulo: 'BÁSICAS', roles: AMBOS },
  { id: 'premios', titulo: 'PREMIOS', roles: AMBOS },
  { id: 'toty', titulo: 'TOTY', roles: SUPER, god: 'toty' },
  { id: 'copafuturo', titulo: 'COPA FUTURO', roles: SUPER, god: 'copafuturo' },
  { id: 'heroes', titulo: 'HÉROES', roles: SUPER, god: 'heroes' },
  { id: 'halloween', titulo: 'HALLOWEEN', roles: SUPER, god: 'halloween' },
];

const puede = (rol) => (x) => x.roles.includes(String(rol || '').toLowerCase());

export const seccionesPara = (rol) => SECCIONES_GOD.filter(puede(rol));
export const altasPara = (rol) => ALTAS_GOD.filter(puede(rol));

/* La sección a mostrar: la pedida si la puede ver, si no la primera que tenga. */
export function seccionInicial(rol, pedida) {
  const lista = seccionesPara(rol);
  return (lista.find((s) => s.id === pedida) || lista[0] || null)?.id ?? null;
}

/* Las secciones agrupadas para el menú, en el orden de la lista. */
export function menuPorGrupo(rol) {
  const grupos = [];
  seccionesPara(rol).forEach((s) => {
    const g = grupos.find((x) => x.grupo === s.grupo);
    if (g) g.secciones.push(s); else grupos.push({ grupo: s.grupo, secciones: [s] });
  });
  return grupos;
}
