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

/* ── Recibos y errores de la base (migración 20260927140000) ───────────── */

/** Número de recibo con ceros adelante: 12 → "000012". Sin número, "s/n". */
export const numeroRecibo = (n) => (n == null || n === '' ? 's/n' : String(n).padStart(6, '0'));

const pesos = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const fechaAR = (iso) => {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
};

/** El recibo como texto, para mandarlo por WhatsApp. */
export function textoRecibo({ club, jugador, pago }) {
  return [
    `🧾 *Recibo N° ${numeroRecibo(pago.recibo_numero)}* — ${club?.nombre || 'Club'}`,
    `Recibimos de ${[jugador?.nombre, jugador?.apellido].filter(Boolean).join(' ')} ${pesos(pago.monto)}`,
    pago.concepto ? `en concepto de ${pago.concepto}.` : null,
    `Fecha: ${fechaAR(pago.fecha_pago)} · ${pago.metodo_pago || 'Efectivo'}`,
    pago.anulado_at ? '⚠️ ESTE COBRO FUE ANULADO.' : '¡Gracias!',
  ].filter(Boolean).join('\n');
}

export { pesos as formatoPesos, fechaAR };

/** La función no existe en la base (migración sin correr). */
export const rpcInexistente = (error) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''));

/** Mensaje para mostrar de un error de la base al cobrar o anular. */
export function mensajeError(error, porDefecto = 'No se pudo completar.') {
  if (!error) return porDefecto;
  if (error.code === '42501') return error.message?.startsWith('No ') ? error.message : 'No tenés permiso para hacer esto.';
  if (['22023', 'P0002'].includes(error.code)) return error.message;
  return porDefecto;
}

/* ── Tarifas y hermanos (migración 20260927150000) ─────────────────────── */

/** Clave de un grupo familiar: "Pérez", " pérez " y "PÉREZ" son el mismo.
    (La base compara con lower(trim()), que respeta las tildes.) */
export const claveGrupo = (g) => String(g || '').trim().toLowerCase();

/** Los grupos de hermanos del club: sólo los que tienen 2 o más activos. */
export function gruposFamiliares(jugadores = []) {
  const grupos = new Map();
  jugadores.filter((j) => j.activo !== false && claveGrupo(j.grupo_familiar)).forEach((j) => {
    const k = claveGrupo(j.grupo_familiar);
    if (!grupos.has(k)) grupos.set(k, { clave: k, nombre: String(j.grupo_familiar).trim(), miembros: [] });
    grupos.get(k).miembros.push(j);
  });
  return [...grupos.values()]
    .map((g) => ({ ...g, miembros: g.miembros.sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es')) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Tabla no creada todavía (migración sin correr). */
export const faltaTabla = (error) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message || ''));
