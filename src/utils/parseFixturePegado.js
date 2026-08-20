// src/utils/parseFixturePegado.js
//
// Convierte el texto que el usuario copia a mano desde la vista "Por jornada"
// de un torneo en cruces listos para el modo bloque de Torneos.jsx.
//
// El pegado real viene con los escudos como saltos de linea, asi que un cruce
// puede llegar en una sola linea ("Local 20:00 Visitante") o partido en tres
// lineas sueltas. El parser acepta las dos formas.

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

// "VIERNES, 21 DE AGOSTO" -> { dia: 21, mes: 8 }
const RE_CABECERA_DIA = /^[a-zá-ú]+,\s*(\d{1,2})\s+de\s+([a-zá-ú]+)/i;

// "Jornada 22" / "Fecha 22"
const RE_JORNADA = /^(?:jornada|fecha)\s+(\d{1,3})$/i;

// "Villa Heredia 20:00 Excursionistas" en una sola linea (o con la hora sin definir)
const RE_CRUCE_INLINE = /^(.+?)\s+(\d{1,2}:\d{2}|(?:hora|horario) a confirmar)\s+(.+)$/i;

// Una hora suelta en su propia linea
const RE_HORA_SOLA = /^(\d{1,2}:\d{2})$/;

// Placeholders de la web cuando la fecha/hora todavia no esta definida.
// "Hora a confirmar" ocupa el mismo lugar que la hora, asi que cuenta como
// separador entre local y visitante; sin esto el buffer se desfasa y arrastra
// el resto de la jornada.
const RE_HORA_PENDIENTE = /^(hora|horario)\s+a\s+confirmar$/i;
const RE_FECHA_PENDIENTE = /^fecha\s+a\s+confirmar$/i;

// Alt-text de los escudos: al copiar la pagina, cada imagen deja una linea
// "Escudo <equipo>". No aportan nada y duplican el nombre del equipo.
const RE_ESCUDO = /^escudo\b/i;

const esSeparadorHorario = (l) => RE_HORA_SOLA.test(l) || RE_HORA_PENDIENTE.test(l);

// Lineas de la UI que no son datos y hay que descartar
const RUIDO = [
  /^campeón$/i, /^por (jornada|fecha|equipo)$/i, /^cargando/i,
  /^\d+$/, /^-?\d+$/, /^(pts|pj|dg)$/i,
  RE_ESCUDO,
];

const esRuido = (l) => RUIDO.some((re) => re.test(l));

export const normalizarNombre = (s) =>
  (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(c\.?a\.?|club|atletico|atlético|deportivo|dep\.?|social y deportivo)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

/**
 * @param {string} texto  Lo pegado desde el sitio.
 * @param {number} anio   Año del torneo (el selector de la pagina lo tiene).
 * @returns {{ jornada: string|null, jornadas: string[], cruces: Array, avisos: string[] }}
 */
export function parseFixturePegado(texto, anio = new Date().getFullYear()) {
  const lineas = String(texto)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !esRuido(l));

  const cruces = [];
  const avisos = [];
  let jornada = null;
  const jornadas = [];
  let fechaActual = null;
  let buffer = []; // acumula lineas sueltas de un cruce partido en 3

  const armarFecha = (dia, mes) => {
    const d = String(dia).padStart(2, '0');
    const m = String(mes).padStart(2, '0');
    return `${anio}-${m}-${d}`;
  };

  const volcarBuffer = () => {
    // Espera [local, hora, visitante]; tolera [local, visitante] sin hora.
    if (buffer.length === 3 && esSeparadorHorario(buffer[1])) {
      const hora = RE_HORA_SOLA.test(buffer[1]) ? buffer[1] : null;
      cruces.push({ local: buffer[0], visitante: buffer[2], hora, fecha: fechaActual, jornada });
    } else if (buffer.length === 2) {
      cruces.push({ local: buffer[0], visitante: buffer[1], hora: null, fecha: fechaActual, jornada });
    } else if (buffer.length) {
      avisos.push(`No pude interpretar: "${buffer.join(' / ')}"`);
    }
    buffer = [];
  };

  for (const linea of lineas) {
    const mJornada = linea.match(RE_JORNADA);
    if (mJornada) {
      volcarBuffer();
      jornada = `Fecha ${mJornada[1]}`;
      if (!jornadas.includes(jornada)) jornadas.push(jornada);
      fechaActual = null;
      continue;
    }

    if (RE_FECHA_PENDIENTE.test(linea)) {
      volcarBuffer();
      fechaActual = null; // la liga todavia no la definio; queda a completar a mano
      continue;
    }

    const mDia = linea.match(RE_CABECERA_DIA);
    if (mDia) {
      volcarBuffer();
      const mes = MESES[mDia[2].toLowerCase()];
      fechaActual = mes ? armarFecha(mDia[1], mes) : null;
      if (!mes) avisos.push(`Mes no reconocido en "${linea}"`);
      continue;
    }

    const mInline = linea.match(RE_CRUCE_INLINE);
    if (mInline) {
      volcarBuffer();
      cruces.push({
        local: mInline[1].trim(),
        visitante: mInline[3].trim(),
        hora: RE_HORA_SOLA.test(mInline[2]) ? mInline[2] : null,
        fecha: fechaActual,
        jornada,
      });
      continue;
    }

    buffer.push(linea);
    if (buffer.length === 3) volcarBuffer();
  }
  volcarBuffer();

  if (!cruces.length) avisos.push('No encontre ningun cruce en el texto pegado.');
  cruces.forEach((c) => {
    if (!c.jornada) avisos.push(`"${c.local} vs ${c.visitante}" quedo sin jornada.`);
  });

  return { jornada: jornadas[0] || null, jornadas, cruces, avisos };
}

// Valor centinela para los selects: NO es un id de `rivales` (tu propio club no
// vive en esa tabla). Marca que ese lado del cruce sos vos, y hace que el
// partido se guarde como propio (condicion Local/Visitante) en vez de Neutral.
export const ID_MI_CLUB = '__MI_CLUB__';

/**
 * Cruza los nombres parseados contra la tabla `rivales` ya cargada en pantalla.
 *
 * El orden de prioridad es: alias guardado > nombre exacto > prefijo. El alias
 * va primero a proposito: es una decision que vos ya tomaste a mano, asi que
 * tiene que ganarle a cualquier heuristica.
 *
 * @param {Array} cruces   Salida de parseFixturePegado().cruces
 * @param {Array} rivales  Filas de la tabla `rivales`
 * @param {Array} alias    Filas de `rivales_alias` ({ alias_norm, rival_id })
 * @param {string} miClub  Nombre de tu club, para reconocerlo en el pegado
 */
export function matchearRivales(cruces, rivales, alias = [], miClub = null) {
  const indice = new Map();
  (rivales || []).forEach((r) => {
    const k = normalizarNombre(r.nombre);
    if (k && !indice.has(k)) indice.set(k, r);
  });

  const porId = new Map((rivales || []).map((r) => [r.id, r]));
  const indiceAlias = new Map();
  (alias || []).forEach((a) => {
    const r = porId.get(a.rival_id);
    if (r && a.alias_norm) indiceAlias.set(a.alias_norm, r);
  });

  const kMiClub = miClub ? normalizarNombre(miClub) : null;

  const buscar = (nombre) => {
    const k = normalizarNombre(nombre);
    // Tu club primero: no esta en `rivales`, asi que sin este chequeo caeria
    // siempre en "no pude identificar" y tendrias que elegirlo a mano cada vez.
    if (kMiClub && k === kMiClub) return { id: ID_MI_CLUB, nombre: miClub };
    if (indiceAlias.has(k)) return indiceAlias.get(k);
    if (indice.has(k)) return indice.get(k);
    // Fallback por prefijo: "Rosario Ctral" vs "Rosario Central".
    for (const [clave, rival] of indice) {
      if (clave.startsWith(k) || k.startsWith(clave)) return rival;
    }
    return null;
  };

  return cruces.map((c) => {
    const local = buscar(c.local);
    const visitante = buscar(c.visitante);
    return {
      local_id: local?.id || '',
      visitante_id: visitante?.id || '',
      estado: 'Pendiente',
      goles_local: 0,
      goles_visitante: 0,
      // Cada cruce lleva su jornada, asi un solo pegado puede traer varias fechas.
      jornada: c.jornada || '',
      // Metadata para el preview; no va al insert.
      _crudo: c,
      _sinResolver: [!local && c.local, !visitante && c.visitante].filter(Boolean),
    };
  });
}


/**
 * Detecta que alias conviene guardar despues de que resolviste el preview a mano.
 *
 * Sólo devuelve los casos que hoy NO se resuelven solos: si el texto pegado ya
 * normaliza igual que el nombre del rival, guardar un alias seria ruido.
 *
 * @param {Array} partidos  formFixture.partidos_multiples (con _crudo)
 * @param {Array} rivales   Filas de `rivales`
 * @param {Array} alias     Filas de `rivales_alias` ya existentes
 * @returns {Array<{ rival_id, alias, alias_norm }>}
 */
export function calcularAliasNuevos(partidos, rivales, alias = []) {
  const porId = new Map((rivales || []).map((r) => [r.id, r]));
  const yaGuardados = new Set((alias || []).map((a) => a.alias_norm));
  const nuevos = new Map();

  const evaluar = (textoCrudo, rivalId) => {
    if (!textoCrudo || !rivalId) return;
    if (rivalId === ID_MI_CLUB) return; // no es un rival: no va a `rivales_alias`
    const rival = porId.get(rivalId);
    if (!rival) return;

    const norm = normalizarNombre(textoCrudo);
    if (!norm) return;
    if (norm === normalizarNombre(rival.nombre)) return; // ya matchea solo
    if (yaGuardados.has(norm) || nuevos.has(norm)) return;

    nuevos.set(norm, { rival_id: rivalId, alias: textoCrudo.trim(), alias_norm: norm });
  };

  (partidos || []).forEach((p) => {
    evaluar(p._crudo?.local, p.local_id);
    evaluar(p._crudo?.visitante, p.visitante_id);
  });

  return [...nuevos.values()];
}