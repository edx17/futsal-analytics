/* MODO GOD · USUARIOS: cuentas y filtros (sin pantalla ni base, para probarlos). */

export const FILTROS_USUARIOS = [
  ['todos', 'TODOS'], ['jugadores', 'JUGADORES'], ['staff', 'STAFF'], ['activos', 'JUEGAN'], ['sin_jugar', 'NUNCA JUGARON'], ['bloqueados', 'BLOQUEADOS'],
];

const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const jugo = (u) => (u.sobres || 0) + (u.vdraft || 0) > 0;

/** Los que pasan el filtro y la búsqueda (por nombre o categoría). */
export function filtrarUsuarios(lista = [], { texto = '', filtro = 'todos' } = {}) {
  const t = normal(texto).trim();
  return lista.filter((u) => {
    if (t && !normal(`${u.nombre} ${u.detalle || ''}`).includes(t)) return false;
    switch (filtro) {
      case 'jugadores': return u.tipo === 'jugador';
      case 'staff': return u.tipo === 'staff';
      case 'activos': return jugo(u);
      case 'sin_jugar': return !jugo(u);
      case 'bloqueados': return !!u.bloqueado;
      default: return true;
    }
  });
}

/** Los números de arriba: cuántos son, cuántos juegan, V-Coins en circulación, bloqueados. */
export function resumenUsuarios(lista = []) {
  return {
    total: lista.length,
    juegan: lista.filter(jugo).length,
    vcoins: lista.reduce((s, u) => s + (Number(u.puntos) || 0), 0),
    bloqueados: lista.filter((u) => u.bloqueado).length,
  };
}

/** El evento de V-Coins que corre ahora (el de mayor factor), o null. */
export function multiplicadorVigente(lista = [], ahora = new Date()) {
  const t = +ahora;
  return lista.filter((m) => m.activo !== false && +new Date(m.desde) <= t && t <= +new Date(m.hasta))
    .sort((a, b) => b.factor - a.factor)[0] || null;
}

/** 'APAGADO' | 'PROGRAMADO' | 'CORRIENDO' | 'TERMINÓ'. */
export function estadoMultiplicador(m, ahora = new Date()) {
  const t = +ahora;
  if (m.activo === false) return 'APAGADO';
  if (t < +new Date(m.desde)) return 'PROGRAMADO';
  return t > +new Date(m.hasta) ? 'TERMINÓ' : 'CORRIENDO';
}

export const FACTORES = [1.5, 2, 3];

/** Problemas que impiden guardar un evento de V-Coins. */
export function erroresMultiplicador(m = {}) {
  const e = [];
  if (!String(m.nombre || '').trim()) e.push('Ponele un nombre.');
  if (!(Number(m.factor) >= 1 && Number(m.factor) <= 5)) e.push('El factor va de 1 a 5.');
  if (!m.desde || !m.hasta) e.push('Poné desde y hasta.');
  else if (+new Date(m.hasta) <= +new Date(m.desde)) e.push('El fin tiene que ser después del inicio.');
  if (Array.isArray(m.aplica) && m.aplica.length === 0) e.push('Elegí al menos un juego.');
  return e;
}
