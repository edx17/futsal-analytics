# Reportes de cierre de año: cómo funcionan (brief de diseño)

Este documento explica qué son los reportes de VirtualClub, cómo están armados
y qué se puede tocar para mejorar su diseño (documento en pantalla, PDF y
presentación). Está pensado para quien vaya a rediseñarlos visualmente.

**En una línea:** los datos y los textos ya están resueltos y testeados; lo que
se busca es que **se vean mejor**. El trabajo es de **presentación**, no de
cálculo.

---

## 1. Qué es

En **Plantel → Reportes** (ruta `/reportes`, para superuser, manager, admin y
CT) se genera el reporte de fin de temporada. Hay cinco tipos:

| Tipo | Qué cuenta | Se elige |
|---|---|---|
| **Jugador** | La temporada de un jugador: números, partido a partido, sus mejores partidos, cómo está en su categoría, compromiso, wellness, cierre | Temporada, categoría, jugador |
| **Categoría** | El año de una categoría: números, partido a partido, cuándo y cómo llegan los goles, plantel, liga, compromiso, cierre | Temporada, categoría |
| **Club** | Todas las categorías juntas: números del club, categoría por categoría, liga, figuras, cantera, compromiso | Temporada |
| **Torneo** | Lo de categoría acotado a un torneo + primera vs segunda rueda + rival por rival | Temporada, torneo |
| **Jugador vs jugador** | Comparativo cara a cara de dos jugadores | Temporada, categoría, jugador A y B |

Además se elige **para quién es** (la audiencia), y cambia el tono y el detalle:

- **Cuerpo técnico** (`ct`): todo, incluido "Para trabajar".
- **Jugador y familia** (`jugador`): lo mismo dicho en positivo, sin el detalle
  del wellness ni los últimos puestos.
- **Comisión directiva** (`directiva`): el resumen, la evolución y el compromiso.

Cada reporte se ve de **tres maneras**, siempre con el mismo contenido:

1. **Documento** en pantalla (tema oscuro de la app, tipo dashboard).
2. **PDF** (botón DESCARGAR PDF = imprimir del navegador): fondo blanco, A4,
   varias hojas, logo VF arriba a la derecha y pie en cada hoja.
3. **Presentación** (botón ▶ PRESENTAR): pantalla completa, una diapositiva por
   sección, para una reunión, un televisor o la cena de fin de año. Se maneja con
   flechas, espacio, deslizando el dedo o tocando los costados; Escape sale.

---

## 2. Cómo está armado (lo importante)

```
src/analytics/reporteJugador.js       ┐
src/analytics/reporteCategoria.js     │  CÁLCULO: funciones puras, con tests.
src/analytics/reportesClubTorneo.js   ┘  Entran datos → sale { titulo, subtitulo, audiencia, secciones }.
                                          NO TOCAR para el rediseño.

src/pages/Reportes.jsx       La pantalla: selectores, botones, documento y la copia para imprimir.
src/reportes/Bloques.jsx     DIBUJO: cómo se ve cada tipo de bloque.          ← rediseñar acá
src/reportes/Presentacion.jsx  El modo presentación (diapositivas).          ← rediseñar acá
src/reportes/reportes.css    Todos los estilos: pantalla, PDF (@media print)
                             y presentación.                                  ← rediseñar acá
```

Un reporte es una lista de **secciones**, y cada sección es una lista de
**bloques**. Las funciones de cálculo deciden *qué* bloques hay; los
componentes de `Bloques.jsx` deciden *cómo se ven*. Así, un cambio de diseño en
un bloque se aplica a los cinco reportes, al PDF y a la presentación a la vez.

```js
{
  titulo: 'Reporte de TORNEO 2026',
  subtitulo: 'Tercera · 2026',
  audiencia: 'ct',
  secciones: [
    { id: 'portada',  titulo: '…', bloques: [{ tipo: 'portada', … }] },
    { id: 'numeros',  titulo: 'La temporada en números', bloques: [{ tipo: 'kpis', items: [...] }] },
    { id: 'evolucion', titulo: 'Partido a partido', bloques: [{ tipo: 'serie', … }, { tipo: 'texto', … }, { tipo: 'kpis', … }] },
    …
  ]
}
```

### Los 8 tipos de bloque (el contrato de datos)

Este es el "idioma" de los reportes. Los campos de cada bloque **no se
cambian**: se puede cambiar cómo se dibujan, pero los datos llegan así.

| `tipo` | Para qué | Campos |
|---|---|---|
| `portada` | Encabezado del reporte | `nombre`, `foto` (url o null → inicial), `club`, `titulo`, `dorsal`, `posicion`, `categoria`, `escudo`. Comparativo: además `foto2`, `nombre2` (una foto a cada lado) |
| `kpis` | Números grandes en tarjetas | `items: [{ rotulo, valor, detalle?, destacado? }]` |
| `serie` | Línea partido a partido (SVG) | `titulo`, `puntos: [{ x (fecha), y, rival, resultado 'G'/'E'/'P', goles? }]`, `min?`, `max?`, `promedio?`, `referencia?`, `etiquetaReferencia?`, `marcarGoles?` |
| `barras` | Barras horizontales con raya de referencia | `titulo`, `escala?`, `leyendaReferencia?`, `items: [{ rotulo, valor, texto, referencia?, textoReferencia?, tope? }]` |
| `ranking` | Puesto en su categoría por métrica | `items: [{ rotulo, puesto, de }]` (los 3 primeros son "podio") |
| `tabla` | Tablas (goleadores, rivales, liga, cara a cara) | `titulo`, `columnas`, `filas` (una celda puede ser `{ v, fuerte }`), `resaltarFila?`, `resaltarColumna?`, `resaltarUltima?` |
| `lista` | "Lo mejor del año", "Para trabajar" | `titulo`, `tono: 'bien' / 'trabajo' / 'neutro'`, `items: [texto]` |
| `texto` | Una frase de lectura | `texto` |

En `serie` y `barras` los colores tienen significado: **verde = ganado,
amarillo = empatado, rojo = perdido**, y la raya es la referencia (promedio de
la categoría, el otro jugador en el comparativo, o los goles en contra).

### Estilos

- Todo usa clases `rp-*` y variables CSS propias, que en pantalla toman los
  colores del tema de la app:
  `--rp-acento`, `--rp-panel`, `--rp-borde`, `--rp-texto`, `--rp-dim`,
  `--rp-bien`, `--rp-mal`, `--rp-medio`.
- El PDF redefine esas variables a blanco y negro con acento verde oscuro
  (`.rp-impresion`), y la presentación a fondo casi negro (`.rp-presentacion`).
- Cambiar la paleta es cambiar esas variables en tres lugares.

---

## 3. Lo que NO hay que romper

1. **No tocar `src/analytics/reporte*.js`**: el cálculo y los textos tienen
   tests y salen de los mismos números que el resto de la app.
2. **El PDF se imprime desde una copia aparte.** La app vive en un contenedor de
   alto fijo con overflow oculto; si se imprime desde ahí sale **una sola hoja
   cortada**. Por eso `Reportes.jsx` monta una copia del reporte directamente en
   el `<body>` (`createPortal`, clase `.rp-impresion`), que solo se ve al
   imprimir. Esa estructura tiene que quedar:
   - `.rp-hoja-cabeza` (logo VF) y `.rp-hoja-pie` (pie) son `position: fixed`
     → el navegador los repite en cada hoja;
   - la `<table class="rp-hoja">` con `thead`/`tfoot` vacíos les reserva el
     lugar en cada hoja para que no tapen el contenido.
3. **Saltos de página:** las secciones largas se pueden partir entre hojas, pero
   las piezas chicas no (`break-inside: avoid` en KPIs, gráficos, barras,
   filas, portada), los títulos no quedan solos al pie y las tablas repiten el
   encabezado. Cualquier rediseño tiene que seguir saliendo bien en A4.
4. **Gráficos en SVG o HTML/CSS**, no en `<canvas>`: así salen nítidos y
   iguales en pantalla, PDF y presentación. Si se usa una librería de gráficos,
   que renderice SVG y que funcione al imprimir. En el PDF el fondo es blanco:
   nada de colores que dependan de un fondo oscuro.
5. **La presentación arma las diapositivas sola**: una por sección, y si una
   sección tiene más de un bloque "grande" (`serie`, `barras`, `tabla`,
   `ranking`) se parte en varias con el mismo título; `texto` y `lista`
   acompañan al bloque anterior. Los bloques reciben `grande={true}` en la
   presentación, para dibujarse más grandes.
6. **Celular:** la pantalla de reportes se usa también en el celular (hasta
   375 px de ancho). Las tablas anchas hacen scroll horizontal dentro de su caja.
7. Los textos de la interfaz están en **español rioplatense**.

---

## 4. Lo que queremos mejorar (para el rediseño)

- **Documento en pantalla:** que se vea como un informe de club profesional y
  no como un panel de datos genérico. Mejor jerarquía (portada con más
  presencia, números más protagonistas) y más aire entre secciones.
- **PDF:** que parezca un informe para entregar en mano a un jugador, su familia
  o la comisión directiva: portada más fuerte (escudo, foto, temporada),
  tipografía cuidada y tablas más prolijas, siempre en A4 y con el logo VF y el
  pie en cada hoja.
- **Presentación:** que luzca en un televisor o un proyector: números enormes,
  transiciones suaves, la portada como "carátula" y un cierre con lo mejor del
  año. Que siga funcionando con teclado y con el dedo.
- **Coherencia** con la identidad de VirtualClub (logo VF naranja sobre negro,
  `public/android-chrome-192x192.png`) y con los colores del club cuando estén
  disponibles (escudo en la portada).

---

## 5. Cómo probarlo

1. Entrar como CT o admin → **Plantel → Reportes**.
2. Probar los cinco tipos y las tres audiencias: cambian las secciones que
   aparecen.
3. **DESCARGAR PDF** → en el diálogo de impresión, "Guardar como PDF", A4.
   Revisar que no haya hojas cortadas ni hojas con solo el pie, y que el logo y
   el pie salgan en todas.
4. **▶ PRESENTAR** → recorrer con flechas y salir con Escape.
5. Correr `npx vitest run` (tienen que pasar todos los tests) y `npm run build`.
