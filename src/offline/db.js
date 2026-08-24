/* ═══════════════════════════════════════════════════════════════════════════
   ALMACÉN LOCAL DE LA CAPTURA OFFLINE

   IndexedDB, sin dependencias. localStorage no alcanza acá: un partido
   analizado con recorridos y snapshots posicionales pasa los 5 MB de cuota
   con facilidad, y encima localStorage es síncrono (traba la UI justo cuando
   estás arrastrando fichas en el mapita).

   Todo lo que se crea offline lleva un `local_id` propio. Ese id es la clave
   primaria acá y también viaja a Supabase, así sincronizar dos veces no
   duplica nada.
   ═══════════════════════════════════════════════════════════════════════════ */

const DB_NOMBRE = 'vc_captura_offline';
const DB_VERSION = 1;

/* Cada store guarda su clave y por qué partido se filtra. */
export const STORES = {
  partidos:   { key: 'id',       indices: [] },
  eventos:    { key: 'local_id', indices: ['id_partido', '_estado'] },
  snapshots:  { key: 'local_id', indices: ['id_partido'] },
  recorridos: { key: 'local_id', indices: ['id_partido'] },
  stints:     { key: 'local_id', indices: ['id_partido'] },
  secuencias: { key: 'id',       indices: ['id_partido'] },
};

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;

  dbPromesa = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no soporta IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      Object.entries(STORES).forEach(([nombre, def]) => {
        const store = db.objectStoreNames.contains(nombre)
          ? req.transaction.objectStore(nombre)
          : db.createObjectStore(nombre, { keyPath: def.key });
        def.indices.forEach(ix => {
          if (!store.indexNames.contains(ix)) store.createIndex(ix, ix, { unique: false });
        });
      });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  /* Si falla la apertura no dejamos la promesa rota cacheada para siempre. */
  dbPromesa.catch(() => { dbPromesa = null; });
  return dbPromesa;
}

function correr(store, modo, fn) {
  return abrir().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const req = fn(tx.objectStore(store));
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve();
    }
  }));
}

export const leer     = (store, clave) => correr(store, 'readonly',  s => s.get(clave));
export const leerTodo = (store)        => correr(store, 'readonly',  s => s.getAll());
export const borrar   = (store, clave) => correr(store, 'readwrite', s => s.delete(clave));

export function guardar(store, registro) {
  return correr(store, 'readwrite', s => s.put(registro)).then(() => registro);
}

/* Escritura en lote dentro de UNA transacción: o entran todos o no entra
   ninguno. Importante al bajar un partido entero o al cerrar una secuencia. */
export function guardarVarios(store, registros = []) {
  if (registros.length === 0) return Promise.resolve([]);
  return abrir().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    registros.forEach(r => os.put(r));
    tx.oncomplete = () => resolve(registros);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function leerPorPartido(store, idPartido) {
  return abrir().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    if (!os.indexNames.contains('id_partido')) { resolve([]); return; }
    const req = os.index('id_partido').getAll(idPartido);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

/* Todo lo que un partido tiene guardado localmente, de una. */
export async function cargarPartidoCompleto(idPartido) {
  const [cabecera, eventos, snapshots, recorridos, stints, secuencias] = await Promise.all([
    leer('partidos', idPartido),
    leerPorPartido('eventos', idPartido),
    leerPorPartido('snapshots', idPartido),
    leerPorPartido('recorridos', idPartido),
    leerPorPartido('stints', idPartido),
    leerPorPartido('secuencias', idPartido),
  ]);
  return { cabecera: cabecera || null, eventos, snapshots, recorridos, stints, secuencias };
}

export async function borrarPartidoCompleto(idPartido) {
  const partes = ['eventos', 'snapshots', 'recorridos', 'stints', 'secuencias'];
  for (const store of partes) {
    const filas = await leerPorPartido(store, idPartido);
    const clave = STORES[store].key;
    for (const f of filas) await borrar(store, f[clave]);
  }
  await borrar('partidos', idPartido);
}

/* Cuánto espacio nos está dando el navegador. Se muestra en pantalla porque
   el que carga un partido entero offline necesita saber si le va a entrar. */
export async function espacioDisponible() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usadoMB: usage / 1048576, totalMB: quota / 1048576 };
  } catch {
    return null;
  }
}

/* Pide persistencia para que el navegador no evacúe la base bajo presión de
   disco. Sin esto, Safari puede borrar todo a los 7 días de inactividad. */
export async function pedirPersistencia() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
