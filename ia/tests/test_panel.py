"""
El panel local: un comando y el resto son clicks.

Se prueba contra un servidor de verdad levantado en un puerto libre, no contra
mocks: lo que puede fallar acá es el ruteo y el manejo de estado, no la lógica
de negocio, y eso solo se ve corriéndolo.
"""

import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from futsal_ia import panel  # noqa: E402


@pytest.fixture
def servidor():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        puerto = s.getsockname()[1]
    srv = ThreadingHTTPServer(("127.0.0.1", puerto), panel.Panel)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    yield f"http://127.0.0.1:{puerto}"
    srv.shutdown()
    srv.server_close()


def get(base, ruta):
    with urllib.request.urlopen(base + ruta, timeout=5) as r:
        return json.loads(r.read())


def post(base, ruta, datos):
    pedido = urllib.request.Request(
        base + ruta, data=json.dumps(datos).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(pedido, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_escucha_solo_en_esta_computadora():
    """
    No es un servicio: es un panel para la máquina donde corre. Si se atara a
    0.0.0.0 quedaría expuesto en la red, con un endpoint que lista carpetas del
    disco y otro que escribe archivos.
    """
    fuente = Path(panel.__file__).read_text(encoding="utf-8")
    assert '"127.0.0.1"' in fuente
    assert "0.0.0.0" not in fuente


def test_el_estado_dice_que_piezas_faltan(servidor):
    d = get(servidor, "/api/estado")
    assert d["trabajo"]["estado"] in ("libre", "corriendo", "listo", "error")
    for pieza in ("calibracion", "encuadre", "partido"):
        assert "existe" in d["archivos"][pieza]
    assert d["archivos"]["carpeta"]


def test_el_panel_se_sirve_como_html(servidor):
    with urllib.request.urlopen(servidor + "/", timeout=5) as r:
        assert r.status == 200
        assert "text/html" in r.headers["Content-Type"]
        assert b"Panel" in r.read()


@pytest.mark.parametrize("archivo", ["calibrador.html", "verificador.html", "partido.html"])
def test_las_herramientas_se_sirven(servidor, archivo):
    with urllib.request.urlopen(f"{servidor}/{archivo}", timeout=5) as r:
        assert r.status == 200


def test_no_sirve_archivos_arbitrarios(servidor):
    """La lista de estáticos es blanca y por nombre exacto, no por ruta."""
    for intento in ("/futsal_ia/panel.py", "/../requirements.txt", "/README.md"):
        try:
            with urllib.request.urlopen(servidor + intento, timeout=5) as r:
                assert r.status == 404
        except urllib.error.HTTPError as e:
            assert e.code == 404


def test_el_explorador_lista_carpetas(servidor, tmp_path):
    (tmp_path / "videos").mkdir()
    (tmp_path / "PT.mp4").write_bytes(b"x" * 2_000_000)
    (tmp_path / "notas.txt").write_text("nada", encoding="utf-8")

    d = get(servidor, "/api/carpeta?ruta=" + str(tmp_path))
    assert d["ruta"] == str(tmp_path)
    assert [c["nombre"] for c in d["carpetas"]] == ["videos"]
    assert [v["nombre"] for v in d["videos"]] == ["PT.mp4"]
    assert d["videos"][0]["mb"] == 2
    assert d["padre"]


def test_el_explorador_no_explota_con_una_ruta_inventada(servidor):
    d = get(servidor, "/api/carpeta?ruta=/no/existe/esta/carpeta")
    assert "ruta" in d and isinstance(d["carpetas"], list)


def test_guardar_solo_acepta_los_nombres_conocidos(servidor):
    codigo, d = post(servidor, "/api/guardar",
                     {"nombre": "cualquier_cosa.json", "contenido": {}})
    assert codigo == 400 and "no permitido" in d["error"]

    codigo, d = post(servidor, "/api/guardar",
                     {"nombre": "../../escape.json", "contenido": {}})
    assert codigo == 400


def test_guardar_escribe_el_archivo(servidor, tmp_path, monkeypatch):
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    codigo, d = post(servidor, "/api/guardar",
                     {"nombre": "partido.json", "contenido": {"club": "abc"}})
    assert codigo == 200 and d["ok"]
    assert json.loads((tmp_path / "partido.json").read_text(encoding="utf-8"))["club"] == "abc"


def test_un_analisis_que_falla_queda_en_estado_error(servidor, tmp_path, monkeypatch):
    """
    Lo importante no es que falle, es que el panel se entere y lo muestre. Un
    hilo que muere en silencio deja la barra girando para siempre.
    """
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    codigo, d = post(servidor, "/api/analizar",
                     {"config": str(tmp_path / "no_esta.json"), "periodo": "PT"})
    assert codigo == 200 and d["ok"]

    for _ in range(60):
        estado = get(servidor, "/api/estado")["trabajo"]
        if estado["estado"] in ("error", "listo"):
            break
        time.sleep(0.1)
    assert estado["estado"] == "error"
    assert estado["error"]
    assert any("ERROR" in m for m in estado["mensajes"])


def test_no_arranca_dos_analisis_a_la_vez(servidor, tmp_path):
    """El detector no se comparte entre hilos, y dos corridas se pisarían."""
    panel.TRABAJO.estado = "corriendo"
    try:
        codigo, d = post(servidor, "/api/analizar", {"config": "x.json", "periodo": "PT"})
        assert codigo == 409 and "corriendo" in d["error"]
    finally:
        panel.TRABAJO.estado = "libre"


def test_el_log_no_crece_sin_limite():
    """Un análisis largo con el navegador pidiendo el estado cada segundo."""
    t = panel.Trabajo()
    for i in range(1000):
        t.log(f"linea {i}")
    assert len(t.mensajes) == 300
    assert t.mensajes[-1] == "linea 999"


def test_el_puerto_ocupado_se_explica(capsys):
    """
    Pasa siempre: se deja el panel abierto en una consola y se lo lanza en otra.
    El OSError pelado no dice que es eso.
    """
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        puerto = s.getsockname()[1]
        assert panel.main(["--puerto", str(puerto), "--no-abrir"]) == 1
    salida = capsys.readouterr().out
    assert "ya tengas el panel corriendo" in salida
    assert f"--puerto {puerto + 1}" in salida


def test_help_no_levanta_el_servidor():
    with pytest.raises(SystemExit) as e:
        panel.main(["--help"])
    assert e.value.code == 0


def test_asignar_roles_sin_haber_detectado(servidor, tmp_path, monkeypatch):
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    codigo, d = post(servidor, "/api/equipos/asignar", {"roles": {"0": "Propio"}})
    assert codigo == 400 and "todavía no se detectaron" in d["error"]


def test_asignar_roles_escribe_en_equipos_json(servidor, tmp_path, monkeypatch):
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    (tmp_path / "equipos.json").write_text(json.dumps({
        "centros": [[200, 40, 40], [40, 40, 200], [250, 250, 40], [20, 20, 20]],
        "equipo_por_grupo": {"0": "Propio", "1": "Rival", "2": "Desconocido",
                             "3": "Desconocido"},
        "separacion": 226.0,
    }), encoding="utf-8")

    codigo, d = post(servidor, "/api/equipos/asignar",
                     {"roles": {"1": "Propio", "2": "Arquero propio"}})
    assert codigo == 200
    # Propio es único: el grupo 0 tuvo que soltarlo.
    assert d["equipo_por_grupo"]["1"] == "Propio"
    assert d["equipo_por_grupo"]["0"] != "Propio"
    assert d["equipo_por_grupo"]["2"] == "Arquero propio"

    guardado = json.loads((tmp_path / "equipos.json").read_text(encoding="utf-8"))
    assert guardado["equipo_por_grupo"]["1"] == "Propio"


def test_un_rol_inventado_se_rechaza(servidor, tmp_path, monkeypatch):
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    (tmp_path / "equipos.json").write_text(json.dumps({
        "centros": [[1, 2, 3]], "equipo_por_grupo": {"0": "Propio"}, "separacion": 1.0,
    }), encoding="utf-8")
    codigo, d = post(servidor, "/api/equipos/asignar", {"roles": {"0": "El Capitán"}})
    assert codigo == 400 and "rol desconocido" in d["error"]


def test_los_recortes_se_sirven_solo_por_nombre_esperado(servidor, tmp_path, monkeypatch):
    monkeypatch.setattr(panel, "RAIZ", tmp_path)
    carpeta = tmp_path / "equipos_recortes"
    carpeta.mkdir()
    (carpeta / "grupo_0_0.png").write_bytes(b"\x89PNG fingido")
    (carpeta / "secreto.png").write_bytes(b"no")

    with urllib.request.urlopen(servidor + "/equipos_recortes/grupo_0_0.png", timeout=5) as r:
        assert r.status == 200 and r.headers["Content-Type"] == "image/png"

    for intento in ("secreto.png", "..%2F..%2Frequirements.txt"):
        try:
            with urllib.request.urlopen(
                    f"{servidor}/equipos_recortes/{intento}", timeout=5) as r:
                assert r.status == 404
        except urllib.error.HTTPError as e:
            assert e.code == 404
