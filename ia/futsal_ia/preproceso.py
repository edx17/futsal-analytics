"""
Encuadre: el giro y el recorte que se le aplica a cada video, siempre igual.

Por qué esto vive en el código y no en un programa de edición.

La calibración se hace UNA VEZ sobre un frame ya girado y recortado, y después
se reusa en todos los partidos. Eso solo funciona si el giro y el recorte son
EXACTAMENTE los mismos siempre. Si un día alguien recorta tres píxeles más
arriba, la homografía sigue calculando —no falla, no avisa— y todas las
posiciones salen corridas. Es el peor tipo de error: silencioso y sistemático.

Así que el encuadre deja de ser un paso manual y pasa a ser un dato: se guarda
junto a la calibración, se aplica solo, y el pipeline se niega a analizar un
video cuya resolución no coincide con la que se usó para calibrar.

Para qué sirve recortar, siendo honestos:

  · NO agrega resolución. Los píxeles del fondo de la cancha son los que son;
    recortar la tribuna no inventa ninguno. Lo único que agrega resolución
    óptica de verdad es mover o girar la cámara físicamente.

  · SÍ mejora la detección, y bastante. Los detectores achican la imagen a un
    tamaño fijo antes de mirarla. Si la cancha ocupa la mitad del cuadro, la
    mitad de ese presupuesto se gasta en gradas. Recortando, cae todo sobre
    jugadores.

  · Además: menos gente de tribuna detectada, archivos más chicos y análisis
    más rápido.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class ErrorEncuadre(Exception):
    pass


@dataclass(frozen=True)
class Encuadre:
    """
    Giro alrededor del centro y después recorte.

    El orden importa y no es negociable: primero se gira, después se recorta.
    El recorte está expresado en coordenadas del frame YA GIRADO.
    """

    resolucion_origen: tuple[int, int]      # (ancho, alto) del video original
    rotacion_grados: float = 0.0            # positivo = antihorario
    recorte: tuple[int, int, int, int] | None = None   # (x, y, ancho, alto)

    def __post_init__(self):
        ancho, alto = self.resolucion_origen
        if ancho <= 0 or alto <= 0:
            raise ErrorEncuadre(f"Resolución de origen inválida: {self.resolucion_origen}")
        if self.recorte is not None:
            x, y, w, h = self.recorte
            if w <= 0 or h <= 0:
                raise ErrorEncuadre(f"El recorte tiene ancho o alto no positivo: {self.recorte}")
            if x < 0 or y < 0 or x + w > ancho or y + h > alto:
                raise ErrorEncuadre(
                    f"El recorte {self.recorte} se sale del frame de "
                    f"{ancho}x{alto}. Ojo que el recorte va en coordenadas del "
                    "frame YA GIRADO."
                )

    @property
    def resolucion_salida(self) -> tuple[int, int]:
        if self.recorte is None:
            return self.resolucion_origen
        return self.recorte[2], self.recorte[3]

    @property
    def es_identidad(self) -> bool:
        return self.rotacion_grados == 0.0 and self.recorte is None

    # ── Geometría ─────────────────────────────────────────────────────────

    def matriz_giro(self) -> np.ndarray:
        """
        La afín 2x3 del giro alrededor del centro. Es la misma que usa OpenCV
        para transformar la imagen, así que el punto y el píxel no se pueden
        desincronizar: hay una sola fórmula.
        """
        ancho, alto = self.resolucion_origen
        cx, cy = ancho / 2.0, alto / 2.0
        rad = np.deg2rad(self.rotacion_grados)
        cos, sen = np.cos(rad), np.sin(rad)
        return np.array([
            [cos, sen, (1 - cos) * cx - sen * cy],
            [-sen, cos, sen * cx + (1 - cos) * cy],
        ], dtype=np.float64)

    def punto_a_encuadre(self, u: float, v: float) -> tuple[float, float]:
        """
        De píxel del video original a píxel del frame ya girado y recortado.

        Sirve para convertir marcas que alguien clickeó sobre el frame crudo,
        sin obligarlo a volver a marcar todo cuando se cambia el encuadre.
        """
        M = self.matriz_giro()
        p = M @ np.array([u, v, 1.0])
        if self.recorte is not None:
            p = p - np.array([self.recorte[0], self.recorte[1]])
        return float(p[0]), float(p[1])

    def punto_desde_encuadre(self, u: float, v: float) -> tuple[float, float]:
        """El camino inverso: de píxel del frame procesado al video original."""
        if self.recorte is not None:
            u, v = u + self.recorte[0], v + self.recorte[1]
        M = np.vstack([self.matriz_giro(), [0.0, 0.0, 1.0]])
        p = np.linalg.inv(M) @ np.array([u, v, 1.0])
        return float(p[0]), float(p[1])

    def dentro_del_recorte(self, u: float, v: float) -> bool:
        """¿Ese punto del video original sobrevive al encuadre?"""
        x, y = self.punto_a_encuadre(u, v)
        ancho, alto = self.resolucion_salida
        return bool(0 <= x < ancho and 0 <= y < alto)

    # ── Aplicación ────────────────────────────────────────────────────────

    def aplicar(self, frame):
        """Gira y recorta un frame. Necesita OpenCV."""
        import cv2

        alto_f, ancho_f = frame.shape[:2]
        if (ancho_f, alto_f) != tuple(self.resolucion_origen):
            raise ErrorEncuadre(
                f"El video es de {ancho_f}x{alto_f} pero el encuadre se definió "
                f"sobre {self.resolucion_origen[0]}x{self.resolucion_origen[1]}. "
                "Con otra resolución la calibración no vale: hay que recalibrar."
            )
        if self.rotacion_grados:
            frame = cv2.warpAffine(
                frame, self.matriz_giro(), (ancho_f, alto_f),
                flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
            )
        if self.recorte is not None:
            x, y, w, h = self.recorte
            frame = frame[y:y + h, x:x + w]
        return frame

    def comando_ffmpeg(self, entrada: str = "entrada.mp4", salida: str = "salida.mp4") -> str:
        """
        El mismo encuadre como comando de ffmpeg, por si conviene preprocesar
        los partidos de una vez en vez de girar y recortar en cada análisis.

        Ojo: ffmpeg gira en el sentido contrario al de OpenCV, por eso el signo
        cambiado. Es exactamente la clase de detalle que hace que un recorte
        hecho a mano no coincida con el del pipeline.
        """
        filtros = []
        if self.rotacion_grados:
            filtros.append(f"rotate={-np.deg2rad(self.rotacion_grados):.9f}:bilinear=1")
        if self.recorte is not None:
            x, y, w, h = self.recorte
            filtros.append(f"crop={w}:{h}:{x}:{y}")
        if not filtros:
            return f'ffmpeg -i "{entrada}" -c copy "{salida}"'
        return (f'ffmpeg -i "{entrada}" -vf "{",".join(filtros)}" '
                f'-c:v libx264 -crf 16 -preset slow -c:a copy "{salida}"')

    # ── Persistencia ──────────────────────────────────────────────────────

    def a_dict(self) -> dict:
        return {
            "resolucion_origen": list(self.resolucion_origen),
            "rotacion_grados": self.rotacion_grados,
            "recorte": list(self.recorte) if self.recorte else None,
            "resolucion_salida": list(self.resolucion_salida),
        }

    @staticmethod
    def de_dict(d: dict | None) -> "Encuadre | None":
        if not d:
            return None
        return Encuadre(
            resolucion_origen=tuple(d["resolucion_origen"]),
            rotacion_grados=float(d.get("rotacion_grados", 0.0)),
            recorte=tuple(d["recorte"]) if d.get("recorte") else None,
        )

    def guardar(self, ruta: str | Path) -> None:
        Path(ruta).write_text(json.dumps(self.a_dict(), indent=2), encoding="utf-8")

    @staticmethod
    def leer(ruta: str | Path) -> "Encuadre":
        return Encuadre.de_dict(json.loads(Path(ruta).read_text(encoding="utf-8")))


def recorte_desde_esquinas(
    esquinas_px: list[tuple[float, float]],
    resolucion_origen: tuple[int, int],
    rotacion_grados: float = 0.0,
    margen_px: int = 60,
) -> Encuadre:
    """
    Arma el encuadre a partir de las esquinas de la cancha marcadas sobre el
    video original: recorta lo justo para que entre la cancha con un margen.

    El margen no es decorativo. Los jugadores salen de la cancha —a buscar una
    pelota, en un saque de banda, el arquero jugando adelantado— y si el
    recorte pasa raspando la línea, el seguidor los pierde y los vuelve a
    encontrar con número nuevo cada vez.
    """
    if len(esquinas_px) < 3:
        raise ErrorEncuadre("Hacen falta al menos 3 esquinas para calcular el recorte.")

    tmp = Encuadre(resolucion_origen=resolucion_origen, rotacion_grados=rotacion_grados)
    girados = [tmp.punto_a_encuadre(u, v) for u, v in esquinas_px]
    xs = [p[0] for p in girados]
    ys = [p[1] for p in girados]

    ancho, alto = resolucion_origen
    x0 = max(0, int(min(xs)) - margen_px)
    y0 = max(0, int(min(ys)) - margen_px)
    x1 = min(ancho, int(max(xs)) + margen_px)
    y1 = min(alto, int(max(ys)) + margen_px)
    if x1 - x0 < 2 or y1 - y0 < 2:
        raise ErrorEncuadre("El recorte calculado quedó vacío. Revisá las esquinas marcadas.")
    return Encuadre(resolucion_origen=resolucion_origen, rotacion_grados=rotacion_grados,
                    recorte=(x0, y0, x1 - x0, y1 - y0))
