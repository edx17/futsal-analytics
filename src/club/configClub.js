/* CONFIGURADOR GENERAL DEL CLUB: ramas, país, ligas y categorías.
 *
 * Vive en la tabla clubes (pais, ramas, ligas, categorias; migración
 * 20261119120000_club_configurador.sql). Las categorías se siguen guardando
 * por nombre en cada tabla; esto define cuáles existen, en qué orden y en qué
 * ligas juegan. Si el club no configuró nada, la app hace lo de siempre
 * (deduce las categorías de los datos).
 *
 * Nombre libre: el club escribe "Primera", "Primera Femenina", "Sub-17",
 * "Promocional 2014"… La rama es un dato de la categoría (y un filtro), no
 * parte obligatoria del nombre.
 */
import { normCat } from '../utils/categorias';

export const RAMAS = ['Masculino', 'Femenino'];

export const TIPOS = {
  division: 'División',
  sub: 'Sub (por edad)',
  promocional: 'Promocional (por año)',
  otra: 'Otra',
};

/* Las ligas que vienen armadas por país. Sólo se precargan las categorías de
   las que la nomenclatura es segura; el resto se arma con los modelos. */
export const PAISES = [
  {
    id: 'AR', nombre: 'Argentina', ligas: [
      { id: 'afa', nombre: 'AFA', nota: 'Primera A, B, C y D', modelo: 'afa' },
      { id: 'futsala', nombre: 'Futsala', nota: '' },
      { id: 'lamba', nombre: 'LAMBA', nota: '' },
    ],
  },
  { id: 'UY', nombre: 'Uruguay', ligas: [] },
  { id: 'PY', nombre: 'Paraguay', ligas: [] },
  { id: 'CL', nombre: 'Chile', ligas: [] },
  { id: 'BR', nombre: 'Brasil', ligas: [] },
  { id: 'ES', nombre: 'España', ligas: [] },
  { id: 'OTRO', nombre: 'Otro país', ligas: [] },
];

export const paisPorId = (id) => PAISES.find((p) => p.id === id) || null;

/* Modelos para sumar varias categorías de una vez. `anioJuego`: la temporada
   (para las promocionales, que van por año de nacimiento). */
export const MODELOS = [
  { id: 'afa', nombre: 'AFA: Primera y Tercera a Octava', armar: () => ['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava'].map((n) => ({ nombre: n, tipo: 'division' })) },
  { id: 'divisional', nombre: 'Divisional: Primera a Octava', armar: () => ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava'].map((n) => ({ nombre: n, tipo: 'division' })) },
  { id: 'reserva', nombre: 'Primera, Reserva y Única', armar: () => ['Primera', 'Reserva', 'Única'].map((n) => ({ nombre: n, tipo: 'division' })) },
  { id: 'sub', nombre: 'Sub-21 a Sub-13', armar: () => [21, 19, 17, 15, 13].map((e) => ({ nombre: `Sub-${e}`, tipo: 'sub', edad_max: e })) },
  {
    id: 'promocional', nombre: 'Promocionales por año de nacimiento', armar: ({ anioJuego = new Date().getFullYear(), desde = 7, hasta = 12 } = {}) => {
      const r = [];
      for (let edad = desde; edad <= hasta; edad += 1) r.push({ nombre: `Promocional ${anioJuego - edad}`, tipo: 'promocional', anio: anioJuego - edad });
      return r;
    },
  },
];

/* Normaliza lo que viene de la base (o de la pantalla). */
export function normalizarConfig(club = {}) {
  const ramas = (Array.isArray(club.ramas) ? club.ramas : []).filter((r) => RAMAS.includes(r));
  const ligas = (Array.isArray(club.ligas) ? club.ligas : [])
    .filter((l) => l && String(l.nombre || '').trim())
    .map((l) => ({ id: String(l.id || idDeLiga(l.nombre)), nombre: String(l.nombre).trim() }));
  const idsLigas = new Set(ligas.map((l) => l.id));
  const categorias = (Array.isArray(club.categorias) ? club.categorias : [])
    .filter((c) => c && String(c.nombre || '').trim())
    .map((c) => ({
      nombre: String(c.nombre).trim(),
      rama: RAMAS.includes(c.rama) ? c.rama : (ramas[0] || 'Masculino'),
      ligas: (Array.isArray(c.ligas) ? c.ligas : []).filter((id) => idsLigas.has(id)),
      tipo: TIPOS[c.tipo] ? c.tipo : 'division',
      edad_max: c.edad_max != null && c.edad_max !== '' ? Number(c.edad_max) : null,
      anio: c.anio != null && c.anio !== '' ? Number(c.anio) : null,
      activa: c.activa !== false,
    }));
  return { pais: club.pais || null, ramas, ligas, categorias };
}

export const idDeLiga = (nombre) => normCat(nombre).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `liga_${Date.now()}`;

/** ¿El club ya configuró sus categorías? Si no, la app deduce de los datos. */
export const hayConfig = (config) => (config?.categorias || []).length > 0;

/** Las categorías activas, en el orden del configurador (opcional: de una rama). */
export const categoriasActivas = (config, rama = null) =>
  (config?.categorias || []).filter((c) => c.activa && (!rama || c.rama === rama)).map((c) => c.nombre);

/** Errores para no dejar guardar: { 'cat.3': 'texto', 'liga.1': 'texto' }. */
export function erroresConfig(config) {
  const e = {};
  const vistas = new Set();
  (config.ligas || []).forEach((l, i) => {
    const k = normCat(l.nombre);
    if (!k) e[`liga.${i}`] = 'Poné el nombre de la liga.';
    else if (vistas.has(k)) e[`liga.${i}`] = 'Esa liga ya está.';
    vistas.add(k);
  });
  const cats = new Set();
  (config.categorias || []).forEach((c, i) => {
    const k = normCat(c.nombre);
    if (!k) e[`cat.${i}`] = 'Poné el nombre.';
    else if (cats.has(k)) e[`cat.${i}`] = 'Ya hay una categoría con ese nombre.';
    cats.add(k);
    if (c.tipo === 'sub' && !(Number(c.edad_max) > 0)) e[`cat.${i}`] = e[`cat.${i}`] || 'Falta la edad (Sub-…).';
    if (c.tipo === 'promocional' && !(Number(c.anio) > 1900)) e[`cat.${i}`] = e[`cat.${i}`] || 'Falta el año de nacimiento.';
  });
  return e;
}

/** Suma las categorías de un modelo (sin repetir nombres), con rama y liga. */
export function sumarModelo(config, modeloId, { rama, ligaId = null, anioJuego, desde, hasta } = {}) {
  const modelo = MODELOS.find((m) => m.id === modeloId);
  if (!modelo) return config;
  const ya = new Set((config.categorias || []).map((c) => normCat(c.nombre)));
  const nuevas = modelo.armar({ anioJuego, desde, hasta })
    .filter((c) => !ya.has(normCat(c.nombre)))
    .map((c) => ({ edad_max: null, anio: null, ...c, rama: rama || config.ramas?.[0] || 'Masculino', ligas: ligaId ? [ligaId] : [], activa: true }));
  return { ...config, categorias: [...(config.categorias || []), ...nuevas] };
}

/** Las categorías que aparecen en los datos y no están configuradas (para unificar o sumar). */
export function sinConfigurar(config, categoriasEnDatos = []) {
  const conf = new Set((config?.categorias || []).map((c) => normCat(c.nombre)));
  return [...new Set(categoriasEnDatos.filter(Boolean))].filter((c) => !conf.has(normCat(c)));
}

/** La configurada que más se parece (mismo nombre sin acentos/mayúsculas, o 3ra ↔ Tercera). */
const ORDINALES = { '1ra': 'primera', '2da': 'segunda', '3ra': 'tercera', '4ta': 'cuarta', '5ta': 'quinta', '6ta': 'sexta', '7ma': 'septima', '8va': 'octava' };
export function parecida(config, nombre) {
  const n = normCat(nombre).replace(/\s+/g, '');
  const largo = ORDINALES[n] || n;
  return (config?.categorias || []).find((c) => {
    const k = normCat(c.nombre).replace(/\s+/g, '');
    return k === largo || k === n;
  })?.nombre || null;
}

/** Sugerencia de categoría por fecha de nacimiento (sub y promocionales), para una temporada. */
export function categoriaPorEdad(config, fechaNacimiento, anioJuego = new Date().getFullYear(), rama = null) {
  const anio = Number(String(fechaNacimiento || '').slice(0, 4));
  if (!anio) return null;
  const cats = (config?.categorias || []).filter((c) => c.activa && (!rama || c.rama === rama));
  const promo = cats.find((c) => c.tipo === 'promocional' && Number(c.anio) === anio);
  if (promo) return promo.nombre;
  const edad = anioJuego - anio;
  const subs = cats.filter((c) => c.tipo === 'sub' && edad <= Number(c.edad_max)).sort((a, b) => a.edad_max - b.edad_max);
  return subs[0]?.nombre || null;
}

/**
 * La regla única para cualquier lista de categorías que muestre la app:
 * sin configurador, la lista tal cual (como siempre); con configurador, las
 * activas del club en su orden y, al final, las que aparezcan en `deDatos`
 * sin estar configuradas (para no esconder datos viejos).
 * `soloLasDeDatos`: para filtros de consulta, sólo las que tienen datos
 * (en el orden del club).
 */
export function segunClub(deDatos = [], config, { soloLasDeDatos = false } = {}) {
  const lista = (deDatos || []).filter(Boolean);
  if (!hayConfig(config)) return lista;
  const conDatos = new Set(lista.map(normCat));
  const activas = categoriasActivas(config).filter((c) => !soloLasDeDatos || conDatos.has(normCat(c)));
  const vistas = new Set(activas.map(normCat));
  // Lo que tiene datos y no está entre las activas: primero las inactivas del club (en su orden), después las desconocidas.
  const orden = config.categorias.map((c) => normCat(c.nombre));
  const extra = [...new Map(lista.map((c) => [normCat(c), c])).entries()]
    .filter(([k]) => !vistas.has(k))
    .sort(([a], [b]) => (orden.indexOf(a) === -1 ? 999 : orden.indexOf(a)) - (orden.indexOf(b) === -1 ? 999 : orden.indexOf(b)))
    .map(([, c]) => c);
  return [...activas, ...extra];
}
