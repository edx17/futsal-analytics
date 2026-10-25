"""
MYSQUAD · LOS PENALES DEL V-DRAFT (Blender 4.2, Cycles)

La tanda de penales se ve desde el punto del penal, en el mismo pabellón de
las cinemáticas (escena_pabellon.py, que NO se modifica). Se renderiza por
capas, todas con la MISMA cámara, para que en la app encajen al píxel:

  fondo     el pabellón y el arco SIN la red (una imagen, alta calidad);
  red       sólo la red del arco, sobre transparente (los palos la tapan):
            la app la "infla" donde entra la pelota;
  arquero   un arquero 3D (cuerpo, camiseta de manga larga, short, medias,
            guantes y botines) animado: espera (en loop), tirada a la
            izquierda alta / media / baja, salto al medio, quedarse al medio
            y achicar abajo. La derecha es el espejo (la cámara está centrada).
            Con dos equipos: 'rival' (naranja) y 'propio' (verde).
            Sobre transparente, con su sombra (piso "atrapa sombras");
  pelota    la pelota de futsal sola, para animarla en la app.

    python3 cine/escena_penales.py --capa fondo
    python3 cine/escena_penales.py --capa red
    python3 cine/escena_penales.py --capa pelota
    python3 cine/escena_penales.py --capa arquero --equipo rival [--anim izq_alta] [--cuadros 1,10]
    python3 cine/penales_empaquetar.py      # recorta y arma los sprites para la app

Salida: /tmp/cine/penales/. Coordenadas como el pabellón: el arco del fondo
está en y=44 (de x=-1,5 a 1,5, 2 m de alto); el punto penal, en y=38.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import escena_pasillo as base  # noqa: E402
import escena_pabellon as pab  # noqa: E402

ANCHO, ALTO = 960, 720
FPS = 30
Y_ARCO = pab.Y1
SALIDA = '/tmp/cine/penales'

# Las animaciones: cuántos cuadros y desde qué cuadro de la línea de tiempo.
ANIMS = {
    'espera': (1, 24),         # loop
    'izq_alta': (101, 20),
    'izq_media': (201, 20),
    'izq_baja': (301, 20),
    'centro_alto': (401, 20),
    'centro_medio': (501, 20),
    'centro_bajo': (601, 20),
}

EQUIPOS = {
    'rival': {'camiseta': (0.95, 0.32, 0.03), 'detalle': (0.08, 0.08, 0.09), 'short': (0.05, 0.05, 0.06), 'medias': (0.95, 0.32, 0.03),
              'guantes': (0.92, 0.92, 0.9)},
    'propio': {'camiseta': (0.03, 0.55, 0.24), 'detalle': (0.95, 0.85, 0.1), 'short': (0.03, 0.12, 0.07), 'medias': (0.03, 0.55, 0.24),
               'guantes': (0.95, 0.85, 0.1)},
}


# ── la escena ───────────────────────────────────────────────────────────────

def armar_escena(p):
    base.limpiar()
    escena = bpy.context.scene
    mundo = bpy.data.worlds.new('mundo'); escena.world = mundo
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs['Color'].default_value = (0.001, 0.001, 0.0015, 1)
    h = pab.armar_pabellon(p)
    base.caja('pared_cercana', (44, 0.4, pab.TECHO), (0, -0.2, pab.TECHO / 2), base.mat_hormigon())
    # Todo prendido, fijo (en las cinemáticas se prende de a poco).
    for fila in h['filas']:
        for luz, soc in fila:
            luz.data.energy = p['luz_pabellon_w']
            soc.default_value = 20
    for soc in (h['led'], h['marcador'], h['pantalla']):
        soc.default_value = 5
    h['sectores']['arco_lejano'].data.energy = 2600
    h['sectores']['arco_lejano'].data.color = (1.0, 0.96, 0.9)
    # Cámara en el punto del penal, a la altura de los ojos, mirando el arco.
    bpy.ops.object.camera_add(location=(0, Y_ARCO - 6.5, 1.15))
    cam = bpy.context.active_object
    cam.name = 'camara_penal'
    cam.data.lens = 40
    cam.data.sensor_width = 36
    cam.data.sensor_fit = 'HORIZONTAL'
    pab.mirar(cam, Vector((0, Y_ARCO, 0.95)))
    escena.camera = cam
    base.render_config(escena, cam)
    escena.camera = cam
    escena.render.resolution_x, escena.render.resolution_y = ANCHO, ALTO
    escena.render.resolution_percentage = 100
    escena.render.fps = FPS
    # Sin composición: las capas tienen que coincidir exactas (el brillo y la distorsión de lente las correrían).
    escena.use_nodes = False
    escena.render.use_motion_blur = True
    escena.render.motion_blur_shutter = 0.5
    return escena, cam


# ── el arquero ──────────────────────────────────────────────────────────────

def mat_tela(nombre, color, rug=0.75, brillo=0.0):
    m = bpy.data.materials.new(nombre)
    pr = base.principled(m)
    pr.inputs['Base Color'].default_value = (*color, 1)
    pr.inputs['Roughness'].default_value = rug
    pr.inputs['Sheen Weight'].default_value = 0.4
    pr.inputs['Coat Weight'].default_value = brillo
    return m


def articulacion(nombre, padre, pos):
    e = bpy.data.objects.new(nombre, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.05
    e.parent = padre
    e.location = pos
    e.rotation_mode = 'XYZ'
    return e


def pieza(nombre, tipo, dims, pos, mat, padre, giro=(0, 0, 0)):
    """Una parte del cuerpo: 'elipse' (esfera escalada) o 'tubo' (cápsula a lo largo de z)."""
    if tipo == 'elipse':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
        o = bpy.context.active_object
        o.scale = dims
    else:
        r, largo = dims
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=largo)
        o = bpy.context.active_object
        # puntas redondeadas
        bev = o.modifiers.new('punta', 'BEVEL'); bev.width = r * 0.9; bev.segments = 4; bev.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth()
    o.name = nombre
    o.data.materials.append(mat)
    o.parent = padre
    o.location = pos
    o.rotation_euler = [math.radians(g) for g in giro]
    return o


def armar_arquero(equipo):
    k = EQUIPOS[equipo]
    piel = mat_tela('piel', (0.56, 0.37, 0.26), 0.55)
    pelo = mat_tela('pelo', (0.03, 0.025, 0.02), 0.6)
    camiseta = mat_tela('camiseta', k['camiseta'], 0.7)
    detalle = mat_tela('detalle', k['detalle'], 0.6)
    short = mat_tela('short', k['short'], 0.7)
    medias = mat_tela('medias', k['medias'], 0.8)
    guantes = mat_tela('guantes', k['guantes'], 0.5)
    botin = mat_tela('botin', (0.02, 0.02, 0.025), 0.3, brillo=0.5)

    raiz = articulacion('raiz', None, (0, Y_ARCO - 0.35, 0.95))
    j = {'raiz': raiz}
    # tronco
    j['torso'] = articulacion('torso', raiz, (0, 0, 0))
    pieza('cadera', 'elipse', (0.17, 0.12, 0.13), (0, 0, 0.0), short, j['torso'])
    pieza('pecho', 'elipse', (0.2, 0.13, 0.3), (0, 0, 0.3), camiseta, j['torso'])
    pieza('cuello', 'tubo', (0.05, 0.12), (0, 0, 0.6), piel, j['torso'])
    pieza('cuello_camiseta', 'tubo', (0.065, 0.05), (0, 0, 0.56), detalle, j['torso'])
    j['cabeza'] = articulacion('cabeza', j['torso'], (0, 0, 0.64))
    pieza('craneo', 'elipse', (0.1, 0.11, 0.125), (0, 0, 0.11), piel, j['cabeza'])
    pieza('pelo', 'elipse', (0.105, 0.115, 0.08), (0, 0.015, 0.17), pelo, j['cabeza'])
    for s, lado in ((-1, 'i'), (1, 'd')):
        # brazos (manga larga) desde los hombros
        j[f'hombro_{lado}'] = articulacion(f'hombro_{lado}', j['torso'], (s * 0.22, 0, 0.5))
        pieza(f'brazo_{lado}', 'tubo', (0.058, 0.32), (0, 0, -0.15), camiseta, j[f'hombro_{lado}'])
        pieza(f'hombrera_{lado}', 'elipse', (0.075, 0.075, 0.07), (0, 0, 0), camiseta, j[f'hombro_{lado}'])
        j[f'codo_{lado}'] = articulacion(f'codo_{lado}', j[f'hombro_{lado}'], (0, 0, -0.3))
        pieza(f'antebrazo_{lado}', 'tubo', (0.05, 0.28), (0, 0, -0.13), camiseta, j[f'codo_{lado}'])
        pieza(f'puno_{lado}', 'tubo', (0.054, 0.04), (0, 0, -0.26), detalle, j[f'codo_{lado}'])
        pieza(f'guante_{lado}', 'elipse', (0.06, 0.035, 0.1), (0, 0, -0.36), guantes, j[f'codo_{lado}'])
        # piernas
        j[f'cadera_{lado}'] = articulacion(f'cadera_{lado}', raiz, (s * 0.1, 0, -0.02))
        pieza(f'muslo_{lado}', 'tubo', (0.085, 0.3), (0, 0, -0.14), short, j[f'cadera_{lado}'])
        pieza(f'pierna_{lado}', 'tubo', (0.07, 0.2), (0, 0, -0.33), piel, j[f'cadera_{lado}'])
        j[f'rodilla_{lado}'] = articulacion(f'rodilla_{lado}', j[f'cadera_{lado}'], (0, 0, -0.45))
        pieza(f'media_{lado}', 'tubo', (0.062, 0.42), (0, 0, -0.2), medias, j[f'rodilla_{lado}'])
        j[f'tobillo_{lado}'] = articulacion(f'tobillo_{lado}', j[f'rodilla_{lado}'], (0, 0, -0.43))
        pieza(f'botin_{lado}', 'elipse', (0.06, 0.13, 0.045), (0, -0.05, -0.03), botin, j[f'tobillo_{lado}'])
    return j


# ── las poses ───────────────────────────────────────────────────────────────

LISTO = {
    'raiz': (0.0, 0.79, 0.0),          # x, z, inclinación (grados, + hacia la derecha de la cámara)
    'torso': (16, 0, 0), 'cabeza': (-14, 0, 0),
    'hombro_i': (-30, 38, 0), 'codo_i': (-55, 0, 0),
    'hombro_d': (-30, -38, 0), 'codo_d': (-55, 0, 0),
    'cadera_i': (-38, 12, 0), 'rodilla_i': (68, 0, 0), 'tobillo_i': (-28, 0, 0),
    'cadera_d': (-38, -12, 0), 'rodilla_d': (68, 0, 0), 'tobillo_d': (-28, 0, 0),
}


def con(base_pose, **cambios):
    p = dict(base_pose)
    p.update(cambios)
    return p


def estirado(x, z, incl):
    """En el aire, todo estirado hacia el lado de la tirada."""
    return {
        'raiz': (x, z, incl), 'torso': (0, 0, 0), 'cabeza': (0, 8, 0),
        'hombro_i': (-8, 172, 0), 'codo_i': (-6, 0, 0),
        'hombro_d': (-8, -168, 0), 'codo_d': (-6, 0, 0),
        'cadera_i': (-12, 6, 0), 'rodilla_i': (18, 0, 0), 'tobillo_i': (-10, 0, 0),
        'cadera_d': (-28, -14, 0), 'rodilla_d': (46, 0, 0), 'tobillo_d': (-20, 0, 0),
    }


CARGA = con(LISTO, raiz=(0.06, 0.72, 6.0), cadera_d=(-46, -10, 0), rodilla_d=(84, 0, 0))
EN_EL_PISO = {
    'raiz': (-1.38, 0.17, -90), 'torso': (0, 0, 0), 'cabeza': (-6, 14, 0),
    'hombro_i': (-10, 165, 0), 'codo_i': (-20, 0, 0), 'hombro_d': (-25, -150, 0), 'codo_d': (-35, 0, 0),
    'cadera_i': (-10, 4, 0), 'rodilla_i': (25, 0, 0), 'tobillo_i': (-10, 0, 0),
    'cadera_d': (-35, -8, 0), 'rodilla_d': (60, 0, 0), 'tobillo_d': (-25, 0, 0),
}


def tirada(x, z, incl):
    medio = estirado(x * 0.55, (z + 0.75) / 2 + 0.05, incl * 0.6)
    medio.update({'hombro_i': (-15, 120, 0), 'hombro_d': (-15, -110, 0), 'codo_i': (-25, 0, 0), 'codo_d': (-30, 0, 0)})
    cae = estirado(x * 1.12, max(0.22, z * 0.5), incl - 6)
    return [(1, LISTO), (4, CARGA), (8, medio), (12, estirado(x, z, incl)), (16, cae), (20, EN_EL_PISO)]


GUIONES = {
    'espera': [(1, LISTO), (7, con(LISTO, raiz=(-0.07, 0.77, -2.5))), (13, con(LISTO, raiz=(0.0, 0.8, 0))),
               (19, con(LISTO, raiz=(0.07, 0.77, 2.5))), (25, LISTO)],
    'izq_alta': tirada(-1.05, 1.32, -60),
    'izq_media': tirada(-1.2, 0.86, -82),
    'izq_baja': tirada(-1.12, 0.42, -96),
    'centro_alto': [(1, LISTO), (5, con(LISTO, raiz=(0, 0.66, 0), rodilla_i=(90, 0, 0), rodilla_d=(90, 0, 0))),
                    (11, {**estirado(0, 1.38, 0), 'hombro_i': (-6, 172, 0), 'hombro_d': (-6, -172, 0),
                          'cadera_i': (-25, 8, 0), 'cadera_d': (-25, -8, 0), 'rodilla_i': (45, 0, 0), 'rodilla_d': (45, 0, 0)}),
                    (16, {**estirado(0, 1.05, 0), 'hombro_i': (-30, 150, 0), 'hombro_d': (-30, -150, 0)}),
                    (20, con(LISTO, raiz=(0, 0.74, 0)))],
    'centro_medio': [(1, LISTO), (6, con(LISTO, torso=(10, 0, 0), hombro_i=(-75, 14, 0), hombro_d=(-75, -14, 0),
                                        codo_i=(-85, 0, 0), codo_d=(-85, 0, 0))),
                     (20, con(LISTO, torso=(14, 0, 0), raiz=(0, 0.76, 0), hombro_i=(-70, 10, 0), hombro_d=(-70, -10, 0),
                              codo_i=(-95, 0, 0), codo_d=(-95, 0, 0)))],
    'centro_bajo': [(1, LISTO), (5, con(LISTO, raiz=(0, 0.6, 0))),
                    (10, con(LISTO, raiz=(0, 0.42, 0), torso=(32, 0, 0), cabeza=(-30, 0, 0),
                             cadera_i=(-55, 48, 0), cadera_d=(-55, -48, 0), rodilla_i=(105, 0, 0), rodilla_d=(105, 0, 0),
                             hombro_i=(-35, 24, 0), hombro_d=(-35, -24, 0), codo_i=(-12, 0, 0), codo_d=(-12, 0, 0))),
                    (20, con(LISTO, raiz=(0, 0.4, 0), torso=(34, 0, 0), cabeza=(-32, 0, 0),
                             cadera_i=(-58, 50, 0), cadera_d=(-58, -50, 0), rodilla_i=(108, 0, 0), rodilla_d=(108, 0, 0),
                             hombro_i=(-30, 26, 0), hombro_d=(-30, -26, 0), codo_i=(-8, 0, 0), codo_d=(-8, 0, 0)))],
}


def poner_pose(j, cuadro, pose):
    x, z, incl = pose['raiz']
    raiz = j['raiz']
    raiz.location = (x, Y_ARCO - 0.35, z)
    raiz.rotation_euler = (0, math.radians(incl), 0)
    raiz.keyframe_insert('location', frame=cuadro)
    raiz.keyframe_insert('rotation_euler', frame=cuadro)
    for nombre, (rx, ry, rz) in pose.items():
        if nombre == 'raiz':
            continue
        e = j[nombre]
        e.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        e.keyframe_insert('rotation_euler', frame=cuadro)


def animar(j):
    for anim, (desde, _) in ANIMS.items():
        for f, pose in GUIONES[anim]:
            poner_pose(j, desde + f - 1, pose)


# ── la pelota ───────────────────────────────────────────────────────────────

def mat_pelota():
    """Blanca con gajos oscuros (Voronoi), como una pelota de futsal."""
    m = bpy.data.materials.new('pelota')
    n, l = base.nodos(m)
    pr = n['Principled BSDF']
    vor = n.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = 3.2
    paso = n.new('ShaderNodeMath'); paso.operation = 'LESS_THAN'; paso.inputs[1].default_value = 0.05
    l.new(vor.outputs['Distance'], paso.inputs[0])
    mz = n.new('ShaderNodeMix'); mz.data_type = 'RGBA'
    mz.inputs[6].default_value = (0.92, 0.92, 0.9, 1); mz.inputs[7].default_value = (0.05, 0.1, 0.35, 1)
    l.new(paso.outputs['Value'], mz.inputs['Factor'])
    l.new(mz.outputs[2], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.35
    pr.inputs['Coat Weight'].default_value = 0.4
    return m


# ── capas ───────────────────────────────────────────────────────────────────

def es_red(o):
    return o.name.startswith('arco_lejano_red')


def es_palo(o):
    return o.name.startswith('arco_lejano_poste') or o.name.startswith('arco_lejano_travesano')


def render(ruta, transparente):
    escena = bpy.context.scene
    escena.render.film_transparent = transparente
    escena.render.image_settings.file_format = 'PNG'
    escena.render.image_settings.color_mode = 'RGBA' if transparente else 'RGB'
    escena.render.filepath = ruta
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'{os.path.basename(ruta)}: {time.time() - t:.1f} s', flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--capa', required=True, choices=['fondo', 'red', 'pelota', 'arquero'])
    ap.add_argument('--equipo', default='rival', choices=list(EQUIPOS))
    ap.add_argument('--anim', default='')
    ap.add_argument('--cuadros', default='')
    ap.add_argument('--muestras', type=int, default=0)
    ap.add_argument('--salida', default=SALIDA)
    a = ap.parse_args(argv)
    with open(os.path.join(AQUI, 'perfiles.json')) as f:
        p = json.load(f)['penales']
    p['id'] = 'penales'
    escena, cam = armar_escena(p)
    os.makedirs(a.salida, exist_ok=True)

    if a.capa == 'fondo':
        for o in escena.objects:
            if es_red(o):
                o.visible_camera = False
        escena.cycles.samples = a.muestras or 64
        render(os.path.join(a.salida, 'fondo.png'), False)
        return

    if a.capa == 'red':
        # Sólo la red; los palos la tapan (holdout) y el resto no se ve.
        for o in escena.objects:
            if o.type != 'MESH':
                continue
            if es_palo(o):
                o.is_holdout = True
            elif not es_red(o):
                o.visible_camera = False
        escena.cycles.samples = a.muestras or 48
        render(os.path.join(a.salida, 'red.png'), True)
        return

    if a.capa == 'pelota':
        for o in escena.objects:
            if o.type == 'MESH':
                o.visible_camera = False
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.11, location=(0, Y_ARCO - 6.0, 0.11))
        b = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        b.data.materials.append(mat_pelota())
        b.rotation_euler = (0.4, 0.7, 0.2)
        cam.location = (0.0, Y_ARCO - 6.0 - 0.9, 0.2)
        pab.mirar(cam, b.location)
        cam.data.lens = 85
        escena.render.resolution_x = escena.render.resolution_y = 256
        escena.cycles.samples = a.muestras or 64
        escena.render.use_motion_blur = False
        render(os.path.join(a.salida, 'pelota.png'), True)
        return

    # arquero: sólo él, con su sombra sobre el parquet ("atrapa sombras").
    j = armar_arquero(a.equipo)
    animar(j)
    nuestras = set()
    for e in j.values():
        nuestras.add(e.name)
        nuestras.update(c.name for c in e.children_recursive)
    for o in escena.objects:
        if o.type != 'MESH' or o.name in nuestras:
            continue
        if o.name == 'parquet_cancha':
            o.is_shadow_catcher = True
        elif es_palo(o):
            o.is_holdout = True
        else:
            o.visible_camera = False
    escena.cycles.samples = a.muestras or 24
    anims = [a.anim] if a.anim else list(ANIMS)
    for anim in anims:
        desde, n = ANIMS[anim]
        cuadros = [int(c) for c in a.cuadros.split(',') if c] if a.cuadros else range(1, n + 1)
        carpeta = os.path.join(a.salida, f'arquero_{a.equipo}_{anim}')
        os.makedirs(carpeta, exist_ok=True)
        for c in cuadros:
            ruta = os.path.join(carpeta, f'{c:02d}.png')
            if os.path.exists(ruta):
                continue
            escena.frame_set(desde + c - 1)
            render(ruta, True)


if __name__ == '__main__':
    main()
