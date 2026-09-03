"""
Los cuadros para revisar.

El revisor cargaba el video del partido y lo hacía saltar de instante en
instante. Con un archivo que Chrome no sabe decodificar —H.265, el de la
GoPro— la página quedaba en negro para siempre (`readyState 4`, `videoWidth
0`) aunque el análisis hubiera salido perfecto: OpenCV sí lee ese códec.

Ahora los cuadros los saca Python. Lo que se prueba acá es lo único que puede
volver a romperse en silencio: que el cuadro que se escribe sea el del INSTANTE
que dice, y no otro. Un cuadro corrido no se ve mal —se ve como una jugada
cualquiera— pero los recuadros no caen sobre nadie y la medición sale mentida.

Para eso el video de prueba tiene cada cuadro pintado de un gris distinto,
igual a su número: leyendo el brillo se sabe exactamente qué cuadro salió.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.revision import (  # noqa: E402
    CUANTOS,
    elegir_instantes,
    exportar_cuadros,
)

cv2 = pytest.importorskip("cv2")

FPS = 30.0
CUADROS = 240                 # 8 segundos
ANCHO, ALTO = 160, 120
SAQUE_MS = 2000.0             # el saque no está en cero: ahí vivía el bug


def _video(destino: Path) -> Path:
    """Un video donde el cuadro número k es gris k. El brillo es el reloj."""
    w = cv2.VideoWriter(str(destino), cv2.VideoWriter_fourcc(*"mp4v"),
                        FPS, (ANCHO, ALTO))
    assert w.isOpened(), "no se pudo escribir el video de prueba"
    for k in range(CUADROS):
        w.write(np.full((ALTO, ANCHO, 3), k % 256, dtype=np.uint8))
    w.release()
    return destino


def _analisis(t_periodo_ms, encuadre=None):
    """Un análisis mínimo: una persona por instante, con su recuadro."""
    return {
        "meta": {"periodo": "PT", "t_saque_ms": SAQUE_MS, "encuadre": encuadre},
        "snapshots": [
            {"t_ms": t, "posiciones": [
                {"_track_ia": i, "_bbox": [10, 10, 40, 70], "equipo": "Propio"}]}
            for i, t in enumerate(t_periodo_ms)
        ],
    }


def _gris(ruta: Path) -> float:
    img = cv2.imread(str(ruta))
    assert img is not None, f"no se pudo leer {ruta}"
    return float(img.mean())


# ── Qué instantes se eligen ────────────────────────────────────────────────

def test_sin_gente_no_hay_nada_que_revisar():
    """Veinte cuadros de cancha vacía no miden nada."""
    assert elegir_instantes({"snapshots": [{"t_ms": 0, "posiciones": []}]}) == []
    assert elegir_instantes({}) == []


def test_si_hay_pocos_van_todos():
    a = _analisis([0, 100, 200])
    assert len(elegir_instantes(a)) == 3


def test_se_reparten_a_lo_largo_de_todo_el_analisis():
    """
    Veinte instantes seguidos son la misma escena veinte veces. Lo que se
    quiere es que el primero y el último estén en las puntas y el resto parejo.
    """
    a = _analisis(list(range(0, 100_000, 200)))     # 500 snapshots
    elegidos = elegir_instantes(a)
    assert len(elegidos) == CUANTOS
    tiempos = [s["t_ms"] for s in elegidos]
    assert tiempos == sorted(tiempos)
    assert tiempos[0] == 0
    assert tiempos[-1] >= 90_000
    huecos = np.diff(tiempos)
    assert huecos.max() - huecos.min() <= 200        # un snapshot de tolerancia


def test_los_snapshots_desordenados_se_ordenan():
    a = _analisis([5000, 1000, 3000])
    assert [s["t_ms"] for s in elegir_instantes(a)] == [1000, 3000, 5000]


# ── La exportación ─────────────────────────────────────────────────────────

def test_el_cuadro_exportado_es_el_del_instante_que_dice(tmp_path):
    """
    La regresión que importa. El snapshot guarda tiempo de PERÍODO y el video
    corre en su propio reloj: hay que SUMAR el saque. Restarlo, u olvidarlo,
    da imágenes de otro momento con los recuadros del instante pedido.
    """
    video = _video(tmp_path / "prueba.mp4")
    tiempos = [0, 1000, 2000, 3000]                  # tiempo de período
    indice = exportar_cuadros(video, _analisis(tiempos), tmp_path / "cuadros")

    assert [i["t_ms"] for i in indice["instantes"]] == tiempos
    for inst in indice["instantes"]:
        esperado = (inst["t_ms"] + SAQUE_MS) / 1000.0 * FPS   # número de cuadro
        medido = _gris(tmp_path / "cuadros" / inst["imagen"])
        assert abs(medido - esperado) <= 3, (
            f"el instante {inst['t_ms']} ms salió del cuadro {medido:.0f} y "
            f"tenía que salir del {esperado:.0f}")


def test_los_cuadros_salen_ya_recortados(tmp_path):
    """
    El visor dibuja los recuadros del análisis tal cual sobre la imagen. Si el
    JPG no viniera recortado igual que el frame que analizó el pipeline, cada
    caja quedaría corrida por el tamaño del recorte.
    """
    video = _video(tmp_path / "prueba.mp4")
    enc = {"resolucion_origen": [ANCHO, ALTO], "rotacion_grados": 0.0,
           "recorte": [20, 10, 100, 80]}
    indice = exportar_cuadros(video, _analisis([0, 500], encuadre=enc),
                              tmp_path / "cuadros")
    for inst in indice["instantes"]:
        assert (inst["ancho"], inst["alto"]) == (100, 80)
        img = cv2.imread(str(tmp_path / "cuadros" / inst["imagen"]))
        assert img.shape[:2] == (80, 100)


def test_el_indice_queda_escrito_junto_a_las_imagenes(tmp_path):
    video = _video(tmp_path / "prueba.mp4")
    exportar_cuadros(video, _analisis([0, 1000]), tmp_path / "cuadros")
    d = json.loads((tmp_path / "cuadros" / "indice.json").read_text(encoding="utf-8"))
    assert d["periodo"] == "PT"
    assert len(d["instantes"]) == 2
    # Los recuadros viajan con el índice: el visor no vuelve a abrir el análisis.
    assert d["instantes"][0]["posiciones"][0]["_bbox"] == [10, 10, 40, 70]
    for inst in d["instantes"]:
        assert (tmp_path / "cuadros" / inst["imagen"]).exists()


def test_una_corrida_nueva_borra_los_cuadros_de_la_anterior(tmp_path):
    """
    Si sobraran cuadros de una revisión más larga, el visor podría mostrar
    imágenes que ya no corresponden a ningún instante del índice.
    """
    video = _video(tmp_path / "prueba.mp4")
    destino = tmp_path / "cuadros"
    exportar_cuadros(video, _analisis([0, 500, 1000, 1500, 2000]), destino)
    assert len(list(destino.glob("cuadro_*.jpg"))) == 5
    exportar_cuadros(video, _analisis([0, 500]), destino)
    assert len(list(destino.glob("cuadro_*.jpg"))) == 2


def test_el_desfase_se_informa(tmp_path):
    """Sin esto no habría cómo saber que un cuadro no cayó donde debía."""
    video = _video(tmp_path / "prueba.mp4")
    indice = exportar_cuadros(video, _analisis([0, 1000]), tmp_path / "cuadros")
    for inst in indice["instantes"]:
        assert abs(inst["desfase_ms"]) <= 50
    assert indice["avisos"] == []


def test_un_analisis_viejo_se_rechaza_con_nombre_y_apellido(tmp_path):
    """Sin t_saque_ms no hay forma de saber a qué momento del video mirar."""
    a = _analisis([0])
    del a["meta"]["t_saque_ms"]
    with pytest.raises(ValueError, match="versión"):
        exportar_cuadros(tmp_path / "no_importa.mp4", a, tmp_path / "cuadros")


def test_un_analisis_sin_gente_se_rechaza(tmp_path):
    a = {"meta": {"periodo": "PT", "t_saque_ms": 0},
         "snapshots": [{"t_ms": 0, "posiciones": []}]}
    with pytest.raises(ValueError, match="instante con gente"):
        exportar_cuadros(tmp_path / "no_importa.mp4", a, tmp_path / "cuadros")


def test_un_video_que_no_abre_lo_dice(tmp_path):
    with pytest.raises(FileNotFoundError):
        exportar_cuadros(tmp_path / "no_existe.mp4", _analisis([0]),
                         tmp_path / "cuadros")


# ── El visor ───────────────────────────────────────────────────────────────

REVISOR = Path(__file__).resolve().parents[1] / "herramientas" / "revision.html"


def test_el_visor_no_vuelve_a_depender_del_video():
    """
    Esta es la regresión de producto, no de código. Mientras el visor tuviera
    un <video>, cualquier partido grabado en H.265 —o sea, todos los de la
    GoPro— dejaba la página en negro aunque el análisis hubiera salido bien.
    """
    html = REVISOR.read_text(encoding="utf-8")
    assert "<video" not in html
    assert "videoWidth" not in html
    assert "/api/revision" in html and "/api/cuadros" in html
