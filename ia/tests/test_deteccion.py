"""
Detección en mosaicos. El detector en sí no se puede probar acá (necesita GPU y
los pesos), pero el partido en pedazos y la fusión son geometría pura y son
justamente donde se cuelan los errores de conteo.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.deteccion import (  # noqa: E402
    Deteccion,
    DetectorEnMosaicos,
    fusionar,
    generar_mosaicos,
)


def test_los_mosaicos_cubren_toda_la_imagen():
    """Si queda un hueco sin cubrir, ahí hay jugadores que nunca se detectan."""
    ancho, alto, tam = 3840, 2160, 1280
    mosaicos = generar_mosaicos(ancho, alto, tam, solape=0.2)
    cubierto = [[False] * (alto // 40) for _ in range(ancho // 40)]
    for x, y, w, h in mosaicos:
        for i in range(x // 40, min((x + w) // 40, ancho // 40)):
            for j in range(y // 40, min((y + h) // 40, alto // 40)):
                cubierto[i][j] = True
    assert all(all(col) for col in cubierto)


def test_los_mosaicos_no_se_salen_de_la_imagen():
    """
    Un pedazo que sobresale habría que rellenarlo con negro, y el detector
    vería un borde recto que no existe en la escena.
    """
    for ancho, alto in [(3840, 2160), (1224, 514), (1000, 1000), (1279, 640)]:
        for x, y, w, h in generar_mosaicos(ancho, alto, 1280, 0.2):
            assert x >= 0 and y >= 0
            assert x + w <= ancho and y + h <= alto


def test_los_mosaicos_se_solapan():
    """Sin solape, el jugador que cae en la costura queda partido al medio."""
    mosaicos = generar_mosaicos(3840, 1280, tam=1280, solape=0.25)
    xs = sorted({m[0] for m in mosaicos})
    assert len(xs) > 1
    for anterior, siguiente in zip(xs, xs[1:]):
        assert siguiente - anterior < 1280


def test_una_imagen_chica_da_un_solo_mosaico():
    """Un frame ya recortado a la cancha no necesita partirse, y no se parte."""
    assert len(generar_mosaicos(1000, 600, tam=1280)) == 1


def test_mosaicos_rechaza_parametros_absurdos():
    with pytest.raises(ValueError, match="inválidas"):
        generar_mosaicos(0, 100)
    with pytest.raises(ValueError, match="solape"):
        generar_mosaicos(100, 100, solape=1.5)


def test_la_fusion_saca_el_duplicado_de_la_costura():
    """
    El mismo jugador detectado por dos pedazos vecinos. Sin fusionar, contaría
    doble y el conteo de jugadores en cancha daría cualquier cosa.
    """
    a = Deteccion(bbox=(100, 100, 160, 260), confianza=0.90)
    casi_igual = Deteccion(bbox=(104, 98, 162, 258), confianza=0.75)
    otro = Deteccion(bbox=(900, 400, 960, 560), confianza=0.80)

    fusionadas = fusionar([a, casi_igual, otro])
    assert len(fusionadas) == 2
    assert a in fusionadas and otro in fusionadas


def test_la_fusion_se_queda_con_la_de_mayor_confianza():
    floja = Deteccion(bbox=(100, 100, 160, 260), confianza=0.55)
    fuerte = Deteccion(bbox=(102, 101, 161, 259), confianza=0.95)
    assert fusionar([floja, fuerte]) == [fuerte]


def test_la_fusion_no_junta_dos_jugadores_pegados():
    """
    Dos jugadores marcándose se solapan bastante en la imagen. Fusionarlos
    sería peor que el duplicado: perderías uno de los dos.
    """
    uno = Deteccion(bbox=(100, 100, 160, 260), confianza=0.9)
    otro = Deteccion(bbox=(135, 100, 195, 260), confianza=0.9)   # ~28% de IoU
    assert len(fusionar([uno, otro], umbral_iou=0.5)) == 2


def test_la_fusion_de_nada_es_nada():
    assert fusionar([]) == []


class _DetectorFalso:
    """Devuelve una detección fija en el centro de lo que le den."""

    def __init__(self):
        self.llamadas = 0

    def detectar(self, frame):
        self.llamadas += 1
        alto, ancho = frame.shape[:2]
        return [Deteccion(bbox=(ancho / 2 - 20, alto / 2 - 60,
                                ancho / 2 + 20, alto / 2 + 60), confianza=0.9)]


def test_las_coordenadas_vuelven_al_frame_completo():
    """
    El detector ve un pedazo y devuelve coordenadas DEL PEDAZO. Si no se les
    suma el desplazamiento, todos los jugadores aparecen amontonados en la
    esquina superior izquierda de la cancha.
    """
    np = pytest.importorskip("numpy")
    frame = np.zeros((2000, 3000, 3), dtype=np.uint8)
    base = _DetectorFalso()
    det = DetectorEnMosaicos(base, tam=1280, solape=0.2).detectar(frame)

    assert base.llamadas > 1, "no llegó a partirse en pedazos"
    assert len(det) > 1
    # Ninguna detección puede quedar dentro del primer pedazo si vino de otro.
    assert max(d.bbox[0] for d in det) > 1280


def test_un_frame_chico_no_paga_el_costo_de_los_mosaicos():
    np = pytest.importorskip("numpy")
    frame = np.zeros((514, 1224, 3), dtype=np.uint8)
    base = _DetectorFalso()
    DetectorEnMosaicos(base, tam=1280).detectar(frame)
    assert base.llamadas == 1


# ── Choques de dependencias ────────────────────────────────────────────────
#
# rfdetr declara "transformers" sin cota de versión, así que pip instala la
# última. transformers 5.0.0 eliminó find_pruneable_heads_and_indices, que
# rfdetr importa, y el paquete revienta al importarse. Verificado: el símbolo
# está en 4.57.6 y no está en 5.0.0.
#
# El traceback que sale tiene veinte marcos y no nombra ni a rfdetr ni al
# conflicto: culpa a un archivo de transformers por no tener una función.
# Nadie deduce de ahí que hay que bajar una versión.

def test_el_choque_con_transformers_5_se_explica():
    from futsal_ia.deteccion import ErrorDetector, _traducir_import_error

    e = ImportError(
        "cannot import name 'find_pruneable_heads_and_indices' from "
        "'transformers.pytorch_utils'"
    )
    traducido = _traducir_import_error(e, "rfdetr")
    assert isinstance(traducido, ErrorDetector)
    texto = str(traducido)
    assert 'pip install "transformers<5"' in texto
    assert "sin poner cota de versión" in texto
    assert "--detector yolo" in texto


def test_tambien_atrapa_la_otra_funcion_que_se_eliminó():
    from futsal_ia.deteccion import _traducir_import_error

    e = ImportError("cannot import name 'prune_linear_layer' from 'transformers.pytorch_utils'")
    assert 'transformers<5' in str(_traducir_import_error(e, "rfdetr"))


def test_un_paquete_que_falta_manda_a_instalar_todo():
    from futsal_ia.deteccion import _traducir_import_error

    e = ImportError("No module named 'rfdetr'")
    texto = str(_traducir_import_error(e, "rfdetr"))
    assert "pip install -r requirements.txt" in texto


def test_un_import_error_desconocido_no_se_disfraza():
    """Si es otra cosa, que se vea el mensaje original y no una receta que no aplica."""
    from futsal_ia.deteccion import _traducir_import_error

    e = ImportError("algo raro que nunca vimos")
    texto = str(_traducir_import_error(e, "rfdetr"))
    assert "algo raro que nunca vimos" in texto
    assert "transformers<5" not in texto


def test_detector_desconocido():
    from futsal_ia.deteccion import crear_detector

    with pytest.raises(ValueError, match="rfdetr"):
        crear_detector("el_mejor_detector")
