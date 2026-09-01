"""
Corrección de distorsión de la lente. Con una GoPro en un corner, esto no es
opcional.

El problema, en una línea: la homografía asume que las líneas rectas se ven
rectas. Los modos anchos de una GoPro las curvan. Calibrar sobre una imagen
curvada da una homografía que anda bien en el centro y cada vez peor hacia los
bordes, sin avisar.

Los modos de la GoPro, de más a menos distorsión:

    HyperView  > SuperView > Wide > Linear

`Linear` ya viene corregido por la cámara y no necesita nada de este módulo.
El problema es que Linear ronda los 90-95 grados de campo horizontal y, desde
un corner, LA CANCHA ENTERA NO ENTRA: hacen falta unos 115-125 grados según
qué tan atrás y qué tan alto esté la cámara. O sea que con la cámara en un
corner hay que filmar en Wide y corregir acá.

Dos cosas más que hay que apagar en la cámara, y que arruinan todo si quedan
prendidas:

  · Horizon Lock / nivelación: rota y recorta el cuadro sobre la marcha. Una
    homografía fija deja de valer en cuanto el encuadre se mueve un grado.
  · Estabilización (HyperSmooth): mismo problema. La cámara está en un
    trípode, no hace falta.

La calibración de lente se hace UNA VEZ por cámara y modo, filmando un tablero
de ajedrez impreso desde varios ángulos, y se guarda. No es por partido.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Punto de partida razonable para una GoPro en Wide sobre 16:9. NO son valores
# medidos de una unidad concreta: sirven para arrancar y para que el pipeline
# corra, pero la calibración real con tablero da bastante mejor y es una tarde
# de trabajo. Mientras se usen estos, el informe lo dice.
COEFICIENTES_APROXIMADOS_WIDE = {
    "modelo": "fisheye",
    "k": [-0.255, 0.062, -0.008, 0.0],
    "f_rel": 0.46,       # distancia focal como fracción del ancho de imagen
    "aproximado": True,
}


@dataclass
class CalibracionLente:
    K: np.ndarray            # matriz intrínseca
    D: np.ndarray            # coeficientes de distorsión
    resolucion: tuple[int, int]
    modelo: str = "fisheye"
    aproximado: bool = False

    @staticmethod
    def aproximada_gopro_wide(ancho: int, alto: int) -> "CalibracionLente":
        f = COEFICIENTES_APROXIMADOS_WIDE["f_rel"] * ancho
        K = np.array([[f, 0, ancho / 2], [0, f, alto / 2], [0, 0, 1]], dtype=np.float64)
        D = np.array(COEFICIENTES_APROXIMADOS_WIDE["k"], dtype=np.float64).reshape(4, 1)
        return CalibracionLente(K=K, D=D, resolucion=(ancho, alto),
                                modelo="fisheye", aproximado=True)

    @staticmethod
    def leer(ruta: str | Path) -> "CalibracionLente":
        d = json.loads(Path(ruta).read_text(encoding="utf-8"))
        return CalibracionLente(
            K=np.array(d["K"], dtype=np.float64),
            D=np.array(d["D"], dtype=np.float64),
            resolucion=tuple(d["resolucion"]),
            modelo=d.get("modelo", "fisheye"),
            aproximado=bool(d.get("aproximado", False)),
        )

    def guardar(self, ruta: str | Path) -> None:
        Path(ruta).write_text(json.dumps({
            "K": self.K.tolist(), "D": self.D.tolist(),
            "resolucion": list(self.resolucion),
            "modelo": self.modelo, "aproximado": self.aproximado,
        }, indent=2), encoding="utf-8")


class Enderezador:
    """
    Aplica la corrección a cada frame. Precalcula los mapas una vez: rehacerlos
    por frame cuesta más que la propia corrección.
    """

    def __init__(self, calibracion: CalibracionLente):
        import cv2  # import tardío: el resto del paquete no necesita OpenCV

        self.cv2 = cv2
        self.calibracion = calibracion
        ancho, alto = calibracion.resolucion
        if calibracion.modelo == "fisheye":
            K_nueva = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
                calibracion.K, calibracion.D, (ancho, alto), np.eye(3), balance=1.0
            )
            self.mapa1, self.mapa2 = cv2.fisheye.initUndistortRectifyMap(
                calibracion.K, calibracion.D, np.eye(3), K_nueva, (ancho, alto), cv2.CV_16SC2
            )
        else:
            K_nueva, _ = cv2.getOptimalNewCameraMatrix(
                calibracion.K, calibracion.D, (ancho, alto), 1, (ancho, alto)
            )
            self.mapa1, self.mapa2 = cv2.initUndistortRectifyMap(
                calibracion.K, calibracion.D, None, K_nueva, (ancho, alto), cv2.CV_16SC2
            )
        self.K_nueva = K_nueva

    def __call__(self, frame):
        return self.cv2.remap(frame, self.mapa1, self.mapa2,
                              interpolation=self.cv2.INTER_LINEAR)


def calibrar_con_tablero(rutas_imagenes, filas: int = 6, columnas: int = 9,
                         lado_mm: float = 25.0) -> CalibracionLente:
    """
    Calibración real, con un tablero de ajedrez impreso.

    Cómo se hace: imprimís un tablero, lo pegás en algo rígido (una tapa de
    carpeta), y filmás 20-30 fotos desde ángulos y distancias distintas
    ocupando bien las ESQUINAS del cuadro, que es donde la distorsión pega y
    donde justamente van a caer las líneas lejanas de la cancha.

    Es una tarde de trabajo y se hace una sola vez por cámara y por modo.
    """
    import cv2

    objp = np.zeros((1, filas * columnas, 3), np.float64)
    objp[0, :, :2] = np.mgrid[0:columnas, 0:filas].T.reshape(-1, 2) * (lado_mm / 1000.0)

    puntos_mundo, puntos_imagen, forma = [], [], None
    for ruta in rutas_imagenes:
        img = cv2.imread(str(ruta))
        if img is None:
            continue
        gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        forma = gris.shape[::-1]
        ok, esquinas = cv2.findChessboardCorners(
            gris, (columnas, filas),
            cv2.CALIB_CB_ADAPTIVE_THRESH + cv2.CALIB_CB_NORMALIZE_IMAGE,
        )
        if not ok:
            continue
        cv2.cornerSubPix(
            gris, esquinas, (3, 3), (-1, -1),
            (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.1),
        )
        puntos_mundo.append(objp)
        puntos_imagen.append(esquinas)

    if len(puntos_mundo) < 10:
        raise ValueError(
            f"Solo se encontró el tablero en {len(puntos_mundo)} imágenes. "
            "Hacen falta al menos 10, y conviene que en varias el tablero esté "
            "cerca de las esquinas del cuadro."
        )

    K = np.zeros((3, 3))
    D = np.zeros((4, 1))
    cv2.fisheye.calibrate(
        puntos_mundo, puntos_imagen, forma, K, D, None, None,
        cv2.fisheye.CALIB_RECOMPUTE_EXTRINSIC + cv2.fisheye.CALIB_FIX_SKEW,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1e-6),
    )
    return CalibracionLente(K=K, D=D, resolucion=forma, modelo="fisheye", aproximado=False)
