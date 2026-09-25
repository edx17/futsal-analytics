import { describe, it, expect } from 'vitest';
import {
  manejaPlata, hoyLocal, ultimoDiaDelMes, pendientesPorAntiguedad, validarCobro, deudaSinCobro,
  claveNombre, esDelEmpleado, liquidacionDelMes, faltaColumna, fichaDe,
  numeroRecibo, textoRecibo, mensajeError, rpcInexistente,
} from '../tesoreria';

describe('manejaPlata', () => {
  it('superuser, admin, manager y tesorero; nadie más', () => {
    ['superuser', 'admin', 'Manager', 'TESORERO'].forEach((r) => expect(manejaPlata(r)).toBe(true));
    ['ct', 'jugador', '', null, undefined].forEach((r) => expect(manejaPlata(r)).toBe(false));
  });
});

describe('fechas', () => {
  it('hoyLocal usa la fecha del dispositivo, no UTC', () => {
    // 31/10 a las 23:30 hora local sigue siendo 31/10
    expect(hoyLocal(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-31');
    expect(hoyLocal(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  it('ultimoDiaDelMes', () => {
    expect(ultimoDiaDelMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29');
    expect(ultimoDiaDelMes('2026-09')).toBe('2026-09-30');
  });
});

describe('pendientesPorAntiguedad', () => {
  it('la más vieja primero y sólo pendientes o parciales', () => {
    const deudas = [
      { id: 3, estado: 'Pendiente', fecha_vencimiento: '2026-09-10' },
      { id: 1, estado: 'Pagada', fecha_vencimiento: '2026-07-10' },
      { id: 2, estado: 'Parcial', fecha_vencimiento: '2026-08-10' },
      { id: 4, estado: 'Beca', fecha_vencimiento: '2026-06-10' },
      { id: 5, estado: 'Pendiente', mes_correspondiente: '2026-07' },
      { id: 6, estado: 'Pendiente' },
    ];
    expect(pendientesPorAntiguedad(deudas).map((d) => d.id)).toEqual([5, 2, 3, 6]);
  });
});

describe('validarCobro', () => {
  const deuda = { monto_original: 25000, monto_pagado: 10000 };
  it('no deja cobrar más que el saldo', () => {
    const r = validarCobro(deuda, 30000);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/15/);
  });
  it('parcial y total', () => {
    expect(validarCobro(deuda, 5000)).toMatchObject({ ok: true, pagado: 15000, estado: 'Parcial' });
    expect(validarCobro(deuda, 15000)).toMatchObject({ ok: true, pagado: 25000, estado: 'Pagada' });
  });
  it('monto inválido', () => {
    expect(validarCobro(deuda, 0).ok).toBe(false);
    expect(validarCobro(deuda, '').ok).toBe(false);
    expect(validarCobro(deuda, -5).ok).toBe(false);
  });
});

describe('deudaSinCobro', () => {
  it('anular devuelve el saldo y el estado', () => {
    expect(deudaSinCobro({ monto_pagado: 25000 }, 10000)).toEqual({ monto_pagado: 15000, estado: 'Parcial' });
    expect(deudaSinCobro({ monto_pagado: 10000 }, 10000)).toEqual({ monto_pagado: 0, estado: 'Pendiente' });
    expect(deudaSinCobro({ monto_pagado: 5000 }, 10000)).toEqual({ monto_pagado: 0, estado: 'Pendiente' });
  });
});

describe('empleados en los pagos', () => {
  it('claveNombre ignora orden, tildes, comas y mayúsculas', () => {
    expect(claveNombre('Pérez, Juan')).toBe(claveNombre('juan  PEREZ'));
  });

  const emp = { id: 7, nombre_completo: 'Juan Pérez', jugador_id: 12 };
  const jugador = { id: 12, nombre: 'Juan Ignacio', apellido: 'Pérez' };

  it('por id cuando el egreso lo tiene, aunque el nombre no coincida', () => {
    expect(esDelEmpleado({ empleado_id: 7, responsable: 'Otro nombre' }, emp)).toBe(true);
    expect(esDelEmpleado({ empleado_id: 8, responsable: 'Juan Pérez' }, emp)).toBe(false);
  });
  it('los viejos, por nombre del empleado o del jugador en cualquier orden', () => {
    expect(esDelEmpleado({ responsable: 'Pérez, Juan' }, emp)).toBe(true);
    expect(esDelEmpleado({ responsable: 'Pérez, Juan Ignacio' }, emp, jugador)).toBe(true);
    expect(esDelEmpleado({ responsable: 'Tesorero/Admin' }, emp, jugador)).toBe(false);
  });
  it('liquidacionDelMes separa sueldo de comisiones', () => {
    const pagos = [
      { empleado_id: 7, categoria: 'Sueldos y Viáticos', monto: 50000, descripcion: 'Viático de AGOSTO (Vía Efectivo)' },
      { responsable: 'Pérez, Juan Ignacio', categoria: 'Sueldos y Viáticos', monto: 3000, descripcion: 'Comisión 10% por Sponsor: X' },
      { empleado_id: 9, categoria: 'Sueldos y Viáticos', monto: 99, descripcion: 'Sueldo' },
    ];
    const r = liquidacionDelMes(emp, pagos, jugador);
    expect(r.pagoEsteMes.monto).toBe(50000);
    expect(r.bonosExtra).toBe(3000);
    expect(liquidacionDelMes({ id: 1, nombre_completo: 'Nadie' }, pagos).pagoEsteMes).toBeNull();
  });
});

describe('faltaColumna', () => {
  it('reconoce la columna que todavía no existe', () => {
    expect(faltaColumna({ code: 'PGRST204', message: "Could not find the 'empleado_id' column" })).toBe(true);
    expect(faltaColumna({ code: '42703', message: 'column "empleado_id" does not exist' })).toBe(true);
    expect(faltaColumna({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(faltaColumna(null)).toBe(false);
  });
});

describe('fichaDe', () => {
  it('rellena vacíos y deja afuera lo que no es de la ficha', () => {
    const f = fichaDe({ id: 3, nombre_completo: 'Ana', dni: null, club_id: 'x', estado: null });
    expect(f).toMatchObject({ id: 3, nombre_completo: 'Ana', dni: '', estado: 'Activo', cbu: '' });
    expect(f.club_id).toBeUndefined();
  });
});

describe('recibos', () => {
  it('numeroRecibo', () => {
    expect(numeroRecibo(12)).toBe('000012');
    expect(numeroRecibo(null)).toBe('s/n');
  });
  it('textoRecibo', () => {
    const t = textoRecibo({ club: { nombre: 'Club Ejemplo' }, jugador: { nombre: 'Ana', apellido: 'Uno' }, pago: { recibo_numero: 3, monto: 25000, concepto: 'Cuota agosto', fecha_pago: '2026-09-25', metodo_pago: 'Efectivo' } });
    expect(t).toContain('N° 000003');
    expect(t).toContain('Ana Uno');
    expect(t).toContain('25.000');
    expect(t).toContain('25/09/2026');
    expect(textoRecibo({ club: {}, jugador: {}, pago: { monto: 1, anulado_at: 'x' } })).toContain('ANULADO');
  });
  it('mensajeError', () => {
    expect(mensajeError({ code: '22023', message: 'Esa cuota debe $1.' })).toBe('Esa cuota debe $1.');
    expect(mensajeError({ code: '42501', message: 'permission denied' })).toBe('No tenés permiso para hacer esto.');
    expect(mensajeError({ code: 'XX', message: 'x' }, 'fallo')).toBe('fallo');
    expect(rpcInexistente({ code: 'PGRST202' })).toBe(true);
  });
});
