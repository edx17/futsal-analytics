/* LOS DOS FORMATOS DE UNA PLACA
 *
 * Instagram da más pantalla al 4:5 que al cuadrado, y hoy todas las placas
 * del club eran 1080×1080: un tercio del espacio disponible se tiraba. Las
 * referencias de SofaScore, Opta y Sky con las que comparamos son todas 4:5.
 *
 * Las medidas son las nativas de exportación. En pantalla la placa se escala
 * para entrar, pero el PNG sale siempre a este tamaño por la escala de
 * exportación.
 */

export const FORMATOS = {
  feed: {
    id: 'feed',
    label: 'Feed',
    ayuda: 'Para el posteo del perfil (4:5)',
    ancho: 1080,
    alto: 1350,
    /* Alto reservado para el pie. El pie va anclado abajo y el contenido no
       puede invadirlo, así que ningún desborde se lo puede comer. */
    altoPie: 92,
  },
  story: {
    id: 'story',
    label: 'Historia',
    ayuda: 'Para stories y estados (9:16)',
    ancho: 1080,
    alto: 1920,
    /* En la historia se deja más margen abajo: ahí Instagram monta sus
       propios controles encima de la imagen. */
    altoPie: 188,
  },
};

export const FORMATO_POR_DEFECTO = 'feed';
export const CLAVES_FORMATO = Object.keys(FORMATOS);
export const formatoDe = (id) => FORMATOS[id] || FORMATOS[FORMATO_POR_DEFECTO];

/* El estilo del contenedor de contenido. Reserva abajo el alto del pie —que va
 * anclado— y lo publica como variable para que el pie lo use. Así el contenido
 * nunca se le monta encima ni lo empuja fuera del lienzo. */
export const estiloContenido = (formato, paddingTop) => {
  const { altoPie } = formatoDe(formato?.id);
  return { paddingTop, paddingBottom: altoPie, '--pl-alto-pie': `${altoPie}px` };
};
