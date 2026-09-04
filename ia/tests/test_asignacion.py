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


# ── Medir si el color alcanza ──────────────────────────────────────────────
# El primer partido real dio 50% de acierto de equipo, y la explicación fácil
# —"faltó asignar los grupos"— no era la buena: con los grupos que salieron el
# techo era 69% aun asignando perfecto. Eso solo se ve midiendo.

from futsal_ia.asignacion import _por_instante, validar  # noqa: E402
from futsal_ia.color import ESPACIOS  # noqa: E402
from futsal_ia.equipos import entrenar_supervisado  # noqa: E402


def _partido(separables=True, instantes=20, semilla=0):
    """Un partido sintético con luz al azar, sin relación con el rol."""
    rng = np.random.default_rng(semilla)
    base = ({"Propio": (60, 210, 60), "Rival": (150, 150, 150)} if separables
            else {"Propio": (150, 155, 150), "Rival": (150, 150, 158)})
    base.update({"Arquero propio": (240, 190, 40), "Arquero rival": (40, 40, 190)})
    plantel = ["Propio"] * 4 + ["Rival"] * 4 + ["Arquero propio", "Arquero rival"]
    muestras = []
    for k in range(instantes):
        for rol in plantel:
            luz = rng.uniform(0.5, 1.4)
            color = np.clip(np.array(base[rol], float) * luz + rng.normal(0, 7, 3),
                            0, 255)
            muestras.append({"t_ms": k * 2000, "rol": rol, "color": color})
    return muestras


def test_los_pliegues_no_parten_un_instante():
    """
    Es la propiedad que hace honesto al número. Dos jugadores del mismo cuadro
    no son dos ejemplos independientes: misma luz, mismo cuadro, a veces el
    mismo jugador. Si un instante quedara a los dos lados, el modelo estaría
    siendo evaluado sobre algo que ya vio.
    """
    muestras = _partido(instantes=10)
    partes = _por_instante(muestras, 5)
    assert len(partes) == 5
    vistos = set()
    for parte in partes:
        instantes = {muestras[i]["t_ms"] for i in parte}
        assert not (instantes & vistos), "un instante cayó en dos pliegues"
        vistos |= instantes
    assert sum(len(p) for p in partes) == len(muestras)   # no se pierde ninguna


def test_con_camisetas_distintas_el_color_alcanza():
    v = validar(_partido(separables=True), espacio="bgr")
    assert v["supervisado"] > 0.95


def test_con_camisetas_parecidas_el_color_no_alcanza_y_se_nota():
    """
    El caso que hay que poder detectar: si acá diera un número alto, el
    diagnóstico mandaría a aplicar algo que no va a funcionar.
    """
    v = validar(_partido(separables=False), espacio="bgr")
    assert v["supervisado"] < 0.85


def test_ningun_espacio_inventa_una_separacion_que_no_existe():
    """
    Dos camisetas del MISMO tono que solo se diferencian en el brillo. Para el
    espacio que ignora el brillo son literalmente el mismo color, y tiene que
    reportarlo como lo que es: no se pueden distinguir.

    Esto es lo que hace confiable al diagnóstico. Un espacio que devolviera un
    número alto acá mandaría a aplicar algo que no puede funcionar, y el error
    aparecería recién en el partido siguiente.
    """
    rng = np.random.default_rng(3)
    muestras = []
    for k in range(20):
        for rol, base in (("Propio", (60, 200, 60)), ("Rival", (30, 100, 30))):
            for _ in range(4):
                luz = rng.uniform(0.4, 1.6)
                muestras.append({"t_ms": k * 2000, "rol": rol,
                                 "color": np.clip(np.array(base, float) * luz, 0, 255)})
    # Mitad y mitad es tirar una moneda: exactamente lo que corresponde.
    assert validar(muestras, espacio="cromatico")["supervisado"] < 0.7


@pytest.mark.parametrize("espacio", ESPACIOS)
def test_todos_los_espacios_devuelven_un_numero_comparable(espacio):
    """
    Cuál gana NO se decide acá: depende de las camisetas, la luz y la cancha de
    cada partido, y por eso se mide con `cli color-diagnostico` sobre los datos
    de ese partido. Lo que sí tiene que pasar siempre es que los cuatro
    devuelvan un número sobre la misma escala, o la comparación no valdría.
    """
    v = validar(_partido(separables=True), espacio=espacio)
    assert 0.0 <= v["agrupado"] <= 1.0
    assert 0.0 <= v["supervisado"] <= 1.0
    assert v["muestras"] == 200


def test_el_desglose_por_rol_dice_donde_esta_el_error():
    v = validar(_partido(separables=False), espacio="bgr")
    assert set(v["por_rol"]) == {"Propio", "Rival", "Arquero propio", "Arquero rival"}
    # Los arqueros visten distinto: tienen que salir mejor que los dos grises.
    assert v["por_rol"]["Arquero rival"]["acierto"] > v["por_rol"]["Propio"]["acierto"]


def test_con_un_solo_instante_no_se_puede_validar():
    """Sin dos instantes no hay nada contra qué probar, y hay que decirlo."""
    v = validar([{"t_ms": 0, "rol": "Propio", "color": np.array([1., 2., 3.])}])
    assert "aviso" in v and "instantes" in v["aviso"]


# ── El clasificador armado con etiquetas ───────────────────────────────────

def test_el_supervisado_arma_un_monton_por_rol():
    clas = entrenar_supervisado(_partido(), espacio="bgr", por_rol=1)
    assert sorted(clas.equipo_por_grupo.values()) == [
        "Arquero propio", "Arquero rival", "Propio", "Rival"]


def test_puede_haber_varios_montones_del_mismo_rol():
    """
    La misma camiseta se ve distinta según dónde esté parado el jugador. Dos
    montones de "Propio" siguen siendo los dos "Propio".
    """
    clas = entrenar_supervisado(_partido(), espacio="bgr", por_rol=3)
    cuenta = {}
    for rol in clas.equipo_por_grupo.values():
        cuenta[rol] = cuenta.get(rol, 0) + 1
    assert cuenta["Propio"] == 3 and cuenta["Rival"] == 3


def test_el_supervisado_recuerda_en_que_espacio_se_entreno():
    """
    Si el que entrena convierte y el que clasifica no, los centros y los
    colores viven en espacios distintos: no falla, da cualquier cosa.
    """
    clas = entrenar_supervisado(_partido(), espacio="cromatico")
    assert clas.espacio == "cromatico"
    assert ClasificadorEquipos.de_dict(clas.a_dict()).espacio == "cromatico"
    # Y clasifica bien un color crudo, convirtiéndolo por dentro.
    assert clas.clasificar(np.array([60., 210., 60.]) * 0.5) == "Propio"


def test_un_equipos_json_viejo_sigue_siendo_bgr():
    """Los archivos guardados antes no tienen el campo y son BGR."""
    d = {"centros": [[1., 2., 3.]], "equipo_por_grupo": {"0": "Propio"},
         "separacion": 50.0}
    assert ClasificadorEquipos.de_dict(d).espacio == "bgr"


def test_sin_etiquetas_no_se_entrena():
    with pytest.raises(ValueError, match="ninguna muestra"):
        entrenar_supervisado([{"rol": "Desconocido", "color": np.zeros(3)}])
