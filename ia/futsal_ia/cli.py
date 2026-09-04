"""Línea de comandos de la Fase 1."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .cancha import PUNTOS_REFERENCIA
from .deteccion import ErrorDetector
from .config import PARAMETROS
from .geometria import ErrorCalibracion, Homografia, calibrar
from .pipeline import ErrorIncompatible, SinColores
from .preproceso import Encuadre, ErrorEncuadre
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
    marcas = {k: tuple(v) for k, v in _leer_json(args.marcas, "marcas.json").items()}

    # El calibrador exporta las marcas en coordenadas del frame ORIGINAL, que es
    # sobre el que clickeó la persona. La homografía, en cambio, tiene que valer
    # sobre el frame ya girado y recortado, que es el que va a ver el detector.
    # La conversión se hace acá y no a mano: pedirle a alguien que clickee sobre
    # una imagen ya recortada es pedirle que se equivoque.
    encuadre = Encuadre.de_dict(_leer_json(args.encuadre, "encuadre.json")) if args.encuadre else None
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
    h = Homografia.de_dict(_leer_json(args.calibracion, "calibracion.json"))
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


class ArchivoFaltante(Exception):
    """Un archivo que el usuario nombró y no está. Se reporta, no se revienta."""


def _leer_json(ruta, que: str) -> dict:
    """
    Lee un JSON de entrada y, si no está, lo dice en una línea.

    Un traceback de Python para "el archivo no está" es ruido: no ayuda a
    nadie y esconde la única información útil, que es dónde buscarlo. El caso
    real es siempre el mismo: el navegador bajó marcas.json y encuadre.json a
    la carpeta de Descargas, no a la del proyecto.
    """
    p = Path(ruta)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ArchivoFaltante(f"{p} no es un JSON válido ({e}).") from e

    pistas = []
    descargas = Path.home() / "Downloads"
    for carpeta in (Path.cwd(), descargas, Path.home() / "Descargas"):
        candidato = carpeta / p.name
        if carpeta != p.parent and candidato.exists():
            pistas.append(f"  Está acá:  {candidato}")
    if not pistas:
        cerca = sorted(x.name for x in Path.cwd().glob("*.json"))[:6]
        if cerca:
            pistas.append("  JSON en esta carpeta: " + ", ".join(cerca))

    raise ArchivoFaltante(
        f"No encuentro el {que}: {p}\n" + "\n".join(pistas)
        + ("\n  Pasale la ruta completa entre comillas, o movelo acá." if pistas else "")
    )


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
        from .pipeline import diagnostico_video
        print(f"ERROR: {diagnostico_video(args.video)}", file=sys.stderr)
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


def _cmd_cuadros(args):
    """
    Saca del video los cuadros a revisar, ya recortados.

    El visor antes cargaba el video entero. Eso ataba la revisión a que el
    navegador supiera reproducir ese archivo, y Chrome no reproduce varios
    códecs que OpenCV sí lee. Con los cuadros como imágenes, el visor anda con
    cualquier video que el análisis haya podido leer.
    """
    from .revision import CARPETA, exportar_cuadros

    analisis = _leer_json(args.analisis, "el análisis")
    video = args.video or (analisis.get("meta") or {}).get("video")
    if not video:
        print("ERROR: este análisis no dice de qué video salió. "
              "Pasá --video.", file=sys.stderr)
        return 1
    if not Path(video).exists():
        print(f"ERROR: no existe el video: {video}", file=sys.stderr)
        return 1

    destino = Path(args.salida or (Path(args.analisis).parent / CARPETA))
    try:
        indice = exportar_cuadros(video, analisis, destino, cuantos=args.cuantos)
    except (ValueError, FileNotFoundError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print(f"{len(indice['instantes'])} cuadros en {destino}")
    for aviso in indice.get("avisos", []):
        print("AVISO: " + aviso)
    print("Ahora abrí el revisor: python -m futsal_ia.panel "
          "y entrá a http://127.0.0.1:8710/revision.html")
    return 0


def _cmd_migrar_correcciones(args):
    """
    Pasa correcciones viejas al formato de cajas, sin volver a revisar nada.

    Diez minutos de trabajo humano por partido no se tiran porque el formato
    haya cambiado. Lo que le falta al formato viejo está en el índice de los
    cuadros que esa persona miró.
    """
    import json

    from .evaluacion import NoEsElMismoAnalisis, a_formato_3, verdad_de
    from .revision import CARPETA

    corr = _leer_json(args.correcciones, "las correcciones")
    if verdad_de(corr):
        print("Estas correcciones ya están en el formato nuevo. No hice nada.")
        return 0

    if args.analisis:
        # El índice es el registro de lo que se miró; un análisis solo sirve si
        # es exactamente esa corrida, y eso no se puede verificar del todo.
        fuente = _leer_json(args.analisis, "el análisis")
        print("OJO: estoy usando un análisis y no el índice de la revisión. "
              "Si no es EXACTAMENTE la corrida que revisaste, la conversión "
              "sale mal y no se nota.")
    else:
        fuente = _leer_json(Path(args.cuadros or CARPETA) / "indice.json",
                            "el índice de los cuadros revisados")

    try:
        nuevo = a_formato_3(fuente, corr)
    except NoEsElMismoAnalisis as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    destino = Path(args.salida or args.correcciones)
    if destino == Path(args.correcciones):
        respaldo = destino.with_suffix(".formato2.json")
        respaldo.write_text(json.dumps(corr, indent=2, ensure_ascii=False),
                            encoding="utf-8")
        print(f"Copia de lo anterior en {respaldo}")
    destino.write_text(json.dumps(nuevo, indent=2, ensure_ascii=False),
                       encoding="utf-8")
    cajas = sum(len(i["verdad"]) for i in nuevo["instantes"])
    print(f"{cajas} cajas en {len(nuevo['instantes'])} instantes, escritas en "
          f"{destino}.")
    print("Ahora esta revisión sirve para medir cualquier corrida del mismo "
          "video, no solo la que tenías enfrente.")
    return 0


def _muestras_etiquetadas(args):
    """Las cajas etiquetadas en la revisión, con el color de cada torso."""
    from .asignacion import colorear, muestras_de_revision

    carpeta = Path(args.cuadros)
    indice = _leer_json(carpeta / "indice.json", "el índice de los cuadros")
    corr = _leer_json(args.correcciones, "las correcciones")
    muestras = muestras_de_revision(indice, corr)
    if not muestras:
        raise ArchivoFaltante(
            "No hay ninguna caja etiquetada en esas correcciones. "
            "¿Revisaste y guardaste en el visor?")
    con_color, sin_color = colorear(muestras, carpeta)
    if not con_color:
        raise ArchivoFaltante(
            f"No pude leer el color de ninguna de las {len(muestras)} cajas. "
            f"¿Están los JPG en {carpeta}?")
    return con_color, sin_color


def _cmd_color_diagnostico(args):
    """
    ¿El color de la camiseta alcanza para saber de qué equipo es cada uno?

    Es la pregunta que hay que contestar antes de seguir tocando parámetros, y
    hasta ahora se contestaba de memoria. El primer partido real dio 50% de
    acierto de equipo, y la explicación fácil —"faltó asignar los grupos"— no
    era la buena: con los grupos que salieron, el techo era 69% aun asignando
    perfecto. Eso solo se ve midiendo.

    Se prueban los espacios de color contra las cajas que una persona etiquetó,
    partiendo por INSTANTE: dos jugadores del mismo cuadro no son dos ejemplos
    independientes, y mezclarlos daría un número alto que no significa nada.
    """
    from .asignacion import validar
    from .color import DESCRIPCION, ESPACIOS

    con_color, sin_color = _muestras_etiquetadas(args)
    instantes = len({m.get("t_ms") for m in con_color})
    print(f"{len(con_color)} cajas etiquetadas en {instantes} instantes"
          + (f" ({sin_color} sin color legible)" if sin_color else ""))
    if instantes < 5:
        print("OJO: con tan pocos instantes los números de abajo se mueven "
              "mucho. Revisá unos veinte.")
    print("\nQué tanto se le puede sacar al color, según cómo se lo mire.")
    print("Partido por instante, así que es lo que se espera en un momento "
          "del partido que el modelo no vio.\n")
    print(f"  {'espacio':<12} {'agrupando':>10} {'con etiquetas':>14}   qué es")
    print("  " + "-" * 74)

    resultados = []
    for espacio in ESPACIOS:
        try:
            v = validar(con_color, espacio=espacio, por_rol=args.por_rol)
        except (ImportError, ValueError) as e:
            print(f"  {espacio:<12} {'-':>10} {'-':>14}   no se pudo: {e}")
            continue
        if v.get("aviso"):
            print(f"  {espacio:<12} {'-':>10} {'-':>14}   {v['aviso']}")
            continue
        resultados.append(v)
        print(f"  {espacio:<12} {v['agrupado']:>9.0%} {v['supervisado']:>13.0%}"
              f"   {DESCRIPCION[espacio]}")

    if not resultados:
        return 1

    mejor = max(resultados, key=lambda v: v["supervisado"])
    print(f"\n  Mejor: {mejor['espacio']} con etiquetas, {mejor['supervisado']:.0%}.")
    print("\n  Por rol, con ese espacio:")
    for rol, d in mejor["por_rol"].items():
        print(f"    {rol:<16} {d['acierto']:>5.0%}  ({d['muestras']} muestras)")

    techo_viejo = max(v["agrupado"] for v in resultados)
    for d in _veredicto_color(mejor, techo_viejo):
        print(f"\n  >> {d}")
    return 0


def _veredicto_color(mejor: dict, techo_agrupado: float) -> list[str]:
    """Qué significan esos números para lo que hay que hacer ahora."""
    sup, esp = mejor["supervisado"], mejor["espacio"]
    dichos = []
    if sup >= 0.9:
        dichos.append(
            f"El color alcanza: bien usado da {sup:.0%}. Corré "
            f"`equipos-desde-revision --supervisado --espacio {esp} --aplicar` "
            "y volvé a analizar.")
    elif sup >= 0.75:
        falla = 1 - sup
        cada = round(1 / falla) if falla else 0
        dichos.append(
            f"El color alcanza a medias: {sup:.0%}, o sea que uno de cada "
            f"{cada} va a salir con el equipo equivocado. Sirve igual y es "
            f"gratis: aplicalo, y después mirá los roles flojos de la lista de "
            f"arriba, que es donde está el error concentrado.")
    else:
        dichos.append(
            f"El color NO alcanza: ni usando las etiquetas se pasa de {sup:.0%}. "
            "Seguir tocando la asignación no va a mover nada. Las camisetas se "
            "ven demasiado parecidas a esta distancia, o el recorte del torso "
            "está agarrando fondo en vez de camiseta. Antes de entrenar nada, "
            "mirá los recortes de `equipos_recortes/` y fijate qué se ve ahí.")

    if sup - techo_agrupado >= 0.1:
        dichos.append(
            f"Usar las etiquetas gana {sup - techo_agrupado:.0%} contra agrupar "
            "a ciegas, y eso ya es con la asignación regalada. O sea que el "
            "problema no era qué rol se le puso a cada grupo: eran los grupos.")
    return dichos


def _cmd_equipos_desde_revision(args):
    """
    Decide qué es cada grupo de color con lo que revisó una persona, en vez de
    mirando siete recortes.

    Dos modos, y la diferencia importa:

      · por defecto, se le pone nombre a los grupos que YA existen. Barato, y
        alcanza cuando los grupos son buenos y lo único que falló fue el
        nombre.
      · `--supervisado` arma los grupos DE CERO a partir de las etiquetas. Hace
        falta cuando los grupos mismos están mal: en el primer partido real, el
        techo con los grupos que había era 69% aun asignándolos perfecto, así
        que ningún nombre lo arreglaba.

    Cuál corresponde lo dice `cli color-diagnostico`, que lo mide.
    """
    import json

    from .asignacion import aplicar, avisos, validar, votar
    from .equipos import ClasificadorEquipos, entrenar_supervisado

    con_color, sin_color = _muestras_etiquetadas(args)
    d_equipos = _leer_json(args.equipos, "los equipos")
    clas = ClasificadorEquipos.de_dict(d_equipos)
    print(f"{len(con_color)} cajas etiquetadas con color legible"
          + (f" ({sin_color} sin color, muy chicas)" if sin_color else ""))
    print()

    if args.supervisado:
        v = validar(con_color, espacio=args.espacio, por_rol=args.por_rol)
        nuevo = entrenar_supervisado(con_color, espacio=args.espacio,
                                     por_rol=args.por_rol)
        cuenta: dict[str, int] = {}
        for rol in nuevo.equipo_por_grupo.values():
            cuenta[rol] = cuenta.get(rol, 0) + 1
        print(f"Clasificador armado con las etiquetas, en espacio "
              f"'{args.espacio}':")
        for rol, n in sorted(cuenta.items()):
            print(f"  {rol:<16} {n} montón(es) de color")
        if not v.get("aviso"):
            print(f"\n  Acierto esperado: {v['supervisado']:.0%} "
                  f"(partiendo por instante, o sea en momentos que no vio).")
            for rol, d in v["por_rol"].items():
                print(f"    {rol:<16} {d['acierto']:>5.0%}  ({d['muestras']})")
        validacion = v
    else:
        v = votar(clas, con_color)
        ancho = max(len(f["actual"]) for f in v["grupos"])
        for f in v["grupos"]:
            cabeza = (f"  Grupo {f['grupo']}  {f['muestras']:>4} muestras  "
                      f"|  ahora: {f['actual']:<{ancho}}  ->  ")
            if f["propuesta"]:
                marca = "=" if f["propuesta"] == f["actual"] else "CAMBIA a"
                print(f"{cabeza}{marca} {f['propuesta']}  "
                      f"({f['pureza']:.0%} de acuerdo)")
            else:
                print(f"{cabeza}sin tocar ({f['motivo']})")
            if f["votos"]:
                detalle = ", ".join(f"{r} {n}" for r, n in
                                    sorted(f["votos"].items(), key=lambda x: -x[1]))
                print(f"{' ' * 12}{detalle}")
        for a in avisos(v):
            print(f"\n  >> {a}")
        nuevo, validacion = aplicar(clas, v), None

    if not args.aplicar:
        print("\nNo escribí nada. Si te cierra, corré lo mismo con --aplicar.")
        return 0

    d_equipos.update(nuevo.a_dict())
    if validacion and not validacion.get("aviso"):
        d_equipos["validacion"] = validacion
    Path(args.equipos).write_text(
        json.dumps(d_equipos, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nEscrito en {args.equipos}.")
    print("Ahora hay que volver a analizar: la asignación de equipos se aplica "
          "durante el análisis, no después.")
    return 0


def _imprimir_confusion(mc: dict) -> None:
    """
    La matriz, en texto. Filas: lo que dijo la IA. Columnas: lo que era.

    La diagonal son los aciertos. Todo lo que esté fuera de la diagonal es un
    error, y DÓNDE está dice cuál de los cuatro problemas típicos es. Un
    porcentaje suelto no distingue entre "los equipos están al revés" (arreglo
    de treinta segundos) y "el color no separa" (arreglo de tarde entera).
    """
    if not mc.get("total"):
        return

    abrev = {"Arquero propio": "Arq.pro", "Arquero rival": "Arq.riv",
             "Desconocido": "Descon.", "No es persona": "No-persona",
             "Arbitro": "Árbitro"}
    def corto(e):
        return abrev.get(e, e)

    filas, columnas = mc["filas"], mc["columnas"]
    ancho_fila = max([len(corto(f)) for f in filas] + [len("dijo la IA")])
    anchos = [max(len(corto(c)), 5) for c in columnas]

    print("\nQué dijo la IA (filas) contra qué era en realidad (columnas)")
    print("  " + "dijo la IA".ljust(ancho_fila) + " |" +
          "".join(corto(c).rjust(a + 2) for c, a in zip(columnas, anchos)))
    print("  " + "-" * (ancho_fila + 1) + "+" + "-" * sum(a + 2 for a in anchos))
    for f in filas:
        celdas = []
        for c, a in zip(columnas, anchos):
            n = mc["conteo"].get(f"{f}|{c}", 0)
            # La diagonal marcada: es lo único que no hay que arreglar.
            celdas.append((f"{n}*" if f == c and n else str(n) if n else ".").rjust(a + 2))
        print("  " + corto(f).ljust(ancho_fila) + " |" + "".join(celdas))
    print(f"  (* = acertó. {mc['total']} recuadros en total)")

    if mc.get("no_vistas"):
        detalle = ", ".join(f"{n} {corto(r)}" for r, n in
                            sorted(mc["no_vistas"].items(), key=lambda x: -x[1]))
        print(f"  No vio, y una persona los dibujó a mano: {detalle}")

    for d in mc.get("diagnostico", []):
        print(f"\n  >> {d}")


def _cmd_evaluar(args):
    """Cruza el análisis con lo que dijo una persona y saca los números."""
    from .evaluacion import (cajas_etiquetadas, comparar, matriz_confusion,
                             medir, veredicto)

    analisis = _leer_json(args.analisis, "el análisis")
    corr = _leer_json(args.correcciones, "las correcciones")

    m = medir(analisis, corr)
    if not m.get("instantes"):
        print(m.get("aviso", "Sin datos."))
        return 1

    print(f"Instantes revisados: {m['instantes']}")
    print(f"Jugadores que había: {m['jugadores_reales']}")
    print(f"Detectados:          {m['detectados']}  "
          f"({m['falsos_positivos']} que no eran jugadores)\n")
    print(f"  Encuentra           {m['recall']:.0%} de los jugadores")
    print(f"  De lo que marca     {m['precision']:.0%} son jugadores")
    print(f"  Le pega al equipo   {m['acierto_equipo']:.0%} de las veces\n")
    for d in veredicto(m):
        print(f"  - {d}")

    if m.get("aviso_formato"):
        print(f"\n  OJO: {m['aviso_formato']}")
    if m.get("detecciones_sin_etiqueta"):
        print(f"\n  OJO: {m['detecciones_sin_etiqueta']} recuadros de este "
              "análisis caen donde la revisión no etiquetó nada. Se cuentan "
              "como falsos positivos, pero pueden ser gente que esta corrida "
              "encontró y la revisión no llegó a marcar: en ese caso los "
              "números salen peores que la realidad.")
    if m.get("descuadre_conteo"):
        print(f"\n  OJO: hay {m['descuadre_conteo']} jugadores de diferencia "
              "entre los que se contaron a ojo y los que quedaron dibujados. "
              "A un jugador que nadie marcó no se lo puede encontrar: el "
              "recall sale mejor de lo que es.")

    _imprimir_confusion(matriz_confusion(analisis, corr))

    if args.contra:
        previo = _leer_json(args.contra, "la medición anterior")
        print("\nContra la medición anterior:")
        c = comparar(previo.get("metricas", previo), m)
        for clave, v in c.items():
            if clave == "veredicto":
                continue
            print(f"  {clave:<16} {v['antes']:.3f} -> {v['despues']:.3f}  "
                  f"({v['delta']:+.3f})")
        print(f"\n  {c['veredicto']}")

    cajas = cajas_etiquetadas(corr, analisis)
    if cajas:
        total = sum(len(c["cajas"]) for c in cajas)
        a_mano = sum(1 for c in cajas for x in c["cajas"] if x["origen"] == "humano")
        print(f"\n{total} cajas confirmadas en {len(cajas)} cuadros "
              f"({a_mano} dibujadas a mano). Es material de entrenamiento.")

    if args.guardar:
        Path(args.guardar).write_text(
            json.dumps({"metricas": m}, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nMedición guardada en {args.guardar}, para comparar más adelante.")
    return 0


def _cmd_excluir(args):
    """
    Marca una franja de la cancha donde lo que se detecte no cuenta.

    Sirve para la zona de los bancos: los suplentes se paran a menos de un
    metro de la línea, la homografía los ubica bien, y cualquier margen
    razonable para el que ejecuta un saque también los deja pasar.
    """
    ruta = Path(args.calibracion)
    d = _leer_json(ruta, "calibracion.json")
    zonas = d.get("zonas_excluidas", [])

    if args.limpiar:
        d["zonas_excluidas"] = []
        ruta.write_text(json.dumps(d, indent=2), encoding="utf-8")
        print("Zonas excluidas borradas.")
        return 0

    if not args.rect:
        if not zonas:
            print("No hay zonas excluidas.\n")
            print("Para marcar la franja de los bancos, con las coordenadas que")
            print("te da el diagnóstico:\n")
            print("  python -m futsal_ia.cli excluir --calibracion calibracion.json \\")
            print('      --rect "0,19.6,16,26"\n')
            print("El rectángulo va en metros de cancha: x1,y1,x2,y2. La cancha es")
            print("40 x 20, así que y mayor a 20 es afuera del lado de una banda.")
            return 0
        print(f"{len(zonas)} zona(s) excluida(s):")
        for i, z in enumerate(zonas):
            xs = [p[0] for p in z]
            ys = [p[1] for p in z]
            print(f"  {i}: x {min(xs):.1f} a {max(xs):.1f} m, y {min(ys):.1f} a {max(ys):.1f} m")
        return 0

    try:
        x1, y1, x2, y2 = (float(v) for v in args.rect.split(","))
    except ValueError:
        print('ERROR: el rectángulo va como "x1,y1,x2,y2" en metros.', file=sys.stderr)
        return 1
    zonas.append([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
    d["zonas_excluidas"] = zonas
    ruta.write_text(json.dumps(d, indent=2), encoding="utf-8")
    print(f"Zona agregada: x {x1} a {x2} m, y {y1} a {y2} m.")
    print(f"Ahora hay {len(zonas)} zona(s). Volvé a correr el diagnóstico para verlo.")
    return 0


def _cmd_equipos(args):
    """
    La pasada 1, separada: agrupa los colores y guarda recortes de ejemplo.

    Se corre una vez por partido. Después el operador dice qué es cada grupo
    —desde el panel o con `equipos --asignar`— y el análisis reusa eso sin
    volver a recorrer el video.
    """
    from .deteccion import crear_detector
    from .equipos import ROLES, ClasificadorEquipos
    from .pipeline import preparar_equipos
    from .preproceso import Encuadre

    destino = Path(args.salida)

    if args.asignar:
        if not destino.exists():
            raise ArchivoFaltante(f"No encuentro {destino}. Corré primero el muestreo.")
        d = _leer_json(destino, "equipos.json")
        clas = ClasificadorEquipos.de_dict(d)
        for par in args.asignar:
            grupo, _, rol = par.partition("=")
            if rol not in ROLES:
                print(f"ERROR: rol desconocido {rol!r}. Opciones: {', '.join(ROLES)}",
                      file=sys.stderr)
                return 1
            clas = clas.asignar(int(grupo), rol)
        d.update(clas.a_dict())
        destino.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
        _imprimir_grupos(d)
        return 0

    h = Homografia.de_dict(_leer_json(args.calibracion, "calibracion.json"))
    encuadre = (Encuadre.de_dict(_leer_json(args.encuadre, "encuadre.json"))
                if args.encuadre else None)
    detector = crear_detector(
        args.detector,
        conf_minima=args.conf if args.conf is not None else PARAMETROS.conf_minima_persona,
        mosaicos=args.mosaicos)

    print("Recorriendo el video para juntar colores de camiseta...")
    clas, ejemplos, conteo = preparar_equipos(
        args.video, detector, h, encuadre=encuadre,
        carpeta_recortes=destino.parent / "equipos_recortes")

    d = clas.a_dict()
    d["ejemplos"] = {str(k): v for k, v in ejemplos.items()}
    d["conteo"] = {"frames": conteo.frames, "personas": conteo.personas,
                   "fuera_de_cancha": conteo.fuera_de_cancha, "colores": conteo.colores}
    destino.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{conteo.colores} torsos de {conteo.personas} personas detectadas "
          f"en {conteo.frames} cuadros.")
    print(f"Separación entre los dos grupos principales: {clas.separacion:.0f} "
          f"({'confiable' if clas.confiable else 'NO CONFIABLE'})\n")
    _imprimir_grupos(d)
    print(f"\nGuardado en {destino}. Los recortes de ejemplo están en "
          f"{destino.parent / 'equipos_recortes'}.")
    print("\nMiralos y asigná los roles, por ejemplo:")
    print(f"  python -m futsal_ia.cli equipos --salida {destino.name} "
          "--asignar 0=Propio 1=Rival")
    print("O hacelo con clicks desde el panel, que te muestra los recortes.")
    return 0


def _imprimir_grupos(d: dict) -> None:
    print(f"  {'grupo':<7} {'rol':<16} {'color BGR':<20} ejemplos")
    for i, centro in enumerate(d["centros"]):
        rol = d["equipo_por_grupo"].get(str(i), "Desconocido")
        bgr = ", ".join(f"{c:.0f}" for c in centro)
        n = len(d.get("ejemplos", {}).get(str(i), []))
        print(f"  {i:<7} {rol:<16} {bgr:<20} {n}")


def _cmd_diagnostico(args):
    """
    Un cuadro, el detector, y dónde cae cada persona sobre la cancha.

    Es la herramienta que contesta "por qué no encontró a nadie" sin deducir
    nada: dibuja los recuadros, marca los pies, y encima proyecta la cancha
    según la calibración. Si el contorno verde no cae sobre la cancha real, el
    problema es la calibración y se ve de un vistazo.
    """
    import cv2
    import numpy as np

    from .cancha import ANCHO_CANCHA_M, LARGO_CANCHA_M
    from .deteccion import crear_detector
    from .pipeline import _preparar, diagnostico_video
    from .preproceso import Encuadre

    h = Homografia.de_dict(_leer_json(args.calibracion, "calibracion.json"))
    encuadre = (Encuadre.de_dict(_leer_json(args.encuadre, "encuadre.json"))
                if args.encuadre else None)

    cap = cv2.VideoCapture(str(args.video))
    if not cap.isOpened():
        print(f"ERROR: {diagnostico_video(args.video)}", file=sys.stderr)
        return 1
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(parse_tiempo(args.en) / 1000.0 * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print("ERROR: no pude leer ese cuadro.", file=sys.stderr)
        return 1

    crudo = frame.shape[1], frame.shape[0]
    frame = _preparar(frame, None, encuadre)
    alto, ancho = frame.shape[:2]
    print(f"Cuadro del video: {crudo[0]}x{crudo[1]}")
    print(f"Después del encuadre: {ancho}x{alto}")
    print(f"La calibración se hizo sobre: "
          f"{h.resolucion[0]}x{h.resolucion[1]}" if h.resolucion else "sin resolución guardada")
    if h.resolucion and tuple(h.resolucion) != (ancho, alto):
        print("\n*** ACÁ ESTÁ EL PROBLEMA ***")
        print("La calibración se hizo sobre un cuadro de otro tamaño que el que")
        print("sale del encuadre. Las coordenadas no significan lo mismo, así que")
        print("todo cae fuera de la cancha. Volvé a calibrar sobre un frame")
        print("sacado con `cli frame` de ESTE video.\n")

    print("\nCargando el detector...")
    conf = args.conf if args.conf is not None else PARAMETROS.conf_minima_persona
    detector = crear_detector(args.detector, conf_minima=conf, mosaicos=args.mosaicos)
    detecciones = detector.detectar(frame)
    brutas = getattr(detector, "brutas", None)
    print(f"\nPersonas detectadas: {len(detecciones)}")
    if brutas is not None:
        print(f"Objetos que devolvió el modelo, antes de filtrar: {brutas}")
        if brutas and not detecciones:
            vistas = getattr(detector, "clases_vistas", [])
            print("\n*** El modelo SÍ vio objetos, pero ninguno quedó como persona. ***")
            print(f"Clases devueltas: {vistas}")
            print("Eso es un id de clase equivocado en el filtro, no un problema")
            print("de cámara ni de calibración.")
    print()

    # La cancha según la calibración, encima de la imagen.
    contorno = [(0, 0), (LARGO_CANCHA_M, 0), (LARGO_CANCHA_M, ANCHO_CANCHA_M),
                (0, ANCHO_CANCHA_M), (0, 0)]
    pts = np.array([h.a_imagen(x, y) for x, y in contorno], dtype=np.float64)
    if np.isfinite(pts).all():
        cv2.polylines(frame, [pts.astype(np.int32)], False, (136, 255, 0), 3)
    cv2.line(frame, tuple(np.int32(h.a_imagen(20, 0))), tuple(np.int32(h.a_imagen(20, 20))),
             (136, 255, 0), 2)

    for zona in h.zonas_excluidas:
        pz = np.array([h.a_imagen(x, y) for x, y in zona], dtype=np.float64)
        if np.isfinite(pz).all():
            capa = frame.copy()
            cv2.fillPoly(capa, [pz.astype(np.int32)], (60, 60, 200))
            cv2.addWeighted(capa, 0.25, frame, 0.75, 0, frame)
            cv2.polylines(frame, [pz.astype(np.int32)], True, (60, 60, 200), 2)

    dentro = 0
    print(f"  {'#':>3} {'x_m':>7} {'y_m':>7}  {'zona':<8} estado")
    for i, det in enumerate(detecciones, 1):
        x_m, y_m = h.a_cancha(*det.pies)
        ok_cancha = h.dentro_de_cancha(x_m, y_m, PARAMETROS.margen_cancha_m)
        excluida = h.en_zona_excluida(x_m, y_m)
        dentro += ok_cancha
        from .cancha import etiqueta_zona, metros_a_norm
        z = etiqueta_zona(*metros_a_norm(float(x_m), float(y_m))) if np.isfinite(x_m) else "-"
        motivo = "dentro" if ok_cancha else ("zona excluida" if excluida else "FUERA")
        print(f"  {i:>3} {x_m:>7.1f} {y_m:>7.1f}  {z or '-':<8} {motivo}")
        color = (136, 255, 0) if ok_cancha else (68, 68, 239)
        x1, y1, x2, y2 = (int(v) for v in det.bbox)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        u, v = det.pies
        cv2.circle(frame, (int(u), int(v)), 5, color, -1)
        cv2.putText(frame, f"{x_m:.0f},{y_m:.0f}", (x1, y1 - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    # ¿Qué aparecería con menos exigencia? Es la diferencia entre "el modelo no
    # lo vio" y "lo vio pero no le creyó", que se arreglan de forma distinta.
    if not args.conf and conf > 0.10:
        flojo = crear_detector(args.detector, conf_minima=0.10, mosaicos=args.mosaicos)
        extra = [d for d in flojo.detectar(frame)
                 if h.dentro_de_cancha(*h.a_cancha(*d.pies), PARAMETROS.margen_cancha_m)]
        if len(extra) > dentro:
            print(f"\nCon el umbral en 0.10 aparecerían {len(extra) - dentro} "
                  f"persona(s) más dentro de la cancha.")
            print(f"O sea que el modelo las ve pero no les cree con {conf:.2f}.")
            print("Probá con --conf 0.15, o con --mosaicos si son del fondo.")

    cv2.imwrite(str(args.salida), frame)
    print(f"\n{dentro} de {len(detecciones)} dentro de la cancha.")
    if dentro > PARAMETROS.max_en_cancha + 2:
        print(f"\nOJO: {dentro} personas dentro de la cancha. Futsal es 5 contra 5,")
        print(f"así que son {PARAMETROS.max_en_cancha} como máximo: cuatro de campo y")
        print("un arquero por equipo. Lo más probable es que estén entrando los")
        print("suplentes o el cuerpo técnico parados contra la línea. Marcá esa")
        print("franja con:")
        print('  python -m futsal_ia.cli excluir --calibracion calibracion.json '
              '--rect "x1,y1,x2,y2"')
    print(f"Imagen anotada en {args.salida}\n")
    if detecciones and dentro == 0:
        print("Ninguna cayó dentro: la calibración no se corresponde con este video.")
        print("Mirá la imagen: si el contorno verde de la cancha no cae sobre la")
        print("cancha real, ahí está la respuesta.")
    elif not detecciones:
        print("El detector no vio a nadie. Mirá la imagen: lo más probable es que")
        print("el recorte del encuadre no esté mostrando la cancha.")
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

    enc = Encuadre.de_dict(_leer_json(args.encuadre, "encuadre.json"))
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
    from .config import combinar_config
    from .deteccion import crear_detector
    from .equipos import entrenar_clasificador
    from .lente import CalibracionLente, Enderezador
    from .pipeline import analizar, guardar, muestrear_colores

    config = _leer_json(args.config, "partido.json") if args.config else None
    cfg = combinar_config(config, args.periodo, {
        "video": args.video, "calibracion": args.calibracion, "encuadre": args.encuadre,
        "lente": args.lente, "club": args.club, "partido": args.partido,
        "saque": args.saque,
        "invertida": True if args.invertida else None,
    })
    faltan = [k for k in ("video", "calibracion", "club", "partido") if not cfg.get(k)]
    if faltan:
        print(f"ERROR: falta indicar {', '.join(faltan)}. Pasalos como argumentos "
              "o en el --config.", file=sys.stderr)
        return 1

    if args.prueba and not args.duracion:
        args.duracion = "2:00"
        if not args.desde and config:
            args.desde = (config.get("prueba") or {}).get("desde", "5:00")
        args.desde = args.desde or "5:00"
        print(f"Modo prueba: {args.desde} + 2 min. Sacá --prueba para el período entero.")

    args.video = cfg["video"]
    args.calibracion = cfg["calibracion"]
    args.encuadre = cfg["encuadre"]
    args.lente = cfg["lente"]
    args.club, args.partido = cfg["club"], cfg["partido"]
    args.saque, args.invertida = cfg["saque"], cfg["invertida"]
    print(f"Período {args.periodo} | saque en {args.saque} | "
          f"{'ataca a la izquierda' if args.invertida else 'ataca a la derecha'}")

    h = Homografia.de_dict(_leer_json(args.calibracion, "calibracion.json"))
    detector = crear_detector(args.detector, conf_minima=PARAMETROS.conf_minima_persona)

    encuadre = Encuadre.de_dict(_leer_json(args.encuadre, "encuadre.json")) if args.encuadre else None
    if encuadre:
        print(f"Encuadre: giro {encuadre.rotacion_grados}°, salida "
              f"{encuadre.resolucion_salida[0]}x{encuadre.resolucion_salida[1]}")

    enderezador = None
    if args.lente:
        _leer_json(args.lente, "calibración de lente")   # para fallar prolijo si no está
        enderezador = Enderezador(CalibracionLente.leer(args.lente))
    elif args.lente_aproximada:
        ancho, alto = args.lente_aproximada
        enderezador = Enderezador(CalibracionLente.aproximada_gopro_wide(ancho, alto))
        print("AVISO: usando coeficientes de lente APROXIMADOS. Calibrar con "
              "tablero de ajedrez mejora la precisión en los bordes del cuadro.")

    if args.equipos:
        from .equipos import ClasificadorEquipos
        clas = ClasificadorEquipos.de_dict(_leer_json(args.equipos, "equipos.json"))
        print(f"Equipos leídos de {args.equipos}: " + ", ".join(
            f"{g}={r}" for g, r in sorted(clas.equipo_por_grupo.items())))
    else:
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
        encuadre=encuadre, t_saque_ms=parse_tiempo(args.saque or "0"),
        desde_ms=parse_tiempo(args.desde or "0"),
        duracion_ms=parse_tiempo(args.duracion) if args.duracion else None,
        al_avanzar=lambda p: print(f"  {p.frames_analizados} frames, "
                                   f"{len(res.tracks)} tracks", end="\r"),
    )
    destino = guardar(res, args.salida, club_id=args.club, id_partido=args.partido,
                      meta={
                          "video": str(args.video), "periodo": args.periodo,
                          "invertida": bool(args.invertida),
                          "t_saque_ms": parse_tiempo(args.saque or "0"),
                          "desde_ms": parse_tiempo(args.desde or "0"),
                          "encuadre": encuadre.a_dict() if encuadre else None,
                      })
    print(f"\nAnálisis guardado en {destino}\n")
    print(json.dumps(res.resumen(), indent=2, ensure_ascii=False))
    for aviso in res.avisos:
        print(f"\nAVISO: {aviso}")
    if args.overlay:
        from .overlay import exportar
        print(f"\nEscribiendo video de auditoría en {args.overlay}...")
        exportar(args.video, res, args.overlay, invertida=args.invertida,
                 enderezador=enderezador, encuadre=encuadre,
                 desde_ms=parse_tiempo(args.desde or "0"),
                 t_saque_ms=parse_tiempo(args.saque or "0"))
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

    cu = sub.add_parser("cuadros",
                        help="saca del video los cuadros a revisar (para el revisor)")
    cu.add_argument("--analisis", required=True)
    cu.add_argument("--video", help="por defecto, el que dice el análisis")
    cu.add_argument("--salida", help="carpeta destino (por defecto revision_cuadros)")
    cu.add_argument("--cuantos", type=int, default=20)
    cu.set_defaults(func=_cmd_cuadros)

    mg = sub.add_parser(
        "migrar-correcciones",
        help="pasa correcciones viejas al formato de cajas, sin revisar de nuevo")
    mg.add_argument("--correcciones", required=True)
    mg.add_argument("--cuadros", help="la carpeta de la revisión "
                                      "(por defecto revision_cuadros)")
    mg.add_argument("--analisis", help="solo si no tenés la carpeta de la "
                                       "revisión; tiene que ser EXACTAMENTE "
                                       "la corrida que se revisó")
    mg.add_argument("--salida", help="por defecto reescribe el mismo archivo, "
                                     "dejando una copia del anterior")
    mg.set_defaults(func=_cmd_migrar_correcciones)

    cd = sub.add_parser(
        "color-diagnostico",
        help="mide si el color de las camisetas alcanza para separar equipos")
    cd.add_argument("--cuadros", default="revision_cuadros")
    cd.add_argument("--correcciones", required=True)
    cd.add_argument("--por-rol", type=int, default=2,
                    help="cuántos montones de color por rol (la misma camiseta "
                         "se ve distinta según dónde esté parado el jugador)")
    cd.set_defaults(func=_cmd_color_diagnostico)

    ed = sub.add_parser(
        "equipos-desde-revision",
        help="deduce qué grupo de color es cada equipo, con lo que revisó una persona")
    ed.add_argument("--cuadros", default="revision_cuadros",
                    help="la carpeta con los JPG y el indice.json")
    ed.add_argument("--correcciones", required=True)
    ed.add_argument("--equipos", default="equipos.json")
    ed.add_argument("--supervisado", action="store_true",
                    help="arma los grupos de cero con las etiquetas, en vez de "
                         "ponerle nombre a los que ya hay")
    ed.add_argument("--espacio", default="bgr",
                    help="espacio de color; lo elige color-diagnostico")
    ed.add_argument("--por-rol", type=int, default=2)
    ed.add_argument("--aplicar", action="store_true",
                    help="sin esto solo muestra qué haría")
    ed.set_defaults(func=_cmd_equipos_desde_revision)

    ev = sub.add_parser("evaluar", help="qué tan bien anda, contra lo que dijo una persona")
    ev.add_argument("--analisis", required=True)
    ev.add_argument("--correcciones", required=True)
    ev.add_argument("--contra", help="una medición anterior, para comparar")
    ev.add_argument("--guardar", help="guarda esta medición para comparar después")
    ev.set_defaults(func=_cmd_evaluar)

    ex = sub.add_parser("excluir",
                        help="marca zonas donde lo detectado no cuenta (los bancos)")
    ex.add_argument("--calibracion", required=True)
    ex.add_argument("--rect", help='rectángulo en metros: "x1,y1,x2,y2"')
    ex.add_argument("--limpiar", action="store_true")
    ex.set_defaults(func=_cmd_excluir)

    eq = sub.add_parser("equipos",
                        help="agrupa los colores y deja elegir qué es cada grupo")
    eq.add_argument("--video")
    eq.add_argument("--calibracion")
    eq.add_argument("--encuadre")
    eq.add_argument("--salida", default="equipos.json")
    eq.add_argument("--detector", default="rfdetr", choices=["rfdetr", "yolo"])
    eq.add_argument("--conf", type=float)
    eq.add_argument("--mosaicos", action="store_true")
    eq.add_argument("--asignar", nargs="+", metavar="GRUPO=ROL",
                    help="asigna roles a los grupos ya calculados, ej: 0=Propio 1=Rival")
    eq.set_defaults(func=_cmd_equipos)

    d = sub.add_parser("diagnostico",
                       help="un cuadro con los recuadros y la cancha proyectada encima")
    d.add_argument("--video", required=True)
    d.add_argument("--calibracion", required=True)
    d.add_argument("--encuadre")
    d.add_argument("--en", default="5:00")
    d.add_argument("--salida", default="diagnostico.png")
    d.add_argument("--detector", default="rfdetr", choices=["rfdetr", "yolo"])
    d.add_argument("--conf", type=float,
                   help="confianza mínima. Bajala para ver si un jugador que falta "
                        "se estaba detectando por debajo del umbral")
    d.add_argument("--mosaicos", action="store_true",
                   help="corre el detector por pedazos solapados: encuentra a los "
                        "jugadores chicos del fondo, a costa de tardar más")
    d.set_defaults(func=_cmd_diagnostico)

    v = sub.add_parser("video", help="qué es el archivo y si el encuadre le sirve")
    v.add_argument("--video", required=True)
    v.add_argument("--encuadre")
    v.set_defaults(func=_cmd_video)

    a = sub.add_parser("analizar", help="procesa un video y escribe posiciones")
    a.add_argument("--config", help="partido.json, generado por herramientas/partido.html")
    a.add_argument("--video")
    a.add_argument("--calibracion")
    a.add_argument("--club")
    a.add_argument("--partido")
    a.add_argument("--salida", required=True)
    a.add_argument("--prueba", action="store_true",
                   help="analiza solo 2 minutos, para ver si funciona antes de "
                        "esperar horas")
    a.add_argument("--periodo", default="PT", choices=["PT", "ST"])
    a.add_argument("--invertida", action="store_true",
                   help="el equipo propio ataca hacia la izquierda en este período")
    a.add_argument("--saque", default=None,
                   help="instante DEL VIDEO donde arranca el período, como 'mm:ss'. "
                        "Los tiempos se guardan relativos a este punto")
    a.add_argument("--desde", default=None,
                   help="analizar desde este punto del video ('mm:ss')")
    a.add_argument("--duracion", default=None,
                   help="cuánto analizar desde --desde ('mm:ss' o segundos). "
                        "Para probar, 2 minutos alcanzan")
    a.add_argument("--detector", default="rfdetr", choices=["rfdetr", "yolo"])
    a.add_argument("--conf", type=float,
                   help="confianza mínima del detector")
    a.add_argument("--mosaicos", action="store_true",
                   help="detecta por pedazos solapados: encuentra a los jugadores "
                        "chicos del fondo, a costa de tardar más")
    a.add_argument("--lente", help="JSON de calibración de lente")
    a.add_argument("--lente-aproximada", nargs=2, type=int, metavar=("ANCHO", "ALTO"),
                   help="usa coeficientes aproximados de GoPro Wide")
    a.add_argument("--encuadre", help="JSON del giro y recorte (va junto a la calibración)")
    a.add_argument("--equipos", help="equipos.json con los roles ya asignados. "
                                     "Evita repetir el muestreo de colores")
    a.add_argument("--overlay", help="ruta del video de auditoría a generar")
    a.set_defaults(func=_cmd_analizar)

    args = ap.parse_args(argv)
    try:
        return args.func(args)
    except ArchivoFaltante as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except (SinColores, ErrorIncompatible) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except (ErrorCalibracion, ErrorEncuadre, ErrorDetector) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
