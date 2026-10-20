# Cinemáticas de apertura de sobres

Las aperturas especiales de los sobres son **videos renderizados en Blender** a
partir de una escena 3D del pasillo de un pabellón de futsal. La app sólo los
reproduce: la interfaz, el botón SALTAR, la mejor carta y las demás cartas son
de la app (`src/components/sobres`).

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `escena_pasillo.py` | La escena de V-Draft (el pasillo): geometría, materiales, luces, cámara, animación y render. Aprobada: no se modifica. |
| `variantes.json` | Los parámetros de V-Draft. |
| `escena_pabellon.py` | La escena del pabellón y los guiones de las demás variantes. |
| `perfiles.json` | Los perfiles (Élite, Épico, Leyenda, Excepcional, evento demo). |
| `musica.py` | La música de cada cinemática. |
| `efectos.py` | El público al dar vuelta las cartas, a partir de las grabaciones de `sonidos/` (Pixabay). |
| `pasillo_vdraft.blend`, `pabellon_<perfil>.blend` | Las escenas guardadas, editables en Blender 4.2. |
| `texturas/` | Etiquetas del sobre y gráficas de las cajas de luz (generadas por el script con Pillow). |
| `codificar.sh` | Pasa los cuadros a `public/cine/<variante>.webm`, `.mp4` y `.jpg` (póster). |

## La escena

Todo es geometría 3D y materiales PBR hechos con nodos de shader:

- **Piso**: epoxi negro pulido; la rugosidad varía con manchas de uso, así que los reflejos de las luminarias no son un espejo perfecto. Tiene coat y micro-relieve.
- **Paredes**:
  - listones verticales de roble ahumado (array de piezas biseladas) con LED del color de la variante detrás;
  - cajas de luz con gráfica de futsal: MYSQUAD, 10, FUTSAL, 7, PABELLÓN;
  - zócalo de goma, muro de hormigón y tiras LED.
- **Techo**: vigas metálicas, bandeja de cables y 12 luminarias con difusor emisivo, cada una con su luz de área (se prenden de a una).
- **Futsal**:
  - banco de suplentes y pelotas;
  - del otro lado de la boca, parquet de cancha (tablas con veta y laca) con una línea;
  - en la boca, un haz de luz cenital con cono de luz y polvo flotando (partículas 3D).
- **El sobre**: dos mitades de foil metálico combado, con su etiqueta, borde que se enciende, contraluz y una luz que sale por el corte cuando se rompe.
- **Cámara**:
  - 26 mm, con profundidad de campo que pasa del sobre al pasillo;
  - desenfoque de movimiento y un leve balanceo de cámara en mano;
  - acelera y frena con curvas suaves.
- **Render**: Cycles (path tracing) con denoiser, AgX Punchy, glow y aberración cromática leve en composición.

Secuencia (30 fps, 195 cuadros = 6,5 s):

| Cuadros | Qué pasa |
|---|---|
| 1-45 | El sobre aparece en la oscuridad y se acerca. |
| 45-62 | Se rompe y la luz del pasillo entra por el corte. |
| 62-165 | El recorrido. Las luminarias se prenden al paso. Desde la mitad, el pasillo se va apagando hacia adelante. |
| 165-195 | Oscuridad, el haz en la boca y el destello. Ahí la app muestra la mejor carta del sobre. |

## Recursos y licencias

- **Modelos y texturas**: todos hechos por el script, sin recursos externos. No se pudo usar Poly Haven ni Sketchfab: la red de este entorno bloquea `polyhaven.com`, `sketchfab.com` y `download.blender.org`. Si se habilitan, se pueden sumar modelos CC0 (gradas, arco, figuras).
- **Fuente de las etiquetas**: DejaVu Sans Bold (licencia libre de Bitstream Vera / DejaVu).
- **Blender 4.2** (`bpy` de PyPI, GPL). Los renders son nuestros.

## Cómo regenerar

```bash
pip install bpy==4.2.0 pillow imageio-ffmpeg     # o usar Blender 4.2 instalado
# prueba: algunos cuadros
python3 cine/escena_pasillo.py --variante vdraft --ancho 1280 --muestras 16 --cuadros 30,60,120,180
# todo (≈ 35-55 s por cuadro en 4 núcleos de CPU a 1280×720; con GPU, mucho menos)
python3 cine/escena_pasillo.py --variante vdraft --ancho 1280 --muestras 16 --render
cine/codificar.sh vdraft
# guardar la escena editable
python3 cine/escena_pasillo.py --variante vdraft --guardar
```

Con Blender instalado: `blender -b -P cine/escena_pasillo.py -- --variante vdraft --render`.
Para 1920×1080, `--ancho 1920`. Con GPU, sumar `--muestras 64`.

## Variantes

Dos escenas:

- **`escena_pasillo.py`** + `variantes.json`: el pasillo de V-Draft. **Aprobada, no se modifica** (punto de restauración: el commit `b52e51d`).
- **`escena_pabellon.py`** + `perfiles.json`: el pabellón completo, para las demás. Importa los materiales y el sobre de `escena_pasillo.py` (sin cambiarlo) y suma la cancha cubierta:
  - parquet con líneas reglamentarias de futsal (40 × 20 m, áreas de 6 m, penales a 6 y 10 m);
  - arcos de 3 × 2 m con red de malla real;
  - gradas de 9 escalones con butacas, baranda de vidrio y bandas LED con texto;
  - cerchas con 7 filas de luminarias (cada una con luz de área), marcador y pantalla de fondo;
  - 6 focos robóticos con haz visible y 5 luces de "sector" para revelar el pabellón por partes;
  - el pasillo de acceso (como el de V-Draft) que desemboca detrás del arco cercano.

Cada perfil elige un **guion** (cámara y coreografía de luces: no son recoloreos) y lo ajusta con su paleta, la luz del pabellón, el haz, la decoración (`portal`, `banderas`, `logo_centro`), las gráficas, la duración y las muestras.

| Perfil | Sobres | Puesta en escena | Duración |
|---|---|---|---|
| `vdraft` (verde) | Especial V-Draft y Sobre de campeón | El pasillo que se oscurece (escena_pasillo.py). | 6,5 s |
| `elite` (azul/plata) | Mega Sobre | Velocidad: pasillo corto a toda marcha, ola de luminarias de punta a punta, focos que barren en cruz, grúa sobre el arco y lanzamiento al centro. | 7 s |
| `epico` (violeta/magenta) | Sobre de la semana | Misterio: pasillo en penumbra, un portal hexagonal que se enciende y la cámara atraviesa; plano holandés, los haces primero, las gradas después, convergencia en el círculo central. | 7 s |
| `leyenda` (negro/oro) | Si sale un TOTY (conserva el nombre del sobre) | Solemne: todo a oscuras, sobre genérico MYSQUAD; se revela por sectores (arco lejano, una grada, la otra, la cancha); cámara al ras del parquet; composición central con un haz dorado. | 8 s |
| `excepcional` (negro/oro intenso) | TOTY + otra carta top en el mismo sobre (lo que el juego ya considera extraordinario) | Un segundo de casi silencio y oscuridad, el haz central se abre, la cámara avanza al ras del parquet (reflejos) hasta el sobre que flota; se rompe y el pabellón se enciende en anillos desde el centro. | 8,5 s |
| `evento_demo` (rojo oscuro/ámbar) | Sólo con `?evento=demo` | **Perfil de demostración** del sistema de eventos: banderas y logo "DEMO" en el círculo central. No representa ningún evento real (sin escudos ni sponsors). | 7 s |

### Un evento nuevo

1. Copiar `evento_demo` en `perfiles.json` con otro id: nombre, colores, `decoracion`, `graficas`, `texto_banderas`, `texto_logo`, `cuadros`.
2. `python3 cine/escena_pabellon.py --perfil <id> --ancho 480 --muestras 8 --render --cuadros 40,110,160,200 --salida /tmp/prueba` (prueba), después el render completo y `cine/codificar.sh <id>`.
3. La música: una función `pieza_<id>` en `musica.py` (se puede partir de `pieza_evento_demo`) y `python3 cine/musica.py <id>`.
4. En `src/analytics/aperturas.js`: una entrada en `VIDEOS` y otra en `EVENTOS` (`video: '<id>'`). Se activa sólo a pedido (`?evento=<id>`); las cartas no cambian.

## Música

`musica.py` sintetiza una pieza épica por variante (numpy/scipy, sin samples ni licencias de terceros): cuerdas, metales graves ("braams"), coro por formantes, taikos y timbales, subidas, impactos con sub-grave, campanas FM y reverb por convolución. Cada pieza está compuesta sobre los cuadros de su guion (el sobre que se rompe, las luces, el clímax, el destello) y dura ~3,5 s más que el video para acompañar la mejor carta.

| Pieza | Carácter |
|---|---|
| `vdraft` | Re menor, latidos, el portal, caminata de taikos y cuerdas, coro y golpe final. |
| `elite` | Mi menor, 140 BPM, semicorcheas de cuerdas, campanas con la ola de luces, clímax de metales. |
| `epico` | Do# frigio, coro oscuro, campanas en tonos enteros, braam en el portal. |
| `leyenda` | Si bemol, casi silencio; un timbal y un acorde de metales por sector; coral final. |
| `excepcional` | Silencio, coro etéreo con el haz, el golpe más grande, campanas con cada anillo de luz. |
| `evento_demo` | La mayor, 120 BPM, marcha con fanfarria. |

`python3 cine/musica.py` (todas) o `python3 cine/musica.py elite` → `public/cine/musica/<id>.m4a` (AAC 160 kb/s). En la app suena sincronizada con el video (Web Audio, desde el segundo exacto); si no llegó a bajar, o en velocidad rápida, suenan los efectos sintetizados de siempre. Respeta el botón de sonido y se corta con fundido al saltar o cerrar.

## En la app

`src/analytics/aperturas.js`: `VIDEOS` (archivos, duración, música), `VARIANTES`, `VARIANTE_DE_TIPO`, `EVENTOS`. Una variante cuyo video no está abre con la apertura estándar (Excepcional usa el de Leyenda si falta el suyo; el evento, el de V-Draft).
