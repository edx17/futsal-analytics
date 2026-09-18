/* EL ÚNICO EXPORTADOR DE PLACAS
 *
 * Había cuatro copias de esto, una por placa, cada una con sus propios
 * parches: la de partido neutralizaba los `repeating-linear-gradient` que
 * rompen Android, la de jugador medía la altura real a mano, la de temporada
 * no tenía ninguno de los dos y encima exportaba a escala 1 (la mitad de
 * resolución que el resto). Ahora es uno solo.
 */

const esAndroid = () => /Android/i.test(navigator?.userAgent || '');

/* En un celular, un PNG de 1080×1920 a 2x son 2160×3840: hay equipos que no
 * lo aguantan. 2x en escritorio, 1.5x en el teléfono. */
const escalaSegunEquipo = () =>
  (typeof window !== 'undefined' && window.innerWidth < 768) ? 1.5 : 2;

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

  /* Un respiro para que terminen de pintarse las fuentes y cualquier gráfico.
     Sin esto salen placas con la tipografía de respaldo. */
  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise(r => setTimeout(r, 180));

  const lienzo = await html2canvas(nodo, {
    scale: escala || escalaSegunEquipo(),
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
      /* `repeating-linear-gradient` rompe el renderizador en Android: se
         neutraliza sólo en la copia, la placa en pantalla no se toca. */
      doc.querySelectorAll('*').forEach((n) => {
        const bg = n.style?.backgroundImage || '';
        if (bg.includes('repeating-linear-gradient')) n.style.backgroundImage = 'none';
      });
    },
  });

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
