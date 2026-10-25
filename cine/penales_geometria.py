"""
Dónde cae cada cosa de la escena de los penales en la imagen (960 × 720):
las esquinas del arco, los palos y la red, para que la app apunte la pelota.
Arma la misma escena que escena_penales.py (sin renderizar) y proyecta.

    python3 cine/penales_geometria.py [--salida /tmp/cine/penales]
"""

import argparse
import json
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import escena_penales as ep  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--salida', default=ep.SALIDA)
    a = ap.parse_args(argv)
    with open(os.path.join(AQUI, 'perfiles.json')) as f:
        p = json.load(f)['penales']
    p['id'] = 'penales'
    escena, cam = ep.armar_escena(p)
    bpy.context.view_layer.update()

    def px(x, y, z):
        v = world_to_camera_view(escena, cam, Vector((x, y, z)))
        return [round(v.x * ep.ANCHO, 1), round((1 - v.y) * ep.ALTO, 1)]

    y = ep.Y_ARCO
    # El interior del arco: 3 × 2 m (los palos miden 8 cm).
    g = {
        'ancho': ep.ANCHO, 'alto': ep.ALTO,
        'arco': {'arriba_izq': px(-1.5, y, 2.0), 'arriba_der': px(1.5, y, 2.0),
                 'abajo_izq': px(-1.5, y, 0), 'abajo_der': px(1.5, y, 0)},
        # el fondo de la red (para que la pelota "entre")
        'red': {'arriba_izq': px(-1.5, y + 0.8, 1.6), 'arriba_der': px(1.5, y + 0.8, 1.6),
                'abajo_izq': px(-1.5, y + 1.0, 0), 'abajo_der': px(1.5, y + 1.0, 0)},
        'punto_penal': px(0, y - 6.0, 0),
        # radio de la pelota (11 cm) en la línea del arco, en píxeles
        'pelota_en_arco': round(px(0.11, y, 1.0)[0] - px(0, y, 1.0)[0], 2),
        'arquero_y': ep.Y_ARCO - 0.35,
    }
    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, 'geometria.json'), 'w') as f:
        json.dump(g, f, indent=1)
    print(json.dumps(g))


if __name__ == '__main__':
    main()
