import { describe, it, expect } from 'vitest';
import { coincideBusqueda } from '../../utils/buscarJugador.js';

const j = { nombre: 'Luciano', apellido: 'Gómez', apodo: 'Tano', dorsal: 10 };

describe('buscador del plantel', () => {
  it('vacío muestra a todos', () => {
    expect(coincideBusqueda(j, '')).toBe(true);
    expect(coincideBusqueda(j, '   ')).toBe(true);
  });
  it('por nombre, apellido o apodo, sin acentos ni mayúsculas', () => {
    expect(coincideBusqueda(j, 'gomez')).toBe(true);
    expect(coincideBusqueda(j, 'LUCI')).toBe(true);
    expect(coincideBusqueda(j, 'tano')).toBe(true);
    expect(coincideBusqueda(j, 'pérez')).toBe(false);
  });
  it('varias palabras en cualquier orden', () => {
    expect(coincideBusqueda(j, 'gomez luciano')).toBe(true);
    expect(coincideBusqueda(j, 'luciano perez')).toBe(false);
  });
  it('un número busca por dorsal', () => {
    expect(coincideBusqueda(j, '10')).toBe(true);
    expect(coincideBusqueda(j, '#10')).toBe(true);
    expect(coincideBusqueda(j, '1')).toBe(false);
  });
  it('sin apodo no se rompe', () => {
    expect(coincideBusqueda({ nombre: 'Tato' }, 'tato')).toBe(true);
  });
});
