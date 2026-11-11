/* ANOTADOR · LO QUE SE MUESTRA (sin pantalla, para probarlo) */

export const TIPOS_NOTA = {
  general: { nombre: 'General', icono: 'nota', color: '#9ca3af' },
  video: { nombre: 'Videoanálisis', icono: 'video', color: '#f43f5e' },
  rival: { nombre: 'Rival', icono: 'rivales', color: '#f59e0b' },
  microciclo: { nombre: 'Microciclo', icono: 'microciclo', color: '#38bdf8' },
  sesion: { nombre: 'Sesión', icono: 'planificacion', color: '#00ff88' },
  partido: { nombre: 'Partido', icono: 'resumenPartido', color: '#a78bfa' },
};

/** 83 → "1:23"; 3725 → "1:02:05". */
export function minutoVideo(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const dos = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(r)}` : `${m}:${dos(r)}`;
}

/** "Rival · Dep. Merlo", "Videoanálisis · Final vs X", "General". */
export function etiquetaVinculo(n) {
  const t = TIPOS_NOTA[n?.vinculo_tipo || n?.tipo] || TIPOS_NOTA.general;
  const nombre = n?.vinculo_nombre ?? n?.nombre;
  return nombre && (n?.vinculo_tipo || n?.tipo) !== 'general' ? `${t.nombre} · ${nombre}` : t.nombre;
}

/** Fijadas primero; en un video, por minuto; si no, las más nuevas primero. */
export function ordenarNotas(notas = [], { porMinuto = false } = {}) {
  return [...notas].sort((a, b) => (Number(!!b.fijada) - Number(!!a.fijada))
    || (porMinuto && a.video_seg != null && b.video_seg != null ? a.video_seg - b.video_seg : 0)
    || (new Date(b.created_at) - new Date(a.created_at)));
}

/** Filtra por tipo, texto y "sólo mías". */
export function filtrarNotas(notas = [], { tipo = 'todas', texto = '', soloMias = false, yo = null } = {}) {
  const q = texto.trim().toLowerCase();
  return notas.filter((n) => (tipo === 'todas' || n.vinculo_tipo === tipo)
    && (!soloMias || n.autor === yo)
    && (!q || `${n.texto} ${n.vinculo_nombre || ''}`.toLowerCase().includes(q)));
}

/** "hace 5 min", "hace 3 h", "12/11". */
export function cuando(fecha, ahora = Date.now()) {
  const ms = ahora - new Date(fecha).getTime();
  if (!Number.isFinite(ms)) return '';
  if (ms < 60000) return 'recién';
  if (ms < 3600000) return `hace ${Math.floor(ms / 60000)} min`;
  if (ms < 86400000) return `hace ${Math.floor(ms / 3600000)} h`;
  const d = new Date(fecha);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
