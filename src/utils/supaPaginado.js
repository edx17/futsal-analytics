// ─────────────────────────────────────────────────────────────────────────────
// supaPaginado.js — lectura sin techo de filas contra Supabase / PostgREST
//
// PostgREST corta TODA respuesta en 1000 filas (db-max-rows), sin importar el
// .limit() que se le pase y SIN AVISAR: la query devuelve 200 OK con data
// recortada. Ya nos comió eventos en JugadorPerfil.jsx; con los clips de video
// el techo se alcanza todavía más rápido.
//
// Regla del módulo: ninguna pantalla vuelve a hacer .select() a pelo sobre una
// tabla que pueda superar las 1000 filas. Se usa fetchPaginado / fetchKeyset.
// ─────────────────────────────────────────────────────────────────────────────

export const TAM_PAGINA = 1000;

/**
 * Recorre una query de a páginas con .range() hasta agotar la tabla.
 *
 * IMPORTANTE: `construirQuery` tiene que DEVOLVER UN BUILDER NUEVO en cada
 * llamada. Los builders de supabase-js son "thenables" de un solo uso: si le
 * pasás el mismo objeto dos veces, la segunda vuelve vacía o repite la primera
 * página.
 *
 *   const filas = await fetchPaginado(() =>
 *     supabase.from('eventos').select('*').eq('id_partido', id).order('id')
 *   );
 *
 * OJO CON EL ORDEN: .range() es un OFFSET. Si el .order() no es determinista
 * (ej. ordenar sólo por `fecha` con fechas repetidas), Postgres puede devolver
 * la misma fila en dos páginas y perder otra. Ordená siempre por algo único, o
 * agregá `id` como criterio de desempate:
 *
 *   .order('created_at', { ascending: false }).order('id', { ascending: false })
 *
 * @param {() => object} construirQuery  Fábrica de builders de supabase-js.
 * @param {object}  [opciones]
 * @param {number}  [opciones.tamPagina=1000]
 * @param {number}  [opciones.maxPaginas=200]  Freno de mano: 200k filas.
 * @param {(n:number)=>void} [opciones.onProgreso]  Se llama con el acumulado.
 * @returns {Promise<Array>} Todas las filas concatenadas.
 */
export async function fetchPaginado(construirQuery, opciones = {}) {
  const {
    tamPagina = TAM_PAGINA,
    maxPaginas = 200,
    onProgreso = null,
  } = opciones;

  const acumulado = [];

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const desde = pagina * tamPagina;
    const { data, error } = await construirQuery().range(desde, desde + tamPagina - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    acumulado.push(...data);
    if (onProgreso) onProgreso(acumulado.length);

    // Página incompleta = era la última. Nos ahorramos un round-trip vacío.
    if (data.length < tamPagina) break;
  }

  return acumulado;
}

/**
 * Paginado por cursor (keyset). Más rápido que fetchPaginado en tablas grandes:
 * .range() obliga a Postgres a contar y descartar `desde` filas en cada página
 * (O(n²) sobre el total), mientras que el cursor entra directo por índice.
 *
 * Requiere una columna ordenable y única (típicamente `id` o `created_at`+`id`).
 * No le pases un .order() propio: lo pone esta función.
 *
 *   const clips = await fetchKeyset(() =>
 *     supabase.from('video_clips').select('*').eq('club_id', clubId)
 *   );
 *
 * @param {() => object} construirQuery
 * @param {object}  [opciones]
 * @param {string}  [opciones.columna='id']
 * @param {boolean} [opciones.ascendente=true]
 * @param {number}  [opciones.tamPagina=1000]
 * @param {number}  [opciones.maxPaginas=200]
 * @returns {Promise<Array>}
 */
export async function fetchKeyset(construirQuery, opciones = {}) {
  const {
    columna = 'id',
    ascendente = true,
    tamPagina = TAM_PAGINA,
    maxPaginas = 200,
    onProgreso = null,
  } = opciones;

  const acumulado = [];
  let cursor = null;

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    let q = construirQuery().order(columna, { ascending: ascendente }).limit(tamPagina);
    if (cursor !== null && cursor !== undefined) {
      q = ascendente ? q.gt(columna, cursor) : q.lt(columna, cursor);
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    acumulado.push(...data);
    if (onProgreso) onProgreso(acumulado.length);

    cursor = data[data.length - 1][columna];
    if (data.length < tamPagina || cursor === null || cursor === undefined) break;
  }

  return acumulado;
}

/**
 * Trae TODAS las páginas en paralelo, en vez de una detrás de otra.
 *
 * `fetchPaginado` y `fetchKeyset` piden una página, esperan, piden la
 * siguiente. Con 25.000 filas eso son 25 idas y vueltas encadenadas: en un
 * teléfono con 4G, unos 7 segundos de reloj esperando, sin contar la descarga.
 * Pero el tope de 1000 filas es del servidor, no un límite real: si se sabe
 * cuántas filas hay, todas las páginas se pueden pedir de una.
 *
 * La primera página viene con `count: 'exact'`, que devuelve el total en la
 * misma respuesta sin costar un viaje aparte. Con ese número se disparan las
 * demás de a tandas.
 *
 * DOS CONDICIONES:
 *
 *  1. La query TIENE que llevar un `.order()` determinista (por `id`, o por lo
 *     que sea más `id` de desempate). Las páginas se piden por OFFSET y en
 *     paralelo: sin un orden estable, dos páginas pueden traer la misma fila.
 *
 *  2. `construirQuery` recibe las opciones del `.select()` y las tiene que
 *     pasar tal cual, para que la primera página pueda pedir el conteo:
 *
 *       fetchParalelo((opts) =>
 *         supabase.from('eventos').select('*', opts)
 *           .in('id_partido', ids).order('id'))
 *
 * @param {(opcionesSelect?: object) => object} construirQuery
 * @param {object} [opciones]
 * @param {number} [opciones.tamPagina=1000]
 * @param {number} [opciones.concurrencia=6]
 * @param {number} [opciones.maxPaginas=200]
 * @param {(traidas:number, total:number)=>void} [opciones.onProgreso]
 * @returns {Promise<Array>}
 */
export async function fetchParalelo(construirQuery, opciones = {}) {
  const {
    tamPagina = TAM_PAGINA,
    concurrencia = 6,
    maxPaginas = 200,
    onProgreso = null,
  } = opciones;

  const primera = await construirQuery({ count: 'exact' }).range(0, tamPagina - 1);
  if (primera.error) throw primera.error;

  const cabeza = primera.data || [];

  // Entró todo en la primera página: no hay nada más que pedir.
  if (cabeza.length < tamPagina) {
    if (onProgreso) onProgreso(cabeza.length, cabeza.length);
    return cabeza;
  }

  /* Sin conteo no se puede repartir el trabajo, y dar por terminado acá
     recortaría la tabla en 1000 filas sin avisar —que es justo el error que
     este módulo existe para evitar—. Se sigue de a una, que es lento pero
     trae todo. */
  if (primera.count == null) {
    const resto = await fetchPaginado(construirQuery, { tamPagina, maxPaginas, onProgreso: null });
    const filas = resto.length > cabeza.length ? resto : cabeza;
    if (onProgreso) onProgreso(filas.length, filas.length);
    return filas;
  }

  const total = primera.count;
  if (onProgreso) onProgreso(cabeza.length, total);
  if (total <= tamPagina) return cabeza;

  const paginas = Math.min(Math.ceil(total / tamPagina), maxPaginas);
  const porPagina = new Array(paginas);
  porPagina[0] = cabeza;
  let traidas = cabeza.length;

  const pendientes = [];
  for (let p = 1; p < paginas; p++) pendientes.push(p);

  for (let i = 0; i < pendientes.length; i += concurrencia) {
    const tanda = pendientes.slice(i, i + concurrencia);
    await Promise.all(tanda.map(async (p) => {
      const desde = p * tamPagina;
      const { data, error } = await construirQuery().range(desde, desde + tamPagina - 1);
      if (error) throw error;
      porPagina[p] = data || [];
      traidas += porPagina[p].length;
      if (onProgreso) onProgreso(traidas, total);
    }));
  }

  return porPagina.flat();
}

/**
 * Resuelve un `.in('col', ids)` grande partiéndolo en lotes.
 *
 * Dos límites distintos que conviene no confundir:
 *  - supabase-js manda GET, así que la lista de IDs viaja en la URL. Con UUIDs,
 *    pasadas ~150 entradas el servidor empieza a rechazar por largo de URI.
 *  - Y la respuesta de cada lote sigue teniendo el techo de 1000 filas, por eso
 *    cada lote se pagina internamente.
 *
 *   const eventos = await fetchPorLotes(idsPartidos, (lote) =>
 *     supabase.from('eventos').select('*').in('id_partido', lote).order('id')
 *   );
 *
 * @param {Array} ids
 * @param {(lote:Array) => object} construirQuery  Recibe el lote, devuelve builder nuevo.
 * @param {object} [opciones]
 * @param {number} [opciones.tamLote=60]
 * @param {number} [opciones.concurrencia=3]  Lotes en paralelo. Subirlo acelera,
 *                                            pero pega más fuerte contra el rate limit.
 * @param {(avance:{lotesHechos:number,lotesTotal:number,filas:number})=>void} [opciones.onProgreso]
 *        Se llama al terminar cada tanda. Sirve para que la pantalla muestre
 *        un avance real en vez de un spinner que no dice nada: cuando la
 *        espera son varios segundos, saber que van 3 de 8 es la diferencia
 *        entre esperar y pensar que se colgó.
 * @returns {Promise<Array>}
 */
export async function fetchPorLotes(ids, construirQuery, opciones = {}) {
  const { tamLote = 60, concurrencia = 3, paginarLote = true, onProgreso = null } = opciones;

  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (unicos.length === 0) {
    // Avisar igual, para que quien mire el avance no quede esperando en cero.
    if (onProgreso) onProgreso({ lotesHechos: 0, lotesTotal: 0, filas: 0 });
    return [];
  }

  const lotes = [];
  for (let i = 0; i < unicos.length; i += tamLote) {
    lotes.push(unicos.slice(i, i + tamLote));
  }

  const acumulado = [];

  for (let i = 0; i < lotes.length; i += concurrencia) {
    const tanda = lotes.slice(i, i + concurrencia);
    const resultados = await Promise.all(
      tanda.map(async (lote) => {
        if (paginarLote) return fetchPaginado(() => construirQuery(lote));
        const { data, error } = await construirQuery(lote);
        if (error) throw error;
        return data || [];
      })
    );
    resultados.forEach((filas) => acumulado.push(...filas));
    if (onProgreso) {
      onProgreso({
        lotesHechos: Math.min(i + concurrencia, lotes.length),
        lotesTotal: lotes.length,
        filas: acumulado.length,
      });
    }
  }

  return acumulado;
}

/**
 * Cuenta filas sin traerlas. `head: true` no descarga ni una fila: es una
 * consulta de COUNT pura. Usalo para badges y contadores en vez de traer todo
 * el set y hacer .length.
 *
 *   const total = await contarFilas(() =>
 *     supabase.from('video_clips').select('id', { count: 'exact', head: true }).eq('club_id', clubId)
 *   );
 */
export async function contarFilas(construirQuery) {
  const { count, error } = await construirQuery();
  if (error) throw error;
  return count || 0;
}

/**
 * Índice por clave, para hacer los joins en JS (convención del proyecto: no se
 * usa la sintaxis de embed de PostgREST para relaciones grandes, porque no se
 * puede paginar el lado embebido y se recorta en silencio).
 */
export function indexarPor(filas, clave = 'id') {
  const m = new Map();
  (filas || []).forEach((f) => {
    if (f && f[clave] != null) m.set(f[clave], f);
  });
  return m;
}

/** Igual que indexarPor pero agrupando: Map<clave, Array<fila>>. */
export function agruparPor(filas, clave) {
  const m = new Map();
  (filas || []).forEach((f) => {
    const k = typeof clave === 'function' ? clave(f) : f?.[clave];
    if (k == null) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  });
  return m;
}