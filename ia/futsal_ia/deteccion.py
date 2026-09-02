"""
Detección de personas.

Esta es la parte fácil, y conviene decirlo: los detectores de objetos ya vienen
entrenados con "persona" entre sus clases y andan muy bien sin que hagamos
nada. No hay que entrenar nada para encontrar jugadores.

Lo que NO sale de acá:
  · quién es cada uno  -> no se resuelve (ver el diccionario de métricas);
  · de qué equipo es   -> equipos.py, por color;
  · dónde está parado  -> geometria.py, por homografía;
  · la pelota          -> Fase 2, y es harina de otro costal: objeto chico,
                          rapidísimo y tapado la mitad del tiempo. El detector
                          genérico no sirve, hay que entrenar uno.

Sobre la licencia: el modelo por defecto es RF-DETR (Apache 2.0). Ultralytics
YOLO anda igual de bien pero es AGPL-3.0, que obliga a abrir el código del
servicio o a pagar licencia comercial. Está disponible acá para comparar,
detrás de un aviso explícito.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

CLASE_PERSONA_COCO = 0


class ErrorDetector(Exception):
    """El detector no se pudo cargar. Se explica, no se revienta."""


def _traducir_import_error(e: ImportError, paquete: str) -> ErrorDetector:
    """
    Convierte el choque de dependencias en algo accionable.

    El caso concreto: rfdetr declara `transformers` sin cota de versión, pip
    instala la última, y transformers 5.0.0 eliminó
    find_pruneable_heads_and_indices, que rfdetr importa. El traceback que sale
    tiene veinte marcos y no nombra ni a rfdetr ni al conflicto: culpa a un
    archivo de transformers por no tener una función. Nadie deduce de ahí que
    hay que bajar una versión.
    """
    texto = str(e)
    if "find_pruneable_heads_and_indices" in texto or "prune_linear_layer" in texto:
        return ErrorDetector(
            "rfdetr no es compatible con la versión de transformers instalada.\n\n"
            "rfdetr pide 'transformers' sin poner cota de versión, así que pip "
            "instala la última, y transformers 5.0.0 eliminó las funciones que "
            "rfdetr importa.\n\n"
            "Arreglo:\n"
            '  pip install "transformers<5"\n\n'
            "Si aun así no anda, probá el otro detector con --detector yolo "
            "(ojo: Ultralytics es AGPL-3.0, sirve para probar, no para "
            "producción si esto se comercializa)."
        )
    if paquete in texto or "No module named" in texto:
        return ErrorDetector(
            f"Falta instalar {paquete}. Corré:\n  pip install -r requirements.txt\n\n"
            f"Detalle: {texto}"
        )
    return ErrorDetector(f"No pude cargar el detector {paquete}: {texto}")


@dataclass
class Deteccion:
    bbox: tuple[float, float, float, float]   # x1, y1, x2, y2 en píxeles
    confianza: float

    @property
    def pies(self) -> tuple[float, float]:
        """Medio del borde inferior: el punto apoyado en el plano de la cancha."""
        x1, y1, x2, y2 = self.bbox
        return (x1 + x2) / 2.0, y2

    @property
    def alto(self) -> float:
        return self.bbox[3] - self.bbox[1]

    @property
    def ancho(self) -> float:
        return self.bbox[2] - self.bbox[0]


class Detector(Protocol):
    def detectar(self, frame) -> list[Deteccion]: ...


class DetectorRFDETR:
    """RF-DETR (Apache 2.0). El que se usa por defecto."""

    def __init__(self, conf_minima: float = 0.35, tamano: str = "base"):
        try:
            from rfdetr import RFDETRBase, RFDETRLarge
        except ImportError as e:
            raise _traducir_import_error(e, "rfdetr") from e

        self.conf_minima = conf_minima
        self.modelo = (RFDETRLarge if tamano == "large" else RFDETRBase)()

    def detectar(self, frame) -> list[Deteccion]:
        det = self.modelo.predict(frame, threshold=self.conf_minima)
        salida = []
        for bbox, clase, conf in zip(det.xyxy, det.class_id, det.confidence):
            if int(clase) != CLASE_PERSONA_COCO:
                continue
            salida.append(Deteccion(bbox=tuple(float(v) for v in bbox), confianza=float(conf)))
        return salida


class DetectorYOLO:
    """
    Ultralytics YOLO. OJO CON LA LICENCIA: AGPL-3.0.

    Si esto se comercializa como servicio, usarlo obliga a abrir todo el código
    del servicio o a pagar licencia comercial. Sirve para comparar precisión
    contra RF-DETR; no para producción sin resolver antes ese tema.
    """

    def __init__(self, conf_minima: float = 0.35, pesos: str = "yolo11m.pt"):
        import warnings

        try:
            from ultralytics import YOLO
        except ImportError as e:
            raise _traducir_import_error(e, "ultralytics") from e

        warnings.warn(
            "Ultralytics YOLO es AGPL-3.0. Si este módulo se comercializa, hay "
            "que abrir el código del servicio o pagar licencia comercial. "
            "Para producción, usar DetectorRFDETR.",
            stacklevel=2,
        )
        self.conf_minima = conf_minima
        self.modelo = YOLO(pesos)

    def detectar(self, frame) -> list[Deteccion]:
        res = self.modelo.predict(frame, conf=self.conf_minima, classes=[CLASE_PERSONA_COCO],
                                  verbose=False)[0]
        return [
            Deteccion(bbox=tuple(float(v) for v in caja.xyxy[0]), confianza=float(caja.conf[0]))
            for caja in res.boxes
        ]


def crear_detector(nombre: str = "rfdetr", conf_minima: float = 0.35) -> Detector:
    if nombre == "rfdetr":
        return DetectorRFDETR(conf_minima=conf_minima)
    if nombre == "yolo":
        return DetectorYOLO(conf_minima=conf_minima)
    raise ValueError(f"Detector desconocido: {nombre!r}. Opciones: 'rfdetr', 'yolo'.")


# ── Detección en mosaicos ──────────────────────────────────────────────────
#
# Los detectores achican la imagen a un tamaño fijo antes de mirarla. Un
# jugador en el fondo de la cancha, que ya ocupa pocos píxeles en el original,
# después de ese achique queda en nada y el detector no lo ve.
#
# La salida es partir el frame en pedazos que se solapan, correr el detector
# en cada uno a resolución completa, y juntar los resultados. Un jugador chico
# del fondo pasa a ser un jugador de tamaño normal dentro de su pedazo.
#
# Cuesta plata: N pedazos son N inferencias. Sobre un frame ya recortado a la
# cancha suele no hacer falta para jugadores, porque el recorte solo ya
# resolvió el problema. Donde sí va a hacer falta es en la Fase 2, con la
# pelota, que es el objeto chico de verdad.

def generar_mosaicos(ancho: int, alto: int, tam: int = 1280, solape: float = 0.2):
    """
    Pedazos cuadrados que cubren toda la imagen, solapados.

    El solape no es opcional: sin él, un jugador que cae justo en la costura
    queda partido al medio y ninguno de los dos pedazos lo detecta entero.
    Con 20% de solape, cualquier jugador entra completo en al menos un pedazo.
    """
    if ancho <= 0 or alto <= 0:
        raise ValueError(f"Dimensiones inválidas: {ancho}x{alto}")
    if not 0 <= solape < 1:
        raise ValueError(f"El solape va entre 0 y 1, llegó {solape}")

    paso = max(1, int(tam * (1 - solape)))
    xs = list(range(0, max(1, ancho - tam + 1), paso))
    ys = list(range(0, max(1, alto - tam + 1), paso))
    # El último pedazo se pega al borde en vez de sobresalir: si sobresaliera,
    # habría que rellenar con negro y el detector vería un borde que no existe.
    if xs[-1] + tam < ancho:
        xs.append(max(0, ancho - tam))
    if ys[-1] + tam < alto:
        ys.append(max(0, alto - tam))

    return [(x, y, min(tam, ancho - x), min(tam, alto - y)) for y in ys for x in xs]


def _iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def fusionar(detecciones: list[Deteccion], umbral_iou: float = 0.5) -> list[Deteccion]:
    """
    Supresión de no-máximos: un jugador que cae en la zona de solape aparece
    dos veces, una por cada pedazo. Se queda la de mayor confianza.

    Sin esto, cada jugador de la costura contaría doble y el conteo de
    jugadores en cancha daría cualquier cosa.
    """
    quedan = sorted(detecciones, key=lambda d: d.confianza, reverse=True)
    elegidas: list[Deteccion] = []
    while quedan:
        mejor = quedan.pop(0)
        elegidas.append(mejor)
        quedan = [d for d in quedan if _iou(mejor.bbox, d.bbox) < umbral_iou]
    return elegidas


class DetectorEnMosaicos:
    """Envuelve cualquier detector y lo corre por pedazos."""

    def __init__(self, base: Detector, tam: int = 1280, solape: float = 0.2,
                 umbral_iou: float = 0.5):
        self.base = base
        self.tam = tam
        self.solape = solape
        self.umbral_iou = umbral_iou

    def detectar(self, frame) -> list[Deteccion]:
        alto, ancho = frame.shape[:2]
        mosaicos = generar_mosaicos(ancho, alto, self.tam, self.solape)
        if len(mosaicos) <= 1:
            return self.base.detectar(frame)

        todas: list[Deteccion] = []
        for x, y, w, h in mosaicos:
            for d in self.base.detectar(frame[y:y + h, x:x + w]):
                x1, y1, x2, y2 = d.bbox
                todas.append(Deteccion(bbox=(x1 + x, y1 + y, x2 + x, y2 + y),
                                       confianza=d.confianza))
        return fusionar(todas, self.umbral_iou)
