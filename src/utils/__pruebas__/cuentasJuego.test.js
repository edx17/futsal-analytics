import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { rpc: vi.fn(), auth: { signInWithOAuth: vi.fn(async () => ({ error: null })) } } }));

const { supabase } = await import('../../supabase');
const {
  linkInvitacion, estadoInvitacion, entrarConGoogle, tomarPendiente, resolverPendiente, errorDeEntrada,
} = await import('../cuentasJuego');

const memoria = () => {
  let m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, clear: () => { m = {}; } };
};

describe('juegos con Gmail: los links de hinchas', () => {
  it('arma el link', () => {
    expect(linkInvitacion('https://app.test', 'ABCD2345')).toBe('https://app.test/unirse/ABCD2345');
  });

  it('el estado: usos, tope, vencimiento y por qué no anda', () => {
    expect(estadoInvitacion({ usos: 1 })).toBe('1 USO');
    expect(estadoInvitacion({ usos: 3, max_usos: 10, vence: '2026-12-31' })).toBe('3/10 USOS · HASTA 31/12/2026');
    expect(estadoInvitacion({ usos: 0, motivo: 'Esta invitación está pausada.' })).toBe('ESTÁ PAUSADA');
  });
});

describe('juegos con Gmail: ir a Google y volver', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoria());
    vi.stubGlobal('window', { location: { origin: 'https://app.test' } });
    supabase.rpc.mockReset();
  });

  it('el celular deja de ser kiosco y lo pendiente se hace una sola vez', async () => {
    localStorage.setItem('kiosco_mode', 'true');
    localStorage.setItem('kiosco_token', 't-1');
    await entrarConGoogle({ accion: 'vincular', token: 't-1' });
    expect(localStorage.getItem('kiosco_mode')).toBe(null);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
    expect(tomarPendiente()).toEqual({ accion: 'vincular', token: 't-1' });
    expect(tomarPendiente()).toBe(null);
  });

  it('si la base dice que no, el motivo queda para la pantalla de entrada', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'juegos: esta invitación venció' } });
    await resolverPendiente({ accion: 'unirse', codigo: 'XYZ' });
    expect(supabase.rpc).toHaveBeenCalledWith('juegos_unirse', { p_codigo: 'XYZ', p_nombre: null });
    expect(errorDeEntrada()).toEqual({ texto: 'esta invitación venció', accion: 'unirse', codigo: 'XYZ' });
  });
});
