# Análisis de partidos por IA (video → datos)

> Estado: **propuesta**. Nada de esto está construido todavía. Este documento
> dice qué se puede lograr, con qué herramientas libres, cómo encaja con lo que
> ya tiene la app y qué hace falta para arrancar.

## La idea

Se sube el video del partido (archivo MP4 o link de YouTube, Vimeo o Drive). A la
noche una compu del club lo procesa sola. A la mañana siguiente la app tiene:

- dónde estuvo cada jugador en cada momento (posicionamiento, mapa de calor);
- cuánto corrió, a qué velocidad y cuántos sprints hizo;
- quién tocó la pelota y cuántas veces;
- los pases, las cadenas de pases, las pérdidas y las recuperaciones;
- los toques reales del arquero;
- la **foto** de cómo estaban parados los diez en cada gol, a favor y en contra.

## Lo que había antes

`src/pages/VideoTracingIA.jsx` es un prototipo que no está en ningún menú. Funcionaba así:

1. Subía el video a Storage (`futsal_videos`).
2. El usuario tocaba 4 puntos de la cancha en el video para calibrar.
3. Mandaba el link a un servidor Python (`/analyze`) que corría en una compu y se
   exponía con ngrok.
4. El servidor devolvía, cuadro por cuadro, jugadores con un número de seguimiento.
5. A mano se asociaba cada número a un jugador y se guardaba todo en `tactical_analysis`.

**El servidor Python nunca se subió al repo**, así que no hay nada que reutilizar
de esa parte. La tabla `tactical_analysis` tampoco tiene migración en el repo. La
idea de base (calibrar con puntos y asociar números a jugadores) sí sirve, y se
mantiene.

## ¿Es posible? Sí, con estos niveles de confianza

La confianza depende sobre todo de **la cámara**. Lo que sigue supone una cámara
**fija, alta y que tome la cancha entera** (ver "La cámara" más abajo).

| Dato | Confianza esperada | Por qué |
|---|---|---|
| Posición de cada jugador, mapa de calor, centro de gravedad | **Alta** | Detectar personas es lo que mejor hacen estos modelos. |
| Distancia recorrida, velocidad, sprints, aceleraciones | **Alta** con cámara fija | Sale de la posición calibrada en metros. Con cámara que se mueve baja mucho. |
| Equipo de cada jugador (por color) | **Alta** | Agrupar por color de camiseta es confiable. Arqueros y árbitros se separan aparte. |
| Quién es cada jugador | **Media → alta con ayuda** | El seguimiento pierde a la gente cuando se cruzan. Lo resolvemos con los cambios que ya carga la toma en vivo (en cada minuto hay sólo 5 candidatos) y una revisión corta a la mañana. Leer el dorsal queda para más adelante. |
| Pelota | **Media** | Es chica, rápida y queda tapada. Se completa interpolando entre cuadros. |
| Contactos con la pelota, posesión | **Media** | Salen de "qué jugador está pegado a la pelota". |
| Pases, cadenas, pérdidas, recuperaciones | **Media** | Salen de los cambios de poseedor: mismo equipo = pase, otro equipo = pérdida/recuperación. |
| Toques del arquero | **Media-alta** | Pelota que llega al arquero o cambia de dirección cerca de él. |
| Foto en cada gol | **Alta** | El minuto del gol ya lo tenemos de la toma en vivo: se busca ese cuadro y se toman las posiciones. |
| Remates | **Media** | Pelota que sale rápido hacia el arco. Se cruza con los remates de la toma en vivo. |

Todo lo de confianza media se guarda **con su nivel de confianza**. A la mañana la
app muestra primero lo dudoso para confirmarlo con un toque.

## Cómo encaja con lo que ya existe

El **Análisis Offline** ya tiene casi todo el modelo de datos que la IA necesita
llenar: eventos con origen y destino, cadenas (`secuencias`), fotos (`snapshots`),
recorridos de cada ficha, la línea de la pelota y el mapa de calor. La IA pasa a ser
**un Análisis Offline que se carga solo**:

- lo que detecta se escribe con `origen = 'ia'` y su confianza;
- las pestañas de Goles, Balance, Minutos y Calor funcionan sin cambios;
- lo que el cuerpo técnico corrige a mano queda marcado como corregido (y sirve para
  entrenar mejor el modelo).

La **toma en vivo** ayuda mucho: da los minutos de los goles y los cambios. Con eso se
sabe quiénes estaban en cancha en cada momento.

## Cómo funciona (arquitectura)

```
App (subir video o pegar link) ──► Supabase: cola "video_analisis"
                                          │
        Compu del club (de noche) ◄───────┘  pregunta cada minuto si hay trabajo
        "Analizador VirtualClub" (Python)
          1. baja el video (yt-dlp / Storage) y lo normaliza (ffmpeg)
          2. calibra la cancha (los puntos que marcaste en la app)
          3. detecta jugadores, arqueros, árbitros y pelota
          4. sigue a cada uno cuadro a cuadro
          5. separa los equipos por color
          6. asocia cada seguimiento a un jugador (cambios de la toma + revisión)
          7. calcula: velocidades, posesión, pases, cadenas, fotos de gol…
          8. sube los resultados ──► Supabase (tablas + Storage)
                                          │
App a la mañana: aviso "Análisis listo" ◄──┘  + pantalla de revisión
```

- La compu **sale** a buscar trabajo: no hace falta abrir puertos ni usar ngrok.
- La compu no tiene la clave maestra de Supabase: usa una llave propia del club que
  sólo puede tomar trabajos y subir resultados de ese club.
- Si se corta la luz o internet, retoma donde quedó.

## Herramientas (todas gratis)

Elegidas para que se puedan usar en un producto comercial sin pagar licencias.

| Para qué | Herramienta | Licencia |
|---|---|---|
| Detectar jugadores y pelota | **RF-DETR** (tamaños Nano/Small/Medium) o **RT-DETR** | Apache 2.0 |
| Seguimiento cuadro a cuadro, conteos, dibujos | **supervision** + **ByteTrack** (Roboflow) | MIT |
| Equipos por color, radar, calibración de cancha (ejemplos de fútbol) | **roboflow/sports** | MIT |
| Bajar videos de YouTube, Vimeo, Drive | **yt-dlp** | Unlicense |
| Cortar y normalizar video | **ffmpeg** | LGPL |
| Datos de futsal para entrenar | Datasets de futsal en Roboflow Universe (varios CC BY 4.0) | Revisar uno por uno |
| Referencia de todo el circuito (posición, equipo, dorsal) | **SoccerNet sn-gamestate** | Revisar antes de usar código |

**Ojo con YOLO de Ultralytics (YOLOv8/YOLO11):** es AGPL-3.0. Usarlo dentro de un
servicio comercial obliga a publicar el código o a comprar su licencia. Por eso
proponemos RF-DETR / RT-DETR.

No encontramos ningún proyecto hecho **para futsal**: todos son de fútbol 11. Lo
adaptamos: la cancha es otra (40×20), la pelota es distinta y hay mucho más
contacto. Hace falta entrenar el detector con imágenes de futsal (hay datasets
públicos y después sumamos cuadros de los partidos del club).

## La cámara (lo que más importa)

| | Recomendado | Aceptable | Difícil |
|---|---|---|---|
| Ubicación | Fija, alta (4–6 m o tribuna alta), en la mitad de la cancha | Fija en una esquina alta | A la altura de la cancha |
| Encuadre | Cancha entera siempre | Casi entera | Sigue la jugada con zoom |
| Calidad | 1080p, 50 cuadros por segundo | 1080p, 25–30 | 720p o menos |

La **fase 1 sólo soporta cámara fija**. Con cámara que se mueve hay que calibrar
cuadro por cuadro (detectando las líneas de la cancha): queda para la fase 3.

## La compu que trabaja de noche

- **Ideal:** una PC con placa NVIDIA de 8 GB o más (por ejemplo, una RTX 3060). Un
  partido debería estar en 1 a 2 horas.
- **Sin placa de video:** funciona, pero mucho más lento. Analizando menos cuadros
  por segundo debería entrar en una noche, a costa de perder precisión con la pelota.
- **Alternativa sin hardware:** alquilar una compu con GPU en la nube sólo mientras
  procesa. Se paga por uso y no hace falta tener nada prendido en el club.
- Colab y Kaggle son gratis pero cortan las sesiones: no sirven para dejarlo solo
  toda la noche.

## Plan por etapas

| Etapa | Qué se entrega | Para validar |
|---|---|---|
| **0. Prueba con un video real** | 5 minutos de un partido del club: jugadores detectados y seguidos, radar 2D, velocidades. Un informe con lo que anda y lo que no. | Que con tu cámara la calidad alcance. |
| **1. El circuito completo** | Subir/pegar link, calibrar en la app, cola, Analizador para la compu, aviso a la mañana. Datos: posicionamiento, mapa de calor, distancias, velocidades, sprints, foto de cada gol. Revisión de identidades. | Un partido entero procesado de noche. |
| **2. La pelota** | Posesión, contactos, pases, cadenas, pérdidas y recuperaciones, toques del arquero, remates. Todo con confianza y revisión. | Comparar contra un partido cargado a mano en Análisis Offline. |
| **3. Más automático** | Lectura de dorsales, cámara que se mueve, detector entrenado con las correcciones del club. | Menos revisión a la mañana. |

## Qué necesitamos del club

1. **2 o 3 videos de partidos completos** grabados como se graba siempre (y decirnos
   cómo está puesta la cámara).
2. **La compu que va a trabajar de noche:** sistema operativo, si tiene placa de video y cuál.
3. Para la etapa 2, **2 o 3 horas de alguien** corrigiendo cuadros (dónde está la
   pelota, quién es quién) para entrenar el detector de futsal.
4. Seguir cargando la toma en vivo, al menos los goles y los cambios: es lo que
   permite saber quién es quién sin leer dorsales.
