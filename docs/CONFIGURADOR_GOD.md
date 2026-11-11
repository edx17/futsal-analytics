# Configurador GOD · plan de reorganización de Juegos

Objetivo: **centralizar en un solo lugar todo lo que se administra del módulo
de Juegos** (cartas, placas, eventos, sobres, usuarios, misiones y V-Coins) y
dejar **MySquad sólo para jugar a armar el quinteto**.

Decisiones tomadas con el dueño:

| Tema | Decisión |
|---|---|
| Dónde | Pantalla propia **`/god`**, con menú lateral por secciones. Se saca el panel GOD de adentro de Sobres. |
| Quién | **Superusuario**: todo. **Manager**: sólo *Alta de cartas de premio* y *Placas* (lo que hoy hace desde MySquad → Premios). |
| MySquad | Sólo **CANCHA**: armar el quinteto (de 5) y **publicarlo en redes**. Sin Premios, Especiales ni Historial. Se abre también a los jugadores. |
| Misiones | Configurables, pero sólo sobre **acciones que la base ya mide** (no se pueden inflar desde el navegador). |
| Torneo V-Draft y Gmail · Hinchas | **Quedan como están**, sólo se mudan al configurador. |
| Carta básica | Es la **inicial** del jugador y **una carta publicada no se pisa nunca**. Lo que mejora llega como cartas nuevas: las de partido (POTW/POTM), TOTW/TOTM/TOTY o una segunda tirada. Quien no tiene partidos al empezar la temporada recibe su carta base cargada a mano. |

---

## 1. Mapa del configurador

```
/god
├─ PROBAR            abrir cualquier sobre/escena sin gastar (ya existe)
├─ CARTAS
│   ├─ Alta          básicas (salen solas de los partidos) y especiales:
│   │                premios (TOTW, TOTM, POTM, POTW, goleadores, asistidores,
│   │                recuperadores, presencia, MVP…), TOTY, Copa Futuro,
│   │                Héroes, Halloween                    · manager: sólo premios
│   ├─ Modificar     foto, media (GBL), stats y estilo de carta
│   └─ Baja          suspender (quien la tiene la conserva) o eliminar (con devolución de V-Coins)
├─ PLACAS            publicar la placa con cartas para redes  · manager también
├─ EVENTOS           alta, edición, suspensión y eliminación
├─ SOBRES            alta, modificación y baja; qué trae cada uno y su carátula
├─ USUARIOS          alta, baja, baneo, V-Coins (individual/masivo, sumar/quitar), eventos multiplicadores
├─ MISIONES          alta, baja y modificación de las misiones diarias
├─ V-COINS           los premios de cada juego (Penales, V-Draft, repetidas, Duelos, misiones)
├─ TORNEO V-DRAFT    como está
└─ GMAIL · HINCHAS   como está
```

## 2. Qué existe hoy y qué falta

| Sección | Hoy | Falta |
|---|---|---|
| Probar | ✅ `PanelGod › Probar` | mudarlo |
| Cartas · Alta | ✅ Héroes, Halloween, TOTY, Copa Futuro (pestañas sueltas). Premios en **MySquad › Premios** | juntarlos bajo *Alta* con un selector de tipo; traer Premios de MySquad |
| Cartas · Modificar | ✅ foto y media (`cartas_fotos`, `cartas_ajustes.ovr`). Fotos especiales en **MySquad › Especiales** | **stats** (atributos) y **estilo** de carta: hay que ampliar `cartas_ajustes` (migración) |
| Cartas · Baja | ✅ suspender (`activa`) y eliminar con devolución | mudarlo |
| Placas | ✅ en **MySquad › Premios / Historial** | mudarlo a su sección |
| Eventos | ✅ alta, edición, suspensión | **eliminar** (sólo si nadie lo abrió; si no, se archiva) |
| Sobres | ✅ crear, editar contenido, rarezas, colores, suspender | **carátula**: subir una imagen propia para el paquete |
| Usuarios | ✅ suspender, V-Coins a uno/elegidos/todos, eventos x2 | **alta** (atajo a la invitación con PIN), **baja** y **baneo** con motivo y fecha de fin, **quitar** V-Coins masivo |
| Misiones | ✅ configurables (etapa 4) | — |
| V-Coins | ✅ configurables (etapa 5): penales, V-Draft, desafío, duelos y repetidas | — |
| Torneo V-Draft | ✅ `GodTorneo` | mudarlo |
| Gmail · Hinchas | ✅ `InvitacionesJuego` | mudarlo |

## 3. Etapas

Cada etapa es un PR que se puede usar solo. Las migraciones las aplica el dueño.

### Etapa 1 · La casa nueva (sin migraciones)
- Ruta `/god` (superusuario y manager) con menú lateral y entrada en el menú.
- Se mudan las pestañas actuales a sus secciones, sin cambiar lo que hacen.
- Premios, Especiales e Historial salen de MySquad y pasan a *Cartas › Alta*,
  *Cartas › Modificar* (fotos) y *Placas*.
- El manager ve sólo *Alta (premios)* y *Placas*.
- En Sobres queda un acceso "⚡ Configurador GOD" en lugar del panel.

### Etapa 2 · MySquad sólo cancha + jugadores
- MySquad sin secciones: la cancha, la formación y el banco.
- Botón **Publicar** que arma una imagen del quinteto (con las placas que ya
  usamos para redes) para compartir o descargar.
- Se abre a los jugadores (también desde el kiosco y el menú de Juegos).

### Etapa 1b · Alta sin pisar nada (hecha)
- *Alta › Básicas* compara con el catálogo: **NUEVAS** (se eligen una por una
  y se publican sólo esas), **YA PUBLICADAS** (no se tocan; si hoy daría otra
  media se avisa), **ELIMINADAS** (no vuelven) y **SIN CARTA** (carta base a
  mano: media y 6 stats sugeridas por puesto).
- El aviso de "cartas guardadas sin publicar" del panel manda a elegirlas ahí.

### Etapa 3 · Modificador de cartas completo (migración)
- `cartas_ajustes` suma `atributos` (las 6 stats) y `estilo` (TOTY, TOTW,
  TOTM, POTM, POTW, goleador, asistidor, recuperador, Halloween, Héroe…).
- Un solo editor por carta: foto, media, stats y estilo, con la vista previa
  de la carta al lado.

### Etapa 3b · Segunda tirada
- Una tirada nueva por mes (o cuando se decida) con las stats analizadas del
  período y umbrales propios: son cartas **nuevas** (clave propia), la básica
  queda como está. Se eligen y publican igual que en *Alta › Básicas*.

### Etapa 4 · Misiones (migración `20261115120000_juegos_misiones_config.sql`, hecha)
- Tabla `juegos_misiones_def`: acción, meta, premio, días de la semana,
  activa, orden. Se cargan las 4 de hoy para que nada cambie.
- Acciones que se pueden usar: abrir sobres, jugar / ganar partidos de
  V-Draft, ganar tandas de penales, jugar / ganar duelos, jugar el desafío del día.
- `_juegos_misiones` las lee de la tabla (el progreso se sigue contando solo).

### Etapa 5 · V-Coins por juego (migración `20261116120000_juegos_premios.sql`, hecha)
- Tabla `juegos_premios` (una fila por club) con los valores de hoy como
  base: penales por nivel, V-Draft (partido, victoria, desafío, torneo),
  duelos (premio del ganador, tope por día, apuesta máxima), repetidas por
  rareza.
- Las funciones de la base leen de ahí; si no hay fila, usan los de hoy.

### Etapa 6 · Usuarios, eventos y sobres (migración chica)
- Baneo con motivo y hasta cuándo; baja (se oculta, conserva la historia).
- Quitar V-Coins masivo.
- Eliminar eventos sin aperturas (los otros se archivan).
- Carátula propia de cada sobre (imagen subida al storage).

## 4. A futuro (en carpeta, no se hace ahora)

- **Marketplace de repetidas**: publicar una carta repetida a precio fijo o en
  subasta (oferta mínima, fecha de cierre). La base mueve carta y V-Coins en
  una sola transacción; comisión opcional del club.
- **Intercambio**: propuesta carta por carta (repetidas o no), el otro acepta
  o rechaza; vence a las 48 h. Mismo modelo que los retos de Duelos.
- **Venta de V-Coins por plata real** (sólo la vende el superusuario):
  1 V-Coin = 1 ARS como referencia y promociones por cantidad. Requiere un
  medio de pago (p. ej. Mercado Pago con webhook que acredita en la base),
  términos y condiciones y revisar lo impositivo antes de abrirlo. Se acredita
  sólo desde el servidor, nunca desde el navegador.
