import { describe, it, expect } from 'vitest';
import { fisicoDelJugador, reporteJugador, AREAS_DEVOLUCION } from '../reporteJugador';

describe('reporte del jugador: física, devolución, staff y ficha', () => {
  it('física: lo último de cada medición y cuánto cambió desde la primera (y si es mejora)', () => {
    const f = fisicoDelJugador([
      { fecha_medicion: '2026-10-20', cmj: 41.2, adip: 11.4 },
      { fecha_medicion: '2026-03-10', cmj: 38.5, adip: 13.2, peso: 72 },
    ]);
    const cmj = f.find((m) => m.id === 'cmj');
    expect(cmj).toMatchObject({ valor: '41.2 cm', mejora: true });
    expect(cmj.detalle).toBe('+2.7 cm desde el 10/3');
    expect(f.find((m) => m.id === 'adip')).toMatchObject({ valor: '11.4%', mejora: true });   // bajar adiposidad es mejora
    expect(f.find((m) => m.id === 'peso').detalle).toBe('medido el 10/3');
  });

  it('sin partidos igual sale la devolución; las áreas vacías sólo con "a mano"; el staff al pie; la ficha en la portada', () => {
    const base = { jugador: { id: 1, nombre: 'Juan', apellido: 'Pérez', posicion: 'Ala', fechanac: '2006-06-22', pierna: 'Zurdo' }, fila: null, temporada: '2026',
      devolucion: { tactico: { texto: 'Bien.', autor_nombre: 'DT' } }, staff: [{ cargo: 'DT', nombre: 'Uno' }, { cargo: 'PF', nombre: ' ' }], ficha: { condicion: 'Propio' } };
    const r = reporteJugador(base);
    const dev = r.secciones.find((s) => s.id === 'devolucion').bloques[0];
    expect(dev.items).toEqual([{ titulo: 'Desempeño táctico-técnico', texto: 'Bien.', autor: 'DT', vacio: false }]);
    expect(r.secciones.find((s) => s.id === 'staff').bloques[0].items).toEqual([{ cargo: 'DT', nombre: 'Uno' }]);
    const ficha = r.secciones[0].bloques.find((b) => b.tipo === 'ficha');
    expect(ficha.items.map((i) => i.valor)).toEqual(['Ala', 'Zurdo', '22/06/2006', 'Propio']);
    const aMano = reporteJugador({ ...base, aMano: true }).secciones.find((s) => s.id === 'devolucion').bloques[0];
    expect(aMano.items).toHaveLength(AREAS_DEVOLUCION.length);
    expect(aMano.items.filter((i) => i.vacio)).toHaveLength(AREAS_DEVOLUCION.length - 1);
  });
});
