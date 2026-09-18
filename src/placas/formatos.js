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
  },
  story: {
    id: 'story',
    label: 'Historia',
    ayuda: 'Para stories y estados (9:16)',
    ancho: 1080,
    alto: 1920,
  },
};

export const FORMATO_POR_DEFECTO = 'feed';
export const CLAVES_FORMATO = Object.keys(FORMATOS);
export const formatoDe = (id) => FORMATOS[id] || FORMATOS[FORMATO_POR_DEFECTO];
