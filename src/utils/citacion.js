/**
 * CITACIÓN AL PRÓXIMO PARTIDO
 *
 * Todo lo de acá es puro: entra data, sale texto o números. Ni Supabase ni
 * React. La pantalla (pages/Citacion.jsx) se encarga de traer los datos y de
 * pintarlos; este archivo decide QUÉ dice el mensaje y A QUIÉN conviene citar.
 *
 * El formato del mensaje sale del que ya usa el club en el grupo, tal cual:
 * los asteriscos son las negritas de WhatsApp, y los espacios delante del
 * apellido y antes de la coma están puestos a propósito porque así se ve en
 * el teléfono. No los "arregles": cambiarlos cambia el mensaje del club.
 */

/* ══════════════════════════════════════════════════════════════════════════
   PLANTILLA POR DEFECTO
   ══════════════════════════════════════════════════════════════════════════ */

export const PLANTILLA_DEFAULT = `FECHA {{jornada}} - {{competicion}}🔰
{{cruce}}

📆 {{dia_semana}} {{fecha_corta}}
🏟️ Sede: {{sede}}
📍 Dirección: {{direccion}}

🕜 Inicio: {{hora_partido}}
🎽 *Citados {{hora_citacion}}*

*Convocados:*

{{convocados}}

________________________

 *Indumentaria* :
{{indumentaria}}


*_No es necesario confirmar, cualquier inconveniente informan por privado._*

Entrada general: {{entrada}}


🔰 *CREER PARA CREAR* 🔰`;

export const INDUMENTARIA_DEFAULT = ` *Jugadores:* 
CAMISETA AMARILLA
SHORT VERDE
MEDIAS VERDES`;

/** Cuánto antes del inicio se cita, si nadie lo cambió. 90' = 1h30. */
export const MINUTOS_ANTES_DEFAULT = 90;

/* ══════════════════════════════════════════════════════════════════════════
   FORMATO
   ══════════════════════════════════════════════════════════════════════════ */

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** '2025-09-06' → { dia: 'Domingo', corta: '06/09', larga: '06/09/2025' } */
export function partesDeFecha(fecha) {
  const txt = String(fecha || '').split('T')[0];
  const [a, m, d] = txt.split('-');
  if (!a || !m || !d) return { dia: '', corta: txt, larga: txt };
  // El mediodía evita que la zona horaria corra la fecha un día para atrás.
  const objeto = new Date(`${a}-${m}-${d}T12:00:00`);
  const dia = Number.isNaN(objeto.getTime()) ? '' : DIAS[objeto.getDay()];
  return { dia, corta: `${d}/${m}`, larga: `${d}/${m}/${a}` };
}

/** '20:30' → '20.30hs.' — así lo escribe el club, con punto y no con dos puntos. */
export function formatearHora(hora) {
  const txt = String(hora || '').trim();
  if (!txt) return '';
  if (/hs/i.test(txt)) return txt;                  // ya viene formateado a mano
  const m = txt.match(/^(\d{1,2})[:.h]?(\d{2})?/);
  if (!m) return txt;
  return `${m[1].padStart(2, '0')}.${m[2] || '00'}hs.`;
}

/** '20:30' menos 90 minutos → '19:00'. Devuelve '' si la hora no se entiende. */
export function restarMinutos(hora, minutos) {
  const m = String(hora || '').trim().match(/^(\d{1,2})[:.h]?(\d{2})?/);
  if (!m) return '';
  const total = Number(m[1]) * 60 + Number(m[2] || 0) - Number(minutos || 0);
  const norm = ((total % 1440) + 1440) % 1440;      // no se va de rango si cruza medianoche
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

export const esArquero = (j) => String(j?.posicion || '').toLowerCase().includes('arquero');

/**
 * La lista de convocados como va al grupo: arqueros primero, línea en blanco,
 * y el resto ordenado por apellido. Cada renglón es ` *Apellido* , Nombre`.
 */
export function formatearConvocados(jugadores = []) {
  const porApellido = (a, b) =>
    String(a.apellido || a.nombre || '').localeCompare(String(b.apellido || b.nombre || ''), 'es');

  const linea = (j) => ` *${j.apellido || j.nombre || ''}* , ${j.nombre || ''}`.trimEnd();

  const arqueros = jugadores.filter(esArquero).sort(porApellido);
  const resto = jugadores.filter(j => !esArquero(j)).sort(porApellido);

  const bloques = [];
  if (arqueros.length) bloques.push(arqueros.map(linea).join('\n'));
  if (resto.length) bloques.push(resto.map(linea).join('\n'));
  return bloques.join('\n\n');
}

/** 'Local' → `*Mi Club* vs Rival`. De visitante, al revés: el local va primero. */
export function formatearCruce({ miClub, rival, condicion }) {
  const yo = `*${miClub || 'Mi equipo'}*`;
  const el = rival || 'Rival';
  return String(condicion || '').toLowerCase().startsWith('v') ? `${el} vs ${yo}` : `${yo} vs ${el}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   ARMADO DEL MENSAJE
   ══════════════════════════════════════════════════════════════════════════ */

/** Los reemplazos disponibles, para poder listarlos en la ayuda de la pantalla. */
export const PLACEHOLDERS = [
  ['{{jornada}}', 'Número de fecha del torneo'],
  ['{{competicion}}', 'Nombre del torneo'],
  ['{{cruce}}', 'Local vs Visitante, con tu club en negrita'],
  ['{{mi_club}}', 'Nombre de tu club'],
  ['{{rival}}', 'Nombre del rival'],
  ['{{condicion}}', 'Local o Visitante'],
  ['{{categoria}}', 'Categoría del partido'],
  ['{{dia_semana}}', 'Domingo, Lunes…'],
  ['{{fecha_corta}}', '06/09'],
  ['{{fecha_larga}}', '06/09/2025'],
  ['{{sede}}', 'Nombre de la cancha'],
  ['{{direccion}}', 'Calle y altura'],
  ['{{hora_partido}}', 'Hora de inicio (20.30hs.)'],
  ['{{hora_citacion}}', 'Hora de citación (19.00hs.)'],
  ['{{convocados}}', 'La lista, arqueros primero'],
  ['{{cantidad}}', 'Cuántos convocados son'],
  ['{{indumentaria}}', 'El bloque de indumentaria'],
  ['{{entrada}}', 'Valor de la entrada'],
];

/**
 * Reemplaza los {{campos}} de la plantilla. Un campo que no se conoce queda
 * como está, a la vista: es preferible ver "{{sede}}" en el preview y darse
 * cuenta, a mandar el mensaje al grupo con un renglón vacío.
 */
export function resolverPlantilla(plantilla, datos = {}) {
  const {
    partido = {}, convocados = [], miClub = '',
    horaCitacion = '', indumentaria = '', entrada = '', direccion = '', sede = '',
  } = datos;

  const f = partesDeFecha(partido.fecha);

  const valores = {
    jornada: partido.jornada ?? '',
    competicion: partido.competicion || '',
    cruce: formatearCruce({ miClub, rival: partido.rival, condicion: partido.condicion }),
    mi_club: miClub || '',
    rival: partido.rival || '',
    condicion: partido.condicion || '',
    categoria: partido.categoria || '',
    dia_semana: f.dia,
    fecha_corta: f.corta,
    fecha_larga: f.larga,
    sede: sede || partido.lugar || '',
    direccion: direccion || partido.direccion || '',
    hora_partido: formatearHora(partido.horario),
    hora_citacion: formatearHora(horaCitacion),
    convocados: formatearConvocados(convocados),
    cantidad: String(convocados.length),
    indumentaria: indumentaria || '',
    entrada: entrada || '',
  };

  return String(plantilla || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (original, clave) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : original
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SUGERENCIA DE CONVOCATORIA

   Tres señales, todas visibles en pantalla para que se entienda por qué el
   motor propone a cada uno. Ninguna decide sola:

     · PRESENTISMO   cuánto entrenó en las últimas semanas
     · RENDIMIENTO   su rating promedio en los últimos partidos
     · REGULARIDAD   qué tan parejo rinde (un 6.5 siempre vale más que
                     un 9 y tres 4: eso es "rendimiento constante")

   Y cuatro bloqueos que sacan al jugador de la sugerencia, pero NUNCA de la
   lista: si el técnico lo quiere citar igual, lo tilda y listo.
   ══════════════════════════════════════════════════════════════════════════ */

export const PESOS = { presentismo: 45, rendimiento: 35, regularidad: 20 };

const NEUTRO = 50;  // sin datos no premia ni castiga

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Rating de futsal (1 a 10) a escala 0-100, centrado en 6 = aprobado. */
const ratingANota = (r) => clamp(((Number(r) - 4) / 4) * 100);

const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const desvio = (xs) => {
  if (xs.length < 2) return null;
  const m = promedio(xs);
  return Math.sqrt(promedio(xs.map(x => (x - m) ** 2)));
};

/**
 * @param jugadores       plantel activo de la categoría
 * @param presentismo     { [idJugador]: { presentes, total } }
 * @param ratings         { [idJugador]: number[] }  ratings de sus últimos partidos
 * @param bloqueos        { [idJugador]: string }    motivo por el que no debería ir
 * @param avisos          { [idJugador]: string }    se sugiere igual, pero avisado
 * @param limite          tope de convocados (14 oficial, 16 amistoso)
 */
export function sugerirConvocatoria({
  jugadores = [], presentismo = {}, ratings = {}, bloqueos = {}, avisos = {}, limite = 14,
} = {}) {
  const evaluados = jugadores.map(j => {
    const id = String(j.id);
    const asist = presentismo[id];
    const rats = (ratings[id] || []).filter(r => Number.isFinite(r));

    const notaPresentismo = asist?.total > 0 ? (asist.presentes / asist.total) * 100 : null;
    const notaRendimiento = rats.length ? ratingANota(promedio(rats)) : null;
    // Desvío 0 = clavado siempre → 100. Desvío 2 puntos de rating → 0.
    const d = desvio(rats);
    const notaRegularidad = d === null ? null : clamp(100 - d * 50);

    const score =
      ((notaPresentismo ?? NEUTRO) * PESOS.presentismo +
       (notaRendimiento ?? NEUTRO) * PESOS.rendimiento +
       (notaRegularidad ?? NEUTRO) * PESOS.regularidad) / 100;

    const motivos = [];
    if (notaPresentismo !== null) motivos.push(`${Math.round(notaPresentismo)}% de asistencia (${asist.presentes}/${asist.total})`);
    else motivos.push('Sin presentismo cargado');
    if (notaRendimiento !== null) motivos.push(`Rating ${promedio(rats).toFixed(1)} en ${rats.length} ${rats.length === 1 ? 'partido' : 'partidos'}`);
    else motivos.push('Sin partidos analizados');
    if (notaRegularidad !== null) motivos.push(notaRegularidad >= 70 ? 'Rinde parejo' : 'Rendimiento irregular');

    return {
      jugador: j,
      id,
      score: Math.round(score),
      notas: { presentismo: notaPresentismo, rendimiento: notaRendimiento, regularidad: notaRegularidad },
      motivos,
      bloqueo: bloqueos[id] || null,
      aviso: avisos[id] || null,
      esArquero: esArquero(j),
    };
  });

  evaluados.sort((a, b) => b.score - a.score);

  /* El arquero no compite contra los de campo: un equipo sin arquero no es un
     equipo. Van los dos mejores arqueros disponibles y después se completa. */
  const disponibles = evaluados.filter(e => !e.bloqueo);
  const arqueros = disponibles.filter(e => e.esArquero).slice(0, 2);
  const campo = disponibles.filter(e => !e.esArquero).slice(0, Math.max(0, limite - arqueros.length));
  const sugeridos = new Set([...arqueros, ...campo].map(e => e.id));

  return { evaluados, sugeridos };
}

/** El tope de convocados que ya valida NUEVO PARTIDO. */
export const limiteConvocados = (competicion) =>
  String(competicion || '').toLowerCase().includes('amistoso') ? 16 : 14;
