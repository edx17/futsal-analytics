import { describe, it, expect } from 'vitest';
import { telefonoWhatsApp, linkWhatsApp } from '../../utils/telefono.js';

describe('celular para WhatsApp', () => {
  it('completa el 549 de un celular de Buenos Aires', () => {
    expect(telefonoWhatsApp('11 5555-5555')).toBe('5491155555555');
    expect(telefonoWhatsApp(1155555555)).toBe('5491155555555');
  });
  it('saca el 0 y el 15', () => {
    expect(telefonoWhatsApp('011 15 5555-5555')).toBe('5491155555555');
    expect(telefonoWhatsApp('0351 15 555-5555')).toBe('5493515555555');
    expect(telefonoWhatsApp('02229 15 45-6789')).toBe('5492229456789');
  });
  it('agrega el 9 si vino con 54 solo', () => {
    expect(telefonoWhatsApp('+54 11 5555-5555')).toBe('5491155555555');
    expect(telefonoWhatsApp('0054 11 5555 5555')).toBe('5491155555555');
  });
  it('deja como está lo que ya viene bien', () => {
    expect(telefonoWhatsApp('5491155555555')).toBe('5491155555555');
    expect(telefonoWhatsApp('+54 9 11 5555-5555')).toBe('5491155555555');
  });
  it('números de otro país pasan tal cual; basura da null', () => {
    expect(telefonoWhatsApp('+598 99 123 456')).toBe('59899123456');
    expect(telefonoWhatsApp('1234')).toBeNull();
    expect(telefonoWhatsApp('')).toBeNull();
    expect(telefonoWhatsApp(null)).toBeNull();
  });
  it('arma el link, con o sin número', () => {
    expect(linkWhatsApp('11 5555-5555', 'hola che')).toBe('https://api.whatsapp.com/send?phone=5491155555555&text=hola%20che');
    expect(linkWhatsApp(null, 'hola')).toBe('https://api.whatsapp.com/send?text=hola');
  });
});
