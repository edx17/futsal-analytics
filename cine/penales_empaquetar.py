"""
Arma lo que usa la app para los penales (public/penales/) a partir de los
renders de escena_penales.py y penales_geometria.py (en /tmp/cine/penales):

  fondo.webp      el pabellón y el arco, sin red;
  red.webp        la red sola (transparente), para inflarla en el gol;
  pelota.webp     la pelota;
  arquero_<equipo>_<anim>.webp
                  cada animación en una tira (todos los cuadros recortados al
                  mismo rectángulo, en filas de COLUMNAS);
  penales.json    medidas: el arco en la imagen, el rectángulo del arquero y
                  los cuadros de cada animación.

    python3 cine/penales_empaquetar.py [--entrada /tmp/cine/penales]
"""

import argparse
import glob
import json
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(AQUI, '..', 'public', 'penales')
COLUMNAS = 6
ESCALA_ARQUERO = 0.6   # los cuadros del arquero se achican (en la app se ven a ~1/3)
ANIMS = {'espera': True, 'izq_alta': False, 'izq_media': False, 'izq_baja': False,
         'centro_alto': False, 'centro_medio': False, 'centro_bajo': False}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--entrada', default='/tmp/cine/penales')
    a = ap.parse_args()
    e = a.entrada
    os.makedirs(DESTINO, exist_ok=True)
    with open(os.path.join(e, 'geometria.json')) as f:
        geo = json.load(f)

    Image.open(os.path.join(e, 'fondo.png')).convert('RGB').save(os.path.join(DESTINO, 'fondo.webp'), quality=82, method=6)
    red = Image.open(os.path.join(e, 'red.png')).convert('RGBA')
    caja_red = red.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()
    red.crop(caja_red).save(os.path.join(DESTINO, 'red.webp'), quality=80, method=6)
    pelota = Image.open(os.path.join(e, 'pelota.png')).convert('RGBA')
    pelota = pelota.crop(pelota.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox()).resize((96, 96), Image.LANCZOS)
    pelota.save(os.path.join(DESTINO, 'pelota.webp'), quality=85, method=6)

    # El mismo rectángulo para todos los cuadros (así no salta entre animaciones).
    equipos = sorted({os.path.basename(d).split('_')[1] for d in glob.glob(os.path.join(e, 'arquero_*'))})
    caja = None
    cuadros = {}
    for eq in equipos:
        for anim in ANIMS:
            fs = sorted(glob.glob(os.path.join(e, f'arquero_{eq}_{anim}', '*.png')))
            if not fs:
                raise SystemExit(f'faltan los cuadros de arquero_{eq}_{anim}')
            cuadros[(eq, anim)] = fs
            for fp in fs:
                b = Image.open(fp).getchannel('A').point(lambda v: 255 if v > 4 else 0).getbbox()
                if b:
                    caja = b if caja is None else (min(caja[0], b[0]), min(caja[1], b[1]), max(caja[2], b[2]), max(caja[3], b[3]))
    x0, y0, x1, y1 = caja[0] - 4, caja[1] - 4, caja[2] + 4, caja[3] + 4
    w, h = round((x1 - x0) * ESCALA_ARQUERO), round((y1 - y0) * ESCALA_ARQUERO)
    anims = {}
    for (eq, anim), fs in cuadros.items():
        filas = -(-len(fs) // COLUMNAS)
        tira = Image.new('RGBA', (w * COLUMNAS, h * filas), (0, 0, 0, 0))
        for i, fp in enumerate(fs):
            c = Image.open(fp).convert('RGBA').crop((x0, y0, x1, y1)).resize((w, h), Image.LANCZOS)
            tira.paste(c, ((i % COLUMNAS) * w, (i // COLUMNAS) * h))
        tira.save(os.path.join(DESTINO, f'arquero_{eq}_{anim}.webp'), quality=82, method=6)
        anims[anim] = {'cuadros': len(fs), 'loop': ANIMS[anim]}

    datos = {
        'ancho': geo['ancho'], 'alto': geo['alto'], 'arco': geo['arco'], 'red_fondo': geo['red'],
        'pelota_en_arco': geo['pelota_en_arco'],
        'red': {'x': caja_red[0], 'y': caja_red[1], 'w': caja_red[2] - caja_red[0], 'h': caja_red[3] - caja_red[1]},
        'arquero': {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'columnas': COLUMNAS, 'fps': 30,
                    'equipos': equipos, 'anims': anims},
    }
    with open(os.path.join(DESTINO, 'penales.json'), 'w') as f:
        json.dump(datos, f, indent=1)
    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(DESTINO, '*')))
    print(f'listo: {len(glob.glob(os.path.join(DESTINO, "*")))} archivos, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
