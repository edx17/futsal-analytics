/* ══════════════════════════════════════════════════════════════════════════
   REGLAS DE TESORERÍA

   Lo que decide quién maneja la plata, qué fecha lleva un movimiento, a qué
   deuda se aplica un cobro y cómo se reconoce a un empleado en los pagos.
   Sin Supabase ni React: se prueba solo.
   ══════════════════════════════════════════════════════════════════════════ */

/** Quién entra y edita Tesorería, Empleados y Sponsors. */
export const ROLES_PLATA = ['superuser', 'admin', 'manager', 'tesorero'];
export const manejaPlata = (rol) => ROLES_PLATA.includes(String(rol || '').toLowerCase());

/** Hoy en la hora del dispositivo (Argentina), no en UTC.
    `toISOString()` a las 22 h ya da el día siguiente. */
export const hoyLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Último día del mes `AAAA-MM`, como fecha `AAAA-MM-DD`. */
export const ultimoDiaDelMes = (periodo) => {
  const [a, m] = periodo.split('-').map(Number);
  return `${periodo}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};

export const saldoDe = (d) => Math.max(0, (Number(d?.monto_original) || 0) - (Number(d?.monto_pagado) || 0));

const esPendiente = (d) => ['pendiente', 'parcial'].includes(String(d?.estado || '').toLowerCase());

/** Pendientes de la más vieja a la más nueva: vencimiento, después mes. Sin
    fecha, al final. Es el orden en que se cobra y se beca. */
export function pendientesPorAntiguedad(deudas = []) {
  const clave = (d) => d.fecha_vencimiento || (d.mes_correspondiente ? `${d.mes_correspondiente}-99` : '9999');
  return deudas.filter(esPendiente).sort((a, b) => clave(a).localeCompare(clave(b)) || String(a.id).localeCompare(String(b.id)));
}

/** Valida un cobro contra lo que falta pagar de esa deuda. */
export function validarCobro(deuda, monto) {
  const m = Number(monto);
  const saldo = saldoDe(deuda);
  if (!m || m <= 0) return { ok: false, error: 'Ingresá un monto válido.' };
  if (m > saldo + 0.005) return { ok: false, error: `Esa cuota debe $${saldo.toLocaleString('es-AR')}. No se puede cobrar más que eso.` };
  const pagado = (Number(deuda.monto_pagado) || 0) + m;
  return { ok: true, monto: m, pagado, estado: pagado + 0.005 >= Number(deuda.monto_original) ? 'Pagada' : 'Parcial' };
}

/** Cómo queda la deuda si se anula un cobro de `monto`. */
export function deudaSinCobro(deuda, monto) {
  const pagado = Math.max(0, (Number(deuda.monto_pagado) || 0) - (Number(monto) || 0));
  return { monto_pagado: pagado, estado: pagado > 0.005 ? 'Parcial' : 'Pendiente' };
}

/** "Pérez, Juan", "juan perez" y "Juan  Pérez" son la misma persona. */
export const claveNombre = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ');

const esComision = (p) => String(p.descripcion || '').toLowerCase().includes('comisión');
const esSueldo = (p) => p.categoria === 'Sueldos y Viáticos' || p.categoria === 'Sueldos';

/** ¿Este egreso es de este empleado? Por id si lo tiene; los viejos, por nombre
    (el del empleado o el del jugador vinculado, en cualquier orden). */
export function esDelEmpleado(pago, emp, jugador = null) {
  if (pago.empleado_id != null && pago.empleado_id !== '') return String(pago.empleado_id) === String(emp.id);
  const r = claveNombre(pago.responsable);
  if (!r) return false;
  if (r === claveNombre(emp.nombre_completo)) return true;
  return !!jugador && r === claveNombre(`${jugador.nombre} ${jugador.apellido}`);
}

/** Sueldo o viático del mes (el primero) y las comisiones sumadas. */
export function liquidacionDelMes(emp, pagosMes = [], jugador = null) {
  const suyos = pagosMes.filter((p) => esDelEmpleado(p, emp, jugador));
  return {
    pagoEsteMes: suyos.find((p) => esSueldo(p) && !esComision(p)) || null,
    bonosExtra: suyos.filter(esComision).reduce((a, p) => a + (Number(p.monto) || 0), 0),
  };
}

/** Error de PostgREST/Postgres por columna que todavía no existe (migración
    sin correr). Sirve para reintentar sin `empleado_id`. */
export const faltaColumna = (error) =>
  !!error && (error.code === 'PGRST204' || error.code === '42703' || /column .* does not exist|Could not find the .* column/i.test(error.message || ''));

/** Ficha de empleado vacía, y la de uno existente lista para el formulario. */
export const FICHA_VACIA = {
  id: null, nombre_completo: '', dni: '', telefono: '', direccion: '', cbu: '', alias: '', banco: '',
  rol: '', sueldo_base: '', fecha_ingreso: '', estado: 'Activo', jugador_id: '',
};

export const fichaDe = (emp) => ({
  ...FICHA_VACIA,
  ...Object.fromEntries(Object.entries(emp || {}).filter(([k]) => k in FICHA_VACIA).map(([k, v]) => [k, v ?? ''])),
  estado: emp?.estado || 'Activo',
});
