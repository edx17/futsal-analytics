"""
MYSQUAD · CINEMÁTICAS DEL PABELLÓN (Blender 4.2, Cycles)

Las variantes Élite, Épico, Leyenda, Evento y Excepcional. Reutiliza los
materiales, el sobre, la cámara y el render de la cinemática V-Draft
(escena_pasillo.py, que NO se modifica) y suma la cancha cubierta: parquet con
líneas reglamentarias, arcos de futsal con red, gradas con butacas, techo con
cerchas, luminarias, focos móviles, bandas LED y marcador central.

Cada variante tiene su GUION (recorrido de cámara + coreografía de luces) y su
PERFIL (perfiles.json: colores, gráficas, decoración, duración, muestras).

    python3 cine/escena_pabellon.py --perfil elite --cuadros 40,100,150,200 --ancho 1280
    python3 cine/escena_pabellon.py --perfil elite --render --ancho 1280
    python3 cine/escena_pabellon.py --perfil elite --guardar

Coordenadas (metros): la cancha va de y=4 a y=44 (centro en y=24), x de -10 a
10. El pasillo de acceso desemboca detrás del arco cercano, en y=0.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
import bmesh
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import escena_pasillo as base  # noqa: E402  (materiales, sobre, cámara y render de V-Draft)

from escena_pasillo import caja, nodos, clave, clave_socket  # noqa: E402

FPS = 30
CY = 24.0                # centro de la cancha
Y0, Y1 = 4.0, 44.0       # líneas de fondo
ANCHO_C = 20.0
TECHO = 15.5
FILAS_Y = [6, 12, 18, 24, 30, 36, 42]
COLS_X = [-9.0, -4.5, 0.0, 4.5, 9.0]


# ── geometría auxiliar ──────────────────────────────────────────────────────

def malla(nombre, verts, caras, mat=None):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], caras)
    me.update()
    o = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    return o


def arco_plano(nombre, cx, cy, r, ancho, a0, a1, z, mat, pasos=64):
    """Una línea curva de cancha (sector de anillo plano)."""
    v, f = [], []
    for i in range(pasos + 1):
        a = a0 + (a1 - a0) * i / pasos
        for rr in (r - ancho / 2, r + ancho / 2):
            v.append((cx + rr * math.cos(a), cy + rr * math.sin(a), z))
    for i in range(pasos):
        f.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return malla(nombre, v, f, mat)


def disco(nombre, cx, cy, r, z, mat, pasos=48):
    v = [(cx, cy, z)] + [(cx + r * math.cos(2 * math.pi * i / pasos), cy + r * math.sin(2 * math.pi * i / pasos), z) for i in range(pasos)]
    f = [(0, 1 + i, 1 + (i + 1) % pasos) for i in range(pasos)]
    return malla(nombre, v, f, mat)


def cilindro(nombre, a, b, r, mat):
    """Un tubo entre dos puntos (postes, travesaños)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.name = nombre
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def mirar(obj, objetivo):
    obj.rotation_euler = (Vector(objetivo) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def textura_texto(nombre, lineas, acento, w=1024, h=256, fondo=(4, 5, 7), tam=150, repetir=False):
    """Gráfica con Pillow (bandas LED, banderas, marcador)."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    ac = tuple(int(255 * min(1, c ** (1 / 2.2))) for c in acento)
    img = Image.new('RGB', (w, h), fondo)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(base.FUENTE, tam)
    texto = '   ·   '.join(lineas) if repetir else None
    if repetir:
        x = 0
        while x < w:
            d.text((x, (h - tam) / 2 - 10), texto + '   ·   ', font=f, fill=ac)
            x += d.textlength(texto + '   ·   ', font=f)
    else:
        y = (h - len(lineas) * tam * 1.15) / 2
        for ln in lineas:
            tw = d.textlength(ln, font=f)
            d.text(((w - tw) / 2, y), ln, font=f, fill=(250, 250, 250))
            y += tam * 1.15
    glow = img.filter(ImageFilter.GaussianBlur(10))
    img = Image.blend(img, glow, 0.35)
    ruta = os.path.join(AQUI, 'texturas', f'{nombre}.png')
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    img.save(ruta)
    return ruta


def mat_imagen(nombre, ruta, fuerza=0.0, proyeccion='UV'):
    m = bpy.data.materials.new(nombre)
    n, l = nodos(m)
    p = n['Principled BSDF']
    tex = n.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(ruta)
    l.new(tex.outputs['Color'], p.inputs['Base Color'])
    l.new(tex.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = fuerza
    p.inputs['Roughness'].default_value = 0.5
    return m, p.inputs['Emission Strength']


def plano_imagen(nombre, ancho, alto, pos, rot, mat):
    """Un plano con UV de 0 a 1 (para gráficas)."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=pos)
    o = bpy.context.active_object
    o.name = nombre
    o.scale = (ancho, alto, 1)
    o.rotation_euler = rot
    o.data.materials.append(mat)
    return o


# ── materiales propios ──────────────────────────────────────────────────────

def mat_piso_deportivo(color):
    """Piso sintético de los márgenes: goma con grano fino."""
    m = bpy.data.materials.new('piso_sintetico')
    n, l = nodos(m)
    p = n['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = 0.55
    grano = n.new('ShaderNodeTexNoise'); grano.inputs['Scale'].default_value = 600
    rel = n.new('ShaderNodeBump'); rel.inputs['Strength'].default_value = 0.08
    l.new(grano.outputs['Fac'], rel.inputs['Height'])
    l.new(rel.outputs['Normal'], p.inputs['Normal'])
    return m


def mat_red():
    m = bpy.data.materials.new('red_arco')
    p = base.principled(m)
    p.inputs['Base Color'].default_value = (0.82, 0.82, 0.8, 1)
    p.inputs['Roughness'].default_value = 0.8
    p.inputs['Sheen Weight'].default_value = 0.5
    return m


def mat_poste():
    """Poste de arco de futsal: esmalte blanco con franjas rojas."""
    m = bpy.data.materials.new('poste_arco')
    n, l = nodos(m)
    p = n['Principled BSDF']
    coord = n.new('ShaderNodeTexCoord')
    sep = n.new('ShaderNodeSeparateXYZ'); l.new(coord.outputs['Object'], sep.inputs['Vector'])
    ondas = n.new('ShaderNodeMath'); ondas.operation = 'SINE'
    esc = n.new('ShaderNodeMath'); esc.operation = 'MULTIPLY'; esc.inputs[1].default_value = 15.7  # franjas de 20 cm
    l.new(sep.outputs['Z'], esc.inputs[0]); l.new(esc.outputs['Value'], ondas.inputs[0])
    paso = n.new('ShaderNodeMath'); paso.operation = 'GREATER_THAN'; paso.inputs[1].default_value = 0.0
    l.new(ondas.outputs['Value'], paso.inputs[0])
    mz = n.new('ShaderNodeMix'); mz.data_type = 'RGBA'
    mz.inputs[6].default_value = (0.85, 0.85, 0.85, 1); mz.inputs[7].default_value = (0.6, 0.02, 0.02, 1)
    l.new(paso.outputs['Value'], mz.inputs['Factor'])
    l.new(mz.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.25
    p.inputs['Coat Weight'].default_value = 0.6
    return m


def mat_asiento(color):
    m = bpy.data.materials.new('asiento')
    p = base.principled(m)
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = 0.35
    p.inputs['Coat Weight'].default_value = 0.3
    return m


def mat_cono(color):
    """Cono de luz visible (como el haz de V-Draft): emisión que se desvanece
    hacia la punta lejana y hacia los bordes."""
    mc = bpy.data.materials.new('cono_luz')
    nc, lc = nodos(mc)
    nc.remove(nc['Principled BSDF'])
    em = nc.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = 0.0
    tr = nc.new('ShaderNodeBsdfTransparent')
    coord = nc.new('ShaderNodeTexCoord')
    sep = nc.new('ShaderNodeSeparateXYZ'); lc.new(coord.outputs['Generated'], sep.inputs['Vector'])
    r = nc.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].color = (0, 0, 0, 1); r.color_ramp.elements[1].color = (0.5, 0.5, 0.5, 1)
    r.color_ramp.interpolation = 'EASE'
    lc.new(sep.outputs['Z'], r.inputs['Fac'])
    capa = nc.new('ShaderNodeLayerWeight'); capa.inputs['Blend'].default_value = 0.6
    borde = nc.new('ShaderNodeMath'); borde.operation = 'SUBTRACT'; borde.inputs[0].default_value = 1.0
    lc.new(capa.outputs['Facing'], borde.inputs[1])
    mult = nc.new('ShaderNodeMath'); mult.operation = 'MULTIPLY'
    lc.new(r.outputs['Color'], mult.inputs[0]); lc.new(borde.outputs['Value'], mult.inputs[1])
    mz = nc.new('ShaderNodeMixShader')
    lc.new(mult.outputs['Value'], mz.inputs['Fac'])
    lc.new(tr.outputs['BSDF'], mz.inputs[1]); lc.new(em.outputs['Emission'], mz.inputs[2])
    lc.new(mz.outputs['Shader'], nc['Material Output'].inputs['Surface'])
    # Lo que animan los guiones es el nivel (0-3); la emisión real es 6 veces
    # eso: a lo largo de toda la cancha el cono se ve apenas como bruma.
    nivel = nc.new('ShaderNodeMath'); nivel.operation = 'MULTIPLY'
    nivel.inputs[0].default_value = 0.0; nivel.inputs[1].default_value = 6.0
    lc.new(nivel.outputs['Value'], em.inputs['Strength'])
    return mc, nivel.inputs[0]


# ── el pabellón ─────────────────────────────────────────────────────────────

def lineas_cancha(blanco):
    w = 0.08
    z = 0.006
    zp = 0.0095        # las curvas y discos son planos: por encima del parquet (tapa en 0.006)
    x0, x1 = -ANCHO_C / 2, ANCHO_C / 2
    caja('linea_banda_i', (w, Y1 - Y0, 0.004), (x0, CY, z), blanco)
    caja('linea_banda_d', (w, Y1 - Y0, 0.004), (x1, CY, z), blanco)
    caja('linea_fondo_1', (ANCHO_C, w, 0.004), (0, Y0, z), blanco)
    caja('linea_fondo_2', (ANCHO_C, w, 0.004), (0, Y1, z), blanco)
    caja('linea_media', (ANCHO_C, w, 0.004), (0, CY, z), blanco)
    arco_plano('circulo_central', 0, CY, 3.0, w, 0, 2 * math.pi, zp, blanco)
    disco('punto_central', 0, CY, 0.1, zp, blanco)
    for yl, s in ((Y0, 1), (Y1, -1)):
        # área de 6 m: dos cuartos de círculo con centro en cada palo y la recta de 3 m
        arco_plano(f'area_{yl}_i', -1.5, yl, 6.0, w, math.pi if s > 0 else math.pi, math.pi / 2 if s > 0 else 1.5 * math.pi, zp, blanco)
        arco_plano(f'area_{yl}_d', 1.5, yl, 6.0, w, math.pi / 2 if s > 0 else 1.5 * math.pi, 0 if s > 0 else 2 * math.pi, zp, blanco)
        caja(f'area_recta_{yl}', (3.0, w, 0.004), (0, yl + s * 6.0, z), blanco)
        disco(f'penal_{yl}', 0, yl + s * 6.0, 0.1, zp, blanco)
        disco(f'doble_penal_{yl}', 0, yl + s * 10.0, 0.1, zp, blanco)


def arco_futsal(nombre, y_linea, s, poste, red):
    """Arco de futsal de 3 × 2 m (interior), con base y red de malla real."""
    r = 0.04
    xa, xb = -1.5 - r, 1.5 + r
    prof = 0.85 * -s                      # la red va hacia afuera de la cancha
    cilindro(f'{nombre}_poste_i', (xa, y_linea, 0), (xa, y_linea, 2.0 + r), r, poste)
    cilindro(f'{nombre}_poste_d', (xb, y_linea, 0), (xb, y_linea, 2.0 + r), r, poste)
    cilindro(f'{nombre}_travesano', (xa, y_linea, 2.0 + r), (xb, y_linea, 2.0 + r), r, poste)
    gris = base.mat_simple('marco_arco', (0.08, 0.08, 0.09), 0.4, metal=0.8)
    for x in (xa, xb):
        cilindro(f'{nombre}_base_{x}', (x, y_linea, 0.03), (x, y_linea + prof, 0.03), 0.025, gris)
        cilindro(f'{nombre}_soporte_{x}', (x, y_linea + prof, 0.03), (x, y_linea + prof * 0.4, 2.0), 0.022, gris)
    cilindro(f'{nombre}_base_atras', (xa, y_linea + prof, 0.03), (xb, y_linea + prof, 0.03), 0.025, gris)
    # Red: cuatro paños con malla de 10 cm (wireframe = hilos 3D de verdad).
    def pano(pts, nu, nv, nom):
        v, f = [], []
        a, b, c, d = [Vector(p) for p in pts]
        for j in range(nv + 1):
            for i in range(nu + 1):
                u, w = i / nu, j / nv
                v.append(tuple(a.lerp(b, u).lerp(d.lerp(c, u), w)))
        for j in range(nv):
            for i in range(nu):
                k = j * (nu + 1) + i
                f.append((k, k + 1, k + nu + 2, k + nu + 1))
        o = malla(nom, v, f, red)
        wf = o.modifiers.new('hilos', 'WIREFRAME'); wf.thickness = 0.008; wf.use_even_offset = False
        return o
    ya, yb = y_linea, y_linea + prof
    pano([(xa, yb, 0.03), (xb, yb, 0.03), (xb, yb * 1 + 0 * prof, 2.0), (xa, yb, 2.0)], 30, 20, f'{nombre}_red_fondo')
    pano([(xa, ya, 2.0 + r), (xb, ya, 2.0 + r), (xb, yb, 2.0), (xa, yb, 2.0)], 30, 9, f'{nombre}_red_techo')
    for x, lado in ((xa, 'i'), (xb, 'd')):
        pano([(x, ya, 0.03), (x, yb, 0.03), (x, yb, 2.0), (x, ya, 2.0 + r)], 9, 20, f'{nombre}_red_{lado}')


def gradas(p):
    asiento = mat_asiento(tuple(p['asientos']))
    hormigon = base.mat_hormigon()
    for lado in (-1, 1):
        x_borde = lado * 12.6
        for i in range(9):
            x = lado * (13.0 + i * 0.85 + 0.425)
            alto = 1.0 + i * 0.45
            caja(f'escalon_{lado}_{i}', (0.85, 46, alto), (x, CY, alto / 2), hormigon, bisel=0.01)
            # butacas: asiento + respaldo unidos, repetidos a lo largo de la grada
            s = caja(f'butaca_{lado}_{i}', (0.42, 0.44, 0.08), (x - lado * 0.05, 2.0, alto + 0.32), asiento, bisel=0.02)
            r = caja(f'respaldo_{lado}_{i}', (0.06, 0.44, 0.4), (x + lado * 0.22, 2.0, alto + 0.55), asiento, bisel=0.02)
            bpy.ops.object.select_all(action='DESELECT')
            s.select_set(True); r.select_set(True)
            bpy.context.view_layer.objects.active = s
            bpy.ops.object.join()
            arr = s.modifiers.new('fila', 'ARRAY')
            arr.count = 88
            arr.use_relative_offset = False
            arr.use_constant_offset = True
            arr.constant_offset_displace = (0, 0.5, 0)
            s.modifiers.move(len(s.modifiers) - 1, 0)
        # baranda de vidrio y banda LED al frente de la grada
        vidrio = bpy.data.materials.new('vidrio')
        pv = base.principled(vidrio)
        pv.inputs['Transmission Weight'].default_value = 1.0
        pv.inputs['Roughness'].default_value = 0.05
        caja(f'baranda_{lado}', (0.03, 46, 0.9), (lado * 12.75, CY, 1.45), vidrio)
    # muros detrás de las gradas
    for lado in (-1, 1):
        caja(f'muro_lateral_{lado}', (0.4, 54, TECHO), (lado * 22.2, CY, TECHO / 2), hormigon)


def bandas_led(p):
    ruta = textura_texto(f'banda_{p["id"]}', p['graficas'], p['acento'], w=2048, h=128, tam=84, repetir=True)
    m, fuerza = mat_imagen(f'banda_led_{p["id"]}', ruta)
    objs = []
    for lado in (-1, 1):
        # el frente del plano mira a la cancha (si no, el texto se ve espejado)
        o = plano_imagen(f'banda_led_{lado}', 46, 0.8, (lado * 12.62, CY, 0.6), (math.radians(90), 0, math.radians(-90 * lado)), m)
        objs.append(o)
    return fuerza


def techo_y_luces(p):
    metal = base.mat_simple('cercha', (0.16, 0.16, 0.17), 0.4, metal=1.0)
    hormigon = base.mat_hormigon()
    caja('techo_pabellon', (46, 56, 0.3), (0, CY, TECHO + 0.15), hormigon)
    for i, y in enumerate(range(-1, 51, 5)):
        caja(f'cercha_sup_{i}', (44, 0.3, 0.3), (0, y, TECHO - 0.3), metal, bisel=0.01)
        caja(f'cercha_inf_{i}', (44, 0.22, 0.22), (0, y, TECHO - 1.8), metal, bisel=0.01)
        for k in range(-10, 11, 2):
            caja(f'cercha_v_{i}_{k}', (0.1, 0.1, 1.5), (k * 2.1, y, TECHO - 1.05), metal)
    filas = []
    difusor = base.mat_emisor('luminaria_pabellon', tuple(p['luz_pabellon']), 0.0)
    for j, y in enumerate(FILAS_Y):
        fila = []
        for x in COLS_X:
            caja(f'campana_{j}_{x}', (0.7, 0.7, 0.25), (x, y, TECHO - 2.15), metal, bisel=0.05)
            d = caja(f'difusor_{j}_{x}', (0.6, 0.6, 0.02), (x, y, TECHO - 2.29), difusor.copy())
            bpy.ops.object.light_add(type='AREA', location=(x, y, TECHO - 2.32))
            luz = bpy.context.active_object
            luz.name = f'luz_pabellon_{j}_{x}'
            luz.data.size = 0.6
            luz.data.color = tuple(p['luz_pabellon'])
            luz.data.energy = 0
            fila.append((luz, d.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']))
        filas.append(fila)
    # marcador central colgante
    ruta = textura_texto(f'marcador_{p["id"]}', ['MYSQUAD', '00 : 00'], p['acento'], w=768, h=512, tam=120)
    m, fuerza_marc = mat_imagen(f'marcador_{p["id"]}', ruta)
    caja('marcador_cuerpo', (3.2, 3.2, 1.8), (0, CY, 10.6), base.mat_simple('marcador', (0.02, 0.02, 0.022), 0.4), bisel=0.04)
    for k, (dx, dy, rz) in enumerate(((0, -1.61, 0), (0, 1.61, math.pi), (-1.61, 0, -math.pi / 2), (1.61, 0, math.pi / 2))):
        plano_imagen(f'pantalla_{k}', 3.0, 1.6, (dx, CY + dy, 10.6), (math.radians(90), 0, rz), m)
    for x in (-1.2, 1.2):
        caja(f'cable_{x}', (0.02, 0.02, TECHO - 11.5), (x, CY, (TECHO + 11.5) / 2), metal)
    return filas, fuerza_marc


def focos_moviles(p, n=6):
    """Focos robóticos en las cerchas, con su cono de luz visible."""
    focos = []
    mc, fuerza_cono = mat_cono(tuple(p['haz']))
    for i in range(n):
        x = -12 + i * (24 / (n - 1))
        y = 14 if i % 2 == 0 else 34
        bpy.ops.object.light_add(type='SPOT', location=(x, y, TECHO - 2.0))
        s = bpy.context.active_object
        s.name = f'foco_{i}'
        s.data.spot_size = math.radians(16)
        s.data.spot_blend = 0.4
        s.data.color = tuple(p['haz'])
        s.data.energy = 0
        bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=2.4, radius2=0.12, depth=13.0, location=(0, 0, -6.5), end_fill_type='NOTHING')
        c = bpy.context.active_object
        c.name = f'cono_{i}'
        c.data.materials.append(mc)
        c.visible_shadow = False
        c.parent = s
        focos.append(s)
    return focos, fuerza_cono


def boca_y_pasillo(p, largo=12.0):
    """Pasillo de acceso (como el de V-Draft) que desemboca en y=0, detrás del arco."""
    var = dict(p)
    mitad = base.ANCHO_P / 2
    alto = base.ALTO_P
    piso = base.mat_piso()
    listones = base.mat_listones()
    hormigon = base.mat_hormigon()
    led = base.mat_emisor('led_pasillo', tuple(p['acento']), 0.0)
    aluminio = base.mat_simple('aluminio', (0.6, 0.6, 0.62), 0.25, metal=1.0)
    y0 = -largo
    caja('piso_pasillo', (base.ANCHO_P + 6, largo + 8, 0.1), (0, y0 + (largo - 8) / 2, -0.05), piso)
    caja('techo_pasillo', (base.ANCHO_P + 0.3, largo, 0.1), (0, y0 + largo / 2, alto + 0.05), hormigon)
    cajas_luz = []
    graf = p['graficas']
    for lado in (-1, 1):
        caja(f'muro_pasillo_{lado}', (0.08, largo, alto), (lado * (mitad + 0.06), y0 + largo / 2, alto / 2), hormigon)
        y, k = y0 + 0.4, 0
        while y < -1.0:
            if k % 2 == 1:
                mc = base.mat_caja_luz(var, graf[(k // 2 + (lado > 0)) % len(graf)], invertir=lado > 0)
                caja(f'marco_caja_p_{lado}_{k}', (0.1, 1.62, 2.0), (lado * (mitad - 0.05), y + 0.75, 1.5), aluminio, bisel=0.015)
                caja(f'caja_luz_p_{lado}_{k}', (0.01, 1.5, 1.85), (lado * (mitad - 0.105), y + 0.75, 1.5), mc)
                cajas_luz.append(mc.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'])
                y += 1.85
            else:
                cuantos = max(1, int(min(4.0, -1.0 - y) / 0.1))
                lis = caja(f'listones_p_{lado}_{k}', (0.06, 0.04, 2.3), (lado * (mitad - 0.04), y + 0.02, 1.5), listones, bisel=0.006)
                arr = lis.modifiers.new('fila', 'ARRAY'); arr.count = cuantos
                arr.use_relative_offset = False; arr.use_constant_offset = True; arr.constant_offset_displace = (0, 0.1, 0)
                lis.modifiers.move(len(lis.modifiers) - 1, 0)
                caja(f'resplandor_p_{lado}_{k}', (0.005, cuantos * 0.1, 2.2), (lado * (mitad + 0.012), y + cuantos * 0.05, 1.5), led)
                y += cuantos * 0.1 + 0.35
            k += 1
        caja(f'led_bajo_p_{lado}', (0.02, largo, 0.025), (lado * (mitad - 0.07), y0 + largo / 2, 0.31), led)
        caja(f'led_alto_p_{lado}', (0.02, largo, 0.02), (lado * (mitad - 0.07), y0 + largo / 2, 2.72), led)
    luces = []
    difusor = base.mat_emisor('difusor_pasillo', tuple(p['luz_techo']), 0.0)
    for i, y in enumerate([y0 + 1.5 + 3 * k for k in range(int(largo / 3))]):
        caja(f'luminaria_p_{i}', (1.3, 0.34, 0.07), (0, y, alto - 0.29), aluminio, bisel=0.01)
        d = caja(f'difusor_p_{i}', (1.2, 0.26, 0.01), (0, y, alto - 0.33), difusor.copy())
        bpy.ops.object.light_add(type='AREA', location=(0, y, alto - 0.35))
        luz = bpy.context.active_object
        luz.data.shape = 'RECTANGLE'; luz.data.size, luz.data.size_y = 1.2, 0.26
        luz.data.color = tuple(p['luz_techo']); luz.data.energy = 0
        luces.append((y, luz, d.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']))
    # pared del fondo del pabellón con la boca del pasillo
    caja('pared_cercana_i', ((22 - mitad), 0.4, TECHO), (-(mitad + (22 - mitad) / 2), -0.2, TECHO / 2), hormigon)
    caja('pared_cercana_d', ((22 - mitad), 0.4, TECHO), ((mitad + (22 - mitad) / 2), -0.2, TECHO / 2), hormigon)
    caja('pared_cercana_sup', (base.ANCHO_P, 0.4, TECHO - alto), (0, -0.2, alto + (TECHO - alto) / 2), hormigon)
    for lado in (-1, 1):
        caja(f'marco_boca_{lado}', (0.18, 0.5, alto), (lado * (mitad - 0.09), -0.2, alto / 2), aluminio, bisel=0.02)
    caja('marco_boca_sup', (base.ANCHO_P, 0.5, 0.18), (0, -0.2, alto - 0.09), aluminio, bisel=0.02)
    return {'led': led.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'], 'luces': luces, 'cajas': cajas_luz}


def decoracion(p):
    """Elementos temáticos de un perfil, integrados al pabellón (no pantallas planas)."""
    extra = {}
    if 'portal' in p['decoracion']:
        # Portal hexagonal en la boca del pasillo: seis piezas biseladas con filo emisivo.
        borde = base.mat_emisor('portal_filo', tuple(p['acento']), 0.0)
        metal = base.mat_simple('portal_metal', (0.05, 0.04, 0.07), 0.3, metal=1.0)
        r = 2.75
        piezas = []
        for i in range(6):
            a0 = math.radians(90 + i * 60)
            a1 = math.radians(90 + (i + 1) * 60)
            pa = Vector((r * math.cos(a0), -1.1, 1.6 + r * math.sin(a0)))
            pb = Vector((r * math.cos(a1), -1.1, 1.6 + r * math.sin(a1)))
            mid = (pa + pb) / 2
            o = caja(f'portal_{i}', ((pb - pa).length + 0.25, 0.35, 0.3), tuple(mid), metal, bisel=0.04)
            o.rotation_euler = (0, -math.atan2(pb.z - pa.z, pb.x - pa.x), 0)
            f = caja(f'portal_filo_{i}', ((pb - pa).length, 0.37, 0.05), tuple(mid), borde)
            f.rotation_euler = o.rotation_euler
            piezas.append(f)
        extra['portal'] = borde.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    if 'banderas' in p['decoracion']:
        ruta = textura_texto(f'bandera_{p["id"]}', p.get('texto_banderas', ['EVENTO']), p['acento'], w=512, h=1280, tam=110,
                             fondo=tuple(int(255 * c ** (1 / 2.2)) for c in p['sobre_color']))
        m, fuerza = mat_imagen(f'bandera_{p["id"]}', ruta)
        for i, y in enumerate((9, 17, 31, 39)):
            for lado in (-1, 1):
                b = plano_imagen(f'bandera_{i}_{lado}', 2.2, 5.5, (lado * 7.5, y, TECHO - 5.2), (math.radians(90), 0, math.radians(-90 * lado)), m)
                curva = b.modifiers.new('caida', 'SIMPLE_DEFORM'); curva.deform_method = 'BEND'; curva.angle = math.radians(12)
        extra['banderas'] = fuerza
    if 'logo_centro' in p['decoracion']:
        ruta = textura_texto(f'logo_{p["id"]}', [p.get('texto_logo', 'EVENTO')], p['acento'], w=1024, h=1024, tam=260,
                             fondo=tuple(int(255 * c ** (1 / 2.2)) for c in p['sobre_color']))
        m, fuerza = mat_imagen(f'logo_{p["id"]}', ruta)
        plano_imagen('logo_centro', 5.6, 5.6, (0, CY, 0.004), (0, 0, 0), m)
        extra['logo'] = fuerza
    return extra


def armar_pabellon(p):
    piso_margen = mat_piso_deportivo(tuple(p['piso_margen']))
    caja('piso_pabellon', (44, 52, 0.1), (0, CY, -0.05), piso_margen)
    caja('parquet_cancha', (ANCHO_C + 1.0, Y1 - Y0 + 1.0, 0.012), (0, CY, 0.0), base.mat_parquet())
    blanco = base.mat_simple('lineas', (0.82, 0.82, 0.82), 0.35)
    lineas_cancha(blanco)
    poste, red = mat_poste(), mat_red()
    arco_futsal('arco_cercano', Y0, 1, poste, red)
    arco_futsal('arco_lejano', Y1, -1, poste, red)
    gradas(p)
    caja('pared_lejana', (44, 0.4, TECHO), (0, 49.2, TECHO / 2), base.mat_hormigon())
    ruta = textura_texto(f'pantalla_fondo_{p["id"]}', ['MYSQUAD', 'FUTSAL'], p['acento'], w=1600, h=600, tam=200)
    m_pant, fuerza_pant = mat_imagen(f'pantalla_fondo_{p["id"]}', ruta)
    plano_imagen('pantalla_fondo', 12, 4.5, (0, 48.95, 8.5), (math.radians(90), 0, 0), m_pant)
    led = bandas_led(p)
    filas, marcador = techo_y_luces(p)
    focos, conos = focos_moviles(p)
    # Luces de "sector" para revelar el pabellón por partes.
    sectores = {}
    for nombre, pos, obj in (('arco_lejano', (0, Y1 - 7, 9), (0, Y1, 1)), ('arco_cercano', (0, Y0 + 7, 9), (0, Y0, 1)),
                             ('gradas_i', (-6, CY, 12), (-17, CY, 3)), ('gradas_d', (6, CY, 12), (17, CY, 3)),
                             ('centro', (0, CY, 13.5), (0, CY, 0))):
        bpy.ops.object.light_add(type='SPOT', location=pos)
        s = bpy.context.active_object
        s.name = f'sector_{nombre}'
        s.data.spot_size = math.radians(48 if nombre.startswith('gradas') else 34 if nombre != 'centro' else 20)
        s.data.spot_blend = 0.5
        s.data.color = tuple(p['haz']) if nombre == 'centro' else tuple(p['luz_pabellon'])
        s.data.energy = 0
        mirar(s, obj)
        sectores[nombre] = s
    # Cono visible del foco central (la luz del final).
    mc, cono_central = mat_cono(tuple(p['haz']))
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=3.2, radius2=0.25, depth=13.4, location=(0, CY, 6.7), end_fill_type='NOTHING')
    c = bpy.context.active_object
    c.name = 'cono_central'
    c.data.materials.append(mc)
    c.visible_shadow = False
    return {'filas': filas, 'focos': focos, 'conos': conos, 'led': led, 'marcador': marcador, 'pantalla': fuerza_pant,
            'sectores': sectores, 'cono_central': cono_central}


# ── animación del sobre (como en V-Draft, con tiempos propios) ──────────────

def animar_sobre(sobre, p, pos0, pos1, f_ini, f_corte, giro=-14, gira_rapido=False):
    raiz, abajo, arriba = sobre['raiz'], sobre['abajo'], sobre['arriba']
    clave(raiz, 'scale', 1, Vector((0.001, 0.001, 0.001)), 'CONSTANT')
    clave(raiz, 'scale', f_ini, Vector((1, 1, 1)))
    clave(raiz, 'location', f_ini, Vector(pos0))
    clave(raiz, 'location', f_corte - 4, Vector(pos1))
    rz0 = math.radians(70 if gira_rapido else giro)
    clave(raiz, 'rotation_euler', f_ini, Vector((0, math.radians(-4), rz0)))
    clave(raiz, 'rotation_euler', f_corte - 6, Vector((0, 0, 0)))
    em = sobre['mat'].inputs['Emission Strength']
    clave_socket(em, f_ini, 0.0); clave_socket(em, f_corte - 12, 0.3); clave_socket(em, f_corte, 1.4); clave_socket(em, f_corte + 14, 0.0)
    # luces del sobre: contraluz del color de la variante y una suave de frente
    bpy.ops.object.light_add(type='AREA', location=(pos1[0], pos1[1] + 0.9, pos1[2] + 0.9))
    contra = bpy.context.active_object
    contra.data.size = 1.5; contra.data.color = tuple(p['acento'])
    mirar(contra, (pos1[0], pos1[1] - 2, pos1[2]))
    clave(contra.data, 'energy', 1, 0.0); clave(contra.data, 'energy', f_ini + 10, 60.0)
    clave(contra.data, 'energy', f_corte, 150.0); clave(contra.data, 'energy', f_corte + 16, 0.0)
    bpy.ops.object.light_add(type='AREA', location=(pos1[0] + 0.9, pos1[1] - 1.2, pos1[2] + 0.9))
    frente = bpy.context.active_object
    frente.data.size = 2.2; frente.data.color = (1, 0.97, 0.92)
    mirar(frente, pos1)
    clave(frente.data, 'energy', 1, 0.0); clave(frente.data, 'energy', f_ini + 6, 30.0)
    clave(frente.data, 'energy', f_corte, 35.0); clave(frente.data, 'energy', f_corte + 14, 0.0)
    clave(sobre['luz'].data, 'energy', f_corte - 1, 0.0)
    clave(sobre['luz'].data, 'energy', f_corte + 3, 450.0)
    clave(sobre['luz'].data, 'energy', f_corte + 14, 0.0)
    for o, sentido in ((abajo, -1), (arriba, 1)):
        clave(o, 'location', f_corte, Vector((0, 0, 0)))
        clave(o, 'location', f_corte + 19, Vector((0.25 * sentido, -0.15, 0.95 * sentido)))
        clave(o, 'rotation_euler', f_corte, Vector((0, 0, 0)))
        clave(o, 'rotation_euler', f_corte + 19, Vector((math.radians(70 * sentido), math.radians(25 * sentido), math.radians(-20 * sentido))))
    clave(raiz, 'scale', f_corte + 18, Vector((1, 1, 1)))
    clave(raiz, 'scale', f_corte + 21, Vector((0.001, 0.001, 0.001)))


def camara_por(cam, puntos, objetivo_puntos, lente=None):
    """Recorrido de cámara: posiciones y punto al que mira (con Track To), con
    curvas suaves (aceleración y frenado progresivos)."""
    mira = bpy.data.objects.new('mira_camara', None)
    bpy.context.collection.objects.link(mira)
    for f, pos in puntos:
        clave(cam, 'location', f, Vector(pos))
    for f, pos in objetivo_puntos:
        clave(mira, 'location', f, Vector(pos))
    for o in (cam, mira):
        base.suavizar(o)
    t = cam.constraints.new('TRACK_TO')
    t.target = mira
    t.track_axis = 'TRACK_NEGATIVE_Z'
    t.up_axis = 'UP_Y'
    if lente:
        for f, mm in lente:
            clave(cam.data, 'lens', f, mm)
    # el foco sigue al punto de interés (al principio, el sobre)
    cam.data.dof.focus_object = mira
    cam.data.dof.aperture_fstop = 2.8
    return mira


def balanceo(cam, fuerza=0.006):
    if cam.animation_data and cam.animation_data.action:
        for fc in cam.animation_data.action.fcurves:
            if fc.data_path == 'location':
                r = fc.modifiers.new('NOISE'); r.scale = 26; r.strength = fuerza * 4


def rodar(cam, claves):
    """Inclinación de cámara (roll) sumada encima del Track To."""
    cam.rotation_mode = 'XYZ'
    for f, grados in claves:
        clave(cam, 'delta_rotation_euler', f, Vector((0, 0, math.radians(grados))))


def encender(luz_o_socket, f, valor, golpe=True, dur=6):
    """Prende una luz (con golpe de arranque, como las de pabellón)."""
    es_socket = not hasattr(luz_o_socket, 'data')
    def k(fr, v, interp='LINEAR'):
        if es_socket:
            clave_socket(luz_o_socket, fr, v, interp)
        else:
            clave(luz_o_socket.data, 'energy', fr, v, interp)
    k(f - 1, 0.0, 'CONSTANT')
    if golpe:
        k(f, valor * 1.5); k(f + 2, valor * 0.4); k(f + dur, valor)
    else:
        k(f + dur, valor)


def fijar(luz_o_socket, f, valor, interp='BEZIER'):
    if hasattr(luz_o_socket, 'data'):
        clave(luz_o_socket.data, 'energy', f, valor, interp)
    else:
        clave_socket(luz_o_socket, f, valor, interp)


def destello(destello_fac, f0, f1):
    clave_socket(destello_fac, f0, 0.0)
    clave_socket(destello_fac, f1, 1.0)


# ── los guiones ─────────────────────────────────────────────────────────────

def guion_elite(p, h, sobre, cam, dest):
    """ÉLITE: potencia y velocidad. Pasillo corto a toda velocidad, las filas de
    luminarias se prenden en ola de punta a punta del pabellón, los focos barren
    la cancha y la cámara sube en grúa sobre el arco y se lanza al centro."""
    pas = h['pasillo']
    animar_sobre(sobre, p, (0, -8.6, 1.5), (0, -9.3, 1.5), 4, 36, gira_rapido=True)
    camara_por(cam,
               [(1, (0, -11.2, 1.5)), (36, (0, -10.9, 1.5)), (52, (0, -8.4, 1.48)), (76, (0, -1.5, 1.55)),
                (96, (0.6, 3.0, 2.4)), (128, (3.4, 9.5, 5.2)), (170, (1.2, 15.5, 3.6)), (210, (0, 18.6, 2.6))],
               [(1, (0, -8.6, 1.5)), (36, (0, -9.3, 1.5)), (52, (0, 2, 1.45)), (90, (0, 12, 1.0)), (128, (0, 22, 0.5)), (210, (0, 26.5, 0.4))],
               lente=[(1, 26), (76, 24), (128, 22), (210, 26)])
    balanceo(cam)
    for y, luz, soc in pas['luces']:
        f = int(46 + (y + 12) / 12 * 22)
        encender(luz, f, 300); encender(soc, f, 20)
        fijar(luz, 120, 80); fijar(soc, 120, 6)
    encender(pas['led'], 44, 6, golpe=False, dur=10)
    for s in pas['cajas']:
        encender(s, 46, 3.2, golpe=False, dur=12)
    # La ola de luz: las filas se prenden de la cercana a la lejana.
    for j, fila in enumerate(h['filas']):
        f = 84 + j * 6
        for luz, soc in fila:
            encender(luz, f, p['luz_pabellon_w']); encender(soc, f, 25)
    encender(h['led'], 88, 7, golpe=False, dur=12)
    encender(h['marcador'], 96, 4, golpe=True)
    encender(h['pantalla'], 100, 4, golpe=True)
    # Focos: barren la cancha en cruz y en el clímax se juntan en el centro.
    encender(h['conos'], 92, 1.8, golpe=False, dur=10)
    for i, s in enumerate(h['focos']):
        encender(s, 92, 6000)
        lado = 1 if i % 2 == 0 else -1
        for f, objetivo in ((92, (lado * 8, 10, 0)), (130, (-lado * 8, 32, 0)), (165, (lado * 6, 18, 0)), (190, (0, CY, 0))):
            mirar(s, objetivo)
            s.keyframe_insert('rotation_euler', frame=f)
        fijar(s, 190, 9000)
    fijar(h['conos'], 190, 3.0)
    # Clímax: barrido de luz blanca + destello.
    encender(h['sectores']['centro'], 186, 6000, golpe=True)
    destello(dest, 196, 210)


def guion_epico(p, h, sobre, cam, dest):
    """ÉPICO: misterio y espectáculo. El pasillo en penumbra violeta, un portal
    hexagonal en la boca que se enciende pieza por pieza, la cámara lo atraviesa,
    gira (plano holandés) y sube a la grada; los haces cruzan el pabellón y
    terminan convergiendo en el círculo central."""
    pas = h['pasillo']
    animar_sobre(sobre, p, (0, -8.8, 1.5), (0, -9.4, 1.5), 6, 42)
    camara_por(cam,
               [(1, (0, -11.3, 1.5)), (42, (0, -11.0, 1.5)), (60, (0, -8.6, 1.5)), (110, (0, -3.2, 1.45)),
                (128, (0, 0.6, 1.7)), (160, (-5.5, 6.0, 5.4)), (192, (-9.5, 11.0, 7.4)), (210, (-10.4, 12.2, 7.8))],
               [(1, (0, -8.8, 1.5)), (42, (0, -9.4, 1.5)), (60, (0, 0, 1.6)), (110, (0, 3, 1.7)), (140, (0, 14, 1.0)), (192, (0, CY, 0.2)), (210, (0, CY, 0.0))],
               lente=[(1, 26), (110, 24), (160, 20), (210, 22)])
    rodar(cam, [(1, 0), (110, 0), (150, -7), (185, -4), (210, 0)])
    balanceo(cam, 0.004)
    for y, luz, soc in pas['luces']:
        f = int(54 + (y + 12) / 12 * 40)
        encender(luz, f, 140, golpe=False, dur=12); encender(soc, f, 9, golpe=False, dur=12)
        fijar(luz, 130, 30); fijar(soc, 130, 2)
    encender(pas['led'], 50, 5, golpe=False, dur=20)
    for s in pas['cajas']:
        encender(s, 56, 2.2, golpe=False, dur=20)
    encender(h['portal'], 96, 22, golpe=True, dur=10)
    # El pabellón en violeta: primero los haces, después las gradas, al final la cancha.
    encender(h['conos'], 118, 2.2, golpe=False, dur=18)
    for i, s in enumerate(h['focos']):
        encender(s, 118 + i * 3, 7000, golpe=False, dur=12)
        lado = 1 if i % 2 == 0 else -1
        for f, objetivo in ((118, (lado * 14, 6 + i * 6, 4)), (160, (-lado * 6, 30 - i * 3, 0)), (192, (0, CY, 0))):
            mirar(s, objetivo)
            s.keyframe_insert('rotation_euler', frame=f)
    encender(h['sectores']['gradas_i'], 132, 2600, golpe=False, dur=14)
    encender(h['sectores']['gradas_d'], 138, 2600, golpe=False, dur=14)
    encender(h['led'], 126, 6, golpe=False, dur=16)
    for j, fila in enumerate(h['filas']):
        for luz, soc in fila:
            encender(luz, 150 + j * 2, p['luz_pabellon_w'], golpe=False, dur=14); encender(soc, 150 + j * 2, 14, golpe=False, dur=14)
    encender(h['marcador'], 150, 3, golpe=False, dur=12)
    encender(h['pantalla'], 150, 3, golpe=False, dur=12)
    fijar(h['conos'], 192, 3.2)
    encender(h['sectores']['centro'], 188, 5200, golpe=True)
    encender(h['cono_central'], 188, 1.6, golpe=False, dur=8)
    destello(dest, 198, 210)


def guion_leyenda(p, h, sobre, cam, dest):
    """LEYENDA: prestigio y solemnidad. Todo a oscuras; el sobre dorado frente al
    arco. Se rompe y el pabellón se revela por sectores, con su golpe: el arco
    lejano, una grada, la otra, la cancha. La cámara avanza al ras del parquet
    y termina en una composición central, con un único haz dorado."""
    animar_sobre(sobre, p, (0, 5.4, 1.3), (0, 4.6, 1.3), 6, 64, giro=-8)
    camara_por(cam,
               [(1, (0, 2.6, 1.2)), (64, (0, 3.0, 1.2)), (86, (0, 4.8, 0.85)), (150, (0, 9.5, 0.6)),
                (205, (0, 14.0, 1.15)), (240, (0, 15.0, 1.3))],
               [(1, (0, 5.4, 1.3)), (60, (0, 4.6, 1.3)), (110, (0, 30, 0.8)), (205, (0, CY, 0.6)), (240, (0, CY, 0.7))],
               lente=[(1, 28), (86, 26), (205, 32), (240, 34)])
    balanceo(cam, 0.003)
    sec = h['sectores']
    encender(sec['arco_lejano'], 94, 3200, golpe=True, dur=10)
    encender(sec['gradas_i'], 118, 3000, golpe=True, dur=10)
    encender(sec['gradas_d'], 138, 3000, golpe=True, dur=10)
    for j, fila in enumerate(h['filas']):
        for luz, soc in fila:
            encender(luz, 160, p['luz_pabellon_w'] * 0.55, golpe=True, dur=10); encender(soc, 160, 12, golpe=True, dur=10)
            fijar(luz, 206, p['luz_pabellon_w'] * 0.25); fijar(soc, 206, 6)
    encender(h['led'], 168, 4, golpe=False, dur=20)
    encender(h['pantalla'], 172, 3, golpe=False, dur=14)
    encender(h['marcador'], 172, 3, golpe=False, dur=14)
    for nombre in ('arco_lejano', 'gradas_i', 'gradas_d'):
        fijar(sec[nombre], 200, 3000); fijar(sec[nombre], 222, 1200)
    encender(sec['centro'], 196, 7000, golpe=False, dur=18)
    encender(h['cono_central'], 196, 1.4, golpe=False, dur=18)
    destello(dest, 226, 240)


def guion_evento(p, h, sobre, cam, dest):
    """EVENTO (perfil configurable): el pasillo, el pabellón vestido con la
    decoración del evento (banderas, logo en el círculo central, bandas LED) y
    una órbita de cámara alrededor del centro."""
    pas = h['pasillo']
    animar_sobre(sobre, p, (0, -8.8, 1.5), (0, -9.4, 1.5), 6, 40)
    camara_por(cam,
               [(1, (0, -11.3, 1.5)), (40, (0, -11.0, 1.5)), (58, (0, -8.4, 1.5)), (92, (0, -0.8, 1.6)),
                (122, (3.5, 7.0, 3.8)), (160, (9.5, 17.0, 4.6)), (195, (8.0, 27.0, 4.0)), (210, (6.8, 29.0, 3.8))],
               [(1, (0, -8.8, 1.5)), (40, (0, -9.4, 1.5)), (58, (0, 2, 1.5)), (110, (0, 16, 0.8)), (160, (0, CY, 0.3)), (210, (0, CY, 0.3))],
               lente=[(1, 26), (92, 24), (160, 22), (210, 24)])
    balanceo(cam)
    for y, luz, soc in pas['luces']:
        f = int(50 + (y + 12) / 12 * 30)
        encender(luz, f, 260); encender(soc, f, 18)
        fijar(luz, 120, 60); fijar(soc, 120, 4)
    encender(pas['led'], 48, 6, golpe=False, dur=12)
    for s in pas['cajas']:
        encender(s, 50, 3, golpe=False, dur=12)
    for j, fila in enumerate(h['filas']):
        for luz, soc in fila:
            encender(luz, 92 + j * 3, p['luz_pabellon_w']); encender(soc, 92 + j * 3, 20)
    encender(h['led'], 94, 7, golpe=False, dur=10)
    for clave_deco in ('banderas', 'logo'):
        if clave_deco in h:
            encender(h[clave_deco], 100, 2.5 if clave_deco == 'banderas' else 1.6, golpe=False, dur=16)
    encender(h['marcador'], 100, 4)
    encender(h['pantalla'], 100, 4)
    encender(h['conos'], 104, 1.8, golpe=False, dur=12)
    for i, s in enumerate(h['focos']):
        encender(s, 104, 6000)
        lado = 1 if i % 2 == 0 else -1
        for f, objetivo in ((104, (lado * 7.5, 9 + i * 5, 6)), (150, (lado * 7.5, 39 - i * 5, 6)), (192, (0, CY, 0))):
            mirar(s, objetivo)
            s.keyframe_insert('rotation_euler', frame=f)
    encender(h['sectores']['centro'], 186, 5600)
    encender(h['cono_central'], 186, 1.3, golpe=False, dur=8)
    destello(dest, 198, 210)


def guion_excepcional(p, h, sobre, cam, dest):
    """EXCEPCIONAL: un acontecimiento. Un segundo de silencio y oscuridad; un haz
    central se abre sobre el círculo con el sobre flotando; la cámara avanza al
    ras del parquet (reflejos) hasta él; se rompe y el pabellón se enciende en
    anillos desde el centro hacia afuera, mientras la cámara sube y gira."""
    animar_sobre(sobre, p, (0, CY - 0.4, 1.6), (0, CY - 1.4, 1.5), 34, 160, giro=0)
    camara_por(cam,
               [(1, (0, 7.0, 0.42)), (34, (0, 7.2, 0.42)), (150, (0, CY - 4.6, 1.25)), (168, (0, CY - 4.2, 1.35)),
                (205, (4.2, CY - 7.0, 3.6)), (238, (6.6, CY - 6.2, 5.4)), (255, (7.0, CY - 6.0, 5.6))],
               [(1, (0, CY, 1.5)), (150, (0, CY - 1.4, 1.5)), (168, (0, CY, 1.2)), (238, (0, CY, 0.4)), (255, (0, CY, 0.4))],
               lente=[(1, 40), (150, 34), (205, 26), (255, 24)])
    balanceo(cam, 0.002)
    sec = h['sectores']
    encender(sec['centro'], 30, 3600, golpe=False, dur=40)
    encender(h['cono_central'], 30, 1.0, golpe=False, dur=40)
    fijar(sec['centro'], 160, 3600); fijar(sec['centro'], 170, 9000); fijar(sec['centro'], 238, 9000)
    # Anillos: filas del centro hacia los extremos.
    orden = [3, 2, 4, 1, 5, 0, 6]
    for k, j in enumerate(orden):
        for luz, soc in h['filas'][j]:
            encender(luz, 172 + k * 5, p['luz_pabellon_w'], golpe=True); encender(soc, 172 + k * 5, 24, golpe=True)
    encender(sec['gradas_i'], 200, 2600); encender(sec['gradas_d'], 204, 2600)
    encender(h['led'], 196, 7, golpe=False, dur=12)
    encender(h['marcador'], 186, 4); encender(h['pantalla'], 200, 4)
    encender(h['conos'], 214, 2.6, golpe=False, dur=10)
    for i, s in enumerate(h['focos']):
        encender(s, 214, 8000)
        mirar(s, (0, CY, 0)); s.keyframe_insert('rotation_euler', frame=214)
    fijar(h['cono_central'], 236, 2.2)
    destello(dest, 240, 255)


GUIONES = {'elite': guion_elite, 'epico': guion_epico, 'leyenda': guion_leyenda,
           'evento': guion_evento, 'excepcional': guion_excepcional}


def armar(p):
    base.limpiar()
    escena = bpy.context.scene
    escena.frame_start, escena.frame_end = 1, p['cuadros']
    escena.render.fps = FPS
    mundo = bpy.data.worlds.new('mundo'); escena.world = mundo
    mundo.use_nodes = True
    mundo.node_tree.nodes['Background'].inputs['Color'].default_value = (0.001, 0.001, 0.0015, 1)
    h = armar_pabellon(p)
    if p['guion'] in ('elite', 'epico', 'evento'):
        h['pasillo'] = boca_y_pasillo(p)
    else:
        # sin pasillo: la boca queda cerrada con la pared
        caja('pared_cercana', (44, 0.4, TECHO), (0, -0.2, TECHO / 2), base.mat_hormigon())
    h.update(decoracion(p))
    var = dict(p)
    sobre = base.armar_sobre(var)
    cam, dest = base.armar_camara(var)
    cam.rotation_euler = (0, 0, 0)
    GUIONES[p['guion']](p, h, sobre, cam, dest)
    base.render_config(escena, cam)
    try:
        escena.cycles.use_camera_cull = True
        # los conos de luz (transparentes) quedan afuera: el cull los descartaba
        for o in escena.objects:
            if o.type == 'MESH' and not o.name.startswith('cono'):
                o.cycles.use_camera_cull = True
    except AttributeError:
        pass
    return escena


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--perfil', default='elite')
    ap.add_argument('--ancho', type=int, default=1280)
    ap.add_argument('--muestras', type=int, default=0)
    ap.add_argument('--cuadros', default='')
    ap.add_argument('--desde', type=int, default=1)
    ap.add_argument('--hasta', type=int, default=0)
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--guardar', action='store_true')
    ap.add_argument('--salida', default='/tmp/cine')
    a = ap.parse_args(argv)
    with open(os.path.join(AQUI, 'perfiles.json')) as f:
        p = json.load(f)[a.perfil]
    p['id'] = a.perfil
    escena = armar(p)
    escena.render.resolution_x = a.ancho
    escena.render.resolution_y = round(a.ancho * 9 / 16)
    escena.cycles.samples = a.muestras or p.get('muestras', 16)
    if a.guardar:
        ruta = os.path.join(AQUI, f'pabellon_{a.perfil}.blend')
        bpy.ops.wm.save_as_mainfile(filepath=ruta, compress=True)
        print('guardado', ruta)
    hasta = a.hasta or p['cuadros']
    cuadros = [int(x) for x in a.cuadros.split(',') if x] if a.cuadros else (range(a.desde, hasta + 1) if a.render else [])
    destino = os.path.join(a.salida, a.perfil)
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
