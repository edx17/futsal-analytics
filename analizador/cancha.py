"""La cancha de futsal: medidas, dibujo 2D y calibración contra el video.

Sistema de coordenadas (en metros), tal como se ve la cancha en el video:
  X de 0 a 40, de izquierda a derecha.
  Y de 0 a 20, desde la banda LEJANA (arriba en la imagen) a la CERCANA (abajo).
"""
import json
import cv2
import numpy as np

LARGO, ANCHO = 40.0, 20.0

# Los puntos que se pueden marcar al calibrar. Con 4 que se vean alcanza
# (que no estén los cuatro sobre la misma línea); con 6 u 8 queda mejor.
PUNTOS = [
    ('Esquina lejana IZQUIERDA', (0, 0)),
    ('Mitad de cancha, banda LEJANA', (20, 0)),
    ('Esquina lejana DERECHA', (40, 0)),
    ('Esquina cercana DERECHA', (40, 20)),
    ('Mitad de cancha, banda CERCANA', (20, 20)),
    ('Esquina cercana IZQUIERDA', (0, 20)),
    ('Centro de la cancha', (20, 10)),
    ('Círculo central, punto de ARRIBA', (20, 7)),
    ('Círculo central, punto de ABAJO', (20, 13)),
    ('Punto penal IZQUIERDO (6 m)', (6, 10)),
    ('Punto penal DERECHO (6 m)', (34, 10)),
    ('Doble penal IZQUIERDO (10 m)', (10, 10)),
    ('Doble penal DERECHO (10 m)', (30, 10)),
]


def homografia(calib):
    """Imagen (px) -> cancha (m)."""
    H, _ = cv2.findHomography(np.float32(calib['img']), np.float32(calib['cancha']), cv2.RANSAC, 3.0)
    return H


def a_cancha(H, pts):
    pts = np.asarray(pts, dtype=np.float32).reshape(-1, 2)
    if len(pts) == 0:
        return np.zeros((0, 2), np.float32)
    return cv2.perspectiveTransform(pts.reshape(-1, 1, 2), H).reshape(-1, 2)


def lineas_cancha(paso=0.25):
    """Las líneas de la cancha como listas de puntos en metros."""
    L, A = LARGO, ANCHO
    lineas = [
        [(0, 0), (L, 0), (L, A), (0, A), (0, 0)],
        [(L / 2, 0), (L / 2, A)],
    ]
    ang = np.arange(0, 2 * np.pi + paso, paso)
    lineas.append([(L / 2 + 3 * np.cos(a), A / 2 + 3 * np.sin(a)) for a in ang])
    # Áreas: cuartos de círculo de 6 m desde cada palo, unidos por una recta.
    for x0, s in ((0, 1), (L, -1)):
        arco = []
        for a in np.arange(-np.pi / 2, 0 + 1e-6, paso / 2):
            arco.append((x0 + s * 6 * np.cos(a), A / 2 - 1.5 + 6 * np.sin(a)))
        for a in np.arange(0, np.pi / 2 + 1e-6, paso / 2):
            arco.append((x0 + s * 6 * np.cos(a), A / 2 + 1.5 + 6 * np.sin(a)))
        lineas.append(arco)
    return lineas


def dibujar_sobre_video(img, H, color=(0, 255, 255)):
    """Proyecta las líneas de la cancha sobre el cuadro del video (para verificar la calibración)."""
    Hinv = np.linalg.inv(H)
    out = img.copy()
    for linea in lineas_cancha():
        p = cv2.perspectiveTransform(np.float32(linea).reshape(-1, 1, 2), Hinv).reshape(-1, 2)
        cv2.polylines(out, [p.astype(np.int32)], False, color, 2, cv2.LINE_AA)
    return out


class Radar:
    """Dibuja la cancha vista desde arriba."""

    def __init__(self, ancho_px=1280, margen=40):
        self.m = margen
        self.esc = (ancho_px - 2 * margen) / LARGO
        self.w = ancho_px
        self.h = int(ANCHO * self.esc + 2 * margen)
        self.fondo = np.full((self.h, self.w, 3), (28, 70, 36), np.uint8)
        for linea in lineas_cancha():
            cv2.polylines(self.fondo, [self.px(linea)], False, (235, 235, 235), 2, cv2.LINE_AA)

    def px(self, pts):
        pts = np.asarray(pts, dtype=np.float32).reshape(-1, 2)
        return (pts * self.esc + self.m).astype(np.int32)

    def lienzo(self):
        return self.fondo.copy()


def guardar_calib(ruta, img_pts, cancha_pts, tam):
    json.dump({'img': [list(map(float, p)) for p in img_pts], 'cancha': [list(map(float, p)) for p in cancha_pts],
               'tam_video': list(tam)}, open(ruta, 'w'), indent=1)


def calibrar_interactivo(img, ruta_salida):
    """Ventana para marcar los puntos de la cancha. Devuelve el dict de calibración."""
    alto, ancho = img.shape[:2]
    esc = min(1.0, 1500 / ancho, 850 / alto)
    base = cv2.resize(img, (int(ancho * esc), int(alto * esc)))
    marcados = []  # (indice_punto, (x, y) en px del video)
    estado = {'i': 0, 'clic': None}

    def on_mouse(ev, x, y, *_):
        if ev == cv2.EVENT_LBUTTONDOWN:
            estado['clic'] = (x / esc, y / esc)

    ventana = 'Calibrar cancha - VirtualClub'
    cv2.namedWindow(ventana, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(ventana, on_mouse)

    while True:
        vis = base.copy()
        for k, (idx, (x, y)) in enumerate(marcados):
            cv2.circle(vis, (int(x * esc), int(y * esc)), 6, (0, 255, 0), -1)
            cv2.putText(vis, str(idx + 1), (int(x * esc) + 8, int(y * esc) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        i = estado['i']
        if i < len(PUNTOS):
            texto = f'{i + 1}/{len(PUNTOS)}  Clic en: {PUNTOS[i][0]}'
        else:
            texto = 'No hay mas puntos.'
        ayuda = 'S = no se ve (saltar)   Z = deshacer   ENTER = terminar (minimo 4)   ESC = salir'
        cv2.rectangle(vis, (0, 0), (vis.shape[1], 58), (0, 0, 0), -1)
        cv2.putText(vis, texto, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(vis, ayuda + f'   ({len(marcados)} marcados)', (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.imshow(ventana, vis)
        tecla = cv2.waitKey(30) & 0xFF

        if estado['clic'] is not None and i < len(PUNTOS):
            marcados.append((i, estado['clic']))
            estado['clic'] = None
            estado['i'] += 1
        elif estado['clic'] is not None:
            estado['clic'] = None
        if tecla in (ord('s'), ord('S')) and i < len(PUNTOS):
            estado['i'] += 1
        elif tecla in (ord('z'), ord('Z')) and marcados:
            ultimo, _ = marcados.pop()
            estado['i'] = ultimo
        elif tecla == 27:
            cv2.destroyWindow(ventana)
            raise SystemExit('Calibración cancelada.')
        elif tecla in (13, 10) or (i >= len(PUNTOS) and tecla != 255):
            if len(marcados) < 4:
                print('Faltan puntos: marcá al menos 4.')
                continue
            calib = {'img': [p for _, p in marcados], 'cancha': [PUNTOS[k][1] for k, _ in marcados]}
            H = homografia(calib)
            if H is None:
                print('Con esos puntos no se puede calibrar (¿están todos en una línea?). Marcá otros.')
                continue
            check = cv2.resize(dibujar_sobre_video(img, H), base.shape[1::-1])
            cv2.rectangle(check, (0, 0), (check.shape[1], 34), (0, 0, 0), -1)
            cv2.putText(check, 'Las lineas amarillas tienen que caer sobre las de la cancha.  ENTER = OK   R = rehacer',
                        (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            cv2.imshow(ventana, check)
            while True:
                t = cv2.waitKey(0) & 0xFF
                if t in (13, 10, ord('r'), ord('R'), 27):
                    break
            if t in (13, 10):
                cv2.destroyWindow(ventana)
                guardar_calib(ruta_salida, calib['img'], calib['cancha'], (ancho, alto))
                return json.load(open(ruta_salida))
            if t == 27:
                cv2.destroyWindow(ventana)
                raise SystemExit('Calibración cancelada.')
            marcados.clear()
            estado['i'] = 0
