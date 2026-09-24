/* Genera el Excel del plantel (hoja JUGADORES + hoja INSTRUCCIONES).
   La librería se carga recién cuando alguien baja la planilla. */
import { COLUMNAS, INSTRUCCIONES, matrizExportacion } from '../analytics/cargaMasiva';

const hoyArchivo = () => new Date().toISOString().slice(0, 10);

export async function descargarPlanilla(jugadores = [], nombreClub = 'club') {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const [encabezado, ...filas] = matrizExportacion(jugadores);

  const celdaEnc = (t) => ({ value: t, type: String, fontWeight: 'bold', backgroundColor: t.startsWith('ID') ? '#D9D9D9' : '#00FF88' });
  const celda = (v, i) => (v === '' ? null : {
    value: v, type: String,
    // El ID en gris: que se note que es la columna que no se toca.
    ...(i === 0 ? { textColor: '#7F7F7F' } : {}),
  });

  const nombre = String(nombreClub || 'club').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

  await writeExcelFile([
    {
      sheet: 'JUGADORES',
      data: [encabezado.map(celdaEnc), ...filas.map((f) => f.map(celda))],
      columns: COLUMNAS.map((c) => ({ width: c.ancho || 14 })),
      stickyRowsCount: 1,
    },
    {
      sheet: 'INSTRUCCIONES',
      data: INSTRUCCIONES.map(([t], i) => [{ value: t, type: String, ...(i === 0 || t === 'Valores aceptados' ? { fontWeight: 'bold' } : {}) }]),
      columns: [{ width: 110 }],
    },
  ]).toFile(`plantel-${nombre}-${hoyArchivo()}.xlsx`);
}

