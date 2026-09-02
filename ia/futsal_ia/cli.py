"""Línea de comandos de la Fase 1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .cancha import PUNTOS_REFERENCIA
from .config import PARAMETROS
from .geometria import ErrorCalibracion, Homografia, calibrar
from .preproceso import Encuadre
from .salida import parse_tiempo


def _cmd_puntos(_):
    """Lista los puntos que el operador tiene que marcar, en orden."""
    print("Puntos de referencia para calibrar (los 4 primeros son obligatorios):\n")
    for p in PUNTOS_REFERENCIA:
        marca = "*" if p.imprescindible else " "
        print(f" {marca} {p.id:<20} ({p.x_m:>4.1f}, {p.y_m:>4.1f}) m   {p.etiqueta}")
    print("\nCuantos más marques, mejor reparte el error. Con la cámara en un")
    print("corner conviene marcar todos: el rincón lejano es el peor lugar de")
    print("la imagen y mejora mucho si tiene marcas cerca.")
    return 0


def _cmd_calibrar(args):
    marcas = {k: tuple(v) for k, v in json.loads(Path(args.marcas).read_text()).items()}

    # El calibrador exporta las marcas en coordenadas del frame ORIGINAL, que es
    # sobre el que clickeó la persona. La homografía, en cambio, tiene que valer
    # sobre el frame ya girado y recortado, que es el que va a ver el detector.
    # La conversión se hace acá y no a mano: pedirle a alguien que clickee sobre
    # una imagen ya recortada es pedirle que se equivoque.
    encuadre = Encuadre.leer(args.encuadre) if args.encuadre else None
    if encuadre:
        marcas = {k: encuadre.punto_a_encuadre(*v) for k, v in marcas.items()}
        afuera = [k for k, v in marcas.items()
                  if not (0 <= v[0] < encuadre.resolucion_salida[0]
                          and 0 <= v[1] < encuadre.resolucion_salida[1])]
        if afuera:
            print(f"ERROR: el recorte deja afuera {len(afuera)} punto(s) marcado(s): "
                  f"{', '.join(sorted(afuera))}.\n"
                  "Subí el margen del encuadre o revisá el giro.", file=sys.stderr)
            return 1
        print(f"Encuadre aplicado: giro {encuadre.rotacion_grados}°, "
              f"salida {encuadre.resolucion_salida[0]}x{encuadre.resolucion_salida[1]}")
        args.resolucion = list(encuadre.resolucion_salida)

    try:
        h = calibrar(marcas, resolucion=tuple(args.resolucion) if args.resolucion else None)
    except ErrorCalibracion as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    Path(args.salida).write_text(json.dumps(h.a_dict(), indent=2), encoding="utf-8")
    print(f"Calibración guardada en {args.salida}")
    print(f"Error RMS: {h.error_rms_m:.3f} m con {len(h.ids_usados)} puntos")
    _imprimir_precision(h.reporte_precision(PARAMETROS.error_deteccion_px))
    return 0


def _imprimir_precision(rep):
    print(f"\nPrecisión esperable (asumiendo {rep['error_deteccion_px_asumido']} px "
          "de error de detección):\n")
    print(f"  {'celda':<8} {'px/m':>7} {'error':>9}")
    for etiqueta, datos in rep["celdas"].items():
        if datos["error_m"] is None:
            print(f"  {etiqueta:<8} {'-':>7} {'-':>9}")
            continue
        print(f"  {etiqueta:<8} {datos['px_por_m']:>7.1f} {datos['error_m']:>8.2f} m")
    print(f"\n  Mejor: {rep['mejor_celda']} ({rep['error_min_m']} m)")
    print(f"  Peor:  {rep['peor_celda']} ({rep['error_max_m']} m)")
    if rep["error_max_m"] and rep["error_max_m"] > 0.75:
        print("\n  AVISO: más de 75 cm de incertidumbre en la peor celda. Es el")
        print("  costo de la cámara en un corner. Subirla o correrla hacia el")
        print("  medio de la lateral mejora esto más que cualquier cambio de código.")


def _cmd_precision(args):
    h = Homografia.de_dict(json.loads(Path(args.calibracion).read_text()))
    rep = h.reporte_por_periodo(args.error_px, invertida_pt=args.invertida_pt)

    for periodo in ("PT", "ST"):
        print(f"\n{'=' * 46}\n  {periodo}\n{'=' * 46}")
        _imprimir_precision(rep[periodo])

    if rep["asimetria_maxima"] and rep["asimetria_maxima"] > 2:
        print(f"\n{'=' * 46}")
        print("  LA MISMA CELDA CAMBIA DE CALIDAD ENTRE TIEMPOS")
        print(f"{'=' * 46}\n")
        print("Las zonas se cuentan desde el arco propio y los equipos cambian")
        print("de lado en el entretiempo, así que Z4 del PT y Z4 del ST son")
        print("extremos FÍSICOS distintos de la cancha.\n")
        print(f"  {'celda':<8} {'PT':>9} {'ST':>9} {'ratio':>7}")
        for etiqueta, d in rep["comparacion"].items():
            print(f"  {etiqueta:<8} {d['error_pt_m']:>7.2f} m {d['error_st_m']:>7.2f} m "
                  f"{d['veces_peor']:>6.1f}x")
        print(f"\n  Peor caso: {rep['celda_mas_asimetrica']}, "
              f"{rep['asimetria_maxima']}x entre tiempos.")
        print("  NO sumes esa celda entre períodos sin aclarar de dónde viene")
        print("  cada mitad: estarías mezclando centímetros con medio metro.")
    return 0


def _cmd_frame(args):
    """
    Saca un cuadro del video para calibrar sobre él.

    Existe para no depender de ffmpeg, pero sobre todo para que el frame salga
    del MISMO camino que después va a leer el análisis: mismo decodificador,
    misma resolución, mismos píxeles. Un frame sacado con otra herramienta
    puede venir escalado o recortado sin que se note, y ahí la calibración
    queda atada a una imagen que el pipeline nunca va a ver.
    """
    try:
        import cv2
    except ImportError:
        print("Hace falta OpenCV: pip install opencv-python-headless", file=sys.stderr)
        return 1

    try:
        ms = parse_tiempo(args.en)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        print(f"No pude abrir el video: {args.video}", file=sys.stderr)
        return 1
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    objetivo = int(round(ms / 1000.0 * fps))
    if total and objetivo >= total:
        print(f"ERROR: el video dura {total / fps / 60:.1f} min y pediste el minuto "
              f"{ms / 60000:.1f}.", file=sys.stderr)
        cap.release()
        return 1
    cap.set(cv2.CAP_PROP_POS_FRAMES, objetivo)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print("No pude leer ese cuadro.", file=sys.stderr)
        return 1

    alto, ancho = frame.shape[:2]
    cv2.imwrite(str(args.salida), frame)
    print(f"Cuadro guardado en {args.salida}")
    print(f"Resolución: {ancho}x{alto}  (la que tiene que quedar en el encuadre)")
    print("\nAbrí herramientas/calibrador.html y cargá este archivo.")
    return 0


def _cmd_video(args):
    """
    Qué es realmente el archivo de video, y si el encuadre le sirve.

    Existe por una razón concreta: analizar un período tarda horas. Descubrir
    recién ahí que la calibración se hizo sobre una captura de pantalla del
    reproductor, y no sobre un frame del video, es tirar una tarde a la basura.
    Esto lo dice en dos segundos.
    """
    datos = _leer_datos_video(args.video)
    if datos is None:
        print("No pude leer el video. Instalá OpenCV (pip install -r requirements.txt) "
              "o tené ffprobe en el PATH.", file=sys.stderr)
        return 1

    ancho, alto, fps, cuadros = datos
    print(f"Video:      {ancho}x{alto}")
    print(f"Relación:   {ancho / alto:.4f}")
    print(f"FPS:        {fps:.2f}")
    if cuadros:
        print(f"Duración:   {cuadros / fps / 60:.1f} min ({cuadros} cuadros)")

    if ancho % 2 or alto % 2:
        print("\nOJO: las dimensiones son impares. Prácticamente ningún video las "
              "tiene: esto suele ser una captura de pantalla, no un archivo de video.")

    if not args.encuadre:
        print("\nPasá --encuadre para verificar que la calibración le sirva a este video.")
        return 0

    enc = Encuadre.leer(args.encuadre)
    esperado = tuple(enc.resolucion_origen)
    print(f"\nEncuadre:   definido sobre {esperado[0]}x{esperado[1]}")
    if esperado == (ancho, alto):
        print(f"Recorte:    {enc.resolucion_salida[0]}x{enc.resolucion_salida[1]}")
        print("\nOK: el encuadre corresponde a este video.")
        return 0

    print("\nNO COINCIDEN. La calibración no vale para este archivo.\n")
    if esperado[0] % 2 or esperado[1] % 2:
        print("El encuadre se definió sobre dimensiones impares, así que el frame que")
        print("marcaste era una captura de pantalla del reproductor y no un cuadro del")
        print("video. La ventana del reproductor recorta y escala: los píxeles que")
        print("clickeaste no son los píxeles del archivo.\n")
    print("Sacá un frame de verdad del video y volvé a marcar sobre ese:\n")
    print(f'  ffmpeg -ss 00:02:00 -i "{args.video}" -frames:v 1 -q:v 1 frame.png\n')
    print("Marcar de nuevo son cinco minutos ahora que conocés el flujo, y la")
    print("calibración queda atada al archivo real para siempre.")
    return 1


def _leer_datos_video(ruta):
    """Resolución, fps y cuadros. Con OpenCV si está; si no, con ffprobe."""
    try:
        import cv2

        cap = cv2.VideoCapture(str(ruta))
        if cap.isOpened():
            datos = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                     int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                     cap.get(cv2.CAP_PROP_FPS) or 0.0,
                     int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
            cap.release()
            return datos
        cap.release()
    except ImportError:
        pass

    import shutil
    import subprocess

    if not shutil.which("ffprobe"):
        return None
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,avg_frame_rate,nb_frames", "-of", "json", str(ruta)],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        return None
    f = json.loads(res.stdout)["streams"][0]
    num, _, den = f.get("avg_frame_rate", "0/1").partition("/")
    fps = float(num) / float(den) if float(den or 0) else 0.0
    return int(f["width"]), int(f["height"]), fps, int(f.get("nb_frames") or 0)


def _cmd_analizar(args):
    from .deteccion import crear_detector
    from .equipos import entrenar_clasificador
    from .lente import CalibracionLente, Enderezador
    from .pipeline import analizar, guardar, muestrear_colores

    h = Homografia.de_dict(json.loads(Path(args.calibracion).read_text()))
    detector = crear_detector(args.detector, conf_minima=PARAMETROS.conf_minima_persona)

    encuadre = Encuadre.leer(args.encuadre) if args.encuadre else None
    if encuadre:
        print(f"Encuadre: giro {encuadre.rotacion_grados}°, salida "
              f"{encuadre.resolucion_salida[0]}x{encuadre.resolucion_salida[1]}")

    enderezador = None
    if args.lente:
        enderezador = Enderezador(CalibracionLente.leer(args.lente))
    elif args.lente_aproximada:
        ancho, alto = args.lente_aproximada
        enderezador = Enderezador(CalibracionLente.aproximada_gopro_wide(ancho, alto))
        print("AVISO: usando coeficientes de lente APROXIMADOS. Calibrar con "
              "tablero de ajedrez mejora la precisión en los bordes del cuadro.")

    print("Pasada 1/2: juntando colores de camiseta...")
    colores = muestrear_colores(args.video, detector, h, enderezador=enderezador,
                                encuadre=encuadre)
    clas = entrenar_clasificador(colores)
    print(f"  {len(colores)} torsos, separación de color {clas.separacion:.0f} "
          f"({'confiable' if clas.confiable else 'NO CONFIABLE'})")

    print("Pasada 2/2: detectando y siguiendo...")
    res = analizar(
        args.video, h, clas,
        club_id=args.club, id_partido=args.partido, periodo=args.periodo,
        invertida=args.invertida, detector=detector, enderezador=enderezador,
        encuadre=encuadre, t_saque_ms=parse_tiempo(args.saque),
        desde_ms=parse_tiempo(args.desde),
        duracion_ms=parse_tiempo(args.duracion) if args.duracion else None,
        al_avanzar=lambda p: print(f"  {p.frames_analizados} frames, "
                                   f"{len(res.tracks)} tracks", end="\r"),
    )
    destino = guardar(res, args.salida, club_id=args.club, id_partido=args.partido)
    print(f"\nAnálisis guardado en {destino}\n")
    print(json.dumps(res.resumen(), indent=2, ensure_ascii=False))
    for aviso in res.avisos:
        print(f"\nAVISO: {aviso}")
    if args.overlay:
        from .overlay import exportar
        print(f"\nEscribiendo video de auditoría en {args.overlay}...")
        exportar(args.video, res, args.overlay, invertida=args.invertida,
                 enderezador=enderezador)
        print("Miralo antes de creerle un solo número al resumen de arriba.")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="futsal-ia", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("puntos", help="lista los puntos de calibración").set_defaults(func=_cmd_puntos)

    c = sub.add_parser("calibrar", help="calcula la homografía desde los puntos marcados")
    c.add_argument("--marcas", required=True, help="JSON {id_punto: [u_px, v_px]}")
    c.add_argument("--salida", required=True)
    c.add_argument("--resolucion", nargs=2, type=int, metavar=("ANCHO", "ALTO"))
    c.add_argument("--encuadre", help="JSON del giro y recorte. Si va, las marcas se "
                                      "interpretan en coordenadas del frame original "
                                      "y se convierten solas")
    c.set_defaults(func=_cmd_calibrar)

    p = sub.add_parser("precision", help="informe de precisión de una calibración")
    p.add_argument("--calibracion", required=True)
    p.add_argument("--error-px", type=float, default=PARAMETROS.error_deteccion_px)
    p.add_argument("--invertida-pt", action="store_true",
                   help="el equipo propio ataca hacia la izquierda en el primer tiempo")
    p.set_defaults(func=_cmd_precision)

    f = sub.add_parser("frame", help="saca un cuadro del video para calibrar")
    f.add_argument("--video", required=True)
    f.add_argument("--en", default="2:00", help="momento del video, como 'mm:ss'")
    f.add_argument("--salida", default="frame.png")
    f.set_defaults(func=_cmd_frame)

    v = sub.add_parser("video", help="qué es el archivo y si el encuadre le sirve")
    v.add_argument("--video", required=True)
    v.add_argument("--encuadre")
    v.set_defaults(func=_cmd_video)

    a = sub.add_parser("analizar", help="procesa un video y escribe posiciones")
    a.add_argument("--video", required=True)
    a.add_argument("--calibracion", required=True)
    a.add_argument("--club", required=True)
    a.add_argument("--partido", required=True)
    a.add_argument("--salida", required=True)
    a.add_argument("--periodo", default="PT", choices=["PT", "ST"])
    a.add_argument("--invertida", action="store_true",
                   help="el equipo propio ataca hacia la izquierda en este período")
    a.add_argument("--saque", default="0",
                   help="instante DEL VIDEO donde arranca el período, como 'mm:ss'. "
                        "Los tiempos se guardan relativos a este punto")
    a.add_argument("--desde", default="0",
                   help="analizar desde este punto del video ('mm:ss')")
    a.add_argument("--duracion", default=None,
                   help="cuánto analizar desde --desde ('mm:ss' o segundos). "
                        "Para probar, 2 minutos alcanzan")
    a.add_argument("--detector", default="rfdetr", choices=["rfdetr", "yolo"])
    a.add_argument("--lente", help="JSON de calibración de lente")
    a.add_argument("--lente-aproximada", nargs=2, type=int, metavar=("ANCHO", "ALTO"),
                   help="usa coeficientes aproximados de GoPro Wide")
    a.add_argument("--encuadre", help="JSON del giro y recorte (va junto a la calibración)")
    a.add_argument("--overlay", help="ruta del video de auditoría a generar")
    a.set_defaults(func=_cmd_analizar)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
