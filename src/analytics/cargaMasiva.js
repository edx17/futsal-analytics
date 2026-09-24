/**
 * CARGA MASIVA DEL PLANTEL POR PLANILLA
 *
 * El circuito es "bajar, completar, subir": se descarga el plantel con todos
 * sus datos (vacía para un club nuevo), se completa en Excel o Google Sheets
 * y se vuelve a subir. Antes de guardar nada se muestra qué va a pasar.
 *
 * Todo lo de acá es puro: entra una matriz de celdas (lo que devuelve
 * read-excel-file o el CSV parseado) y los jugadores actuales, y sale el
 * plan. Sin Supabase ni React, para poder probarlo sin navegador.
 *
 * Reglas que no se negocian, porque una planilla mal pegada no puede romper
 * el plantel:
 *   · Una celda vacía NO borra: significa "dejalo como está".
 *   · La planilla nunca elimina jugadores ni toca PINes ni fotos.
 *   · Una fila con un error no se guarda a medias: se informa entera.
 *   · Un jugador nuevo que se parece a uno existente (mismo DNI, o mismo
 *     nombre y apellido) se frena: casi siempre es alguien a quien le
 *     borraron el ID, y cargarlo daría un duplicado.
 */

export const POSICIONES = ['Arquero', 'Cierre', 'Ala', 'Ala Pivot', 'Pivot'];
export const PIERNAS = ['Diestro', 'Zurdo', 'Ambidiestro'];
export const GRUPOS_SANGUINEOS = ['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

/**
 * Las columnas de la planilla, en orden. `k` es la columna de `jugadores`,
 * `t` el título que ve el club. `alias` son otros títulos que se aceptan al
 * subir (por si alguien escribió "Teléfono" en vez de "Celular").
 */
export const COLUMNAS = [
  { k: 'id', t: 'ID (NO TOCAR)', tipo: 'id', ancho: 12, alias: ['id'] },
  { k: 'apellido', t: 'Apellido', ancho: 18 },
  { k: 'nombre', t: 'Nombre', ancho: 18 },
  { k: 'dorsal', t: 'Dorsal', tipo: 'entero', ancho: 8, alias: ['numero', 'camiseta'] },
  { k: 'posicion', t: 'Posición', opciones: POSICIONES, ancho: 12, alias: ['puesto'] },
  { k: 'categoria', t: 'Categoría', ancho: 14, alias: ['cat'] },
  { k: 'pierna', t: 'Pierna hábil', opciones: PIERNAS, ancho: 13, alias: ['pierna'] },
  { k: 'fechanac', t: 'Fecha de nacimiento', tipo: 'fecha', ancho: 18, alias: ['nacimiento', 'fecha nac', 'f nac'] },
  { k: 'dni', t: 'DNI', tipo: 'dni', ancho: 12, alias: ['documento'] },
  { k: 'contacto', t: 'Celular', tipo: 'telefono', ancho: 16, alias: ['telefono', 'whatsapp', 'contacto'] },
  { k: 'contacto_emergencia', t: 'Contacto de emergencia', ancho: 26, alias: ['emergencia'] },
  { k: 'obra_social', t: 'Obra social', ancho: 16, alias: ['prepaga'] },
  { k: 'grupo_sanguineo', t: 'Grupo sanguíneo', opciones: GRUPOS_SANGUINEOS, tipo: 'sangre', ancho: 15, alias: ['grupo', 'sangre', 'factor'] },
  { k: 'vencimiento_apto', t: 'Vencimiento apto médico', tipo: 'fecha', ancho: 22, alias: ['apto', 'vencimiento apto', 'apto medico'] },
  { k: 'peso', t: 'Peso (kg)', tipo: 'numero', ancho: 10, alias: ['peso'] },
  { k: 'altura', t: 'Altura (cm)', tipo: 'numero', ancho: 11, alias: ['altura'] },
  { k: 'talla_ropa', t: 'Talle de ropa', ancho: 13, alias: ['talle ropa', 'talla ropa', 'talle'] },
  { k: 'talla_calzado', t: 'Talle de calzado', tipo: 'numero', ancho: 15, alias: ['calzado', 'talle calzado', 'talla calzado'] },
];

const COL = Object.fromEntries(COLUMNAS.map((c) => [c.k, c]));

/** "Categoría " → "categoria". Para comparar títulos y opciones sin pelearse con acentos. */
export const clave = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9+-]+/g, ' ')
    .trim();

const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/* ══════════════════════════════════════════════════════════════════════════
   FECHAS
   ══════════════════════════════════════════════════════════════════════════ */

const dos = (n) => String(n).padStart(2, '0');

function fechaValida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Excel, texto argentino o ISO → 'AAAA-MM-DD'. null si no se entiende. */
export function leerFecha(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // read-excel-file devuelve las fechas de Excel a la medianoche UTC.
    return `${v.getUTCFullYear()}-${dos(v.getUTCMonth() + 1)}-${dos(v.getUTCDate())}`;
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return fechaValida(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
  }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    let a = Number(m[3]);
    if (m[3].length === 2) {
      // "05" es 2005, "98" es 1998: nadie tiene un apto que vence en 2098.
      const corte = (new Date().getFullYear() % 100) + 10;
      a += a <= corte ? 2000 : 1900;
    }
    return fechaValida(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
  }
  return null;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', que es como la escribe el club. */
export const fechaArgentina = (iso) => {
  const t = String(iso || '').slice(0, 10);
  const [a, m, d] = t.split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
};

/* ══════════════════════════════════════════════════════════════════════════
   UNA CELDA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El valor de una celda, limpio. { valor } si está bien (undefined = celda
 * vacía, no tocar), { error } si no se puede guardar.
 */
export function normalizarCelda(col, crudo) {
  if (vacio(crudo)) return { valor: undefined };
  const texto = String(crudo instanceof Date ? '' : crudo).trim();

  switch (col.tipo) {
    case 'id': {
      const n = typeof crudo === 'number' ? String(Math.trunc(crudo)) : texto;
      return { valor: n };
    }
    case 'entero': {
      const n = Number(texto.replace(',', '.'));
      if (!Number.isInteger(n) || n < 0) return { error: `${col.t}: "${texto}" no es un número entero` };
      return { valor: n };
    }
    case 'numero': {
      const n = Number(texto.replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return { error: `${col.t}: "${texto}" no es un número` };
      return { valor: n };
    }
    case 'fecha': {
      const f = leerFecha(crudo);
      if (!f) return { error: `${col.t}: "${texto || crudo}" no es una fecha (usá DD/MM/AAAA)` };
      return { valor: f };
    }
    case 'dni': {
      const d = texto.replace(/[.\s-]/g, '');
      if (!/^\d{6,9}$/.test(d)) return { error: `${col.t}: "${texto}" no parece un DNI` };
      return { valor: d };
    }
    case 'telefono': {
      // Excel convierte 1155555555 en número: se vuelve a texto sin decimales.
      const t = typeof crudo === 'number' ? String(Math.trunc(crudo)) : texto;
      return { valor: t };
    }
    case 'sangre': {
      const g = texto.toUpperCase().replace(/\s+/g, '').replace(/^O/, '0')
        .replace(/POSITIVO|POS$/, '+').replace(/NEGATIVO|NEG$/, '-').replace(/RH/, '');
      if (!GRUPOS_SANGUINEOS.includes(g)) return { error: `${col.t}: "${texto}" (usá ${GRUPOS_SANGUINEOS.join(', ')})` };
      return { valor: g };
    }
    default:
      break;
  }

  if (col.opciones) {
    const hit = col.opciones.find((o) => clave(o) === clave(texto));
    if (!hit) return { error: `${col.t}: "${texto}" (usá ${col.opciones.join(', ')})` };
    return { valor: hit };
  }
  return { valor: texto };
}

/* ══════════════════════════════════════════════════════════════════════════
   LA PLANILLA ENTERA
   ══════════════════════════════════════════════════════════════════════════ */

function columnaDeTitulo(titulo) {
  const k = clave(titulo);
  if (!k) return null;
  return COLUMNAS.find((c) => clave(c.t) === k || clave(c.k) === k || (c.alias || []).some((a) => clave(a) === k)) || null;
}

/**
 * Matriz de celdas → filas con sus columnas reconocidas. El encabezado es la
 * primera fila que tenga "Apellido" o "Nombre" (así se toleran filas de
 * título arriba). Las columnas que no reconoce se informan y se ignoran.
 */
export function leerPlanilla(matriz = []) {
  const filas = (matriz || []).map((r) => (Array.isArray(r) ? r : []));
  const iEnc = filas.findIndex((r) => r.some((c) => ['apellido', 'nombre'].includes(clave(c))));
  if (iEnc === -1) {
    return { error: 'No encontré el encabezado: la planilla tiene que tener una fila con las columnas "Apellido" y "Nombre".' };
  }

  const encabezado = filas[iEnc];
  const mapa = [];
  const ignoradas = [];
  const vistas = new Set();
  encabezado.forEach((titulo, i) => {
    const col = columnaDeTitulo(titulo);
    if (col && !vistas.has(col.k)) { mapa[i] = col; vistas.add(col.k); }
    else if (!vacio(titulo)) ignoradas.push(String(titulo).trim());
  });

  if (!vistas.has('apellido') && !vistas.has('nombre')) {
    return { error: 'La planilla no tiene columnas de Apellido ni de Nombre.' };
  }

  const datos = [];
  filas.slice(iEnc + 1).forEach((r, j) => {
    if (r.every(vacio)) return;
    const crudos = {};
    mapa.forEach((col, i) => { if (col) crudos[col.k] = r[i]; });
    datos.push({ nroFila: iEnc + j + 2, crudos }); // +2: base 1 y el encabezado
  });

  return { filas: datos, columnas: [...vistas], ignoradas };
}

/** Cómo está guardado hoy un dato, para compararlo con la planilla. */
function valorActual(col, jugador) {
  const v = jugador?.[col.k];
  if (vacio(v)) return undefined;
  if (col.tipo === 'fecha') return String(v).slice(0, 10);
  if (col.tipo === 'entero' || col.tipo === 'numero') return Number(v);
  return String(v).trim();
}

const mismo = (a, b) => (typeof a === 'number' || typeof b === 'number')
  ? Number(a) === Number(b)
  : String(a) === String(b);

const nombreDe = (j) => [j?.apellido, j?.nombre].filter(Boolean).join(', ') || 'Sin nombre';

/**
 * El plan: qué jugadores se crean, a cuáles se les cambia qué, y qué filas
 * no se pueden guardar y por qué.
 */
export function planDeCarga(filas = [], jugadores = []) {
  const porId = new Map(jugadores.map((j) => [String(j.id), j]));
  const porDni = new Map();
  const porNombre = new Map();
  jugadores.forEach((j) => {
    const dni = String(j.dni ?? '').replace(/\D/g, '');
    if (dni) porDni.set(dni, j);
    const n = clave(`${j.apellido} ${j.nombre}`);
    if (n) porNombre.set(n, j);
  });

  const nuevos = [];
  const cambios = [];
  const errores = [];
  let sinCambios = 0;
  const idsVistos = new Map();
  const dnisVistos = new Map();

  filas.forEach(({ nroFila, crudos }) => {
    const datos = {};
    const problemas = [];

    Object.entries(crudos).forEach(([k, crudo]) => {
      const r = normalizarCelda(COL[k], crudo);
      if (r.error) problemas.push(r.error);
      else if (r.valor !== undefined) datos[k] = r.valor;
    });

    // Repetidos dentro de la misma planilla.
    if (datos.id) {
      if (idsVistos.has(datos.id)) problemas.push(`El ID ${datos.id} ya está en la fila ${idsVistos.get(datos.id)}`);
      else idsVistos.set(datos.id, nroFila);
    }
    if (datos.dni) {
      if (dnisVistos.has(datos.dni)) problemas.push(`El DNI ${datos.dni} ya está en la fila ${dnisVistos.get(datos.dni)}`);
      else dnisVistos.set(datos.dni, nroFila);
    }

    const etiqueta = nombreDe(datos);

    if (datos.id) {
      const jugador = porId.get(datos.id);
      if (!jugador) problemas.push(`El ID ${datos.id} no es de un jugador de este club (si es nuevo, dejá el ID vacío)`);
      if (jugador && datos.dni) {
        const otro = porDni.get(datos.dni);
        if (otro && String(otro.id) !== datos.id) problemas.push(`El DNI ${datos.dni} ya lo tiene ${nombreDe(otro)}`);
      }
      if (problemas.length) { errores.push({ nroFila, jugador: etiqueta, problemas }); return; }

      const diffs = [];
      COLUMNAS.forEach((col) => {
        if (col.k === 'id' || datos[col.k] === undefined) return;
        const antes = valorActual(col, jugador);
        if (antes === undefined || !mismo(antes, datos[col.k])) {
          diffs.push({ k: col.k, t: col.t, antes: antes ?? null, despues: datos[col.k] });
        }
      });
      if (diffs.length === 0) { sinCambios++; return; }
      cambios.push({ nroFila, jugador, diffs, datos: Object.fromEntries(diffs.map((d) => [d.k, d.despues])) });
      return;
    }

    // Sin ID: jugador nuevo.
    if (!datos.apellido || !datos.nombre) problemas.push('Para un jugador nuevo hacen falta Apellido y Nombre');
    if (!datos.categoria) problemas.push('Para un jugador nuevo hace falta la Categoría');
    const mismoDni = datos.dni && porDni.get(datos.dni);
    const mismoNombre = datos.apellido && datos.nombre && porNombre.get(clave(`${datos.apellido} ${datos.nombre}`));
    const parecido = mismoDni || mismoNombre;
    if (parecido) {
      problemas.push(`Parece que ya existe (${nombreDe(parecido)}, ID ${parecido.id}). Si es el mismo, poné su ID; si es otro, revisá el nombre o el DNI`);
    }
    if (problemas.length) { errores.push({ nroFila, jugador: etiqueta, problemas }); return; }

    nuevos.push({ nroFila, datos });
  });

  return { nuevos, cambios, errores, sinCambios };
}

/* ══════════════════════════════════════════════════════════════════════════
   EXPORTAR
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Plantel → matriz de celdas para write-excel-file. Todo va como TEXTO
 * (fechas en DD/MM/AAAA, DNI y celular sin formato de número) para que
 * Excel no los convierta en 4,51E+07 ni cambie el orden día/mes.
 */
export function matrizExportacion(jugadores = []) {
  const encabezado = COLUMNAS.map((c) => c.t);
  const filas = [...jugadores]
    .sort((a, b) => String(a.categoria || '').localeCompare(String(b.categoria || ''))
      || String(a.apellido || '').localeCompare(String(b.apellido || '')))
    .map((j) => COLUMNAS.map((c) => {
      const v = j[c.k];
      if (vacio(v)) return '';
      if (c.tipo === 'fecha') return fechaArgentina(v);
      return String(v);
    }));
  return [encabezado, ...filas];
}

/** Las instrucciones que van en la segunda hoja de la planilla. */
export const INSTRUCCIONES = [
  ['CÓMO USAR ESTA PLANILLA'],
  [''],
  ['1. Completá o corregí los datos en la hoja JUGADORES. Una fila por jugador.'],
  ['2. Para sumar un jugador nuevo, agregá una fila con la columna ID vacía. Necesita Apellido, Nombre y Categoría.'],
  ['3. No toques la columna ID: es la que dice a qué jugador corresponde cada fila.'],
  ['4. Dejar una celda vacía NO borra el dato: queda como estaba.'],
  ['5. Fechas en formato DD/MM/AAAA (ej. 02/05/2009).'],
  ['6. Guardá y subila desde Mi Plantel → SUBIR PLANILLA. Antes de guardar vas a ver qué cambia.'],
  [''],
  ['Valores aceptados'],
  [`Posición: ${POSICIONES.join(', ')}`],
  [`Pierna hábil: ${PIERNAS.join(', ')}`],
  [`Grupo sanguíneo: ${GRUPOS_SANGUINEOS.join(', ')}`],
  [''],
  ['La planilla nunca elimina jugadores ni cambia PINes. Para dar de baja, usá la app.'],
];

/* ══════════════════════════════════════════════════════════════════════════
   CSV (Google Sheets → Descargar → CSV, o Excel → Guardar como CSV)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * CSV → matriz. Detecta el separador: Excel en castellano guarda con ";",
 * Google Sheets con ",". Respeta comillas y saltos de línea dentro de ellas.
 */
export function parsearCSV(texto = '') {
  const t = String(texto).replace(/^\uFEFF/, '');
  const primera = t.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';

  const filas = [];
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
      continue;
    }
    if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}
