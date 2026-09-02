# futsal-ia — Fase 1

De un MP4 a posiciones sobre la cancha, en el mismo formato que llena un humano
en `TomaDatosOffline`.

## Qué hace y qué no

**Hace:** detecta personas, las sigue entre frames, decide de qué equipo son por
color, las proyecta al plano de la cancha, descarta lo que cae fuera (tribuna,
bancos, mesa de control) y escribe `snapshots_posicionales` y
`recorridos_jugador`. Entrega mapa de ocupación por celda Z1–Z4 × I/C/D y un
video de auditoría.

**No hace, a propósito:**

| | Por qué |
|---|---|
| Detectar la pelota | Fase 2. Objeto chico, rapidísimo y tapado la mitad del tiempo: necesita detector propio y modelo temporal |
| Contar pases y posesión | Fase 2, depende de la pelota |
| Reconocer jugadores | No se resuelve con video de cancha. Decisión registrada en el diccionario de métricas |
| Detectar cambios | Ídem. Sigue siendo manual en `TomaDatos`, que lo captura exacto |

## Instalación

Los 77 tests corren solo con `numpy` y `pytest`, sin GPU ni video. Para
procesar video de verdad hace falta el `requirements.txt` completo, que trae
OpenCV y el detector.

**Windows (PowerShell)** — una línea por vez, sin `&&`:

```powershell
cd ia
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install numpy pytest
python -m pytest tests\ -q
```

Si `Activate.ps1` falla porque la ejecución de scripts está deshabilitada
—lo normal en Windows—, habilitala solo para esa ventana con
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, o usá
`.\.venv\Scripts\activate.bat`. Si `python` abre la Microsoft Store, usá `py`
en su lugar (`py -m venv .venv`).

**Linux y macOS:**

```bash
cd ia
python3 -m venv .venv && source .venv/bin/activate
pip install numpy pytest
python -m pytest tests/ -q
```

Con el entorno activo se ve `(.venv)` al principio del prompt.

## Uso

### Antes de todo: un frame de verdad

La calibración se ata a la resolución del archivo. **Nunca calibres sobre una
captura de pantalla del reproductor**: la ventana recorta y escala, así que los
píxeles que clickeás no son los del archivo. Un ancho o alto impar delata una
captura, porque los codecs trabajan en bloques de 2x2 píxeles.

```bash
python -m futsal_ia.cli frame --video "C:\futsal\videos\periodo_PT.mp4" --en 2:00 --salida frame.png
```

`--video` acepta cualquier ruta; la relativa se resuelve desde donde esté
parada la consola. **No dejes los videos dentro de OneDrive, Dropbox o Drive**:
con sincronización a pedido el archivo figura con su nombre y su tamaño pero en
el disco no hay nada, y OpenCV falla como si el video estuviera roto. Una
carpeta local suelta y listo.

Sale del mismo camino que después va a leer el análisis: mismo decodificador,
misma resolución, mismos píxeles. No hace falta ffmpeg.

Si la GoPro partió la grabación en varios archivos, ahí sí conviene unirlos
antes con ffmpeg; si no, los tiempos del segundo pedazo salen corridos.

```bash
printf "file '%s'\n" GX01*.MP4 > lista.txt
ffmpeg -f concat -safe 0 -i lista.txt -c copy periodo_PT.mp4
```

### Calibrar: una vez por posición de cámara, no por partido

**Abrí `herramientas/calibrador.html` con doble click.** Es un HTML suelto, sin
servidor, sin npm y sin internet: no es parte de la app de React y no se llega
a él con `npm run dev`.

1. Cargás un frame de cualquier partido (mejor con la cancha vacía).
2. Clickeás los puntos de referencia. Hay una lupa de 6x, que es lo que hace
   que esto sirva: a 2700 px de ancho un click a ojo se va varios píxeles, y
   cada píxel de error en la calibración se paga después en centímetros de
   error en toda la cancha.
3. Los que no se vean —una esquina tapada por una baranda, por ejemplo— se
   saltean. **No hacen falta las cuatro esquinas**: la calibración es por
   mínimos cuadrados. Con 4 puntos cualesquiera alcanza, pero marcá todos los
   que puedas: con 4 el error da siempre cero y engaña.
4. Ajustás el giro y el margen del recorte.
5. Bajás `marcas.json` y `encuadre.json`.

Después, en la terminal:

El navegador baja `marcas.json` y `encuadre.json` a la carpeta de Descargas,
no a la del proyecto: movelos o pasá la ruta completa.

```bash
# Calibrar. Las marcas vienen en coordenadas del frame ORIGINAL y el encuadre
# las convierte solo: nadie clickea sobre una imagen ya recortada.
python -m futsal_ia.cli calibrar \
    --marcas marcas.json --encuadre encuadre.json --salida calibracion.json

# Qué precisión da esa posición de cámara, celda por celda y por período
python -m futsal_ia.cli precision --calibracion calibracion.json

# La lista de puntos, si querés verla en texto
python -m futsal_ia.cli puntos
```

**Verificá antes de confiar.** Abrí `herramientas/verificador.html` y cargale el
frame, `calibracion.json`, `encuadre.json` y `marcas.json`: dibuja la cancha
calculada encima de la foto. Si las líneas verdes caen sobre las líneas reales
del piso, está bien. Un RMS bajo con las líneas corridas significa que marcaste
mal de forma consistente, y solo se ve mirando.

Con `calibracion.json` + `encuadre.json` guardados, esto no se vuelve a hacer
nunca más mientras la cámara no se mueva. Sirven para todo el archivo, viejo y
nuevo.

### Preparar el partido: marcar los saques

**Abrí `herramientas/partido.html`.** Cargás el video, lo movés hasta el saque
de cada período —hay salto de a un cuadro, y las flechas ← → también— y
clickeás "Marcar acá". Completás el `club_id`, el id del partido y las rutas.

Te baja un `partido.json` y te escribe los comandos listos para copiar. No hay
que tipear minutos a mano, que es de donde salen los desfasajes.

El lado de la cancha se pregunta **una sola vez**, para el primer tiempo: los
equipos cambian en el entretiempo y el segundo se deduce. Si eso sale mal no
falla nada, simplemente todos los mapas del ST quedan espejados.

### Analizar: por partido y por período

Primero, dos segundos de chequeo que ahorran horas:

```bash
python -m futsal_ia.cli video --video periodo_PT.mp4 --encuadre encuadre.json
```

Si dice que no coinciden, la calibración no vale para ese archivo y hay que
rehacerla sobre un frame extraído de él. Analizar tarda horas: descubrirlo
recién ahí es tirar una tarde.

**Probá primero con un tramo corto**, no con el período entero. No hace falta
cortar un archivo: `--desde` y `--duracion` recortan el tramo a analizar.

En CPU el análisis corre bastante por debajo del tiempo real, así que un
período completo puede llevar varias horas. Dos minutos alcanzan de sobra para
ver si el pipeline funciona.

Con el `partido.json` al lado, el comando es de una línea:

```bash
python -m futsal_ia.cli analizar --config partido.json --periodo PT \
    --prueba --salida analisis_PT.json --overlay auditoria_PT.mp4
```

`--prueba` analiza dos minutos en vez del período entero. Sacalo cuando el
overlay se vea bien.

Todo lo del `partido.json` se puede pisar desde la consola (`--video`,
`--saque`, `--invertida`, `--desde`, `--duracion`): el archivo es la comodidad,
no la autoridad.

`--saque` es el instante del video donde arranca el período. Los tiempos se
guardan **relativos al saque**, no al principio del archivo, que es lo que
después permite cruzarlos con los cambios que carga `TomaDatos`.

En el segundo tiempo se agrega `--invertida`, porque los equipos cambian de
lado y las zonas se cuentan desde el arco propio.

## Mirá el overlay antes de creerle al resumen

El resumen dice "1.847 detecciones, 23 tracks" tanto si el análisis salió bien
como si estuvo diez minutos siguiendo al técnico rival. Treinta segundos de
`auditoria_PT.mp4` te dicen en qué estado está. Qué mirar:

- Recuadros sobre la tribuna → falla el filtro de cancha.
- Puntos del radar donde no están los jugadores → falla la calibración.
- Colores de equipo que bailan → falla el clasificador, o la cámara tenía la
  exposición en automático.
- Números que saltan → el seguidor pierde identidades. En futsal es esperable;
  lo que importa es cuánto.

## Estado de verificación

Honestidad sobre qué está probado de verdad:

| Módulo | Estado |
|---|---|
| `cancha.py` | **Verificado.** 9 tests. La grilla Z1–Z4 × I/C/D se compara contra el `zonaDe()` real de `src/offline/modelo.js` corriéndolo con node sobre una grilla densa |
| `geometria.py` | **Verificado.** 17 tests contra una cámara sintética en un corner, de la que conocemos la respuesta correcta |
| `equipos.py` | **Verificado.** 12 tests de clustering de color |
| `salida.py` | **Verificado.** 13 tests; los campos se comparan contra `crearSnapshot()` y `crearRecorrido()` reales de modelo.js |
| `preproceso.py` | **Verificado.** 14 tests del giro y recorte determinista |
| `herramientas/calibrador.html` | **Sin ejecutar en navegador.** Tests que verifican que su lista de puntos no se desincronice de `cancha.py` y que no dependa de ningún CDN |
| `herramientas/verificador.html` | **Sin ejecutar en navegador.** Ídem, sobre las coordenadas en metros de la cancha |
| `herramientas/partido.html` | **Sin ejecutar en navegador.** Tests que verifican que el `partido.json` que baja tenga las claves que el CLI lee y genere el comando que el CLI entiende |
| `deteccion.py` | **Parcial.** El partido en mosaicos y la fusión están verificados (11 tests); el detector en sí necesita GPU y los pesos |
| `seguimiento.py` | **Sin ejecutar.** Necesita `supervision` instalado |
| `lente.py` | **Sin ejecutar.** Necesita OpenCV y un video real |
| `pipeline.py` | **Sin ejecutar de punta a punta.** La orquestación no se probó con un video |
| `overlay.py` | **Sin ejecutar.** |

Los verificados son el núcleo que decide si los números salen bien o
espejados. El resto se prueba recién con el primer partido filmado.

```bash
python -m pytest tests/ -q     # 144 tests, sin GPU ni video
```

## Decisiones que están en el código y conviene no olvidar

1. **Se proyectan los PIES**, el medio del borde inferior del recuadro, no el
   centro del cuerpo. Solo los pies están sobre el plano de la cancha.
2. **Homografía por mínimos cuadrados con 15 puntos**, no con 4. Con cuatro
   esquinas el residuo da siempre cero y engaña; con quince el error se reparte.
   Hay un test que lo mide.
3. **10 fps de análisis**, no los 60 del archivo. Un jugador de futsal se mueve
   menos de 80 cm entre frames a esa cadencia. La pelota sí va a necesitar la
   cadencia completa, pero eso es Fase 2.
4. **El equipo de cada track se decide por voto de mayoría**, no por el primer
   frame.
5. **El pipeline escribe un JSON, no toca Supabase.** Un análisis sin revisar no
   debería poder ensuciar la tabla de eventos del club.
6. **El giro y el recorte son un dato, no un paso manual.** Viajan en un JSON
   junto a la calibración y se aplican solos. Si el recorte saliera tres
   píxeles distinto un día, la homografía seguiría calculando sin fallar y
   todas las posiciones quedarían corridas para siempre.
7. **Primero se endereza la lente, después se encuadra.** Al revés no funciona:
   la corrección depende de dónde está el centro óptico del sensor, y recortar
   lo corre.
8. **El informe de precisión se calcula por período.** Con un arco cerca y otro
   lejos, la misma celda cambia de calidad hasta 8x entre tiempos.
9. **Detector RF-DETR (Apache 2.0) por defecto.** Ultralytics YOLO es AGPL-3.0 y
   está detrás de un aviso: si esto se comercializa, obliga a abrir el código
   del servicio o a pagar licencia.
