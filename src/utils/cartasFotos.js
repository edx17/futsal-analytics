import { supabase } from '../supabase';

/* FOTOS ESPECIALES DE LAS CARTAS
 *
 * Una carta especial (TOTW, TOTM, TOTY…) puede llevar una foto propia, como las
 * ediciones limitadas del FIFA. Se guarda en `cartas_fotos` por (club, clave de la
 * carta), antes o después de publicar el catálogo (migración
 * 20261011160000_cartas_fotos_especiales.sql). La imagen va al bucket público
 * "foto", el mismo del plantel, en cartas/<club>/.
 */

import { aSepia } from './sepia';

const BUCKET = 'foto';
const MAX_LADO = 700;

export const MENSAJE_SIN_FOTOS =
  'Falta crear la tabla de fotos especiales: hay que correr la migración 20261011160000_cartas_fotos_especiales.sql en Supabase.';

const faltaLaTabla = (err) => err?.code === '42P01' || err?.code === 'PGRST205' || /cartas_fotos/i.test(err?.message || '');

/** Las fotos especiales del club: Map clave → url. Si la tabla no existe todavía, vacío (la app sigue andando). */
export async function listarFotos(clubId) {
  const { data, error } = await supabase.from('cartas_fotos').select('clave,url').eq('club_id', clubId).range(0, 4999);
  if (error) {
    if (!faltaLaTabla(error)) console.error('cartas_fotos:', error.message);
    return new Map();
  }
  return new Map((data || []).map((f) => [f.clave, f.url]));
}

/* Achica la imagen (las fotos del celular pesan varios MB). Si es PNG o WebP se
   mantiene el formato, para no perder el fondo transparente de los recortes.
   `sepia`: la pasa a sepia (las cartas de Héroes). Se hace acá, en la imagen, y
   no con un filtro CSS, porque las placas exportadas no ven los filtros. */
export async function reducirImagen(archivo, maxLado = MAX_LADO, { sepia = false } = {}) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (sepia) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    aSepia(img.data);
    ctx.putImageData(img, 0, 0);
  }
  const conAlfa = /png|webp/i.test(archivo.type);
  const tipo = conAlfa ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo achicar la imagen.'))), tipo, 0.88));
  return { blob, ext: conAlfa ? 'png' : 'jpg', tipo };
}

/* Las cartas de Héroes llevan la foto en sepia. */
const vaEnSepia = (clave) => String(clave || '').startsWith('HERO|');

const nombreSeguro = (clave) => String(clave).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** Sube la foto y la deja asociada a la carta. Devuelve la url pública. */
export async function subirFotoEspecial({ clubId, clave, archivo }) {
  if (!archivo || !/^image\//.test(archivo.type)) throw new Error('Elegí una imagen (PNG, JPG o WebP).');
  const { blob, ext, tipo } = await reducirImagen(archivo, MAX_LADO, { sepia: vaEnSepia(clave) });
  const ruta = `cartas/${clubId}/${nombreSeguro(clave)}-${Date.now()}.${ext}`;
  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, upsert: false });
  if (errSubida) throw errSubida;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const url = data.publicUrl;
  const { error } = await supabase.from('cartas_fotos')
    .upsert({ club_id: clubId, clave, url, updated_at: new Date().toISOString() }, { onConflict: 'club_id,clave' });
  if (error) {
    if (faltaLaTabla(error)) throw new Error(MENSAJE_SIN_FOTOS);
    throw error;
  }
  return url;
}

/** Vuelve a la foto del plantel. (La imagen subida queda en el bucket; no se borra.) */
export async function quitarFotoEspecial({ clubId, clave }) {
  const { error } = await supabase.from('cartas_fotos').delete().eq('club_id', clubId).eq('clave', clave);
  if (error) throw error;
}
