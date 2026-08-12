// src/reportes/engine/documento.js
//
// El "documento" es la capa editable que se apoya sobre una plantilla base.
// La plantilla (verde.js, vintage.js, o una del club) es inmutable; todo lo
// que el usuario toca vive acá y se guarda en `reporte_disenos.documento`.
//
// Formato v2:
//   {
//     version: 2,
//     elementos: {                       // patches sobre elementos de la base
//       "stat-goles": { x: 70, y: 410, fontSize: 120, color: "#fff" },
//       "deco-5":     { oculto: true },
//       "deco-9":     { eliminado: true }
//     },
//     extras: [                          // elementos que NO existen en la base
//       { id: "x-a1b2c3", type: "text", text: "Invicto", x: 100, y: 900, ... }
//     ]
//   }
//
// Formato v1 (el que ya está guardado en producción):
//   { "stat-goles": { x, y, oculto } }
// -> `normalizar()` lo levanta como v2 sin perder nada.

export const VERSION_DOCUMENTO = 2;

export const DOCUMENTO_VACIO = Object.freeze({
  version: VERSION_DOCUMENTO,
  elementos: {},
  extras: [],
});

// ------------------------------------------------------------------
// Normalización / migración
// ------------------------------------------------------------------

/**
 * Acepta null, un documento v2, o el formato viejo v1 (mapa plano de
 * id -> {x,y,oculto}) y devuelve siempre un documento v2 válido.
 */
export function normalizar(raw) {
  if (!raw || typeof raw !== "object") return { ...DOCUMENTO_VACIO, elementos: {}, extras: [] };

  // v2 explícito
  if (raw.version === VERSION_DOCUMENTO || raw.elementos || raw.extras) {
    return {
      version: VERSION_DOCUMENTO,
      elementos: { ...(raw.elementos || {}) },
      extras: Array.isArray(raw.extras) ? raw.extras.map((el) => ({ ...el })) : [],
    };
  }

  // v1: el objeto entero ES el mapa de patches
  return {
    version: VERSION_DOCUMENTO,
    elementos: { ...raw },
    extras: [],
  };
}

// ------------------------------------------------------------------
// Composición de capas: club < grupo < jugador
// ------------------------------------------------------------------

/**
 * Combina varios documentos. El último gana, pero a nivel PROP, no a nivel
 * elemento: si el diseño de grupo movió `stat-goles` y el del jugador solo
 * le cambió el color, se conservan las dos cosas.
 */
export function combinar(...documentos) {
  const resultado = { version: VERSION_DOCUMENTO, elementos: {}, extras: [] };
  const idsExtras = new Set();

  for (const bruto of documentos) {
    const doc = normalizar(bruto);

    for (const [id, patch] of Object.entries(doc.elementos)) {
      resultado.elementos[id] = { ...(resultado.elementos[id] || {}), ...patch };
    }

    for (const extra of doc.extras) {
      if (idsExtras.has(extra.id)) {
        // mismo extra redefinido en una capa superior: se mergea
        const i = resultado.extras.findIndex((e) => e.id === extra.id);
        resultado.extras[i] = { ...resultado.extras[i], ...extra };
      } else {
        idsExtras.add(extra.id);
        resultado.extras.push({ ...extra });
      }
    }
  }

  return resultado;
}

// ------------------------------------------------------------------
// Composición final: plantilla base + documento -> lista de elementos
// ------------------------------------------------------------------

/**
 * Devuelve el array de elementos listo para renderizar, con los patches ya
 * aplicados, los eliminados fuera, los extras adentro y todo ordenado por
 * zIndex (orden estable para los que empatan).
 *
 * No resuelve los `{campos}` — de eso sigue encargándose FieldResolver
 * dentro de TemplateRenderer.
 */
export function componer(plantilla, documento) {
  const doc = normalizar(documento);
  const base = plantilla?.elements || [];

  const elementos = [];

  base.forEach((el, indice) => {
    const patch = el.id ? doc.elementos[el.id] : null;
    if (patch?.eliminado) return;
    elementos.push({
      ...el,
      ...(patch || {}),
      __orden: indice,
      __origen: "base",
    });
  });

  doc.extras.forEach((extra, i) => {
    const patch = doc.elementos[extra.id];
    if (patch?.eliminado) return;
    elementos.push({
      ...extra,
      ...(patch || {}),
      __orden: base.length + i,
      __origen: "extra",
    });
  });

  return elementos.sort((a, b) => {
    const za = Number(a.zIndex ?? 1);
    const zb = Number(b.zIndex ?? 1);
    if (za !== zb) return za - zb;
    return a.__orden - b.__orden;
  });
}

// ------------------------------------------------------------------
// Mutaciones (todas inmutables: devuelven un documento nuevo)
// ------------------------------------------------------------------

/**
 * Fusiona plantilla + documento en una plantilla nueva, autónoma: los patches
 * quedan escritos en los elementos y los extras pasan a ser elementos comunes.
 * Es lo que se guarda en `reporte_plantillas.base`.
 *
 * Los elementos ocultos NO se incluyen: si el usuario los sacó del diseño y
 * después guarda eso como plantilla propia, lo que quiere es una plantilla
 * sin esos elementos. Si algún día hace falta recuperarlos, la plantilla de
 * origen queda intacta.
 */
export function aplanar(plantilla, documento, extra = {}) {
  const elementos = componer(plantilla, documento)
    .filter((el) => !el.oculto)
    .map((el) => {
      const limpio = { ...el };
      delete limpio.__orden;
      delete limpio.__origen;
      delete limpio.oculto;
      delete limpio.eliminado;
      return limpio;
    });

  return {
    width: plantilla?.width || 1080,
    height: plantilla?.height || 1350,
    background: plantilla?.background || "#ffffff",
    ...extra,
    elements: elementos,
  };
}

export function aplicarPatch(documento, id, patch) {
  const doc = normalizar(documento);
  return {
    ...doc,
    elementos: {
      ...doc.elementos,
      [id]: { ...(doc.elementos[id] || {}), ...patch },
    },
  };
}

/** Vuelve un elemento a como lo define la plantilla base. */
export function resetearElemento(documento, id) {
  const doc = normalizar(documento);
  const elementos = { ...doc.elementos };
  delete elementos[id];
  return { ...doc, elementos };
}

export function agregarElemento(documento, elemento) {
  const doc = normalizar(documento);
  return { ...doc, extras: [...doc.extras, elemento] };
}

/**
 * Reasigna el zIndex de todos los elementos según el orden de la lista
 * recibida (índice 0 = el más atrás). Se usa al arrastrar en el panel de
 * capas.
 *
 * Renumera todo con paso 1 en vez de intercalar valores: es determinista y
 * evita que después de varios arrastres queden zIndex empatados que
 * dependan del orden del array para desempatar. El costo es que genera un
 * patch por elemento, así que solo se llama en un arrastre explícito.
 */
export function reordenar(documento, idsDeAtrasHaciaAdelante) {
  const doc = normalizar(documento);
  const elementos = { ...doc.elementos };
  idsDeAtrasHaciaAdelante.forEach((id, i) => {
    elementos[id] = { ...(elementos[id] || {}), zIndex: i + 1 };
  });
  return { ...doc, elementos };
}

/**
 * Los extras se borran de verdad. Los de la base solo se pueden marcar
 * `eliminado`, porque la plantilla los va a seguir trayendo.
 */
export function eliminarElemento(documento, id) {
  const doc = normalizar(documento);
  const esExtra = doc.extras.some((e) => e.id === id);

  if (esExtra) {
    const elementos = { ...doc.elementos };
    delete elementos[id];
    return { ...doc, elementos, extras: doc.extras.filter((e) => e.id !== id) };
  }

  return aplicarPatch(doc, id, { eliminado: true });
}

// ------------------------------------------------------------------
// Creación de elementos nuevos
// ------------------------------------------------------------------

let contadorId = 0;

export function nuevoId(prefijo = "x") {
  contadorId += 1;
  return `${prefijo}-${Date.now().toString(36)}${contadorId.toString(36)}`;
}

const DEFAULTS_POR_TIPO = {
  text: {
    text: "Texto nuevo",
    fontFamily: "Anton",
    fontSize: 48,
    fontWeight: 400,
    color: "#ffffff",
    align: "left",
    width: 400,
    zIndex: 50,
  },
  rectangle: {
    width: 240,
    height: 120,
    color: "#e2f018",
    borderRadius: 0,
    zIndex: 50,
  },
  circle: {
    radius: 80,
    color: "transparent",
    border: "5px solid #000000",
    zIndex: 50,
  },
  image: {
    src: "",
    width: 300,
    height: 300,
    objectFit: "contain",
    zIndex: 50,
  },
};

/** Crea un elemento nuevo listo para meter en `extras`. */
export function crearElemento(tipo, posicion = { x: 100, y: 100 }, props = {}) {
  const defaults = DEFAULTS_POR_TIPO[tipo];
  if (!defaults) throw new Error(`Tipo de elemento desconocido: ${tipo}`);
  return {
    id: nuevoId(tipo === "text" ? "txt" : tipo.slice(0, 3)),
    type: tipo,
    x: Math.round(posicion.x),
    y: Math.round(posicion.y),
    ...defaults,
    ...props,
  };
}

// ------------------------------------------------------------------
// Utilidades para la UI del editor
// ------------------------------------------------------------------

/** Ancho/alto aproximado de un elemento, para dibujar su caja de selección. */
export function medidaAproximada(el) {
  if (el.type === "circle") {
    const d = (Number(el.radius) || 40) * 2;
    return { width: d, height: d };
  }
  if (el.type === "image" || el.type === "rectangle") {
    return { width: Number(el.width) || 80, height: Number(el.height) || 80 };
  }
  const fontSize = Number(el.fontSize) || 20;
  const lineas = String(el.text || "").split("\n").length;
  return {
    width: Number(el.width) || Math.max(120, fontSize * 6),
    height: fontSize * 1.6 * lineas,
  };
}

/** ¿Este elemento muestra un dato de la base, o es puro adorno? */
export function esElementoDeDatos(el) {
  if (!el?.id) return false;
  if (el.id.startsWith("deco-")) return false;
  return true;
}

export function estaOculto(documento, id) {
  return !!normalizar(documento).elementos[id]?.oculto;
}