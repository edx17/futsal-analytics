"""
MYSQUAD · LOS SOBRES EN 3D (Blender 4.2, Cycles)

Un paquete metalizado (como los de figuritas): cuerpo inflado, los dos
extremos dentados y sellados, una estrella y franjas en diagonal. Una versión
por tipo de sobre, con sus colores; la "neutro" (plateada) es para los sobres
de eventos y los creados por el club, que la app tiñe con su color.
Sin texto: el nombre del sobre lo pone la pantalla.

    python3 cine/sobres3d.py [--tipos diario,mega] [--muestras 64] [--salida public/juegos/sobres]

Salida: <salida>/<tipo>.webp (transparente, 600 × 840).
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

# principal, oscuro, acento (franjas y estrella)
TIPOS = {
    'diario': ('#00b862', '#03140d', '#fbbf24'),
    'racha': ('#0ea5b7', '#04161c', '#a5f3fc'),
    'wellness': ('#10b981', '#021a14', '#d1fae5'),
    'puntos': ('#2563eb', '#060d2b', '#fbbf24'),
    'mega': ('#d97706', '#160d02', '#fde68a'),
    'premio': ('#7c3aed', '#12052a', '#fbbf24'),
    'premio_especial': ('#be185d', '#1a0410', '#fde68a'),
    'neutro': ('#cbd5e1', '#111418', '#ffffff'),
    # evento: violeta de noche, naranja de calabaza y verde ácido
    'halloween': ('#5b1a8a', '#0c0412', '#ff7a00'),
}

ANCHO, ALTO = 2.0, 3.0      # el cuerpo del sobre, en metros de escena
CRIMP = 0.22                # alto de cada extremo dentado


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lin(c):
    """sRGB 0-255 → lineal 0-1 (para los colores de Blender)."""
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(f(v) for v in c)


def arte(tipo, ruta):
    """El frente: degradé, franjas doradas en diagonal y la estrella."""
    pri, osc, acento = (hex_rgb(x) for x in TIPOS[tipo])
    W, H = 1024, 1536
    im = Image.new('RGB', (W, H), osc)
    d = ImageDraw.Draw(im)
    # degradé del color principal (arriba) al oscuro (abajo)
    for y in range(H):
        t = min(1, max(0, (y - H * 0.15) / (H * 0.7)))
        c = tuple(int(pri[i] * (1 - t) + osc[i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    # el corte en V hacia abajo (como el sobre de referencia)
    capa = Image.new('L', (W, H), 0)
    dc = ImageDraw.Draw(capa)
    dc.polygon([(0, H * 0.55), (W / 2, H * 0.92), (W, H * 0.55), (W, H), (0, H)], fill=255)
    im.paste(Image.new('RGB', (W, H), tuple(int(v * 0.55) for v in osc)), (0, 0), capa)
    # franjas en diagonal
    for off, ancho in ((-0.25, 26), (-0.1, 10), (0.55, 18), (0.7, 8)):
        x0 = W * off
        d.line([(x0, H), (x0 + W * 0.9, 0)], fill=acento, width=ancho)
    # las líneas de la V
    d.line([(0, H * 0.55), (W / 2, H * 0.92), (W, H * 0.55)], fill=acento, width=14)
    if tipo == 'halloween':
        calabaza_arte(im, W, H)
        im.save(ruta)
        return
    # la estrella con brillo
    cx, cy, R = W / 2, H * 0.36, W * 0.25
    pts = []
    for i in range(10):
        r = R if i % 2 == 0 else R * 0.42
        a = -math.pi / 2 + i * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    brillo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(brillo).polygon(pts, fill=acento + (200,))
    brillo = brillo.filter(ImageFilter.GaussianBlur(40))
    im.paste(brillo, (0, 0), brillo)
    d.polygon(pts, fill=acento)
    # biselado: la mitad de cada punta un poco más oscura
    for i in range(0, 10, 2):
        a, b = pts[i], pts[(i + 1) % 10]
        d.polygon([(cx, cy), a, b], fill=tuple(int(v * 0.8) for v in acento))
    im.save(ruta)


def calabaza_arte(im, W, H):
    """Halloween: luna, murciélagos y una calabaza tallada que brilla por dentro."""
    d = ImageDraw.Draw(im)
    luna = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(luna).ellipse([W * 0.56, H * 0.06, W * 0.9, H * 0.06 + W * 0.34], fill=(253, 231, 194, 230))
    halo = luna.filter(ImageFilter.GaussianBlur(50))
    im.paste(halo, (0, 0), halo)
    im.paste(luna, (0, 0), luna)
    for bx, by, k in ((0.2, 0.12, 1.0), (0.38, 0.2, 0.7), (0.12, 0.26, 0.55)):
        x, y, s = W * bx, H * by, 70 * k
        d.polygon([(x, y), (x + s * 0.3, y - s * 0.3), (x + s, y - s * 0.25), (x + s * 0.75, y + s * 0.05), (x + s * 0.45, y - s * 0.02),
                   (x + s * 0.2, y + s * 0.25), (x, y + s * 0.12), (x - s * 0.2, y + s * 0.25), (x - s * 0.45, y - s * 0.02),
                   (x - s * 0.75, y + s * 0.05), (x - s, y - s * 0.25), (x - s * 0.3, y - s * 0.3)], fill=(8, 3, 12))
    # la calabaza: gajos, tallo y la cara encendida
    cx, cy, r = W / 2, H * 0.4, W * 0.27
    brillo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(brillo).ellipse([cx - r * 1.3, cy - r * 1.1, cx + r * 1.3, cy + r * 1.1], fill=(255, 120, 0, 150))
    brillo = brillo.filter(ImageFilter.GaussianBlur(70))
    im.paste(brillo, (0, 0), brillo)
    for dx, w, col in ((-0.55, 0.62, (196, 72, 6)), (0.55, 0.62, (196, 72, 6)), (-0.28, 0.66, (232, 101, 10)), (0.28, 0.66, (232, 101, 10)), (0, 0.6, (255, 138, 31))):
        d.ellipse([cx + dx * r - w * r, cy - r * 0.82, cx + dx * r + w * r, cy + r * 0.82], fill=col)
    d.polygon([(cx - r * 0.06, cy - r * 0.78), (cx + r * 0.08, cy - r * 0.78), (cx + r * 0.2, cy - r * 1.12), (cx + r * 0.06, cy - r * 1.14)], fill=(77, 124, 15))
    cara = (255, 224, 102)
    d.polygon([(cx - r * 0.55, cy - r * 0.05), (cx - r * 0.15, cy - r * 0.05), (cx - r * 0.35, cy - r * 0.42)], fill=cara)
    d.polygon([(cx + r * 0.15, cy - r * 0.05), (cx + r * 0.55, cy - r * 0.05), (cx + r * 0.35, cy - r * 0.42)], fill=cara)
    d.polygon([(cx - r * 0.08, cy + r * 0.12), (cx + r * 0.08, cy + r * 0.12), (cx, cy - r * 0.02)], fill=cara)
    boca = [(cx - r * 0.62, cy + r * 0.22)]
    for i in range(1, 8):
        boca.append((cx - r * 0.62 + i * r * 0.155, cy + r * (0.22 if i % 2 == 0 else 0.34)))
    boca += [(cx + r * 0.5, cy + r * 0.5), (cx, cy + r * 0.62), (cx - r * 0.5, cy + r * 0.5)]
    d.polygon(boca, fill=cara)
    # gotas verdes en las líneas de la V
    for gx in (0.18, 0.33, 0.67, 0.82):
        x = W * gx
        y = H * (0.55 + (0.92 - 0.55) * (1 - abs(gx - 0.5) * 2))
        d.ellipse([x - 12, y, x + 12, y + 46], fill=(163, 230, 53))


def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def cuerpo(mat_frente, mat_dorso):
    """El cuerpo inflado: una grilla deformada (frente) y su espejo (dorso)."""
    def hoja(signo, mat, nombre):
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=90, size=1)
        o = bpy.context.active_object
        o.name = nombre
        o.scale = (ANCHO, ALTO, 1)
        bpy.ops.object.transform_apply(scale=True)
        for v in o.data.vertices:
            u = 2 * v.co.x / ANCHO
            w = 2 * v.co.y / ALTO
            v.co.z = signo * 0.16 * max(0, 1 - abs(u) ** 6) * max(0, 1 - abs(w) ** 10)
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        if signo < 0:
            for p in o.data.polygons:
                p.flip()
        return o
    return hoja(1, mat_frente, 'frente'), hoja(-1, mat_dorso, 'dorso')


def extremo(y, mat):
    """Un extremo sellado: una tira con los dientes del corte y el rayado del sellado."""
    n = 46
    verts, caras = [], []
    borde = y + (CRIMP if y > 0 else -CRIMP)
    for i in range(n + 1):
        x = -ANCHO / 2 - 0.02 + (ANCHO + 0.04) * i / n
        diente = 0.05 if i % 2 else 0.0
        verts += [(x, y, 0), (x, borde + (diente if y > 0 else -diente), 0)]
    for i in range(n):
        a = 2 * i
        caras.append((a, a + 2, a + 3, a + 1))
    me = bpy.data.meshes.new('extremo')
    me.from_pydata(verts, [], caras)
    o = bpy.data.objects.new('extremo', me)
    bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new('grosor', 'SOLIDIFY')
    sol.thickness = 0.03
    sol.offset = 0
    o.data.materials.append(mat)
    return o


def material_foil(nombre, imagen=None, color=None):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    n, ln = m.node_tree.nodes, m.node_tree.links
    pr = n['Principled BSDF']
    if imagen:
        tex = n.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(imagen)
        coord = n.new('ShaderNodeTexCoord')
        mapping = n.new('ShaderNodeMapping')
        # coordenadas del objeto (−A/2..A/2, −H/2..H/2) → 0..1
        mapping.inputs['Location'].default_value = (0.5, 0.5, 0)
        mapping.inputs['Scale'].default_value = (1 / ANCHO, 1 / ALTO, 1)
        mapping.vector_type = 'POINT'
        ln.new(coord.outputs['Object'], mapping.inputs['Vector'])
        ln.new(mapping.outputs['Vector'], tex.inputs['Vector'])
        ln.new(tex.outputs['Color'], pr.inputs['Base Color'])
    else:
        pr.inputs['Base Color'].default_value = (*color, 1)
    pr.inputs['Metallic'].default_value = 0.75
    pr.inputs['Roughness'].default_value = 0.3
    pr.inputs['Coat Weight'].default_value = 0.5
    pr.inputs['Coat Roughness'].default_value = 0.08
    # arrugas finas del papel metalizado
    ruido = n.new('ShaderNodeTexNoise')
    ruido.inputs['Scale'].default_value = 40
    ruido.inputs['Detail'].default_value = 6
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.025
    ln.new(ruido.outputs['Fac'], bump.inputs['Height'])
    ln.new(bump.outputs['Normal'], pr.inputs['Normal'])
    return m


def material_sellado(color):
    """El sellado: dorado/metálico con rayas finas."""
    m = material_foil('sellado', color=color)
    n, ln = m.node_tree.nodes, m.node_tree.links
    pr = n['Principled BSDF']
    ondas = n.new('ShaderNodeTexWave')
    ondas.wave_type = 'BANDS'
    ondas.bands_direction = 'X'
    ondas.inputs['Scale'].default_value = 60
    bump = n.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    ln.new(ondas.outputs['Fac'], bump.inputs['Height'])
    ln.new(bump.outputs['Normal'], pr.inputs['Normal'])
    pr.inputs['Roughness'].default_value = 0.22
    return m


def escena(muestras):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.samples = muestras
    s.cycles.use_denoising = True
    s.cycles.device = 'CPU'
    s.render.film_transparent = True
    s.render.resolution_x, s.render.resolution_y = 600, 840
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Punchy'
    w = bpy.data.worlds.new('mundo')
    s.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.055, 0.06, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    for nombre, loc, energia, tam, color in (
        ('clave', (-3.5, -4.5, 4.0), 900, 3.0, (1, 0.97, 0.92)),
        ('relleno', (4.5, -3.5, 1.0), 260, 4.0, (0.85, 0.9, 1)),
        ('contra', (1.5, 4.0, 4.5), 700, 2.0, (1, 1, 1)),
    ):
        bpy.ops.object.light_add(type='AREA', location=loc)
        luz = bpy.context.active_object
        luz.name = nombre
        luz.data.energy = energia
        luz.data.size = tam
        luz.data.color = color
        luz.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(0, -9.2, 0.35))
    cam = bpy.context.active_object
    cam.data.lens = 70
    cam.rotation_euler = (math.radians(88), 0, 0)
    s.camera = cam
    return s


def render_tipo(tipo, salida, muestras, tmp):
    limpiar()
    s = escena(muestras)
    arte_png = os.path.join(tmp, f'arte_{tipo}.png')
    arte(tipo, arte_png)
    _, osc, acento = TIPOS[tipo]
    frente, dorso = cuerpo(material_foil('frente', imagen=arte_png),
                           material_foil('dorso', color=lin(hex_rgb(osc))))
    sell = material_sellado(lin(hex_rgb(acento)))
    arriba = extremo(ALTO / 2, sell)
    abajo = extremo(-ALTO / 2, sell)
    # todo junto, de pie y girado 3/4 hacia la cámara
    raiz = bpy.data.objects.new('sobre', None)
    s.collection.objects.link(raiz)
    for o in (frente, dorso, arriba, abajo):
        o.parent = raiz
    raiz.rotation_euler = (math.radians(90 - 6), math.radians(0), math.radians(-16))
    png = os.path.join(tmp, f'{tipo}.png')
    s.render.filepath = png
    bpy.ops.render.render(write_still=True)
    im = Image.open(png).convert('RGBA')
    caja = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(caja)
    lienzo = Image.new('RGBA', (600, 840), (0, 0, 0, 0))
    im.thumbnail((560, 800), Image.LANCZOS)
    lienzo.paste(im, ((600 - im.width) // 2, (840 - im.height) // 2), im)
    os.makedirs(salida, exist_ok=True)
    lienzo.save(os.path.join(salida, f'{tipo}.webp'), quality=86, method=6)
    print(f'{tipo}: listo', flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--tipos', default=','.join(TIPOS))
    ap.add_argument('--muestras', type=int, default=64)
    ap.add_argument('--salida', default=os.path.join(AQUI, '..', 'public', 'juegos', 'sobres'))
    ap.add_argument('--tmp', default='/tmp/cine/sobres3d')
    a = ap.parse_args(argv)
    os.makedirs(a.tmp, exist_ok=True)
    for t in a.tipos.split(','):
        render_tipo(t.strip(), a.salida, a.muestras, a.tmp)


if __name__ == '__main__':
    main()
