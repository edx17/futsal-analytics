"""
Deducir qué grupo de color es cada equipo, votando en vez de mirando.

Del primer partido real: de 164 detecciones revisadas, 66 cayeron en grupos de
color sin asignar y la IA nunca dijo "Rival" ni una sola vez, con 43 rivales en
cancha. El acierto de equipo dio 50%.

Nada de eso se ve mirando los siete recortes del panel —los siete se ven bien—
y el análisis corre igual y devuelve números con cara de seriedad. Lo que sí
tiene la respuesta son las doscientas cajas que una persona ya etiquetó.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia.asignacion import (  # noqa: E402
    MUESTRAS_MINIMAS,
    aplicar,
    avisos,
    colorear,
    muestras_de_revision,
    votar,
)
from futsal_ia.equipos import ClasificadorEquipos  # noqa: E402

cv2 = pytest.importorskip("cv2")

# Tres colores bien separados: verde, gris, celeste.
CENTROS = np.array([[60., 220., 60.], [150., 150., 150.], [230., 180., 40.]])


def _clas(roles=None):
    return ClasificadorEquipos(
        centros=CENTROS.copy(),
        equipo_por_grupo=roles or {0: "Desconocido", 1: "Desconocido",
                                   2: "Desconocido"},
        separacion=90.0, confirmado=True)


def _muestras(pares):
    """pares: (grupo, rol). El color es el centro exacto de ese grupo."""
    return [{"color": CENTROS[g], "rol": r} for g, r in pares]


# ── La votación ────────────────────────────────────────────────────────────

def test_un_grupo_limpio_se_propone_entero():
    v = votar(_clas(), _muestras([(0, "Propio")] * 12))
    g0 = v["grupos"][0]
    assert g0["propuesta"] == "Propio" and g0["pureza"] == 1.0
    assert g0["muestras"] == 12


def test_una_minoria_no_arrastra_al_grupo():
    """Tres árbitros dentro del grupo del rival no lo convierten en árbitros."""
    v = votar(_clas(), _muestras([(1, "Rival")] * 58 + [(1, "Arbitro")] * 3))
    assert v["grupos"][1]["propuesta"] == "Rival"
    assert v["grupos"][1]["pureza"] == pytest.approx(58 / 61)


def test_un_grupo_mezclado_no_se_asigna():
    """
    Mitad propio y mitad rival no es un grupo mal asignado: es un color que no
    separa. Asignarlo sería elegir a cuál de los dos equipos perjudicar.
    """
    v = votar(_clas(), _muestras([(0, "Propio")] * 10 + [(0, "Rival")] * 9))
    assert v["grupos"][0]["propuesta"] is None
    assert "mezclado" in v["grupos"][0]["motivo"]
    assert any("mezclado" in a for a in avisos(v))


def test_con_pocas_muestras_no_se_decide():
    """Con tres muestras, dos votos son el 67% y no dicen nada."""
    pocas = MUESTRAS_MINIMAS - 1
    v = votar(_clas(), _muestras([(2, "Arquero propio")] * pocas))
    assert v["grupos"][2]["propuesta"] is None
    assert "no alcanza" in v["grupos"][2]["motivo"]


def test_un_grupo_sin_muestras_se_dice():
    v = votar(_clas(), _muestras([(0, "Propio")] * 10))
    assert v["grupos"][1]["muestras"] == 0
    assert "ninguna muestra" in v["grupos"][1]["motivo"]


def test_dos_grupos_pueden_ser_el_mismo_equipo():
    """
    La luz de un gimnasio parte una camiseta en dos tonos y k-means los separa.
    Dos grupos propios suman los jugadores de los dos, que es lo que se quiere.
    """
    v = votar(_clas(), _muestras([(0, "Propio")] * 20 + [(2, "Propio")] * 15))
    nuevo = aplicar(_clas(), v)
    assert nuevo.equipo_por_grupo[0] == "Propio"
    assert nuevo.equipo_por_grupo[2] == "Propio"


# ── Los avisos ─────────────────────────────────────────────────────────────

def test_un_equipo_sin_ningun_grupo_se_grita():
    """
    Es el error exacto del primer partido: la IA nunca dijo "Rival". El
    análisis corre igual y no se entera nadie hasta que alguien mide.
    """
    v = votar(_clas(), _muestras([(0, "Propio")] * 30))
    dicho = " ".join(avisos(v))
    assert "NINGÚN grupo" in dicho and "Rival" in dicho


def test_sin_arqueros_tambien_avisa():
    v = votar(_clas(), _muestras([(0, "Propio")] * 20 + [(1, "Rival")] * 20))
    dicho = " ".join(avisos(v))
    assert "Arquero propio" in dicho and "Arquero rival" in dicho


def test_todo_asignado_no_avisa_de_mas():
    v = votar(_clas(), _muestras(
        [(0, "Propio")] * 10 + [(1, "Rival")] * 10 + [(2, "Arquero propio")] * 10))
    assert not any("Arquero propio" in a for a in avisos(v))


# ── Aplicar ────────────────────────────────────────────────────────────────

def test_un_grupo_mezclado_pierde_el_rol_que_tenia_puesto():
    """
    Acá SÍ hay evidencia, y dice que el color no separa: cualquier rol que se
    le ponga se lo está poniendo también a jugadores del otro equipo. El rol
    viejo es el que acaba de dar 50% de acierto. Un Desconocido se nota en la
    próxima medición; un rol inventado no se nota nunca.
    """
    previo = _clas({0: "Propio", 1: "Rival", 2: "Arquero propio"})
    v = votar(previo, _muestras([(0, "Propio")] * 10 +
                                [(1, "Propio")] * 8 + [(1, "Rival")] * 7))
    nuevo = aplicar(previo, v)
    assert nuevo.equipo_por_grupo[0] == "Propio"
    assert nuevo.equipo_por_grupo[1] == "Desconocido"    # era Rival, quedó mezclado


def test_un_grupo_sin_evidencia_conserva_lo_que_eligio_una_persona():
    """
    No hay nada que contradiga esa elección: una votación de cero votos no le
    gana a alguien que miró el recorte. Pisarlo sería perder trabajo humano.
    """
    previo = _clas({0: "Propio", 1: "Rival", 2: "Arquero propio"})
    v = votar(previo, _muestras([(0, "Propio")] * 10))
    nuevo = aplicar(previo, v)
    assert nuevo.equipo_por_grupo[2] == "Arquero propio"


# ── De la revisión al color ────────────────────────────────────────────────

def test_las_cajas_dibujadas_a_mano_tambien_son_evidencia():
    """
    Son las más valiosas: son justamente los jugadores que hoy no entran en
    ninguna cuenta, y su camiseta dice a qué grupo pertenecen.
    """
    indice = {"instantes": [{"t_ms": 0, "imagen": "c.jpg", "posiciones": [
        {"_track_ia": 1, "_bbox": [0, 0, 9, 9], "equipo": "Propio"}]}]}
    corr = {"instantes": [{"t_ms": 0, "jugadores_reales": 2,
                           "correcciones": [], "agregados": [
                               {"bbox": [20, 0, 29, 9], "rol": "Rival"}]}]}
    m = muestras_de_revision(indice, corr)
    assert [x["rol"] for x in m] == ["Propio", "Rival"]


def test_lo_que_nadie_supo_decir_no_vota():
    """Un "Desconocido" es la ausencia de respuesta, no una respuesta."""
    indice = {"instantes": [{"t_ms": 0, "imagen": "c.jpg", "posiciones": [
        {"_track_ia": 1, "_bbox": [0, 0, 9, 9], "equipo": "Desconocido"}]}]}
    corr = {"instantes": [{"t_ms": 0, "jugadores_reales": 0,
                           "correcciones": [], "agregados": [
                               {"bbox": [0, 0, 9, 9], "rol": "No es persona"},
                               {"bbox": [0, 0, 9, 9], "rol": "Pelota"}]}]}
    assert muestras_de_revision(indice, corr) == []


def test_el_formato_3_se_lee_directo():
    indice = {"instantes": [{"t_ms": 0, "imagen": "c.jpg", "posiciones": []}]}
    corr = {"formato": 3, "instantes": [{
        "t_ms": 0, "jugadores_reales": 1,
        "verdad": [{"bbox": [0, 0, 9, 9], "rol": "Rival"}]}]}
    m = muestras_de_revision(indice, corr)
    assert len(m) == 1 and m[0]["rol"] == "Rival"


def test_el_color_sale_del_jpg_de_la_revision(tmp_path):
    """
    Es el mismo recorte que vio el pipeline, con un JPEG de por medio. Si el
    JPEG corriera los colores lo suficiente como para cambiar de grupo, se
    vería como grupos impuros; acá se comprueba que no.
    """
    img = np.full((120, 200, 3), 70, np.uint8)
    img[20:110, 10:50] = (60, 220, 60)        # verde
    img[20:110, 100:140] = (150, 150, 150)    # gris
    cv2.imwrite(str(tmp_path / "c.jpg"), img, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

    muestras = [{"imagen": "c.jpg", "bbox": [10, 20, 50, 110], "rol": "Propio"},
                {"imagen": "c.jpg", "bbox": [100, 20, 140, 110], "rol": "Rival"}]
    con_color, sin_color = colorear(muestras, tmp_path)
    assert sin_color == 0 and len(con_color) == 2

    clas = _clas()
    assert clas.grupo_de(con_color[0]["color"]) == 0
    assert clas.grupo_de(con_color[1]["color"]) == 1


def test_una_caja_diminuta_no_rompe_nada(tmp_path):
    img = np.full((60, 60, 3), 90, np.uint8)
    cv2.imwrite(str(tmp_path / "c.jpg"), img)
    con_color, sin_color = colorear(
        [{"imagen": "c.jpg", "bbox": [10, 10, 12, 12], "rol": "Propio"}], tmp_path)
    assert con_color == [] and sin_color == 1


def test_una_imagen_que_falta_no_rompe_nada(tmp_path):
    con_color, sin_color = colorear(
        [{"imagen": "no_esta.jpg", "bbox": [0, 0, 40, 90], "rol": "Propio"}], tmp_path)
    assert con_color == [] and sin_color == 1
