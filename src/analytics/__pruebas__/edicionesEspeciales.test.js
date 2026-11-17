import { describe, it, expect } from 'vitest';
import { EDICIONES, jugadoresParaEdicion, filaEdicion, partidosCopaFuturo, origenesCopaFuturo, cartasDePartidos, jugadoresDeOrigen } from '../edicionesEspeciales';
import { familiaDe, conDisenoEspecial, esEspecial } from '../especialesCartas';

const k = (tipo, id, carta, extra = {}) => ({ clave: `${tipo}|x|${id}`, tipo, jugador_id: id, carta, ...extra });
const catalogo = [
  k('BASE', '1', { nombre: 'Juan', apellido: 'Pérez', rol: 'ALA', ovr: 80, categoria: 'Primera', atributos: [['RIT', 80], ['TIR', 97]] }),
  k('BASE', '2', { nombre: 'Leo', apellido: 'Ruiz', rol: 'PIV', ovr: 70, categoria: 'Tercera', atributos: [['RIT', 70]] }),
  k('HERO', '9', { nombre: 'Viejo', apellido: 'Crack', ovr: 90 }),
  { clave: 'TOTY|2026|1', tipo: 'TOTY', jugador_id: '1', carta: { ovr: 85 } },
];

describe('ediciones especiales: TOTY y Copa Futuro de Oro', () => {
  it('TOTY: el plantel entero, con la media de su temporada más el plus', () => {
    const js = jugadoresParaEdicion(EDICIONES.TOTY, catalogo, new Map(), 2026);
    expect(js.map((j) => [j.apellido, j.ovr, j.sugerida, j.tiene])).toEqual([['Pérez', 80, 85, true], ['Ruiz', 70, 75, false]]);
  });

  it('Copa Futuro: sólo los de inferiores', () => {
    expect(jugadoresParaEdicion(EDICIONES.CFOR, catalogo, new Map(), 2026).map((j) => j.apellido)).toEqual(['Ruiz']);
  });

  it('la fila del catálogo: atributos que suben con la media (hasta 99) y si va a los sobres o sólo al evento', () => {
    const [j] = jugadoresParaEdicion(EDICIONES.TOTY, catalogo, new Map(), 2026);
    const f = filaEdicion(EDICIONES.TOTY, j, { anio: 2026, ovr: 88 });
    expect(f).toMatchObject({ clave: 'TOTY|2026|1', tipo: 'TOTY', rareza: 'toty', exclusiva_evento: false });
    expect(f.carta.atributos).toEqual([['RIT', 88], ['TIR', 99]]);
    const c = filaEdicion(EDICIONES.CFOR, jugadoresParaEdicion(EDICIONES.CFOR, catalogo, new Map(), 2026)[0], { anio: 2026 });
    expect(c).toMatchObject({ tipo: 'CFOR', exclusiva_evento: true });
    expect(c.carta.pie).toBe('TERCERA · 2026');
  });

  it('la TOTY se dibuja con su familia sin volverse especial (su lógica sigue siendo la de MySquad)', () => {
    expect(familiaDe('TOTY')).toBe('toty');
    expect(conDisenoEspecial('TOTY')).toBe(true);
    expect(esEspecial('TOTY')).toBe(false);
    expect(familiaDe('CFOR')).toBe('icono');
  });
});

describe('Copa Futuro: las cartas salen de los partidos del torneo, nada inventado', () => {
  const jug = (id, apellido, posicion) => ({ id, nombre: 'N' + id, apellido, posicion, categoria: 'Tercera', dorsal: id, foto: null });
  const JUGADORES = [jug(1, 'ARQ', 'Arquero'), jug(2, 'CIE', 'Cierre'), jug(3, 'ALA', 'Ala'), jug(4, 'PIV', 'Pivot'), jug(5, 'ALB', 'Ala'), jug(6, 'OTRO', 'Ala')];
  const q = JSON.stringify(['1', '2', '3', '4', '5']);
  const partido = (id, torneo_id, fecha) => ({ id, categoria: 'Tercera', torneo_id, rival: 'CIDECO', fecha, estado: 'Finalizado',
    plantilla: JSON.stringify([1, 2, 3, 4, 5].map((x) => ({ id_jugador: x, titular: true }))) });
  const ev = (id, id_partido, accion, id_jugador, minuto, extra = {}) => ({ id, id_partido, club_id: 'c1', equipo: 'Propio', periodo: 'PT', accion, id_jugador, minuto, segundos: 0, quinteto_activo: q, ...extra });
  const raw = {
    jugadores: JUGADORES,
    torneos: [{ id: 'cf', nombre: 'Copa Futuro Oro' }, { id: 'liga', nombre: 'TORNEO 2026' }],
    partidos: [partido('p1', 'cf', '2026-11-15'), partido('p2', 'cf', '2026-11-22'), partido('p3', 'liga', '2026-10-01')],
    eventos: [
      ev(1, 'p1', 'Gol', 4, 5, { id_asistencia: 3, zona_x: 82, zona_y: 50 }), ev(2, 'p1', 'Recuperación', 2, 9), ev(3, 'p1', 'Pérdida', 5, 12),
      ev(4, 'p3', 'Gol', 6, 3, { quinteto_activo: JSON.stringify(['1', '2', '3', '4', '6']) }),
    ],
  };

  it('sólo los partidos de Copa Futuro con datos cargados (el pendiente sin eventos no aparece)', () => {
    const ps = partidosCopaFuturo(raw);
    expect(ps.map((p) => p.id)).toEqual(['p1']);
    expect(origenesCopaFuturo(ps).map((o) => o.id)).toEqual(['p:p1']);
  });

  it('cada jugador del partido, con la media calculada (sugerida = calculada) y una clave por partido', () => {
    const [o] = origenesCopaFuturo(partidosCopaFuturo(raw));
    const cartas = cartasDePartidos(raw, o.partidos);
    const js = jugadoresDeOrigen(EDICIONES.CFOR, cartas, o, []);
    expect(js.map((j) => j.apellido).sort()).toEqual(['ALA', 'ALB', 'ARQ', 'CIE', 'PIV']);   // OTRO jugó sólo en la liga
    js.forEach((j) => expect(j.sugerida).toBe(j.ovr));
    const piv = js.find((j) => j.apellido === 'PIV');
    expect(piv.stats.goles).toBe(1);
    const f = filaEdicion(EDICIONES.CFOR, piv, { anio: 2026 });
    expect(f.clave).toBe(`CFOR|p:p1|${piv.jugador_id}`);
    expect(f.carta.ovr).toBe(piv.ovr);
    expect(f.carta.pie).toBe('TERCERA · VS CIDECO · 15/11');
    // Ya creada la de este partido: se marca; la de otro partido sería otra clave (carta nueva).
    expect(jugadoresDeOrigen(EDICIONES.CFOR, cartas, o, [{ tipo: 'CFOR', clave: f.clave }]).find((j) => j.apellido === 'PIV').tiene).toBe(true);
  });
});
