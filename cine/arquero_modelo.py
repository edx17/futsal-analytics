"""
El arquero de los penales con el modelo propio (cine/modelos/arquero.glb).

Las paradas se definen en escena_penales.py sobre un esqueleto guía simple
(empties: cadera, rodillas, codos…). Acá se importa el modelo y, cuadro por
cuadro, se le copian esas poses a su esqueleto (13 huesos):

  - el tronco ('torso', que lleva todo el cuerpo) se orienta como la guía de
    la cadera al cuello, con la cadera hacia los costados como eje;
  - cada brazo, pierna, pie y la cabeza apunta adonde apunta la guía. Como el
    modelo tiene otras proporciones, la rodilla y el codo del modelo se ubican
    sobre la cadena de la guía en la misma fracción de largo;
  - al final se apoya en el piso (el punto más bajo del cuerpo, en z=0).

Del lado de la pantalla: en la guía, '_i' es la izquierda de la pantalla; en
el modelo (que mira a la cámara) es '.R'.
"""

import bpy
from mathutils import Matrix, Vector

LADOS = (('i', 'R'), ('d', 'L'))


def _extremo(malla, grupo, desde):
    """El vértice del grupo más lejano a `desde` (la mano, la punta del pie, la coronilla)."""
    gi = malla.vertex_groups[grupo].index
    mejor, dist = None, -1
    for v in malla.data.vertices:
        if any(g.group == gi and g.weight > 0.5 for g in v.groups):
            p = malla.matrix_world @ v.co
            d = (p - desde).length
            if d > dist:
                mejor, dist = p, d
    return mejor


def importar(ruta, equipo='rival'):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=ruta)
    nuevos = [o for o in bpy.data.objects if o not in antes]
    arm = next(o for o in nuevos if o.type == 'ARMATURE')
    malla = next(o for o in nuevos if o.type == 'MESH' and o.parent == arm)
    for o in nuevos:
        if o.type == 'MESH' and o is not malla:
            bpy.data.objects.remove(o, do_unlink=True)
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis.identity()
    # Texturas pixeladas, como fueron pintadas.
    for s in malla.material_slots:
        for n in s.material.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                n.interpolation = 'Closest'
        pr = s.material.node_tree.nodes.get('Principled BSDF')
        if pr:
            pr.inputs['Roughness'].default_value = 0.85
            pr.inputs['Specular IOR Level'].default_value = 0.2
    if equipo == 'propio':
        _tenir(malla, (0.02, 0.36, 0.12))
    malla.data.update()
    return arm, malla


def _tenir(malla, color):
    """El equipo propio: la ropa (gris, sin color) pasa a ser del color del club; la piel y los detalles quedan."""
    for s in malla.material_slots:
        nt = s.material.node_tree
        tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
        pr = nt.nodes.get('Principled BSDF')
        if not tex or not pr:
            continue
        sep = nt.nodes.new('ShaderNodeSeparateColor'); sep.mode = 'HSV'
        nt.links.new(tex.outputs['Color'], sep.inputs['Color'])
        # máscara (valores lineales): poca saturación (gris) y no muy claro (los blancos quedan)
        gris = nt.nodes.new('ShaderNodeMapRange')
        gris.inputs['From Min'].default_value = 0.22; gris.inputs['From Max'].default_value = 0.08
        nt.links.new(sep.outputs['Green'], gris.inputs['Value'])
        oscuro = nt.nodes.new('ShaderNodeMapRange')
        oscuro.inputs['From Min'].default_value = 0.3; oscuro.inputs['From Max'].default_value = 0.2
        nt.links.new(sep.outputs['Blue'], oscuro.inputs['Value'])
        # ni lo casi negro (pelo, botines)
        negro = nt.nodes.new('ShaderNodeMapRange')
        negro.inputs['From Min'].default_value = 0.035; negro.inputs['From Max'].default_value = 0.06
        nt.links.new(sep.outputs['Blue'], negro.inputs['Value'])
        mascara0 = nt.nodes.new('ShaderNodeMath'); mascara0.operation = 'MULTIPLY'
        nt.links.new(gris.outputs['Result'], mascara0.inputs[0]); nt.links.new(oscuro.outputs['Result'], mascara0.inputs[1])
        mascara = nt.nodes.new('ShaderNodeMath'); mascara.operation = 'MULTIPLY'
        nt.links.new(mascara0.outputs['Value'], mascara.inputs[0]); nt.links.new(negro.outputs['Result'], mascara.inputs[1])
        tinte = nt.nodes.new('ShaderNodeMix'); tinte.data_type = 'RGBA'; tinte.blend_type = 'MULTIPLY'
        tinte.inputs['Factor'].default_value = 1.0
        nt.links.new(tex.outputs['Color'], tinte.inputs[6])
        tinte.inputs[7].default_value = (color[0] * 5, color[1] * 5, color[2] * 5, 1)
        mezcla = nt.nodes.new('ShaderNodeMix'); mezcla.data_type = 'RGBA'
        nt.links.new(mascara.outputs['Value'], mezcla.inputs['Factor'])
        nt.links.new(tex.outputs['Color'], mezcla.inputs[6])
        nt.links.new(tinte.outputs[2], mezcla.inputs[7])
        nt.links.new(mezcla.outputs[2], pr.inputs['Base Color'])


class Retarget:
    def __init__(self, arm, malla):
        self.arm, self.malla = arm, malla
        b = arm.data.bones
        M = arm.matrix_world
        cab = lambda n: M @ b[n].head_local  # noqa: E731
        self.reposo = {n: b[n].matrix_local.to_quaternion() for n in (x.name for x in b)}
        self.cabeza_reposo = {x.name: x.head_local.copy() for x in b}
        # puntos del modelo en reposo (mundo)
        P = {}
        for g, m in LADOS:
            P[f'cadera_{g}'] = cab(f'muslo.{m}'); P[f'rodilla_{g}'] = cab(f'pierna.{m}'); P[f'tobillo_{g}'] = cab(f'pie.{m}')
            P[f'punta_{g}'] = _extremo(malla, f'pie.{m}', P[f'tobillo_{g}'])
            P[f'hombro_{g}'] = cab(f'brazo.{m}'); P[f'codo_{g}'] = cab(f'antebrazo.{m}')
            P[f'mano_{g}'] = _extremo(malla, f'antebrazo.{m}', P[f'codo_{g}'])
        P['cuello'] = cab('cabeza')
        P['coronilla'] = _extremo(malla, 'cabeza', P['cuello'])
        P['pelvis'] = (P['cadera_i'] + P['cadera_d']) / 2
        self.P = P
        # dónde caen la rodilla y el codo del modelo en su cadena (fracción del largo)
        self.frac = {}
        for g, _ in LADOS:
            a = (P[f'rodilla_{g}'] - P[f'cadera_{g}']).length; c = (P[f'tobillo_{g}'] - P[f'rodilla_{g}']).length
            self.frac[f'pierna_{g}'] = a / (a + c)
            a = (P[f'codo_{g}'] - P[f'hombro_{g}']).length; c = (P[f'mano_{g}'] - P[f'codo_{g}']).length
            self.frac[f'brazo_{g}'] = a / (a + c)

    @staticmethod
    def _sobre(a, b, c, f):
        """El punto a una fracción f del largo de la cadena a→b→c."""
        l1, l2 = (b - a).length, (c - b).length
        d = f * (l1 + l2)
        return a + (b - a) * (d / l1) if d <= l1 else b + (c - b) * ((d - l1) / l2)

    @staticmethod
    def _base(eje, lateral):
        z = eje.normalized()
        x = (lateral - z * lateral.dot(z)).normalized()
        y = z.cross(x)
        return Matrix((x, y, z)).transposed()

    def objetivos(self, j):
        """Los puntos de la guía (empties de escena_penales) en este cuadro."""
        W = lambda n, off=(0, 0, 0): j[n].matrix_world @ Vector(off)  # noqa: E731
        T = {'pelvis': W('raiz'), 'cuello': W('cabeza'), 'coronilla': W('cabeza', (0, 0, 0.23))}
        for g, _ in LADOS:
            T[f'cadera_{g}'] = W(f'cadera_{g}')
            T[f'tobillo_{g}'] = W(f'tobillo_{g}')
            T[f'punta_{g}'] = W(f'tobillo_{g}', (0, -0.15, -0.03))
            T[f'rodilla_{g}'] = self._sobre(T[f'cadera_{g}'], W(f'rodilla_{g}'), T[f'tobillo_{g}'], self.frac[f'pierna_{g}'])
            T[f'hombro_{g}'] = W(f'hombro_{g}')
            T[f'mano_{g}'] = W(f'codo_{g}', (0, 0, -0.4))
            T[f'codo_{g}'] = self._sobre(T[f'hombro_{g}'], W(f'codo_{g}'), T[f'mano_{g}'], self.frac[f'brazo_{g}'])
        return T

    def _poner(self, nombre, giro, cabeza):
        pb = self.arm.pose.bones[nombre]
        Mi = self.arm.matrix_world.inverted()
        pb.matrix = Matrix.Translation(Mi @ cabeza) @ (giro @ self.reposo[nombre]).to_matrix().to_4x4()
        bpy.context.view_layer.update()

    def _cabeza_ahora(self, nombre):
        return self.arm.matrix_world @ self.arm.pose.bones[nombre].head

    def posar(self, j, cuadro):
        P, T = self.P, self.objetivos(j)
        for pb in self.arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()
        # el tronco
        giro_t = (self._base(T['cuello'] - T['pelvis'], T['cadera_i'] - T['cadera_d'])
                  @ self._base(P['cuello'] - P['pelvis'], P['cadera_i'] - P['cadera_d']).transposed()).to_quaternion()
        piv = self.arm.matrix_world @ self.cabeza_reposo['torso']
        desplazamiento = T['pelvis'] - (piv + giro_t @ (P['pelvis'] - piv))
        self._poner('raiz', Matrix.Identity(3).to_quaternion(), self.arm.matrix_world @ self.cabeza_reposo['raiz'] + desplazamiento)
        self._poner('torso', giro_t, piv + desplazamiento)
        giros = {'torso': giro_t}
        # cadenas: (hueso, padre, de, a)
        cadenas = [('cabeza', 'torso', 'cuello', 'coronilla')]
        for g, m in LADOS:
            cadenas += [(f'brazo.{m}', 'torso', f'hombro_{g}', f'codo_{g}'), (f'antebrazo.{m}', f'brazo.{m}', f'codo_{g}', f'mano_{g}'),
                        (f'muslo.{m}', 'torso', f'cadera_{g}', f'rodilla_{g}'), (f'pierna.{m}', f'muslo.{m}', f'rodilla_{g}', f'tobillo_{g}'),
                        (f'pie.{m}', f'pierna.{m}', f'tobillo_{g}', f'punta_{g}')]
        for hueso, padre, de, a in cadenas:
            heredado = giros[padre] @ (P[a] - P[de])
            giro = heredado.rotation_difference(T[a] - T[de]) @ giros[padre]
            self._poner(hueso, giro, self._cabeza_ahora(hueso))
            giros[hueso] = giro
        # apoyado en el piso
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.malla.evaluated_get(dg)
        piso = min((self.malla.matrix_world @ v.co).z for v in ev.data.vertices)
        self._poner('raiz', Matrix.Identity(3).to_quaternion(), self._cabeza_ahora('raiz') - Vector((0, 0, piso)))
        for pb in self.arm.pose.bones:
            pb.keyframe_insert('location', frame=cuadro)
            pb.keyframe_insert('rotation_quaternion', frame=cuadro)
