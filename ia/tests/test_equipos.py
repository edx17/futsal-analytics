"""
Asignación de equipo por color. Es la parte del pipeline que decide si una
mancha de píxeles es de los nuestros o del rival, y no interviene ninguna red
neuronal: es estadística de color y se puede probar entera acá.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.equipos import (  # noqa: E402
    DESCONOCIDO,
    PROPIO,
    RIVAL,
    asignar_propio,
    color_de_torso,
    entrenar_clasificador,
)

ROJO = [200, 40, 40]
AZUL = [40, 40, 200]
AMARILLO_ARQUERO = [250, 250, 40]
NEGRO_ARBITRO = [20, 20, 20]
PISO_VERDE = [30, 120, 60]


def _colores(rng, base, n, ruido=8):
    return [rng.normal(base, ruido) for _ in range(n)]


def _partido_tipico(semilla=0):
    rng = np.random.default_rng(semilla)
    return (
        _colores(rng, ROJO, 300)
        + _colores(rng, AZUL, 300)
        + _colores(rng, AMARILLO_ARQUERO, 40)
        + _colores(rng, NEGRO_ARBITRO, 30)
    )


def test_separa_los_dos_equipos_de_campo():
    # Cuatro grupos para cuatro poblaciones: acá se prueba el agrupamiento,
    # no la elección del número de grupos.
    clas = entrenar_clasificador(_partido_tipico(), grupos=4)
    assert clas.confiable
    equipo_rojo = clas.clasificar(np.array(ROJO))
    equipo_azul = clas.clasificar(np.array(AZUL))
    assert {equipo_rojo, equipo_azul} == {PROPIO, RIVAL}


def test_arqueros_y_arbitro_no_ensucian_los_equipos():
    """
    Visten distinto, forman sus propios grupos y quedan afuera. Es a propósito:
    si el arquero cayera dentro del grupo de su equipo, el conteo de jugadores
    de campo daría mal y el arquero rival aparecería como propio.
    """
    clas = entrenar_clasificador(_partido_tipico(), grupos=4)
    assert clas.clasificar(np.array(AMARILLO_ARQUERO)) == DESCONOCIDO
    assert clas.clasificar(np.array(NEGRO_ARBITRO)) == DESCONOCIDO


def test_un_click_del_operador_da_vuelta_los_grupos():
    """El único dato de identidad que la Fase 1 le pide a un humano."""
    clas = entrenar_clasificador(_partido_tipico(), grupos=4)
    clas = asignar_propio(clas, np.array(ROJO))
    assert clas.clasificar(np.array(ROJO)) == PROPIO
    assert clas.clasificar(np.array(AZUL)) == RIVAL

    clas = asignar_propio(clas, np.array(AZUL))
    assert clas.clasificar(np.array(AZUL)) == PROPIO
    assert clas.clasificar(np.array(ROJO)) == RIVAL


def test_asignar_propio_dos_veces_seguidas_no_cambia_nada():
    clas = entrenar_clasificador(_partido_tipico())
    una = asignar_propio(clas, np.array(ROJO))
    dos = asignar_propio(una, np.array(ROJO))
    assert una.equipo_por_grupo == dos.equipo_por_grupo


def test_avisa_cuando_los_dos_equipos_visten_parecido():
    """
    Dos juegos de camisetas casi iguales. La clasificación pasa a ser una
    moneda al aire, y eso hay que DECIRLO en vez de devolver números con cara
    de dato. Se arregla en la cancha eligiendo las camisetas, no en el código.
    """
    rng = np.random.default_rng(1)
    colores = (
        _colores(rng, [200, 40, 40], 300)
        + _colores(rng, [215, 55, 50], 300)     # casi el mismo rojo
        + _colores(rng, AMARILLO_ARQUERO, 40)
        + _colores(rng, NEGRO_ARBITRO, 30)
    )
    clas = entrenar_clasificador(colores)
    assert not clas.confiable
    assert clas.separacion < clas.SEPARACION_MINIMA


def test_color_de_torso_ignora_cabeza_short_y_piso():
    """
    El recorte se queda con la franja del pecho. Si tomara el recuadro entero,
    el piso que se ve entre las piernas y a los costados correría el color
    hacia el verde y arruinaría el agrupamiento.
    """
    alto, ancho = 100, 40
    recorte = np.zeros((alto, ancho, 3), dtype=np.uint8)
    recorte[:, :] = PISO_VERDE          # todo el fondo es piso
    recorte[15:55, 10:30] = ROJO        # la camiseta, donde el método mira
    color = color_de_torso(recorte)
    assert color is not None
    assert np.allclose(color, ROJO, atol=1)


def test_la_mediana_aguanta_el_piso_colandose_por_un_costado():
    """
    Con promedio, una camiseta roja con un tercio de piso verde encima da un
    color que no existe en la escena. Con mediana gana el que más manda.
    """
    recorte = np.zeros((100, 40, 3), dtype=np.uint8)
    recorte[:, :] = ROJO
    recorte[15:55, 22:30] = PISO_VERDE   # 40% de la franja del torso es piso
    color = color_de_torso(recorte)
    assert np.allclose(color, ROJO, atol=1)


def test_color_de_torso_devuelve_none_con_recortes_basura():
    assert color_de_torso(None) is None
    assert color_de_torso(np.zeros((0, 0, 3), dtype=np.uint8)) is None
    assert color_de_torso(np.zeros((2, 2, 3), dtype=np.uint8)) is None   # muy chico
    assert color_de_torso(np.zeros((50, 50), dtype=np.uint8)) is None    # sin canales


def test_clasificar_sin_color_no_adivina():
    clas = entrenar_clasificador(_partido_tipico())
    assert clas.clasificar(None) == DESCONOCIDO


def test_hacen_falta_colores_suficientes():
    with pytest.raises(ValueError, match="al menos"):
        entrenar_clasificador([np.array(ROJO), np.array(AZUL)])


def test_el_agrupamiento_es_reproducible():
    """Mismo video, mismos grupos. Si no, dos corridas dan estadísticas distintas."""
    a = entrenar_clasificador(_partido_tipico(), semilla=42)
    b = entrenar_clasificador(_partido_tipico(), semilla=42)
    assert a.separacion == pytest.approx(b.separacion)
    for color in (ROJO, AZUL, AMARILLO_ARQUERO):
        assert a.clasificar(np.array(color)) == b.clasificar(np.array(color))


# ── Asignación de roles por el operador ────────────────────────────────────

def test_asignar_un_rol_a_un_grupo():
    from futsal_ia.equipos import ClasificadorEquipos

    clas = entrenar_clasificador(_partido_tipico())
    g = clas.grupo_de(np.array(ROJO))
    clas = clas.asignar(g, PROPIO)
    assert clas.clasificar(np.array(ROJO)) == PROPIO
    assert isinstance(clas, ClasificadorEquipos)


def test_un_equipo_puede_caer_en_mas_de_un_grupo_de_color():
    """
    Pasa de verdad: con la luz de un gimnasio, una camiseta verde flúor da
    tonos distintos según dónde esté parado el jugador y k-means la parte en
    dos. Los dos grupos tienen que poder marcarse como el mismo equipo.

    No duplica nada: cada detección pertenece a exactamente un grupo, así que
    dos grupos propios suman los jugadores de los dos.
    """
    rng = np.random.default_rng(5)
    verde_claro, verde_oscuro = [60, 220, 200], [40, 170, 150]
    colores = (_colores(rng, verde_claro, 200) + _colores(rng, verde_oscuro, 200)
               + _colores(rng, AZUL, 300) + _colores(rng, NEGRO_ARBITRO, 40))
    clas = entrenar_clasificador(colores)

    g1 = clas.grupo_de(np.array(verde_claro))
    g2 = clas.grupo_de(np.array(verde_oscuro))
    assert g1 != g2, "el test necesita que k-means los separe"

    clas = clas.asignar(g1, PROPIO).asignar(g2, PROPIO)
    assert clas.clasificar(np.array(verde_claro)) == PROPIO
    assert clas.clasificar(np.array(verde_oscuro)) == PROPIO
    assert list(clas.equipo_por_grupo.values()).count(PROPIO) == 2


def test_los_arqueros_y_el_arbitro_tienen_su_propio_rol():
    """
    No son ruido a descartar: marcarlos bien es lo que evita que el arquero
    rival cuente como jugador propio.
    """
    from futsal_ia.equipos import ARBITRO, ARQUERO_PROPIO

    clas = entrenar_clasificador(_partido_tipico())
    clas = clas.asignar(clas.grupo_de(np.array(AMARILLO_ARQUERO)), ARQUERO_PROPIO)
    clas = clas.asignar(clas.grupo_de(np.array(NEGRO_ARBITRO)), ARBITRO)
    assert clas.clasificar(np.array(AMARILLO_ARQUERO)) == ARQUERO_PROPIO
    assert clas.clasificar(np.array(NEGRO_ARBITRO)) == ARBITRO


def test_se_pueden_tener_dos_arqueros_marcados():
    """Ningún rol es excluyente."""
    from futsal_ia.equipos import ARQUERO_PROPIO, ARQUERO_RIVAL

    clas = entrenar_clasificador(_partido_tipico())
    clas = clas.asignar(0, ARQUERO_PROPIO).asignar(1, ARQUERO_RIVAL)
    assert clas.equipo_por_grupo[0] == ARQUERO_PROPIO
    assert clas.equipo_por_grupo[1] == ARQUERO_RIVAL


def test_un_grupo_que_no_existe():
    clas = entrenar_clasificador(_partido_tipico())
    with pytest.raises(ValueError, match="No existe el grupo"):
        clas.asignar(99, PROPIO)


def test_sobrevive_al_json_con_los_roles_puestos():
    """Se guarda en equipos.json y el análisis lo lee sin repetir el muestreo."""
    from futsal_ia.equipos import ClasificadorEquipos

    clas = entrenar_clasificador(_partido_tipico())
    clas = clas.asignar(clas.grupo_de(np.array(ROJO)), PROPIO)
    clas = clas.asignar(clas.grupo_de(np.array(AZUL)), RIVAL)

    vuelta = ClasificadorEquipos.de_dict(clas.a_dict())
    assert vuelta.equipo_por_grupo == clas.equipo_por_grupo
    assert vuelta.clasificar(np.array(ROJO)) == PROPIO
    assert vuelta.clasificar(np.array(AZUL)) == RIVAL


def test_la_primera_asignacion_humana_borra_las_adivinanzas():
    """
    El agrupamiento marca como propio al grupo más poblado, que no significa
    nada. Si esa adivinanza sobreviviera junto a una decisión real, un grupo
    que nadie miró quedaría marcado como propio por un volado, y desde afuera
    se vería igual que uno elegido.
    """
    clas = entrenar_clasificador(_partido_tipico())
    assert clas.confirmado is False
    assert PROPIO in clas.equipo_por_grupo.values()      # la adivinanza

    elegido = clas.grupo_de(np.array(AMARILLO_ARQUERO))
    clas = clas.asignar(elegido, PROPIO)

    assert clas.confirmado is True
    assert list(clas.equipo_por_grupo.values()).count(PROPIO) == 1
    assert clas.equipo_por_grupo[elegido] == PROPIO
    assert RIVAL not in clas.equipo_por_grupo.values()   # la otra también se fue


def test_despues_de_confirmar_las_asignaciones_se_acumulan():
    clas = entrenar_clasificador(_partido_tipico())
    clas = clas.asignar(0, PROPIO).asignar(1, RIVAL).asignar(2, PROPIO)
    assert clas.equipo_por_grupo[0] == PROPIO
    assert clas.equipo_por_grupo[1] == RIVAL
    assert clas.equipo_por_grupo[2] == PROPIO


def test_confirmado_viaja_en_el_json():
    from futsal_ia.equipos import ClasificadorEquipos

    clas = entrenar_clasificador(_partido_tipico())
    assert ClasificadorEquipos.de_dict(clas.a_dict()).confirmado is False
    confirmado = clas.asignar(0, PROPIO)
    assert ClasificadorEquipos.de_dict(confirmado.a_dict()).confirmado is True


def test_con_pocos_grupos_los_arqueros_se_pierden():
    """
    El motivo de subir el valor por defecto. En una cancha hay dos equipos, DOS
    arqueros de colores distintos y uno o dos árbitros: seis poblaciones como
    mínimo. Con cuatro grupos, k-means fusiona y los arqueros dejan de existir
    como grupo propio.
    """
    rng = np.random.default_rng(11)
    ARQ_ROSA, ARQ_CELESTE = [180, 105, 255], [230, 200, 90]
    colores = (_colores(rng, ROJO, 300) + _colores(rng, AZUL, 300)
               + _colores(rng, ARQ_ROSA, 45) + _colores(rng, ARQ_CELESTE, 45)
               + _colores(rng, NEGRO_ARBITRO, 35))

    pocos = entrenar_clasificador(colores, grupos=4)
    muchos = entrenar_clasificador(colores, grupos=7)

    distintos_pocos = len({pocos.grupo_de(np.array(c))
                           for c in (ROJO, AZUL, ARQ_ROSA, ARQ_CELESTE, NEGRO_ARBITRO)})
    distintos_muchos = len({muchos.grupo_de(np.array(c))
                            for c in (ROJO, AZUL, ARQ_ROSA, ARQ_CELESTE, NEGRO_ARBITRO)})
    assert distintos_pocos < 5, "con 4 grupos algo tiene que fusionarse"
    assert distintos_muchos == 5, "con 7 grupos las cinco poblaciones se separan"


def test_la_separacion_se_recalcula_con_los_roles_puestos():
    """
    Antes de asignar, la separación es la distancia entre los dos grupos más
    poblados, que con muchos grupos pueden ser dos pedazos del MISMO equipo y
    dar un número sin sentido. Con los roles puestos se mide lo que importa.
    """
    rng = np.random.default_rng(3)
    verde_a, verde_b, blanco = [60, 230, 210], [45, 185, 165], [235, 235, 235]
    colores = (_colores(rng, verde_a, 200) + _colores(rng, verde_b, 200)
               + _colores(rng, blanco, 250) + _colores(rng, NEGRO_ARBITRO, 40))
    clas = entrenar_clasificador(colores, grupos=5)

    clas = (clas.asignar(clas.grupo_de(np.array(verde_a)), PROPIO)
                .asignar(clas.grupo_de(np.array(verde_b)), PROPIO)
                .asignar(clas.grupo_de(np.array(blanco)), RIVAL))

    esperada = min(
        float(np.sqrt(((np.array(v) - np.array(blanco)) ** 2).sum()))
        for v in (verde_a, verde_b)
    )
    assert clas.separacion == pytest.approx(esperada, rel=0.15)
    assert clas.confiable


def test_dos_equipos_parecidos_se_delatan_despues_de_asignar():
    rng = np.random.default_rng(4)
    casi_a, casi_b = [200, 40, 40], [214, 54, 50]
    colores = (_colores(rng, casi_a, 250) + _colores(rng, casi_b, 250)
               + _colores(rng, NEGRO_ARBITRO, 40))
    clas = entrenar_clasificador(colores, grupos=4)
    clas = (clas.asignar(clas.grupo_de(np.array(casi_a)), PROPIO)
                .asignar(clas.grupo_de(np.array(casi_b)), RIVAL))
    assert not clas.confiable
