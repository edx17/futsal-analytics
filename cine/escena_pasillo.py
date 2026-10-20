"""
MYSQUAD · CINEMÁTICA DEL PASILLO (Blender 4.2, Cycles)

Arma desde cero la escena 3D del pasillo de un pabellón de futsal, la anima
y (si se pide) la renderiza cuadro por cuadro. Todo es geometría 3D real y
materiales PBR procedurales (nodos de shader): no hay imágenes externas, así
que se puede volver a generar en cualquier máquina con Blender 4.2.

    python3 cine/escena_pasillo.py --variante vdraft --guardar        # sólo el .blend
    python3 cine/escena_pasillo.py --variante vdraft --cuadros 1,60,120,180 --ancho 1280
    python3 cine/escena_pasillo.py --variante vdraft --render --ancho 1280   # todos los cuadros

(Con Blender instalado: blender -b -P cine/escena_pasillo.py -- --variante vdraft …)

La secuencia (30 cuadros por segundo, 6,5 s):
   1-45    el sobre aparece en la oscuridad y se acerca; su borde se enciende
  45-62    el sobre se rompe en dos y la luz del pasillo entra por el corte
  62-165   la cámara recorre el pasillo: las luminarias se prenden a su paso,
           reflejos en el piso, neblina; desde la mitad el pasillo se va
           apagando hacia adelante
 165-195   oscuridad, un haz de luz del color de la variante en la boca del
           pasillo y el destello final (ahí la app muestra la mejor carta)

Coordenadas: metros; el pasillo va por +Y desde y=0 hasta y=LARGO.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
import addon_utils
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))

ANCHO_P = 3.6      # ancho del pasillo
ALTO_P = 3.2       # alto
LARGO = 38.0       # largo hasta la boca
FPS = 30
CUADROS = 195
LUMINARIAS = 12    # una cada ~3 m

FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


# ── utilidades ──────────────────────────────────────────────────────────────

def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('cycles', default_set=True)


def caja(nombre, tam, pos, mat=None, bisel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object
    o.name = nombre
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    if bisel:
        m = o.modifiers.new('bisel', 'BEVEL')
        m.width = bisel
        m.segments = 2
        m.limit_method = 'ANGLE'
    if mat:
        o.data.materials.append(mat)
    return o


def nodos(mat):
    mat.use_nodes = True
    return mat.node_tree.nodes, mat.node_tree.links


def principled(mat):
    n, _ = nodos(mat)
    return n.get('Principled BSDF')


def clave(objeto, ruta, cuadro, valor, interp='BEZIER'):
    """Inserta un keyframe en una propiedad (con su interpolación)."""
    partes = ruta.split('.')
    destino = objeto
    for p in partes[:-1]:
        destino = getattr(destino, p)
    setattr(destino, partes[-1], valor)
    destino.keyframe_insert(partes[-1], frame=cuadro)
    ad = getattr(objeto, 'animation_data', None) or getattr(getattr(objeto, 'id_data', None), 'animation_data', None)
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for k in fc.keyframe_points:
                if k.co[0] == cuadro:
                    k.interpolation = interp


def clave_socket(socket, cuadro, valor, interp='BEZIER'):
    socket.default_value = valor
    socket.keyframe_insert('default_value', frame=cuadro)
    arbol = socket.id_data
    if arbol.animation_data and arbol.animation_data.action:
        for fc in arbol.animation_data.action.fcurves:
            for k in fc.keyframe_points:
                if k.co[0] == cuadro:
                    k.interpolation = interp


# ── materiales ──────────────────────────────────────────────────────────────

def mat_piso():
    """Epoxi oscuro pulido: refleja las luminarias, con manchas de uso que
    cambian la rugosidad (así el reflejo no es un espejo perfecto)."""
    m = bpy.data.materials.new('piso_epoxi')
    n, l = nodos(m)
    p = n['Principled BSDF']
    coord = n.new('ShaderNodeTexCoord')
    ruido = n.new('ShaderNodeTexNoise'); ruido.inputs['Scale'].default_value = 3.0; ruido.inputs['Detail'].default_value = 8
    l.new(coord.outputs['Object'], ruido.inputs['Vector'])
    rampa = n.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].position = 0.35; rampa.color_ramp.elements[0].color = (0.04, 0.04, 0.04, 1)
    rampa.color_ramp.elements[1].position = 0.75; rampa.color_ramp.elements[1].color = (0.2, 0.2, 0.2, 1)
    l.new(ruido.outputs['Fac'], rampa.inputs['Fac'])
    l.new(rampa.outputs['Color'], p.inputs['Roughness'])
    color = n.new('ShaderNodeMix'); color.data_type = 'RGBA'
    color.inputs[6].default_value = (0.008, 0.008, 0.009, 1)
    color.inputs[7].default_value = (0.02, 0.02, 0.022, 1)
    l.new(ruido.outputs['Fac'], color.inputs['Factor'])
    l.new(color.outputs[2], p.inputs['Base Color'])
    fino = n.new('ShaderNodeTexNoise'); fino.inputs['Scale'].default_value = 180; fino.inputs['Detail'].default_value = 4
    l.new(coord.outputs['Object'], fino.inputs['Vector'])
    relieve = n.new('ShaderNodeBump'); relieve.inputs['Strength'].default_value = 0.04
    l.new(fino.outputs['Fac'], relieve.inputs['Height'])
    l.new(relieve.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Coat Weight'].default_value = 0.6
    p.inputs['Coat Roughness'].default_value = 0.05
    return m


def mat_parquet():
    """Parquet de cancha: tablas (textura de ladrillo estirada), veta con ruido
    y laca brillante."""
    m = bpy.data.materials.new('parquet')
    n, l = nodos(m)
    p = n['Principled BSDF']
    coord = n.new('ShaderNodeTexCoord')
    mapeo = n.new('ShaderNodeMapping'); mapeo.inputs['Scale'].default_value = (1.0, 0.12, 1.0)
    l.new(coord.outputs['Object'], mapeo.inputs['Vector'])
    tablas = n.new('ShaderNodeTexBrick')
    tablas.inputs['Scale'].default_value = 9.0
    tablas.inputs['Mortar Size'].default_value = 0.004
    tablas.inputs['Brick Width'].default_value = 0.5
    tablas.inputs['Row Height'].default_value = 0.07
    tablas.inputs['Color1'].default_value = (0.42, 0.22, 0.09, 1)
    tablas.inputs['Color2'].default_value = (0.30, 0.15, 0.06, 1)
    tablas.inputs['Mortar'].default_value = (0.08, 0.04, 0.02, 1)
    l.new(mapeo.outputs['Vector'], tablas.inputs['Vector'])
    veta = n.new('ShaderNodeTexWave'); veta.inputs['Scale'].default_value = 3.0; veta.inputs['Distortion'].default_value = 6
    veta.inputs['Detail'].default_value = 3
    l.new(mapeo.outputs['Vector'], veta.inputs['Vector'])
    mezcla = n.new('ShaderNodeMix'); mezcla.data_type = 'RGBA'; mezcla.blend_type = 'MULTIPLY'
    mezcla.inputs['Factor'].default_value = 0.35
    l.new(tablas.outputs['Color'], mezcla.inputs[6])
    l.new(veta.outputs['Color'], mezcla.inputs[7])
    l.new(mezcla.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.28
    p.inputs['Coat Weight'].default_value = 0.8
    p.inputs['Coat Roughness'].default_value = 0.04
    return m


def mat_panel():
    """Paneles acústicos de las paredes: tela oscura con trama fina."""
    m = bpy.data.materials.new('panel_acustico')
    n, l = nodos(m)
    p = n['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.022, 0.024, 0.028, 1)
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Sheen Weight'].default_value = 0.4
    tela = n.new('ShaderNodeTexNoise'); tela.inputs['Scale'].default_value = 400
    relieve = n.new('ShaderNodeBump'); relieve.inputs['Strength'].default_value = 0.15
    l.new(tela.outputs['Fac'], relieve.inputs['Height'])
    l.new(relieve.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_listones():
    """Listones de madera oscura (roble ahumado) con veta."""
    m = bpy.data.materials.new('listones_madera')
    n, l = nodos(m)
    p = n['Principled BSDF']
    coord = n.new('ShaderNodeTexCoord')
    mapeo = n.new('ShaderNodeMapping'); mapeo.inputs['Scale'].default_value = (60, 60, 1.2)   # veta vertical
    l.new(coord.outputs['Object'], mapeo.inputs['Vector'])
    veta = n.new('ShaderNodeTexNoise'); veta.inputs['Scale'].default_value = 2.0; veta.inputs['Detail'].default_value = 6
    l.new(mapeo.outputs['Vector'], veta.inputs['Vector'])
    rampa = n.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].position = 0.3; rampa.color_ramp.elements[0].color = (0.045, 0.026, 0.014, 1)
    rampa.color_ramp.elements[1].position = 0.7; rampa.color_ramp.elements[1].color = (0.13, 0.075, 0.04, 1)
    l.new(veta.outputs['Fac'], rampa.inputs['Fac'])
    l.new(rampa.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.6
    return m


GRAFICAS = ['MYSQUAD', '10', 'FUTSAL', '7', 'PABELLÓN']


def mat_caja_luz(var, texto, invertir=False):
    """Caja de luz con gráfica (dibujada con Pillow): número de camiseta,
    MYSQUAD, FUTSAL…, en el color de la variante."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    w, h = 600, 740
    acento = tuple(int(255 * min(1, c ** (1 / 2.2))) for c in var['acento'])
    img = Image.new('RGB', (w, h), (6, 8, 10))
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-200, h * 0.45, w + 200, h * 1.5], fill=tuple(int(c * 0.22) for c in acento))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(90)), 0.9)
    d = ImageDraw.Draw(img)
    numero = texto.isdigit()
    f = ImageFont.truetype(FUENTE, 360 if numero else (92 if len(texto) > 7 else 120))
    tw = d.textlength(texto, font=f)
    ty = 150 if numero else 300
    sombra = Image.new('RGB', (w, h), (0, 0, 0))
    ImageDraw.Draw(sombra).text(((w - tw) / 2, ty), texto, font=f, fill=acento)
    img = Image.blend(img, Image.composite(sombra, img, sombra.convert('L').filter(ImageFilter.GaussianBlur(14))), 0.7)
    d = ImageDraw.Draw(img)
    d.text(((w - tw) / 2, ty), texto, font=f, fill=(245, 248, 245))
    pie = 'MYSQUAD · FUTSAL'
    fp = ImageFont.truetype(FUENTE, 34)
    d.text(((w - d.textlength(pie, font=fp)) / 2, h - 90), pie, font=fp, fill=acento)
    ruta = os.path.join(AQUI, 'texturas', f'caja_{var["id"]}_{texto}.png')
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    img.save(ruta)
    m = bpy.data.materials.new(f'caja_luz_{texto}{"_d" if invertir else ""}')
    n, l = nodos(m)
    p = n['Principled BSDF']
    tex = n.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(ruta)
    coord = n.new('ShaderNodeTexCoord')
    mapeo = n.new('ShaderNodeMapping')
    # el plano es una caja finita: se proyecta en Y-Z del objeto
    mapeo.inputs['Rotation'].default_value = (0, 0, 0)
    sep = n.new('ShaderNodeSeparateXYZ'); comb = n.new('ShaderNodeCombineXYZ')
    l.new(coord.outputs['Generated'], sep.inputs['Vector'])
    if invertir:
        inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
        l.new(sep.outputs['Y'], inv.inputs[1]); l.new(inv.outputs['Value'], comb.inputs['X'])
    else:
        l.new(sep.outputs['Y'], comb.inputs['X'])
    l.new(sep.outputs['Z'], comb.inputs['Y'])
    l.new(comb.outputs['Vector'], tex.inputs['Vector'])
    p.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
    l.new(tex.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 0.0
    p.inputs['Roughness'].default_value = 0.15
    return m


def mat_simple(nombre, color, rug, metal=0.0):
    m = bpy.data.materials.new(nombre)
    p = principled(m)
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rug
    p.inputs['Metallic'].default_value = metal
    return m


def mat_hormigon():
    m = bpy.data.materials.new('hormigon')
    n, l = nodos(m)
    p = n['Principled BSDF']
    r = n.new('ShaderNodeTexNoise'); r.inputs['Scale'].default_value = 25; r.inputs['Detail'].default_value = 10
    rampa = n.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].color = (0.05, 0.05, 0.052, 1)
    rampa.color_ramp.elements[1].color = (0.11, 0.11, 0.115, 1)
    l.new(r.outputs['Fac'], rampa.inputs['Fac'])
    l.new(rampa.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.8
    relieve = n.new('ShaderNodeBump'); relieve.inputs['Strength'].default_value = 0.2
    l.new(r.outputs['Fac'], relieve.inputs['Height'])
    l.new(relieve.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_emisor(nombre, color, fuerza):
    m = bpy.data.materials.new(nombre)
    n, l = nodos(m)
    p = n['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
    p.inputs['Emission Color'].default_value = (*color, 1)
    p.inputs['Emission Strength'].default_value = fuerza
    p.inputs['Roughness'].default_value = 0.4
    return m


def mat_pelota():
    """Pelota de futsal: blanca con paneles (Voronoi) en el color de acento."""
    m = bpy.data.materials.new('pelota')
    n, l = nodos(m)
    p = n['Principled BSDF']
    v = n.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = 3.2
    v.feature = 'DISTANCE_TO_EDGE'
    rampa = n.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].position = 0.0; rampa.color_ramp.elements[0].color = (0.02, 0.02, 0.025, 1)
    rampa.color_ramp.elements[1].position = 0.06; rampa.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1)
    l.new(v.outputs['Distance'], rampa.inputs['Fac'])
    l.new(rampa.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.35
    p.inputs['Coat Weight'].default_value = 0.5
    return m


# ── la escena ───────────────────────────────────────────────────────────────

def armar(var):
    limpiar()
    escena = bpy.context.scene
    escena.frame_start, escena.frame_end = 1, CUADROS
    escena.render.fps = FPS

    # Mundo: casi negro, apenas un rebote azulado.
    mundo = bpy.data.worlds.new('mundo'); escena.world = mundo
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs['Color'].default_value = (0.002, 0.002, 0.003, 1)

    acento = tuple(var['acento'])
    piso, panel, hormigon = mat_piso(), mat_panel(), mat_hormigon()
    goma = mat_simple('zocalo_goma', (0.012, 0.012, 0.013), 0.55)
    metal = mat_simple('metal_vigas', (0.18, 0.18, 0.19), 0.35, metal=1.0)
    aluminio = mat_simple('marco_aluminio', (0.6, 0.6, 0.62), 0.25, metal=1.0)
    madera_banco = mat_parquet()
    led = mat_emisor('led_acento', acento, 0.0)
    difusor = mat_emisor('difusor_luminaria', tuple(var['luz_techo']), 0.0)

    mitad = ANCHO_P / 2

    # Piso del pasillo y el parquet de la cancha al final.
    caja('piso', (ANCHO_P + 6, LARGO + 7, 0.1), (0, (LARGO - 7) / 2, -0.05), piso)
    caja('piso_cancha', (16, 14, 0.1), (0, LARGO + 7, -0.05), mat_parquet())
    # Línea de cancha (blanca) que se asoma en la boca.
    caja('linea_cancha', (16, 0.08, 0.002), (0, LARGO + 2.5, 0.001), mat_simple('linea', (0.85, 0.85, 0.85), 0.4))

    # Paredes (estilo túnel de vestuario): listones verticales de madera con
    # luz de color detrás, que se escapa entre las juntas, alternados con
    # cajas de luz con gráfica de futsal. Detrás, hormigón oscuro.
    listones = mat_listones()
    cajas_luz = []
    for lado in (-1, 1):
        caja(f'muro_{lado}', (0.08, LARGO, ALTO_P), (lado * (mitad + 0.06), LARGO / 2, ALTO_P / 2), hormigon)
        caja(f'zocalo_{lado}', (0.06, LARGO, 0.3), (lado * (mitad - 0.03), LARGO / 2, 0.15), goma, bisel=0.01)
        y, k = 0.4, 0
        while y < LARGO - 1.0:
            if k % 2 == 1:
                ancho_caja = 1.5
                caja(f'marco_caja_{lado}_{k}', (0.1, ancho_caja + 0.12, 2.0), (lado * (mitad - 0.05), y + ancho_caja / 2, 1.5), aluminio, bisel=0.015)
                grafica = GRAFICAS[(k // 2 + (0 if lado < 0 else 1)) % len(GRAFICAS)]
                # del lado derecho la imagen se espeja para que se lea desde el pasillo
                mat_caja = mat_caja_luz(var, grafica, invertir=lado > 0)
                caja(f'caja_luz_{lado}_{k}', (0.01, ancho_caja, 1.85), (lado * (mitad - 0.105), y + ancho_caja / 2, 1.5), mat_caja)
                cajas_luz.append(mat_caja)
                y += ancho_caja + 0.35
            else:
                largo = min(5.0, LARGO - 1.0 - y)
                cuantos = max(1, int(largo / 0.1))
                lis = caja(f'listones_{lado}_{k}', (0.06, 0.04, 2.3), (lado * (mitad - 0.04), y + 0.02, 1.5), listones, bisel=0.006)
                arr = lis.modifiers.new('fila', 'ARRAY')
                arr.count = cuantos
                arr.use_relative_offset = False
                arr.use_constant_offset = True
                arr.constant_offset_displace = (0, 0.1, 0)
                lis.modifiers.move(len(lis.modifiers) - 1, 0)
                # el resplandor detrás de los listones
                caja(f'resplandor_{lado}_{k}', (0.005, cuantos * 0.1, 2.2), (lado * (mitad + 0.012), y + cuantos * 0.05, 1.5), led)
                y += cuantos * 0.1 + 0.35
            k += 1
        # Tiras LED del color de la variante: a ras del piso y en lo alto.
        caja(f'led_bajo_{lado}', (0.02, LARGO, 0.025), (lado * (mitad - 0.07), LARGO / 2, 0.31), led)
        caja(f'led_alto_{lado}', (0.02, LARGO, 0.02), (lado * (mitad - 0.07), LARGO / 2, 2.72), led)

    # Techo con vigas, bandeja de cables y luminarias.
    caja('techo', (ANCHO_P + 0.3, LARGO, 0.1), (0, LARGO / 2, ALTO_P + 0.05), hormigon)
    for i in range(int(LARGO / 1.5) + 1):
        caja(f'viga_{i}', (ANCHO_P, 0.12, 0.22), (0, i * 1.5, ALTO_P - 0.11), metal, bisel=0.01)
    caja('bandeja_cables', (0.35, LARGO, 0.06), (1.1, LARGO / 2, ALTO_P - 0.28), metal, bisel=0.005)

    luces = []
    for i in range(LUMINARIAS):
        y = 1.5 + i * (LARGO - 3) / (LUMINARIAS - 1)
        caja(f'luminaria_{i}', (1.3, 0.34, 0.07), (0, y, ALTO_P - 0.29), aluminio, bisel=0.01)
        d = caja(f'difusor_{i}', (1.2, 0.26, 0.01), (0, y, ALTO_P - 0.33), difusor.copy())
        bpy.ops.object.light_add(type='AREA', location=(0, y, ALTO_P - 0.35))
        luz = bpy.context.active_object
        luz.name = f'luz_{i}'
        luz.data.shape = 'RECTANGLE'
        luz.data.size, luz.data.size_y = 1.2, 0.26
        luz.data.color = tuple(var['luz_techo'])
        luz.data.energy = 0
        luces.append((y, luz, d))

    # Futsal: un banco de suplentes y pelotas contra la pared.
    caja('banco_asiento', (0.42, 3.2, 0.05), (-mitad + 0.32, 12.0, 0.46), madera_banco, bisel=0.01)
    for dy in (-1.4, 0, 1.4):
        caja(f'banco_pata_{dy}', (0.05, 0.05, 0.44), (-mitad + 0.32, 12.0 + dy, 0.22), metal)
    pelota = mat_pelota()
    for j, (px, py) in enumerate([(mitad - 0.45, 18.4), (mitad - 0.75, 18.9), (mitad - 0.4, 19.3)]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(px, py, 0.11), segments=48, ring_count=24)
        b = bpy.context.active_object
        b.name = f'pelota_{j}'
        bpy.ops.object.shade_smooth()
        b.data.materials.append(pelota)

    # Señalética en relieve en las paredes: MYSQUAD / FUTSAL.
    for texto, lado, y in (('MYSQUAD', -1, 6.0), ('FUTSAL', 1, 23.0)):
        bpy.ops.object.text_add(location=(lado * (mitad - 0.1), y, 1.9))
        t = bpy.context.active_object
        t.data.body = texto
        try:
            t.data.font = bpy.data.fonts.load(FUENTE)
        except Exception:
            pass
        t.data.extrude = 0.015
        t.data.size = 0.55
        t.data.align_x = 'CENTER'
        t.rotation_euler = (math.radians(90), 0, math.radians(-90 * lado))
        t.data.materials.append(led)

    # Boca del pasillo: marco de aluminio y, del otro lado, oscuridad + el haz.
    for lado in (-1, 1):
        caja(f'marco_{lado}', (0.18, 0.25, ALTO_P), (lado * (mitad - 0.09), LARGO, ALTO_P / 2), aluminio, bisel=0.02)
    caja('marco_sup', (ANCHO_P, 0.25, 0.18), (0, LARGO, ALTO_P - 0.09), aluminio, bisel=0.02)
    bpy.ops.object.light_add(type='SPOT', location=(0, LARGO + 1.8, 7.5))
    haz = bpy.context.active_object
    haz.name = 'haz_final'
    haz.data.spot_size = math.radians(24)
    haz.data.spot_blend = 0.35
    haz.data.color = tuple(var['haz'])
    haz.data.energy = 0
    haz.rotation_euler = (0, 0, 0)

    # El haz de la boca: un cono de luz (geometría con emisión que se
    # desvanece hacia abajo y hacia los bordes), más barato que un volumen.
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=1.7, radius2=0.18, depth=7.4, location=(0, LARGO + 1.8, 3.75), end_fill_type='NOTHING')
    cono = bpy.context.active_object
    cono.name = 'haz_cono'
    mc = bpy.data.materials.new('haz_cono')
    nc, lc = nodos(mc)
    nc.remove(nc['Principled BSDF'])
    em = nc.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*var['haz'], 1)
    em.inputs['Strength'].default_value = 0.0
    tr = nc.new('ShaderNodeBsdfTransparent')
    coord = nc.new('ShaderNodeTexCoord')
    sep = nc.new('ShaderNodeSeparateXYZ'); lc.new(coord.outputs['Generated'], sep.inputs['Vector'])
    alto_r = nc.new('ShaderNodeValToRGB')                 # más fuerte arriba, se apaga abajo
    alto_r.color_ramp.elements[0].position = 0.0; alto_r.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1)
    alto_r.color_ramp.elements[1].position = 1.0; alto_r.color_ramp.elements[1].color = (0.55, 0.55, 0.55, 1)
    alto_r.color_ramp.interpolation = 'EASE'
    lc.new(sep.outputs['Z'], alto_r.inputs['Fac'])
    capa = nc.new('ShaderNodeLayerWeight'); capa.inputs['Blend'].default_value = 0.6
    borde = nc.new('ShaderNodeMath'); borde.operation = 'SUBTRACT'; borde.inputs[0].default_value = 1.0
    lc.new(capa.outputs['Facing'], borde.inputs[1])
    mult = nc.new('ShaderNodeMath'); mult.operation = 'MULTIPLY'
    lc.new(alto_r.outputs['Color'], mult.inputs[0]); lc.new(borde.outputs['Value'], mult.inputs[1])
    mz = nc.new('ShaderNodeMixShader')
    lc.new(mult.outputs['Value'], mz.inputs['Fac'])
    lc.new(tr.outputs['BSDF'], mz.inputs[1]); lc.new(em.outputs['Emission'], mz.inputs[2])
    lc.new(mz.outputs['Shader'], nc['Material Output'].inputs['Surface'])
    cono.data.materials.append(mc)
    cono.visible_shadow = False
    vol = em  # (el "volumen" ahora es el cono: se anima su intensidad)

    # Polvo que flota dentro del haz: partículas 3D (esferas emisivas chiquitas).
    bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=3.0, location=(0, LARGO + 1.8, 1.5))
    emisor = bpy.context.active_object
    emisor.name = 'emisor_polvo'
    emisor.hide_render = True
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.006, subdivisions=1, location=(0, -50, 0))
    mota = bpy.context.active_object
    mota.name = 'mota'
    mm = mat_emisor('mota', tuple(var['haz']), 6.0)
    mota.data.materials.append(mm)
    ps = emisor.modifiers.new('polvo', 'PARTICLE_SYSTEM').particle_system
    cfg = ps.settings
    cfg.count = 900
    cfg.frame_start, cfg.frame_end = -200, 1
    cfg.lifetime = 600
    cfg.emit_from = 'VOLUME'
    cfg.physics_type = 'NEWTON'
    cfg.normal_factor = 0.0
    cfg.effector_weights.gravity = 0.0
    try:
        cfg.brownian_factor = 0.02
    except Exception:
        pass
    cfg.render_type = 'OBJECT'
    cfg.instance_object = mota
    cfg.particle_size = 1.0
    cfg.size_random = 0.7
    emisor.show_instancer_for_render = False
    polvo_mat = mm

    sobre = armar_sobre(var)
    camara, destello = armar_camara(var)
    animar(var, luces, haz, led, sobre, camara, destello, vol, cajas_luz)
    render_config(escena, camara)
    return escena


def textura_sobre(var):
    """La etiqueta del sobre (frente), dibujada con Pillow y guardada al lado."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    w, h = 1024, 1536
    base = tuple(int(255 * min(1, c ** (1 / 2.2))) for c in var['sobre_color'])
    acento = tuple(int(255 * min(1, c ** (1 / 2.2))) for c in var['acento'])
    img = Image.new('RGB', (w, h), base)
    d = ImageDraw.Draw(img)
    for yy in range(h):                    # degradé diagonal oscuro-claro-oscuro
        f = 0.55 + 0.45 * math.sin(math.pi * yy / h)
        d.line([(0, yy), (w, yy)], fill=tuple(int(c * f) for c in base))
    # bandas en diagonal (el "foil")
    capa = Image.new('L', (w, h), 0)
    dc = ImageDraw.Draw(capa)
    for k in range(-h, w + h, 140):
        dc.polygon([(k, 0), (k + 60, 0), (k + 60 - h * 0.45, h), (k - h * 0.45, h)], fill=38)
    img = Image.composite(Image.new('RGB', (w, h), (255, 255, 255)), img, capa.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(img)
    d.rectangle([28, 28, w - 28, h - 28], outline=acento, width=10)
    titulo = var.get('sobre_titulo') or ['MYSQUAD']
    sub = var.get('sobre_subtitulo') or 'FUTSAL'
    f_big = ImageFont.truetype(FUENTE, 128)
    f_mid = ImageFont.truetype(FUENTE, 96)
    f_small = ImageFont.truetype(FUENTE, 52)
    # estrella
    cx, cy, r = w / 2, 470, 190
    pts = []
    for k in range(10):
        ang = -math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    ImageDraw.Draw(glow).polygon(pts, fill=acento)
    img = Image.blend(img, Image.composite(glow, img, glow.convert('L').filter(ImageFilter.GaussianBlur(30))), 0.8)
    d = ImageDraw.Draw(img)
    d.polygon(pts, fill=(255, 214, 90))
    y = 760
    for linea in titulo:
        tw = d.textlength(linea, font=f_big)
        d.text(((w - tw) / 2, y), linea, font=f_big, fill=(255, 255, 255))
        y += 150
    tw = d.textlength(sub, font=f_mid)
    d.text(((w - tw) / 2, y + 20), sub, font=f_mid, fill=acento)
    marca = 'MYSQUAD · FUTSAL'
    tw = d.textlength(marca, font=f_small)
    d.text(((w - tw) / 2, h - 170), marca, font=f_small, fill=(230, 230, 230))
    ruta = os.path.join(AQUI, 'texturas', f'sobre_{var["id"]}.png')
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    img.save(ruta)
    return ruta


def armar_sobre(var):
    """El sobre: dos mitades (se rompe por el medio) de foil metálico arrugado,
    con la etiqueta adelante y un borde que se enciende."""
    ruta = textura_sobre(var)
    imagen = bpy.data.images.load(ruta)
    m = bpy.data.materials.new('sobre_foil')
    n, l = nodos(m)
    p = n['Principled BSDF']
    tex = n.new('ShaderNodeTexImage'); tex.image = imagen
    l.new(tex.outputs['Color'], p.inputs['Base Color'])
    l.new(tex.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 0.0
    p.inputs['Metallic'].default_value = 0.7
    p.inputs['Roughness'].default_value = 0.17
    p.inputs['Coat Weight'].default_value = 1.0
    p.inputs['Coat Roughness'].default_value = 0.03
    arrugas = n.new('ShaderNodeTexNoise'); arrugas.inputs['Scale'].default_value = 9; arrugas.inputs['Detail'].default_value = 3
    relieve = n.new('ShaderNodeBump'); relieve.inputs['Strength'].default_value = 0.02
    l.new(arrugas.outputs['Fac'], relieve.inputs['Height'])
    l.new(relieve.outputs['Normal'], p.inputs['Normal'])

    ancho, alto = 0.62, 0.93
    corte = 0.56                  # el corte, a esta altura (0 abajo, 1 arriba)
    mitades = []
    for nombre, v0, v1 in (('sobre_abajo', 0.0, corte), ('sobre_arriba', corte, 1.0)):
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=60, size=1)
        o = bpy.context.active_object
        o.name = nombre
        malla = o.data
        for vtx in malla.vertices:
            u = vtx.co.x + 0.5
            v = v0 + (vtx.co.y + 0.5) * (v1 - v0)
            vtx.co.x = (u - 0.5) * ancho
            vtx.co.y = -0.035 * (1 - (2 * u - 1) ** 2)      # combado hacia la cámara
            vtx.co.z = (v - 0.5) * alto
            # dientes del corte (zig-zag) en el borde de la rotura
            if abs(v - corte) < 1e-6:
                vtx.co.z += 0.012 * (1 if int(u * 20) % 2 else -1)
        uv = malla.uv_layers.active
        for poly in malla.polygons:
            for li in poly.loop_indices:
                vi = malla.loops[li].vertex_index
                co = malla.vertices[vi].co
                uv.data[li].uv = (co.x / ancho + 0.5, co.z / alto + 0.5)
        sol = o.modifiers.new('grosor', 'SOLIDIFY'); sol.thickness = 0.004
        o.data.materials.append(m)
        bpy.ops.object.shade_smooth()
        mitades.append(o)
    vacio = bpy.data.objects.new('sobre', None)
    bpy.context.collection.objects.link(vacio)
    for o in mitades:
        o.parent = vacio
    # Luz que sale por el corte cuando se rompe.
    bpy.ops.object.light_add(type='POINT', location=(0, 0.08, (corte - 0.5) * alto))
    rayo = bpy.context.active_object
    rayo.name = 'luz_corte'
    rayo.data.color = tuple(var['acento'])
    rayo.data.energy = 0
    rayo.data.shadow_soft_size = 0.05
    rayo.parent = vacio
    return {'raiz': vacio, 'abajo': mitades[0], 'arriba': mitades[1], 'mat': p, 'luz': rayo}


def armar_camara(var):
    bpy.ops.object.camera_add(location=(0, -5.0, 1.5))
    cam = bpy.context.active_object
    cam.name = 'camara'
    cam.data.lens = 26
    cam.data.sensor_width = 36
    cam.data.dof.use_dof = True
    cam.data.dof.aperture_fstop = 2.2
    cam.rotation_mode = 'XYZ'
    bpy.context.scene.camera = cam
    # Destello final: un plano emisivo pegado a la lente que se enciende.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.12))
    pl = bpy.context.active_object
    pl.name = 'destello'
    pl.scale = (0.4, 0.25, 1)
    pl.parent = cam
    m = bpy.data.materials.new('destello')
    n, l = nodos(m)
    n.remove(n['Principled BSDF'])
    em = n.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*var['destello'], 1); em.inputs['Strength'].default_value = 6
    tr = n.new('ShaderNodeBsdfTransparent')
    mz = n.new('ShaderNodeMixShader'); mz.inputs['Fac'].default_value = 0.0
    l.new(tr.outputs['BSDF'], mz.inputs[1]); l.new(em.outputs['Emission'], mz.inputs[2])
    l.new(mz.outputs['Shader'], n['Material Output'].inputs['Surface'])
    pl.data.materials.append(m)
    pl.visible_shadow = False
    return cam, mz.inputs['Fac']


# ── la animación ────────────────────────────────────────────────────────────

def suavizar(obj):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    for fc in ad.action.fcurves:
        for k in fc.keyframe_points:
            k.handle_left_type = k.handle_right_type = 'AUTO_CLAMPED'


def animar(var, luces, haz, led, sobre, cam, destello, vol, cajas_luz):
    raiz, abajo, arriba = sobre['raiz'], sobre['abajo'], sobre['arriba']

    # 1) El sobre aparece frente a la cámara, flota y se acerca.
    clave(raiz, 'location', 1, Vector((0, -3.0, 1.5)))
    clave(raiz, 'location', 40, Vector((0, -3.6, 1.5)))
    clave(raiz, 'rotation_euler', 1, Vector((0, math.radians(-4), math.radians(-14))))
    clave(raiz, 'rotation_euler', 40, Vector((0, 0, math.radians(0))))
    clave_socket(sobre['mat'].inputs['Emission Strength'], 1, 0.0)
    clave_socket(sobre['mat'].inputs['Emission Strength'], 30, 0.25)
    clave_socket(sobre['mat'].inputs['Emission Strength'], 46, 1.4)
    clave_socket(sobre['mat'].inputs['Emission Strength'], 60, 0.0)
    # Luz que lo recorta desde atrás (y la del corte, al romperse).
    bpy.ops.object.light_add(type='AREA', location=(0, -2.4, 2.4))
    contra = bpy.context.active_object
    contra.name = 'contraluz_sobre'
    contra.data.size = 1.5
    contra.data.color = tuple(var['acento'])
    contra.rotation_euler = (math.radians(-130), 0, 0)
    clave(contra.data, 'energy', 1, 0.0)
    clave(contra.data, 'energy', 20, 60.0)
    clave(contra.data, 'energy', 46, 140.0)
    clave(contra.data, 'energy', 62, 0.0)
    bpy.ops.object.light_add(type='AREA', location=(0.9, -4.6, 2.4))
    frente = bpy.context.active_object
    frente.name = 'luz_frente_sobre'
    frente.data.size = 2.2
    frente.data.color = (1, 0.97, 0.92)
    direccion = Vector((0, -3.4, 1.5)) - frente.location
    frente.rotation_euler = direccion.to_track_quat('-Z', 'Y').to_euler()
    clave(frente.data, 'energy', 1, 25.0)
    clave(frente.data, 'energy', 50, 35.0)
    clave(frente.data, 'energy', 62, 0.0)
    clave(sobre['luz'].data, 'energy', 44, 0.0)
    clave(sobre['luz'].data, 'energy', 48, 400.0)
    clave(sobre['luz'].data, 'energy', 58, 0.0)

    # 2) Se rompe: cada mitad sale para su lado, girando.
    for o, sentido in ((abajo, -1), (arriba, 1)):
        clave(o, 'location', 45, Vector((0, 0, 0)))
        clave(o, 'location', 64, Vector((0.25 * sentido, -0.15, 0.95 * sentido)))
        clave(o, 'rotation_euler', 45, Vector((0, 0, 0)))
        clave(o, 'rotation_euler', 64, Vector((math.radians(70 * sentido), math.radians(25 * sentido), math.radians(-20 * sentido))))
    clave(raiz, 'scale', 63, Vector((1, 1, 1)))
    clave(raiz, 'scale', 66, Vector((0.001, 0.001, 0.001)))

    # 3) La cámara: casi quieta, empuja por el corte y recorre el pasillo
    #    (acelera y frena suave), con un leve balanceo de cámara en mano.
    camino = [
        (1, (0, -5.0, 1.5)), (40, (0, -4.85, 1.5)), (62, (0, -2.6, 1.48)),
        (100, (0.1, 9.0, 1.55)), (140, (-0.1, 24.5, 1.6)), (170, (0, 31.5, 1.55)), (195, (0, 33.2, 1.5)),
    ]
    for f, pos in camino:
        clave(cam, 'location', f, Vector(pos))
    for f, rot in ((1, (90, 0, 0)), (62, (90.5, 0, 0)), (120, (91.5, 1.5, -1.5)), (170, (89.5, -1.0, 1.0)), (195, (93.0, 0, 0))):
        clave(cam, 'rotation_euler', f, Vector(tuple(math.radians(a) for a in rot)))
    suavizar(cam)
    for fc in cam.animation_data.action.fcurves:
        if fc.data_path == 'rotation_euler':
            ruido = fc.modifiers.new('NOISE'); ruido.scale = 22; ruido.strength = 0.006
    clave(cam.data.dof, 'focus_distance', 1, 1.9)
    clave(cam.data.dof, 'focus_distance', 44, 1.15)
    clave(cam.data.dof, 'focus_distance', 70, 8.0)
    clave(cam.data.dof, 'focus_distance', 195, 5.0)

    # 4) Luminarias: se prenden un poco antes de que pase la cámara; desde
    #    'oscurece_desde' (fracción del largo) en adelante se prenden menos y
    #    las de atrás se apagan: el pasillo se va oscureciendo.
    oscuro = var['oscurece_desde'] * LARGO
    w = var['luz_techo_w']
    tramos = [(p[1][1], p[0]) for p in camino if p[0] >= 62]   # (y, cuadro)

    def cuadro_en(y):
        for (y0, f0), (y1, f1) in zip(tramos, tramos[1:]):
            if y <= y1:
                return f0 + (f1 - f0) * max(0.0, (y - y0) / (y1 - y0))
        return tramos[-1][1]

    for y, luz, d in luces:
        on = max(55, int(cuadro_en(y) - 26))
        brillo = 1.0 if y < oscuro else max(0.0, 1 - (y - oscuro) / (LARGO - oscuro)) ** 1.6
        socket = d.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
        clave_socket(socket, on - 1, 0.0, 'CONSTANT')
        clave_socket(socket, on, 30.0 * brillo, 'LINEAR')
        clave_socket(socket, on + 6, 18.0 * brillo, 'LINEAR')
        clave_socket(socket, 158, 18.0 * brillo * (0.55 if y < oscuro else 0.2))
        clave_socket(socket, 182, 0.0)
        clave(luz.data, 'energy', on - 1, 0.0, 'CONSTANT')
        clave(luz.data, 'energy', on, w * brillo * 1.6, 'LINEAR')     # golpe al prenderse
        clave(luz.data, 'energy', on + 3, w * brillo * 0.7, 'LINEAR')
        clave(luz.data, 'energy', on + 6, w * brillo, 'LINEAR')
        apaga = 158
        clave(luz.data, 'energy', apaga, w * brillo * (0.55 if y < oscuro else 0.2), 'BEZIER')
        clave(luz.data, 'energy', 182, 0.0, 'BEZIER')

    # LEDs de acento: tenues al principio, fuertes en el recorrido y, en la
    # oscuridad final, apenas un hilo de color.
    soc_led = led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    clave_socket(soc_led, 1, 0.0); clave_socket(soc_led, 48, 0.0); clave_socket(soc_led, 70, 5.0)
    clave_socket(soc_led, 150, 3.5); clave_socket(soc_led, 178, 0.4)

    # 5) El haz en la boca y el destello final.
    clave(haz.data, 'energy', 150, 0.0)
    clave(haz.data, 'energy', 175, var['haz_w'] * 0.45)
    clave(haz.data, 'energy', 186, var['haz_w'])
    clave(haz.data, 'energy', 195, var['haz_w'] * 1.8)
    clave_socket(vol.inputs['Strength'], 150, 0.0)
    clave_socket(vol.inputs['Strength'], 178, 0.9)
    clave_socket(vol.inputs['Strength'], 195, 2.2)
    # Las cajas de luz se prenden con el pasillo y se apagan con él.
    for mc in cajas_luz:
        soc = mc.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
        clave_socket(soc, 50, 0.0); clave_socket(soc, 72, 3.2); clave_socket(soc, 150, 2.4); clave_socket(soc, 176, 0.15)
    clave_socket(destello, 183, 0.0)
    clave_socket(destello, 195, 1.0)


def render_config(escena, cam):
    escena.render.engine = 'CYCLES'
    c = escena.cycles
    c.device = 'CPU'
    c.samples = 48
    c.adaptive_threshold = 0.05
    c.use_denoising = True
    try:
        c.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    c.max_bounces = 6
    c.diffuse_bounces = 2
    c.glossy_bounces = 3
    c.transmission_bounces = 2
    c.volume_bounces = 0
    c.volume_step_rate = 4.0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.use_light_tree = True
    escena.render.use_motion_blur = True
    escena.render.motion_blur_shutter = 0.45
    escena.render.film_transparent = False
    escena.view_settings.view_transform = 'AgX'
    try:
        escena.view_settings.look = 'AgX - Punchy'
    except Exception:
        pass
    escena.view_settings.exposure = 0.4
    escena.render.use_persistent_data = True
    # Bloom y viñeta en composición.
    escena.use_nodes = True
    arbol = escena.node_tree
    for nd in list(arbol.nodes):
        arbol.nodes.remove(nd)
    capas = arbol.nodes.new('CompositorNodeRLayers')
    brillo = arbol.nodes.new('CompositorNodeGlare')
    brillo.glare_type = 'FOG_GLOW'
    brillo.quality = 'HIGH'
    brillo.threshold = 1.2
    brillo.size = 8
    brillo.mix = -0.55
    lente = arbol.nodes.new('CompositorNodeLensdist')
    lente.inputs['Dispersion'].default_value = 0.012
    lente.inputs['Distortion'].default_value = -0.012
    salida = arbol.nodes.new('CompositorNodeComposite')
    arbol.links.new(capas.outputs['Image'], brillo.inputs['Image'])
    arbol.links.new(brillo.outputs['Image'], lente.inputs['Image'])
    arbol.links.new(lente.outputs['Image'], salida.inputs['Image'])


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--variante', default='vdraft')
    ap.add_argument('--ancho', type=int, default=1920)
    ap.add_argument('--muestras', type=int, default=48)
    ap.add_argument('--cuadros', default='')
    ap.add_argument('--desde', type=int, default=1)
    ap.add_argument('--hasta', type=int, default=CUADROS)
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--guardar', action='store_true')
    ap.add_argument('--salida', default='/tmp/cine')
    a = ap.parse_args(argv)
    with open(os.path.join(AQUI, 'variantes.json')) as f:
        var = json.load(f)[a.variante]
    var['id'] = a.variante
    escena = armar(var)
    escena.render.resolution_x = a.ancho
    escena.render.resolution_y = round(a.ancho * 9 / 16)
    escena.render.resolution_percentage = 100
    escena.cycles.samples = a.muestras
    if a.guardar:
        ruta = os.path.join(AQUI, f'pasillo_{a.variante}.blend')
        bpy.ops.wm.save_as_mainfile(filepath=ruta, compress=True)
        print('guardado', ruta)
    cuadros = [int(x) for x in a.cuadros.split(',') if x] if a.cuadros else (range(a.desde, a.hasta + 1) if a.render else [])
    destino = os.path.join(a.salida, a.variante)
    os.makedirs(destino, exist_ok=True)
    for f in cuadros:
        escena.frame_set(f)
        escena.render.filepath = os.path.join(destino, f'{f:04d}.png')
        if a.render and os.path.exists(escena.render.filepath):
            continue
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'cuadro {f}: {time.time() - t:.1f} s', flush=True)


if __name__ == '__main__':
    main()
