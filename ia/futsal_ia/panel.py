"""
Panel de control local. Un comando y el resto son clicks.

    python -m futsal_ia.panel

Por qué hace falta un servidor y no alcanza un HTML suelto: el navegador no
puede ejecutar procesos ni leer carpetas del disco, y eso está bien, es lo que
evita que cualquier página que abrís te toque los archivos. Así que hay un
servidor mínimo que sí puede, y el panel le habla a ese.

Sobre seguridad: escucha SOLO en 127.0.0.1. No es accesible desde la red, ni
desde otra máquina, ni desde el celular. Es un panel para la computadora donde
corre, no un servicio. Tampoco sirve archivos arbitrarios: la lista blanca de
estáticos está acotada a la carpeta de herramientas.

No agrega dependencias: usa la biblioteca estándar. Un FastAPI acá sería
traerse un framework entero para seis endpoints.
"""

from __future__ import annotations

import json
import threading
import traceback
import webbrowser
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RAIZ = Path(__file__).resolve().parent.parent
HERRAMIENTAS = RAIZ / "herramientas"
VIDEOS = (".mp4", ".mov", ".mkv", ".avi", ".m4v", ".mts")


@dataclass
class Trabajo:
    """El análisis en curso. Uno por vez: el detector no se comparte."""

    estado: str = "libre"          # libre | corriendo | listo | error
    periodo: str = ""
    mensajes: list[str] = field(default_factory=list)
    frames: int = 0
    tracks: int = 0
    resumen: dict | None = None
    error: str | None = None
    salida: str | None = None
    overlay: str | None = None

    def log(self, texto: str) -> None:
        self.mensajes.append(texto)
        # El log es para mirar, no para archivar: sin tope, un análisis largo
        # se come la memoria del navegador que lo está pidiendo cada segundo.
        del self.mensajes[:-300]

    def a_dict(self) -> dict:
        return {
            "estado": self.estado, "periodo": self.periodo,
            "mensajes": self.mensajes, "frames": self.frames, "tracks": self.tracks,
            "resumen": self.resumen, "error": self.error,
            "salida": self.salida, "overlay": self.overlay,
        }


TRABAJO = Trabajo()
CANDADO = threading.Lock()


def _correr_equipos(datos: dict) -> None:
    """La pasada 1 sola: agrupar colores y guardar recortes para mirar."""
    from .config import PARAMETROS
    from .deteccion import crear_detector
    from .geometria import Homografia
    from .pipeline import preparar_equipos, revisar_compatibilidad
    from .preproceso import Encuadre

    t = TRABAJO
    try:
        config = json.loads((RAIZ / "partido.json").read_text(encoding="utf-8"))
        video = Path(datos.get("video") or config["video"])
        if not video.exists():
            raise FileNotFoundError(f"No existe el video: {video}")

        h = Homografia.de_dict(json.loads(
            (RAIZ / "calibracion.json").read_text(encoding="utf-8")))
        encuadre = (Encuadre.leer(RAIZ / "encuadre.json")
                    if (RAIZ / "encuadre.json").exists() else None)
        revisar_compatibilidad(h, encuadre)

        t.log("Cargando el detector...")
        detector = crear_detector("rfdetr", conf_minima=PARAMETROS.conf_minima_persona)
        t.log("Recorriendo el video para juntar colores de camiseta...")
        clas, ejemplos, conteo = preparar_equipos(
            video, detector, h, encuadre=encuadre,
            carpeta_recortes=RAIZ / "equipos_recortes")

        d = clas.a_dict()
        d["ejemplos"] = {str(k): v for k, v in ejemplos.items()}
        d["conteo"] = {"frames": conteo.frames, "personas": conteo.personas,
                       "fuera_de_cancha": conteo.fuera_de_cancha,
                       "colores": conteo.colores}
        (RAIZ / "equipos.json").write_text(
            json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")

        t.log(f"{conteo.colores} torsos de {conteo.personas} personas en "
              f"{conteo.frames} cuadros.")
        t.log(f"Separación de color: {clas.separacion:.0f} "
              f"({'confiable' if clas.confiable else 'NO CONFIABLE'})")
        t.log("Listo. Ahora decí qué es cada grupo.")
        t.estado = "listo"
    except Exception as e:                              # noqa: BLE001
        t.error = f"{type(e).__name__}: {e}"
        t.log("ERROR: " + t.error)
        t.log(traceback.format_exc()[-1500:])
        t.estado = "error"


def _correr(datos: dict) -> None:
    """El análisis, en su propio hilo. Todo lo que falle se reporta al panel."""
    from .config import PARAMETROS, combinar_config
    from .deteccion import crear_detector
    from .equipos import entrenar_clasificador
    from .geometria import Homografia
    from .pipeline import analizar, guardar, muestrear_colores
    from .preproceso import Encuadre
    from .salida import parse_tiempo

    t = TRABAJO
    try:
        config = json.loads(Path(datos["config"]).read_text(encoding="utf-8"))
        cfg = combinar_config(config, datos["periodo"], {
            "video": datos.get("video") or None,
        })
        t.log(f"Período {datos['periodo']}, saque en {cfg['saque']}, "
              f"ataca a la {'izquierda' if cfg['invertida'] else 'derecha'}")

        video = Path(cfg["video"])
        if not video.exists():
            raise FileNotFoundError(f"No existe el video: {video}")

        h = Homografia.de_dict(json.loads(Path(cfg["calibracion"]).read_text(encoding="utf-8")))
        encuadre = (Encuadre.leer(cfg["encuadre"]) if cfg.get("encuadre") else None)

        # Antes de cargar el detector: si la calibración y el encuadre no se
        # corresponden, mejor saberlo ahora que después de bajar 355 MB.
        revisar_compatibilidad(h, encuadre)

        t.log("Cargando el detector (la primera vez baja los pesos)...")
        detector = crear_detector("rfdetr", conf_minima=PARAMETROS.conf_minima_persona)

        equipos = RAIZ / "equipos.json"
        if equipos.exists():
            from .equipos import ClasificadorEquipos
            clas = ClasificadorEquipos.de_dict(
                json.loads(equipos.read_text(encoding="utf-8")))
            t.log("Equipos ya definidos: " + ", ".join(
                f"{g}={r}" for g, r in sorted(clas.equipo_por_grupo.items())))
        else:
            t.log("Pasada 1 de 2: juntando colores de camiseta...")
            colores = muestrear_colores(video, detector, h, encuadre=encuadre)
            clas = entrenar_clasificador(colores)
            t.log(f"{len(colores)} torsos. Separación de color {clas.separacion:.0f} "
                  f"({'confiable' if clas.confiable else 'NO CONFIABLE'})")

        def avanzar(p):
            t.frames = p.frames_analizados

        t.log("Pasada 2 de 2: detectando y siguiendo...")
        prueba = datos.get("prueba", True)
        res = analizar(
            video, h, clas,
            club_id=cfg["club"], id_partido=cfg["partido"], periodo=datos["periodo"],
            invertida=cfg["invertida"], detector=detector, encuadre=encuadre,
            t_saque_ms=parse_tiempo(cfg["saque"]),
            desde_ms=parse_tiempo(datos.get("desde") or "0"),
            duracion_ms=parse_tiempo("2:00") if prueba else None,
            al_avanzar=avanzar,
        )
        t.tracks = len(res.tracks)

        salida = RAIZ / f"analisis_{datos['periodo']}.json"
        guardar(res, salida, club_id=cfg["club"], id_partido=cfg["partido"])
        t.salida = salida.name
        t.resumen = res.resumen()
        for aviso in res.avisos:
            t.log("AVISO: " + aviso)

        if datos.get("overlay", True):
            from .overlay import exportar
            t.log("Escribiendo el video de auditoría...")
            destino = RAIZ / f"auditoria_{datos['periodo']}.mp4"
            exportar(video, res, destino, invertida=cfg["invertida"], enderezador=None)
            t.overlay = destino.name

        t.log("Listo.")
        t.estado = "listo"
    except Exception as e:                              # noqa: BLE001
        t.error = f"{type(e).__name__}: {e}"
        t.log("ERROR: " + t.error)
        t.log(traceback.format_exc()[-1500:])
        t.estado = "error"


def _estado_archivos() -> dict:
    """Qué piezas ya están y cuáles faltan. Es la mitad del valor del panel."""
    def info(nombre):
        p = RAIZ / nombre
        d = {"nombre": nombre, "existe": p.exists()}
        if p.exists() and p.suffix == ".json":
            try:
                d["contenido"] = json.loads(p.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                d["error"] = "no se pudo leer"
        return d

    return {
        "calibracion": info("calibracion.json"),
        "encuadre": info("encuadre.json"),
        "partido": info("partido.json"),
        "equipos": info("equipos.json"),
        "carpeta": str(RAIZ),
        "resultados": sorted(
            p.name for p in RAIZ.glob("a*_*.*")
            if p.suffix in (".json", ".mp4") and p.name.startswith(("analisis_", "auditoria_"))
        ),
    }


def _listar(ruta: str) -> dict:
    """Explorador mínimo, para elegir el video sin tipear la ruta."""
    p = Path(ruta).expanduser() if ruta else Path.home()
    if not p.is_dir():
        p = p.parent if p.parent.is_dir() else Path.home()
    try:
        hijos = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    except PermissionError:
        return {"ruta": str(p), "error": "sin permiso para leer esta carpeta",
                "carpetas": [], "videos": []}
    return {
        "ruta": str(p),
        "padre": str(p.parent) if p.parent != p else None,
        "carpetas": [{"nombre": x.name, "ruta": str(x)} for x in hijos
                     if x.is_dir() and not x.name.startswith(".")][:200],
        "videos": [{"nombre": x.name, "ruta": str(x), "mb": round(x.stat().st_size / 1e6)}
                   for x in hijos if x.is_file() and x.suffix.lower() in VIDEOS],
    }


class Panel(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass    # la consola es para el análisis, no para el tráfico HTTP

    def _responder(self, cuerpo: bytes, tipo="application/json", codigo=200):
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _json(self, datos, codigo=200):
        self._responder(json.dumps(datos).encode("utf-8"), codigo=codigo)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)

        if u.path in ("/", "/index.html"):
            archivo = HERRAMIENTAS / "panel.html"
            if not archivo.exists():
                return self._responder(b"Falta herramientas/panel.html", "text/plain", 500)
            return self._responder(archivo.read_bytes(), "text/html; charset=utf-8")

        if u.path == "/api/estado":
            with CANDADO:
                return self._json({"trabajo": TRABAJO.a_dict(), "archivos": _estado_archivos()})

        if u.path.startswith("/equipos_recortes/"):
            nombre = Path(u.path).name
            archivo = RAIZ / "equipos_recortes" / nombre
            if nombre.startswith("grupo_") and nombre.endswith(".png") and archivo.exists():
                return self._responder(archivo.read_bytes(), "image/png")
            return self._responder(b"no existe", "text/plain", 404)

        if u.path == "/api/carpeta":
            return self._json(_listar(q.get("ruta", [""])[0]))

        # Estáticos: solo los HTML de herramientas, por nombre exacto.
        nombre = Path(u.path).name
        if nombre in {"calibrador.html", "verificador.html", "partido.html"}:
            return self._responder((HERRAMIENTAS / nombre).read_bytes(),
                                   "text/html; charset=utf-8")

        # Resultados, para poder abrirlos desde el panel.
        if nombre.startswith(("analisis_", "auditoria_")) and (RAIZ / nombre).exists():
            tipo = "video/mp4" if nombre.endswith(".mp4") else "application/json"
            return self._responder((RAIZ / nombre).read_bytes(), tipo)

        return self._responder(b"no existe", "text/plain", 404)

    def do_POST(self):
        u = urlparse(self.path)
        largo = int(self.headers.get("Content-Length", 0))
        datos = json.loads(self.rfile.read(largo) or b"{}")

        if u.path == "/api/guardar":
            nombre = Path(datos.get("nombre", "")).name
            if nombre not in {"partido.json", "marcas.json", "encuadre.json",
                              "calibracion.json", "equipos.json"}:
                return self._json({"error": f"nombre no permitido: {nombre}"}, 400)
            (RAIZ / nombre).write_text(
                json.dumps(datos["contenido"], indent=2, ensure_ascii=False), encoding="utf-8")
            return self._json({"ok": True, "ruta": str(RAIZ / nombre)})

        if u.path == "/api/equipos":
            with CANDADO:
                if TRABAJO.estado == "corriendo":
                    return self._json({"error": "ya hay algo corriendo"}, 409)
                globals()["TRABAJO"] = Trabajo(estado="corriendo", periodo="equipos")
            threading.Thread(target=_correr_equipos, args=(datos,), daemon=True).start()
            return self._json({"ok": True})

        if u.path == "/api/equipos/asignar":
            from .equipos import ROLES, ClasificadorEquipos

            archivo = RAIZ / "equipos.json"
            if not archivo.exists():
                return self._json({"error": "todavía no se detectaron los equipos"}, 400)
            d = json.loads(archivo.read_text(encoding="utf-8"))
            clas = ClasificadorEquipos.de_dict(d)
            for grupo, rol in (datos.get("roles") or {}).items():
                if rol not in ROLES:
                    return self._json({"error": f"rol desconocido: {rol}"}, 400)
                clas = clas.asignar(int(grupo), rol)
            d.update(clas.a_dict())
            archivo.write_text(json.dumps(d, indent=2, ensure_ascii=False),
                               encoding="utf-8")
            return self._json({"ok": True, "equipo_por_grupo": d["equipo_por_grupo"]})

        if u.path == "/api/analizar":
            with CANDADO:
                if TRABAJO.estado == "corriendo":
                    return self._json({"error": "ya hay un análisis corriendo"}, 409)
                nuevo = Trabajo(estado="corriendo", periodo=datos.get("periodo", "PT"))
                globals()["TRABAJO"] = nuevo
            threading.Thread(target=_correr, args=(datos,), daemon=True).start()
            return self._json({"ok": True})

        return self._responder(b"no existe", "text/plain", 404)


def main(argv=None) -> int:
    import argparse

    ap = argparse.ArgumentParser(
        prog="futsal-ia panel",
        description="Panel local: un comando y el resto son clicks.")
    ap.add_argument("--puerto", type=int, default=8710)
    ap.add_argument("--no-abrir", action="store_true",
                    help="no abrir el navegador solo")
    args = ap.parse_args(argv)
    puerto, abrir = args.puerto, not args.no_abrir

    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Panel)
    except OSError as e:
        print(f"No pude abrir el puerto {puerto}: {e}\n"
              f"Puede que ya tengas el panel corriendo en otra consola. "
              f"Probá con --puerto {puerto + 1}.")
        return 1
    url = f"http://127.0.0.1:{puerto}"
    print(f"Panel en {url}")
    print("Escucha solo en esta computadora. Ctrl+C para cortar.")
    if abrir:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nChau.")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
