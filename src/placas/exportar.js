/* EL ÚNICO EXPORTADOR DE PLACAS
 *
 * Había cuatro copias de esto, una por placa, cada una con sus propios
 * parches: la de partido neutralizaba los `repeating-linear-gradient` que
 * rompen Android, la de jugador medía la altura real a mano, la de temporada
 * no tenía ninguno de los dos y encima exportaba a escala 1 (la mitad de
 * resolución que el resto). Ahora es uno solo.
 */

const esAndroid = () => /Android/i.test(navigator?.userAgent || '');

/* La placa se dibuja a 1080 de ancho, así que a 2x sale un PNG de 2160×2700
   (feed) o de 2160×3840 (historia). Son 5,8 y 8,3 millones de píxeles: entran
   holgados en el tope de ~16,7 millones que impone Safari en iPhone.

   Antes el teléfono bajaba a 1.5x "por las dudas". El efecto era que la misma
   placa se descargaba con distinta resolución según desde dónde la bajaras, que
   es justo lo que una herramienta de publicación no tiene que hacer. */
const ESCALA = 2;

/* Marca temporal para encontrar la placa dentro del documento clonado. */
const MARCA = 'data-placa-exportando';

const limpiarNombre = (s) =>
  String(s || 'placa').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 48) || 'placa';

/**
 * Convierte un nodo del DOM en PNG y lo descarga.
 *
 * @param {HTMLElement} nodo   el nodo a tamaño nativo (no el escalado en pantalla)
 * @param {object} opciones    { nombre, ancho, alto, fondo, escala }
 */
export async function exportarPlaca(nodo, { nombre = 'placa', ancho, alto, fondo = '#070A09', escala } = {}) {
  if (!nodo) throw new Error('No se encontró la placa para exportar.');

  const html2canvas = (await import('html2canvas')).default;

  /* `document.fonts.ready` sólo espera lo que ya se estaba cargando, así que
     primero se piden las dos familias a mano: si el PNG se genera antes de que
     lleguen, sale con la tipografía de respaldo y con otras medidas. */
  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load("800 100px 'Archivo'"),
        document.fonts.load("900 100px 'Archivo'"),
        document.fonts.load("700 100px 'JetBrains Mono'"),
        document.fonts.load("800 100px 'JetBrains Mono'"),
      ]);
    } catch { /* si alguna no llega, se exporta igual con la de respaldo */ }
    await document.fonts.ready;
  }
  await new Promise(r => setTimeout(r, 180));

  /* La placa que se ve en pantalla está encogida con `transform: scale()` para
     entrar en el hueco disponible, y html2canvas respeta ese transform: lo que
     salía era la placa chiquita, arrinconada arriba a la izquierda de un lienzo
     de 1080×1350. En el celular, donde la escala es de 0,34, saltaba a la vista;
     en escritorio pasaba lo mismo pero más disimulado.

     El nodo de pantalla no se toca: html2canvas clona el documento y recién
     después mide, así que alcanza con anular el transform EN LA COPIA. Sin
     parpadeo y sin mover nada de lo que el usuario está viendo. */
  nodo.setAttribute(MARCA, '1');

  let lienzo;
  try {
    lienzo = await html2canvas(nodo, {
      scale: escala || ESCALA,
      useCORS: true,          // escudos y fotos vienen de Supabase Storage
      allowTaint: false,      // con allowTaint el canvas se ensucia y toBlob falla
      backgroundColor: fondo,
      logging: false,
      width: ancho,
      height: alto,
      windowWidth: ancho,
      windowHeight: alto,
      /* Un <canvas> de 0×0 tira excepción en Android. */
      ignoreElements: (el) => el.tagName === 'CANVAS' && (el.width === 0 || el.height === 0),
      onclone: (doc) => {
        const clon = doc.querySelector(`[${MARCA}="1"]`);
        if (clon) {
          clon.style.transform = 'none';
          clon.style.transformOrigin = 'top left';
        }

        /* `repeating-linear-gradient` rompe el renderizador en Android: se
           neutraliza sólo en la copia, la placa en pantalla no se toca. */
        doc.querySelectorAll('*').forEach((n) => {
          const bg = n.style?.backgroundImage || '';
          if (bg.includes('repeating-linear-gradient')) n.style.backgroundImage = 'none';
        });
      },
    });
  } finally {
    nodo.removeAttribute(MARCA);
  }

  const archivo = `${limpiarNombre(nombre)}.png`;

  /* En Android un <a download> con un data:URL gigante se corta a la mitad;
     con un Blob y un Object URL anda. */
  if (esAndroid()) {
    const blob = await new Promise((res, rej) =>
      lienzo.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo generar la imagen.'))), 'image/png')
    );
    const url = URL.createObjectURL(blob);
    descargar(url, archivo);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }

  descargar(lienzo.toDataURL('image/png'), archivo);
}

function descargar(href, archivo) {
  const a = document.createElement('a');
  a.href = href;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
