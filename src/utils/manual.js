/* El manual vive como página estática en public/manual/index.html, así que
   se sirve en el mismo dominio de la app: se puede abrir flotante (iframe),
   en otra pestaña, compartir con un link público o guardar como PDF.

   Cada sección se abre por su ancla (#kiosco, #avisos, #plantel…). */
export const RUTA_MANUAL = '/manual/index.html';

export const linkManual = (seccion = '') => `${RUTA_MANUAL}${seccion ? `#${seccion}` : ''}`;

/* El link completo, para copiar y mandar por WhatsApp. */
export const linkManualAbsoluto = (seccion = '') => `${window.location.origin}${linkManual(seccion)}`;
