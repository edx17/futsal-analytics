# Cinemáticas de apertura de sobres

Las aperturas especiales de los sobres son **videos renderizados en Blender** a
partir de una escena 3D del pasillo de un pabellón de futsal. La app sólo los
reproduce: la interfaz, el botón SALTAR, la mejor carta y las demás cartas son
de la app (`src/components/sobres`).

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `escena_pasillo.py` | Arma la escena (geometría, materiales, luces, cámara, animación) y la renderiza. Es la fuente: se puede regenerar todo. |
| `variantes.json` | Las variantes: colores de luces, LED, haz, sobre y cuándo se oscurece el pasillo. |
| `pasillo_<variante>.blend` | La escena guardada, editable en Blender 4.2. |
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

| Variante | Sobres | Estado |
|---|---|---|
| `vdraft` (verde esmeralda) | Sobre especial V-Draft y Sobre de campeón | renderizada |
| `elite` (azul eléctrico) | Mega Sobre | configurada en `variantes.json`, falta renderizar |
| `epico` (violeta) | Sobre de la semana | configurada, falta renderizar |
| `leyenda` (oro) | si sale un TOTY; también "excepcional" | configurada, falta renderizar |

La app decide qué video usar en `src/analytics/aperturas.js` (`VIDEOS`,
`VARIANTE_DE_TIPO`). Una variante sin video abre con la apertura estándar.
Para sumar un video: renderizar, codificar y agregarlo a `VIDEOS`.
