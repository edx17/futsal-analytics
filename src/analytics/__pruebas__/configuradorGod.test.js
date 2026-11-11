import { describe, it, expect } from 'vitest';
import { seccionesPara, altasPara, seccionInicial, menuPorGrupo, SECCIONES_GOD } from '../configuradorGod';

describe('configurador GOD: quién ve qué', () => {
  it('el superusuario ve todas las secciones y todas las altas', () => {
    expect(seccionesPara('superuser')).toHaveLength(SECCIONES_GOD.length);
    expect(altasPara('superuser').map((a) => a.id)).toEqual(['basicas', 'premios', 'toty', 'copafuturo', 'heroes', 'halloween']);
  });

  it('el manager sólo da de alta básicas y premios, sus fotos y las placas', () => {
    expect(seccionesPara('manager').map((s) => s.id)).toEqual(['alta', 'modificar', 'placas']);
    expect(altasPara('manager').map((a) => a.id)).toEqual(['basicas', 'premios']);
  });

  it('el resto no ve nada', () => {
    expect(seccionesPara('ct')).toEqual([]);
    expect(seccionesPara(undefined)).toEqual([]);
    expect(seccionInicial('ct', 'alta')).toBeNull();
  });

  it('si pide una sección que no puede ver, arranca en la primera suya', () => {
    expect(seccionInicial('manager', 'usuarios')).toBe('alta');
    expect(seccionInicial('manager', 'placas')).toBe('placas');
    expect(seccionInicial('superuser', null)).toBe('probar');
  });

  it('el menú se arma por grupos, en orden', () => {
    expect(menuPorGrupo('superuser').map((g) => g.grupo)).toEqual(['CARTAS Y SOBRES', 'JUGADORES', 'JUEGOS']);
    expect(menuPorGrupo('manager')).toHaveLength(1);
  });
});
