"""
Homografía: de píxel de la imagen a metro de la cancha.

Esta es la pieza que convierte "un jugador en el píxel (1840, 620)" en "un
jugador parado en Z3-C, a 26,4 m de nuestro arco". Todo lo demás del análisis
depende de que esto esté bien.

Dos cosas que conviene tener claras:

1. El punto que se proyecta NO es el centro del recuadro del jugador, es el
   MEDIO DEL BORDE INFERIOR: los pies. Son los pies los que están apoyados en
   el plano de la cancha, y la homografía solo vale para ese plano. Proyectar
   el centro del cuerpo mete un error sistemático que crece con la altura del
   jugador en la imagen.

2. La homografía asume cámara pinhole, o sea líneas rectas rectas. Una GoPro
   en Wide/SuperView/HyperView curva las líneas y rompe el supuesto. Hay que
   corregir la distorsión ANTES (ver lente.py) o filmar en Linear.

No usa OpenCV: es numpy puro para poder testearlo sin dependencias pesadas.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .cancha import (
    ANCHO_CANCHA_M,
    CELDAS,
    LARGO_CANCHA_M,
    PUNTOS_POR_ID,
    PUNTOS_IMPRESCINDIBLES,
    acotar,
    espejar,
    metros_a_norm,
    norm_a_metros,
)


class ErrorCalibracion(Exception):
    """La calibración no se puede resolver o no es confiable."""


def _normalizar_hartley(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Lleva los puntos a media cero y distancia media sqrt(2) al origen.

    Sin esto, resolver la homografía con coordenadas de píxel de 4K (números
    del orden de 3000) contra metros (del orden de 20) da una matriz muy mal
    condicionada y el resultado se degrada. Es el paso que más se olvida y el
    que más silenciosamente arruina una calibración.
    """
    centro = pts.mean(axis=0)
    desplazados = pts - centro
    dist_media = np.sqrt((desplazados ** 2).sum(axis=1)).mean()
    if dist_media < 1e-12:
        raise ErrorCalibracion("Los puntos de calibración son todos el mismo punto.")
    escala = np.sqrt(2.0) / dist_media
    T = np.array([
        [escala, 0.0, -escala * centro[0]],
        [0.0, escala, -escala * centro[1]],
        [0.0, 0.0, 1.0],
    ])
    homogeneos = np.hstack([pts, np.ones((len(pts), 1))])
    return (T @ homogeneos.T).T, T


def _resolver_dlt(origen: np.ndarray, destino: np.ndarray) -> np.ndarray:
    """DLT clásico: arma el sistema 2n x 9 y se queda con el vector singular
    de menor valor. Con más de 4 correspondencias esto es mínimos cuadrados,
    que es justamente lo que queremos: repartir el error entre todas las
    marcas en vez de confiar ciegamente en cuatro clicks."""
    n = len(origen)
    A = np.zeros((2 * n, 9))
    for i in range(n):
        x, y, w = origen[i]
        X, Y, W = destino[i]
        A[2 * i] = [0, 0, 0, -W * x, -W * y, -W * w, Y * x, Y * y, Y * w]
        A[2 * i + 1] = [W * x, W * y, W * w, 0, 0, 0, -X * x, -X * y, -X * w]
    _, _, Vt = np.linalg.svd(A)
    return Vt[-1].reshape(3, 3)


@dataclass
class Homografia:
    """Mapa imagen <-> cancha, con su propio informe de qué tan confiable es."""

    H: np.ndarray                 # píxel -> metros de cancha
    H_inv: np.ndarray             # metros de cancha -> píxel
    ids_usados: tuple[str, ...]
    error_por_punto: dict[str, float]      # error de reproyección, en metros
    error_rms_m: float
    error_por_punto_px: dict[str, float] = field(default_factory=dict)
    error_rms_px: float = 0.0
    zonas_excluidas: list = field(default_factory=list)
    """
    Polígonos en metros de cancha donde lo que se detecte NO cuenta.

    Existen por algo muy concreto: los suplentes y el cuerpo técnico se paran
    pegados a la línea de banda, a veces a menos de un metro. La homografía los
    ubica bien —en y = 20,5 m, fuera de la cancha— pero cualquier margen
    razonable para "el que pisa la línea en un saque" también los deja pasar.
    Bajar el margen a cero pierde a los jugadores legítimos y ni siquiera
    alcanza para sacarlos a todos.

    Marcadas una vez por cancha, junto con la calibración, resuelven el
    problema sin castigar a nadie.
    """
    resolucion: tuple[int, int] | None = None
    _reporte: dict = field(default=None, repr=False)

    # ── Proyección ────────────────────────────────────────────────────────

    def a_cancha(self, u, v):
        """Píxel -> metros de cancha. Acepta escalares o arrays."""
        pts = np.atleast_2d(np.stack(np.broadcast_arrays(u, v), axis=-1).astype(float))
        hom = np.hstack([pts, np.ones((len(pts), 1))])
        proy = hom @ self.H.T
        w = proy[:, 2:3]
        # Un w cercano a cero es un punto sobre el horizonte: no tiene imagen
        # en el plano de la cancha. Devolvemos NaN en vez de un número enorme.
        with np.errstate(divide="ignore", invalid="ignore"):
            xy = np.where(np.abs(w) < 1e-9, np.nan, proy[:, :2] / w)
        return xy[0] if np.isscalar(u) or np.ndim(u) == 0 else xy

    def a_imagen(self, x_m, y_m):
        """Metros de cancha -> píxel."""
        pts = np.atleast_2d(np.stack(np.broadcast_arrays(x_m, y_m), axis=-1).astype(float))
        hom = np.hstack([pts, np.ones((len(pts), 1))])
        proy = hom @ self.H_inv.T
        w = proy[:, 2:3]
        with np.errstate(divide="ignore", invalid="ignore"):
            uv = np.where(np.abs(w) < 1e-9, np.nan, proy[:, :2] / w)
        return uv[0] if np.isscalar(x_m) or np.ndim(x_m) == 0 else uv

    def pies_a_norm(self, bbox, invertida: bool):
        """
        De un recuadro de detección (x1, y1, x2, y2) a la coordenada 0-100 de
        la app, ya espejada según el lado en que atacamos.

        El punto de apoyo es el medio del borde inferior del recuadro.
        """
        x1, y1, x2, y2 = bbox
        u = (x1 + x2) / 2.0
        v = y2
        x_m, y_m = self.a_cancha(u, v)
        if not np.isfinite(x_m) or not np.isfinite(y_m):
            return None
        x, y = metros_a_norm(float(x_m), float(y_m))
        return espejar(x, y, invertida)

    # ── Filtros ───────────────────────────────────────────────────────────

    def en_zona_excluida(self, x_m, y_m) -> bool:
        """Punto en polígono por lanzamiento de rayo, sobre cada zona marcada."""
        for zona in self.zonas_excluidas:
            if len(zona) < 3:
                continue
            adentro = False
            n = len(zona)
            for i in range(n):
                x1, y1 = zona[i]
                x2, y2 = zona[(i + 1) % n]
                if (y1 > y_m) != (y2 > y_m):
                    corte = (x2 - x1) * (y_m - y1) / (y2 - y1) + x1
                    if x_m < corte:
                        adentro = not adentro
            if adentro:
                return True
        return False

    def dentro_de_cancha(self, x_m, y_m, margen_m: float = 0.5) -> bool:
        """
        Con la cámara en un corner, la tribuna, los bancos y la mesa de control
        entran en cuadro y el detector de personas los encuentra a todos. Este
        filtro es lo que los saca: cualquier detección cuyos pies caen fuera del
        rectángulo de la cancha (más un margen para el que pisa la línea) se
        descarta. Sale gratis y es más confiable que cualquier heurística.
        """
        if x_m is None or y_m is None or not np.isfinite(x_m) or not np.isfinite(y_m):
            return False
        if self.en_zona_excluida(x_m, y_m):
            return False
        # bool() explícito: comparar numpy floats devuelve np.bool_, que no es
        # `is True` ni `is False` y hace fallar cualquier chequeo por identidad
        # río abajo sin dar la cara.
        return bool(
            -margen_m <= x_m <= LARGO_CANCHA_M + margen_m
            and -margen_m <= y_m <= ANCHO_CANCHA_M + margen_m
        )

    # ── Informe de precisión ──────────────────────────────────────────────

    def escala_local(self, x_m: float, y_m: float, h: float = 0.05):
        """
        Cuántos píxeles ocupa un metro en ese punto de la cancha, y en qué
        dirección se ve peor.

        Se calcula por diferencias centradas sobre el mapa cancha -> imagen y
        se descompone en valores singulares. `sigma_min` es la dirección más
        castigada: un error de 1 px del detector se traduce en 1/sigma_min
        metros de error de posición. Ese es el número honesto.
        """
        p = np.array(self.a_imagen(x_m, y_m), dtype=float)
        px = np.array(self.a_imagen(x_m + h, y_m), dtype=float)
        mx = np.array(self.a_imagen(x_m - h, y_m), dtype=float)
        py = np.array(self.a_imagen(x_m, y_m + h), dtype=float)
        my = np.array(self.a_imagen(x_m, y_m - h), dtype=float)
        if not all(np.isfinite(q).all() for q in (p, px, mx, py, my)):
            return None
        J = np.column_stack([(px - mx) / (2 * h), (py - my) / (2 * h)])
        sigmas = np.linalg.svd(J, compute_uv=False)
        return {
            "px_por_m_mejor": float(sigmas[0]),
            "px_por_m_peor": float(sigmas[1]),
            "m_por_px_peor": float(1.0 / sigmas[1]) if sigmas[1] > 1e-9 else float("inf"),
        }

    def reporte_precision(self, error_deteccion_px: float = 3.0,
                          invertida: bool = False) -> dict:
        """
        Precisión esperable celda por celda de la grilla Z1-Z4 x I/C/D.

        Con la cámara en un corner esto NO es uniforme: el rincón lejano puede
        tener varias veces menos píxeles por metro que el cercano. Este informe
        lo pone en números en vez de dejarlo como sorpresa, y es lo que después
        permite decir "el heatmap en Z4-D tiene medio metro de incertidumbre".

        `invertida` NO es un detalle: las zonas Z1-Z4 se cuentan desde el arco
        PROPIO, y los equipos cambian de lado en el entretiempo. O sea que Z4
        del primer tiempo y Z4 del segundo son extremos FÍSICOS distintos de la
        cancha. Con un arco cerca de la cámara y el otro lejos, esas dos Z4
        tienen calidades de dato completamente distintas, y el informe tiene
        que calcularse con el mismo flag que se usa para analizar el período.
        """
        celdas = {}
        for celda in CELDAS:
            zi = ("Z1", "Z2", "Z3", "Z4").index(celda.zona)
            ci = ("I", "C", "D").index(celda.carril)
            x_m = (zi + 0.5) * (LARGO_CANCHA_M / 4.0)
            y_m = (ci + 0.5) * (ANCHO_CANCHA_M / 3.0)
            if invertida:
                x_m, y_m = LARGO_CANCHA_M - x_m, ANCHO_CANCHA_M - y_m
            esc = self.escala_local(x_m, y_m)
            if esc is None:
                celdas[celda.etiqueta] = {"error_m": None, "px_por_m": None}
                continue
            celdas[celda.etiqueta] = {
                "px_por_m": round(esc["px_por_m_peor"], 2),
                "error_m": round(esc["m_por_px_peor"] * error_deteccion_px, 3),
            }
        validas = [c["error_m"] for c in celdas.values() if c["error_m"] is not None]
        return {
            "error_rms_calibracion_m": round(self.error_rms_m, 3),
            "error_deteccion_px_asumido": error_deteccion_px,
            "invertida": invertida,
            "celdas": celdas,
            "peor_celda": max(celdas, key=lambda k: celdas[k]["error_m"] or -1) if validas else None,
            "mejor_celda": min(celdas, key=lambda k: celdas[k]["error_m"] if celdas[k]["error_m"] is not None else 1e9) if validas else None,
            "error_max_m": round(max(validas), 3) if validas else None,
            "error_min_m": round(min(validas), 3) if validas else None,
        }

    def reporte_por_periodo(self, error_deteccion_px: float = 3.0,
                            invertida_pt: bool = False) -> dict:
        """
        Los dos informes juntos, que es la única forma de ver la asimetría.

        Con un arco cerca de la cámara y el otro lejos, la misma celda de la
        app cambia de calidad entre tiempos. Sumar Z4 del PT con Z4 del ST es
        mezclar un dato de centímetros con uno de medio metro. Este informe
        existe para que eso se vea antes de sacar conclusiones, no después.
        """
        pt = self.reporte_precision(error_deteccion_px, invertida=invertida_pt)
        st = self.reporte_precision(error_deteccion_px, invertida=not invertida_pt)
        comparacion = {}
        for etiqueta in pt["celdas"]:
            e_pt = pt["celdas"][etiqueta]["error_m"]
            e_st = st["celdas"][etiqueta]["error_m"]
            if e_pt is None or e_st is None or min(e_pt, e_st) <= 0:
                continue
            comparacion[etiqueta] = {
                "error_pt_m": e_pt,
                "error_st_m": e_st,
                "veces_peor": round(max(e_pt, e_st) / min(e_pt, e_st), 1),
            }
        peor = max(comparacion, key=lambda k: comparacion[k]["veces_peor"]) if comparacion else None
        return {
            "PT": pt,
            "ST": st,
            "comparacion": comparacion,
            "celda_mas_asimetrica": peor,
            "asimetria_maxima": comparacion[peor]["veces_peor"] if peor else None,
        }

    def a_dict(self) -> dict:
        return {
            "H": self.H.tolist(),
            "ids_usados": list(self.ids_usados),
            "error_rms_m": self.error_rms_m,
            "error_rms_px": self.error_rms_px,
            "error_por_punto_m": self.error_por_punto,
            "error_por_punto_px": self.error_por_punto_px,
            "resolucion": list(self.resolucion) if self.resolucion else None,
            "zonas_excluidas": [[list(p) for p in z] for z in self.zonas_excluidas],
        }

    @staticmethod
    def de_dict(d: dict) -> "Homografia":
        H = np.array(d["H"], dtype=float)
        return Homografia(
            H=H,
            H_inv=np.linalg.inv(H),
            ids_usados=tuple(d.get("ids_usados", ())),
            error_por_punto=d.get("error_por_punto_m", {}),
            error_rms_m=float(d.get("error_rms_m", 0.0)),
            error_por_punto_px=d.get("error_por_punto_px", {}),
            error_rms_px=float(d.get("error_rms_px", 0.0)),
            resolucion=tuple(d["resolucion"]) if d.get("resolucion") else None,
            zonas_excluidas=[[tuple(p) for p in z]
                             for z in d.get("zonas_excluidas", [])],
        )


# El umbral va EN PÍXELES, no en metros, y esa distinción importa.
#
# Con la cámara en un corner, un metro de cancha vale 136 px cerca y 3 px
# lejos: 43 veces menos. Un umbral en metros trata esos dos extremos como si
# fueran lo mismo y termina rechazando calibraciones buenas por culpa de la
# perspectiva, no de quien marcó. Un click perfecto en el rincón lejano
# "falla" por medio metro sin que nadie se haya equivocado.
#
# El error de reproyección en píxeles mide lo único que la persona controla:
# qué tan bien clickeó. 6 px es lo que mete alguien con pulso normal usando
# la lupa; por encima de 12 hay un punto mal marcado o la lente sin corregir.
ERROR_RMS_MAXIMO_PX = 12.0

# Se sigue reportando en metros porque es lo que se entiende, pero como dato
# informativo y no como criterio de aceptación.
ESQUINAS_EN_ORDEN = ("esq_prop_izq", "esq_prop_der", "esq_riv_der", "esq_riv_izq")


def _cruz(o, a, b) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _es_simple(p) -> bool:
    """¿El cuadrilátero no se cruza a sí mismo?"""
    def corta(p1, p2, p3, p4):
        d1, d2 = _cruz(p3, p4, p1), _cruz(p3, p4, p2)
        d3, d4 = _cruz(p1, p2, p3), _cruz(p1, p2, p4)
        return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))
    return not (corta(p[0], p[1], p[2], p[3]) or corta(p[1], p[2], p[3], p[0]))


def revisar_esquinas(marcas: dict[str, tuple[float, float]]) -> str | None:
    """
    Detecta las esquinas marcadas en orden cambiado, que es EL error del
    operador: dos esquinas intercambiadas dan un cuadrilátero en forma de moño.

    Lo insidioso es que la homografía se resuelve igual, sin fallar y sin
    avisar, y devuelve posiciones absurdas. Más vale detectarlo acá.

    Devuelve un mensaje diciendo qué par intercambiar, o None si está bien.
    """
    if not all(e in marcas for e in ESQUINAS_EN_ORDEN):
        return None
    p = [marcas[e] for e in ESQUINAS_EN_ORDEN]
    if _es_simple(p):
        return None
    # De los tres órdenes cíclicos posibles de cuatro puntos, exactamente uno
    # no se cruza. Buscamos cuál y traducimos a "intercambiá estos dos".
    for i, j in ((0, 1), (1, 2), (0, 2)):
        q = list(p)
        q[i], q[j] = q[j], q[i]
        if _es_simple(q):
            return (f"'{ESQUINAS_EN_ORDEN[i]}' y '{ESQUINAS_EN_ORDEN[j]}' están "
                    "intercambiadas: marcadas así, la cancha queda con forma de moño.")
    return ("Las cuatro esquinas no forman un cuadrilátero válido: alguna está "
            "mal marcada.")


def calibrar(
    marcas: dict[str, tuple[float, float]],
    resolucion: tuple[int, int] | None = None,
    tolerancia_rms_px: float = ERROR_RMS_MAXIMO_PX,
) -> Homografia:
    """
    Calcula la homografía a partir de los puntos que marcó el operador.

    `marcas` es {id_de_punto_de_referencia: (u_px, v_px)}. Cuatro alcanzan,
    pero cuantos más se marquen mejor reparte el error, y con la cámara en un
    corner eso importa mucho más que con la cámara al medio.

    Se hace UNA VEZ por posición de cámara, no una vez por partido. Si el
    trípode vuelve al mismo lugar, se reusa el JSON guardado.
    """
    desconocidos = set(marcas) - set(PUNTOS_POR_ID)
    if desconocidos:
        raise ErrorCalibracion(f"Puntos de referencia desconocidos: {sorted(desconocidos)}")

    faltantes = [p for p in PUNTOS_IMPRESCINDIBLES if p not in marcas]
    if len(marcas) < 4:
        raise ErrorCalibracion(
            f"Hacen falta al menos 4 puntos y llegaron {len(marcas)}."
            + (f" Faltan las esquinas: {faltantes}." if faltantes else "")
        )

    problema = revisar_esquinas(marcas)
    if problema:
        raise ErrorCalibracion(problema)

    ids = tuple(sorted(marcas))
    px = np.array([marcas[i] for i in ids], dtype=float)
    metros = np.array([(PUNTOS_POR_ID[i].x_m, PUNTOS_POR_ID[i].y_m) for i in ids], dtype=float)

    px_n, T_px = _normalizar_hartley(px)
    m_n, T_m = _normalizar_hartley(metros)
    H_n = _resolver_dlt(px_n, m_n)
    H = np.linalg.inv(T_m) @ H_n @ T_px

    if abs(H[2, 2]) > 1e-12:
        H = H / H[2, 2]

    try:
        H_inv = np.linalg.inv(H)
    except np.linalg.LinAlgError as exc:
        raise ErrorCalibracion(
            "La homografía salió singular. Suele pasar cuando tres o más "
            "puntos marcados están alineados o dos están casi encima."
        ) from exc

    provisoria = Homografia(H=H, H_inv=H_inv, ids_usados=ids, error_por_punto={},
                            error_rms_m=0.0, resolucion=resolucion)
    proyectados = provisoria.a_cancha(px[:, 0], px[:, 1])
    errores = np.sqrt(((proyectados - metros) ** 2).sum(axis=1))
    provisoria.error_por_punto = {i: round(float(e), 4) for i, e in zip(ids, errores)}
    provisoria.error_rms_m = float(np.sqrt((errores ** 2).mean()))

    # El criterio de aceptación: cuánto se desvía en la IMAGEN, que es lo único
    # que la persona que marcó controla.
    vuelta = provisoria.a_imagen(metros[:, 0], metros[:, 1])
    err_px = np.sqrt(((vuelta - px) ** 2).sum(axis=1))
    provisoria.error_por_punto_px = {i: round(float(e), 2) for i, e in zip(ids, err_px)}
    provisoria.error_rms_px = float(np.sqrt((err_px ** 2).mean()))

    if provisoria.error_rms_px > tolerancia_rms_px:
        peor = max(provisoria.error_por_punto_px, key=provisoria.error_por_punto_px.get)
        raise ErrorCalibracion(
            f"Calibración poco confiable: error RMS de {provisoria.error_rms_px:.1f} px "
            f"(máximo aceptable {tolerancia_rms_px:.0f} px). El punto peor marcado es "
            f"'{peor}' ({PUNTOS_POR_ID[peor].etiqueta}), desviado "
            f"{provisoria.error_por_punto_px[peor]:.1f} px. Revisá ese click. Si están "
            "todos bien marcados, lo más probable es que la lente esté distorsionando: "
            "corregí la distorsión antes de calibrar."
        )
    return provisoria
