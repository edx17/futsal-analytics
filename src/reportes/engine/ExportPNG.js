// src/reportes/engine/ExportPNG.js
import html2canvas from "html2canvas";

const esAndroid = () => /Android/i.test(navigator.userAgent);

/**
 * Exporta el nodo referenciado (el canvas de 1080x1350 de la plantilla) como PNG.
 *
 * @param {React.RefObject} nodoRef - ref al div que contiene el TemplateRenderer.
 * @param {string} nombreArchivo - nombre del archivo, sin extensión.
 * @param {number} escalaExport - multiplicador de resolución (2 = @2x, mejor para redes).
 */
export async function exportarComoPNG(nodoRef, nombreArchivo = "reporte", escalaExport = 2) {
  if (!nodoRef?.current) {
    throw new Error("No se encontró el elemento a exportar.");
  }

  const canvas = await html2canvas(nodoRef.current, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale: escalaExport,
    logging: false,
  });

  const nombreFinal = `${nombreArchivo}.png`;

  if (esAndroid()) {
    // En Android, un <a download> apuntando a un data:URL gigante (toDataURL)
    // suele fallar o cortar la descarga a mitad de camino. toBlob + un
    // Object URL es el camino que ya funcionó en los otros exportadores
    // del club (MatchReport, PlayerReportGenerator, etc.).
    return new Promise((resolvePromise, rejectPromise) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          rejectPromise(new Error("No se pudo generar la imagen."));
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = nombreFinal;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Liberamos el Object URL una vez disparada la descarga.
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        resolvePromise(true);
      }, "image/png");
    });
  }

  // Desktop / iOS: toDataURL funciona sin problemas.
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = nombreFinal;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}

/**
 * Nota para futuras plantillas: html2canvas no siempre reproduce bien
 * gradientes CSS (linear-gradient / radial-gradient) en Android. Si una
 * plantilla nueva necesita un degradé, conviene resolverlo como imagen o
 * patrón SVG en vez de background CSS, tal como se hizo en los reportes
 * anteriores del club.
 */