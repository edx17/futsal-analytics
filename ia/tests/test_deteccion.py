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


# ── Cuando la pasada 1 no junta ningún color ───────────────────────────────

def test_el_diagnostico_distingue_los_tres_motivos():
    """
    Los tres se ven igual desde afuera —cero colores— y se arreglan distinto.
    Sin contadores, el mensaje "hacen falta al menos 4 colores y llegaron 0" no
    le sirve a nadie.
    """
    from futsal_ia.pipeline import ConteoMuestreo

    assert "no se decodifica" in ConteoMuestreo().diagnostico()

    sin_gente = ConteoMuestreo(frames=300, personas=0)
    assert "no encontró una sola persona" in sin_gente.diagnostico()
    assert "recorte" in sin_gente.diagnostico()

    todas_fuera = ConteoMuestreo(frames=300, personas=1500, fuera_de_cancha=1500)
    texto = todas_fuera.diagnostico()
    assert "TODAS cayeron fuera" in texto
    assert "diagnostico" in texto

    chiquitos = ConteoMuestreo(frames=300, personas=1500, fuera_de_cancha=200, sin_color=1300)
    assert "demasiado chicos" in chiquitos.diagnostico()


# ── El id de la clase "persona" ────────────────────────────────────────────
#
# Bug real, encontrado sobre el primer video: el filtro usaba el id 0 para
# RF-DETR, que numera con los ids OFICIALES de COCO donde persona = 1. El
# resultado era cero detecciones. Cero exacto, en cualquier video, sin ningún
# error: el síntoma parecía un problema de cámara, de recorte o de calibración,
# y no lo era.

def test_cada_libreria_numera_distinto():
    from futsal_ia.deteccion import PERSONA_RFDETR, PERSONA_ULTRALYTICS

    assert PERSONA_RFDETR == 1, "RF-DETR usa los ids oficiales de COCO: persona = 1"
    assert PERSONA_ULTRALYTICS == 0, "Ultralytics numera contiguo desde 0: persona = 0"
    assert PERSONA_RFDETR != PERSONA_ULTRALYTICS, (
        "Si alguien los unifica, uno de los dos detectores devuelve cero siempre"
    )


class _ModeloRFDETRFalso:
    """Devuelve lo que devuelve RF-DETR: ids de COCO, persona = 1."""

    def __init__(self, clases):
        self.clases = clases

    def predict(self, frame, threshold=0.5):
        import types

        n = len(self.clases)
        return types.SimpleNamespace(
            xyxy=[[10, 20, 50, 140]] * n,
            class_id=self.clases,
            confidence=[0.9] * n,
        )


def test_el_detector_se_queda_con_las_personas_y_no_con_la_pelota():
    """
    En una cancha el modelo también ve "sports ball" (37) y "chair" (62) en los
    bancos. Solo las personas tienen que pasar.
    """
    from futsal_ia.deteccion import DetectorRFDETR

    det = DetectorRFDETR.__new__(DetectorRFDETR)
    det.conf_minima = 0.35
    det.modelo = _ModeloRFDETRFalso([1, 1, 37, 62, 1])

    encontradas = det.detectar(None)
    assert len(encontradas) == 3
    assert det.brutas == 5
    assert det.clases_vistas == [1, 37, 62]


def test_los_contadores_distinguen_el_bug_de_una_cancha_vacia():
    """
    Con el id equivocado, un cuadro lleno de jugadores da cero — igual que un
    cuadro sin nadie. Los contadores son lo único que separa los dos casos.
    """
    from futsal_ia.deteccion import DetectorRFDETR

    det = DetectorRFDETR.__new__(DetectorRFDETR)
    det.conf_minima = 0.35
    det.modelo = _ModeloRFDETRFalso([1] * 10)
    assert len(det.detectar(None)) == 10 and det.brutas == 10

    det.modelo = _ModeloRFDETRFalso([37, 62, 41])
    assert det.detectar(None) == []
    assert det.brutas == 3 and det.clases_vistas == [37, 41, 62]


def test_los_mosaicos_no_esconden_los_contadores():
    """
    El diagnóstico los usa para distinguir "el modelo no vio nada" de "vio
    cosas pero ninguna era persona". Envolver el detector no puede tapar eso.
    """
    from futsal_ia.deteccion import DetectorEnMosaicos, DetectorRFDETR

    base = DetectorRFDETR.__new__(DetectorRFDETR)
    base.conf_minima = 0.25
    base.modelo = _ModeloRFDETRFalso([1, 37])
    envuelto = DetectorEnMosaicos(base)

    np = pytest.importorskip("numpy")
    envuelto.detectar(np.zeros((400, 600, 3), dtype=np.uint8))
    assert envuelto.brutas == base.brutas == 2
    assert envuelto.clases_vistas == [1, 37]


def test_crear_detector_puede_envolver_en_mosaicos():
    from futsal_ia.deteccion import DetectorEnMosaicos, crear_detector

    class _Falso:
        def detectar(self, frame):
            return []

    import futsal_ia.deteccion as d
    original = d.DetectorRFDETR
    d.DetectorRFDETR = lambda conf_minima: _Falso()
    try:
        assert not isinstance(crear_detector("rfdetr"), DetectorEnMosaicos)
        assert isinstance(crear_detector("rfdetr", mosaicos=True), DetectorEnMosaicos)
    finally:
        d.DetectorRFDETR = original
