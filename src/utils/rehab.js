/**
 * BIBLIOTECA DE REHAB Y PREVENCIÓN
 *
 * Estaba adentro de Rendimiento.jsx como una constante privada. Se saca acá
 * para que la Enfermería pueda sugerir los ejercicios que corresponden a la
 * zona de la lesión sin duplicar la lista: una sola biblioteca, dos pantallas.
 */

export const REHAB_LIB = {
  isquiosural: [{ t: 'Dead Bugs', v: 'https://youtube.com/shorts/vn72PVWnu14' }, { t: 'Puente glúteo unilateral', v: 'https://youtube.com/shorts/Y-N53Q6XxiI' }, { t: 'Peso muerto rumano uni', v: 'https://youtu.be/YXjc7TURwfE' }],
  movilidad:   [{ t: 'Dorsiflexión c/ banda', v: 'https://youtube.com/shorts/Re7XMKgAti8' }, { t: 'Obelisco', v: 'https://youtube.com/shorts/dWLrnRwY41c' }, { t: 'Movilidad Toráxica', v: 'https://youtube.com/shorts/2et2ZXUk6co' }],
  tobillo:     [{ t: 'Mov. Articular', v: 'https://youtube.com/shorts/dYS9cgYk2lY' }, { t: 'Salto Alternado', v: 'https://youtube.com/shorts/b5qmCWB8cpo' }, { t: 'Dorsiflexión c/ carga', v: 'https://youtube.com/shorts/tXVq7MAOAVY' }],
  pelvica:     [{ t: 'Bird-dog', v: 'https://youtube.com/shorts/Tjo5oYHoS8M' }, { t: 'Puente almeja c/ banda', v: 'https://youtube.com/shorts/9vWRjF08xiQ' }, { t: 'Isométricos glúteo', v: 'https://youtube.com/shorts/oxouNCjxHWw' }],
  cadera:      [{ t: '90-90 Rotación interna', v: 'https://youtube.com/shorts/p2NUakSyUcE' }, { t: 'Ranita', v: 'https://youtube.com/shorts/cvgsb7xCgN4' }, { t: 'Curl Nórdico invertido', v: 'https://youtube.com/shorts/UZf6CbQR8_s' }],
  escapular:   [{ t: 'Movilidad Escapular', v: 'https://youtube.com/shorts/5j4inxyq-MA' }, { t: 'Halo Split KB', v: 'https://youtube.com/shorts/UARPXzqDNhM' }, { t: 'Pájaros con poleas', v: 'https://youtu.be/ki6gkb_mJr0' }],
};

/* Qué familia de ejercicios le toca a cada zona del cuerpo. Una zona puede
   pedir más de una: una lumbar necesita core y movilidad, no una sola cosa. */
const REHAB_POR_ZONA = {
  'Isquiosurales':   ['isquiosural', 'pelvica'],
  'Cuádriceps':      ['cadera', 'pelvica'],
  'Aductores':       ['pelvica', 'cadera'],
  'Pubis / Pubalgia':['pelvica', 'cadera'],
  'Gemelo / Sóleo':  ['tobillo', 'movilidad'],
  'Tobillo':         ['tobillo', 'movilidad'],
  'Pie':             ['tobillo'],
  'Rodilla':         ['pelvica', 'cadera'],
  'Cadera':          ['cadera', 'movilidad'],
  'Lumbar':          ['pelvica', 'movilidad'],
  'Cervical':        ['movilidad', 'escapular'],
  'Hombro':          ['escapular'],
  'Codo':            ['escapular'],
  'Muñeca / Mano':   ['escapular'],
  'Cabeza / Rostro': [],
};

/**
 * Los ejercicios sugeridos para una zona, sin repetidos.
 * Devuelve [{ t, v, familia }]. Vacío si la zona no tiene rehab asociada
 * (una fractura de nariz no se trabaja con ejercicios).
 */
export function ejerciciosParaZona(zona) {
  const familias = REHAB_POR_ZONA[zona] || [];
  const vistos = new Set();
  const salida = [];
  familias.forEach(familia => {
    (REHAB_LIB[familia] || []).forEach(ej => {
      if (vistos.has(ej.t)) return;
      vistos.add(ej.t);
      salida.push({ ...ej, familia });
    });
  });
  return salida;
}
