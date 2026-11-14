"""VirtualClub · Analizador de video (prueba local).

Ejemplos:
  python analizar.py --video "https://youtu.be/XXXX" --desde 65 --duracion 300 --salida resultados/prueba
  python analizar.py --video partido.mp4 --desde 0 --duracion 120 --salida resultados/corto
  python analizar.py --video partido.mp4 --calib resultados/prueba/calibracion.json --salida resultados/otra

Qué hace:
  1. Baja el tramo del video (si es un link) o usa el archivo.
  2. Te pide marcar puntos de la cancha en un cuadro (calibración), salvo que pases --calib.
  3. Detecta personas y pelota cuadro a cuadro (RF-DETR) y sigue a cada uno (ByteTrack).
  4. Pasa todo a metros sobre la cancha, separa los equipos por color y calcula distancias,
     velocidades y sprints.
  5. Arma resultado.mp4 (video + radar), mapas de calor, jugadores.csv, datos.json e informe.html.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import webbrowser

def _chequear_instalacion():
    faltan = []
    for modulo, paquete in (('torch', 'torch (ver README, paso 5)'), ('cv2', 'opencv-python'), ('numpy', 'numpy'),
                            ('supervision', 'supervision'), ('sklearn', 'scikit-learn'), ('rfdetr', 'rfdetr'),
                            ('trackers', 'trackers'), ('yt_dlp', 'yt-dlp')):
        try:
            __import__(modulo)
        except ImportError:
            faltan.append(paquete)
    if faltan:
        print('Faltan paquetes en este entorno de Python:', ', '.join(faltan))
        print(f'Python {sys.version.split()[0]} en {sys.executable}')
        if sys.version_info >= (3, 13):
            print('Ojo: con Python 3.13 o más nuevo torch puede no instalarse. Usá Python 3.11 o 3.12 (ver README).')
        print('Con el entorno activado (.venv), corré:  pip install -r requirements.txt  y mirá si da algún error.')
        sys.exit(1)


_chequear_instalacion()

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import supervision as sv  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402

import cancha as C

PERSONA, PELOTA = 1, 37            # clases COCO del modelo preentrenado
UMBRAL_PERSONA, UMBRAL_PELOTA = 0.35, 0.20
MARGEN_CANCHA = 1.0                # metros fuera de las líneas que todavía cuentan como "en cancha"
VEL_MAX_REAL = 10.0                # m/s: más que esto es un salto del seguimiento, no una carrera
UMBRAL_SPRINT = 5.0                # m/s (18 km/h)
SPRINT_MIN_S = 1.0
TRACK_MIN_S = 3.0                  # seguimientos más cortos no van a la tabla por jugador
COLORES_EQUIPO = {'A': (60, 220, 60), 'B': (60, 60, 235), 'otros': (200, 200, 200)}  # BGR


def log(*a):
    print(*a, flush=True)


# ── 1. VIDEO ────────────────────────────────────────────────────────────────
def conseguir_video(fuente, desde, duracion, carpeta):
    if os.path.exists(fuente):
        return fuente, desde
    if not shutil.which('ffmpeg'):
        sys.exit('Falta ffmpeg (ver README: winget install Gyan.FFmpeg) para bajar un tramo del video.')
    destino = os.path.join(carpeta, 'tramo.mp4')
    if os.path.exists(destino):
        log('Uso el tramo ya bajado:', destino)
        return destino, 0
    hasta = desde + duracion
    log(f'Bajando el tramo {desde}s → {hasta}s …')
    cmd = [sys.executable, '-m', 'yt_dlp', '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b',
           '--download-sections', f'*{desde}-{hasta}', '--force-keyframes-at-cuts',
           '-o', destino, fuente]
    r = subprocess.run(cmd)
    if r.returncode != 0 or not os.path.exists(destino):
        sys.exit('No se pudo bajar el video. Probá actualizar yt-dlp: python -m pip install -U yt-dlp')
    return destino, 0


def leer_cuadro(ruta, segundo):
    cap = cv2.VideoCapture(ruta)
    cap.set(cv2.CAP_PROP_POS_MSEC, segundo * 1000)
    ok, img = cap.read()
    cap.release()
    if not ok:
        sys.exit(f'No pude leer el video en el segundo {segundo}.')
    return img


# ── 2. DETECCIÓN Y SEGUIMIENTO ───────────────────────────────────────────────
def puntos_piso(H, alto, ancho):
    """Píxeles de la imagen que caen dentro de la cancha (para estimar el color del piso)."""
    Hinv = np.linalg.inv(H)
    xs, ys = np.meshgrid(np.linspace(1, C.LARGO - 1, 40), np.linspace(1, C.ANCHO - 1, 20))
    px = cv2.perspectiveTransform(np.float32(np.c_[xs.ravel(), ys.ravel()]).reshape(-1, 1, 2), Hinv).reshape(-1, 2)
    px = px.astype(int)
    ok = (px[:, 0] >= 0) & (px[:, 0] < ancho) & (px[:, 1] >= 0) & (px[:, 1] < alto)
    return px[ok]


def color_piso(img, pts):
    if len(pts) == 0:
        return None
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    return np.median(lab[pts[:, 1], pts[:, 0]].astype(np.float32), axis=0)


def color_torso(img, caja, piso):
    """Color de la camiseta: el centro del torso, sin los píxeles que se parecen al piso."""
    x1, y1, x2, y2 = [int(v) for v in caja]
    h, w = y2 - y1, x2 - x1
    torso = img[max(0, y1 + int(h * .20)):max(0, y1 + int(h * .45)), max(0, x1 + int(w * .30)):max(0, x2 - int(w * .30))]
    if torso.size < 30:
        return None
    lab = cv2.cvtColor(torso, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    if piso is not None:
        lejos = np.linalg.norm(lab - piso, axis=1) > 22
        if lejos.sum() >= max(6, 0.2 * len(lab)):
            lab = lab[lejos]
    return np.median(lab, axis=0)


def procesar(ruta, desde, duracion, H, fps_an, lote, modelo_nombre):
    import torch
    from rfdetr import RFDETRMedium, RFDETRNano, RFDETRSmall
    clases = {'nano': RFDETRNano, 'small': RFDETRSmall, 'medium': RFDETRMedium}
    log('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'no (se usa el procesador, va a ser lento)')
    modelo = clases[modelo_nombre]()
    try:
        modelo.optimize_for_inference()
    except Exception:  # noqa: BLE001 — en CPU o versiones viejas no hace falta
        pass

    cap = cv2.VideoCapture(ruta)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ini = int(desde * fps)
    fin = min(total, int((desde + duracion) * fps)) if duracion else total
    cap.set(cv2.CAP_PROP_POS_FRAMES, ini)
    paso = max(1, round(fps / fps_an))
    fps_real = fps / paso
    from trackers import ByteTrackTracker
    tracker = ByteTrackTracker(lost_track_buffer=int(fps_real * 2), frame_rate=fps_real,
                               track_activation_threshold=0.45, high_conf_det_threshold=0.5)
    cuadros, colores = [], {}
    pts_piso = puntos_piso(H, int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)), int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)))
    n_total = (fin - ini) // paso
    log(f'Video: {fps:.0f} cuadros/s · analizo {fps_real:.1f} por segundo · {n_total} cuadros')

    t0 = time.time()
    f = ini
    pendientes = []

    def correr(lote_imgs):
        imgs = [im[:, :, ::-1].copy() for _, im in lote_imgs]
        dets = modelo.predict(imgs if len(imgs) > 1 else imgs[0], threshold=UMBRAL_PELOTA, include_source_image=False)
        if not isinstance(dets, list):
            dets = [dets]
        for (fr, img), det in zip(lote_imgs, dets):
            t = (fr - ini) / fps
            pers = det[(det.class_id == PERSONA) & (det.confidence >= UMBRAL_PERSONA)]
            pies = C.a_cancha(H, pers.get_anchors_coordinates(sv.Position.BOTTOM_CENTER))
            if len(pers):
                m = MARGEN_CANCHA
                dentro = (pies[:, 0] > -m) & (pies[:, 0] < C.LARGO + m) & (pies[:, 1] > -m) & (pies[:, 1] < C.ANCHO + m)
                pers = pers[dentro]
            piso = color_piso(img, pts_piso)
            pers = tracker.update(pers)
            if len(pers):
                pers = pers[pers.tracker_id >= 0]
            pies = C.a_cancha(H, pers.get_anchors_coordinates(sv.Position.BOTTOM_CENTER))
            jugadores = []
            for caja, tid, (X, Y) in zip(pers.xyxy, pers.tracker_id, pies):
                c = color_torso(img, caja, piso)
                if c is not None:
                    colores.setdefault(int(tid), []).append(c)
                jugadores.append({'id': int(tid), 'x': round(float(X), 2), 'y': round(float(Y), 2),
                                  'caja': [int(v) for v in caja]})
            bal = det[det.class_id == PELOTA]
            pelota = None
            if len(bal):
                k = int(np.argmax(bal.confidence))
                bx, by = bal.get_anchors_coordinates(sv.Position.CENTER)[k]
                P = C.a_cancha(H, [[bx, by]])[0]
                if -2 < P[0] < C.LARGO + 2 and -2 < P[1] < C.ANCHO + 2:
                    pelota = {'x': round(float(P[0]), 2), 'y': round(float(P[1]), 2), 'conf': round(float(bal.confidence[k]), 2),
                              'caja': [int(v) for v in bal.xyxy[k]]}
            cuadros.append({'t': round(t, 3), 'frame': fr, 'jugadores': jugadores, 'pelota': pelota})

    while f < fin:
        ok = cap.grab()
        if not ok:
            break
        if (f - ini) % paso == 0:
            _, img = cap.retrieve()
            pendientes.append((f, img))
            if len(pendientes) >= lote:
                correr(pendientes)
                pendientes = []
                hechos = len(cuadros)
                if hechos % (lote * 10) == 0 or hechos < lote * 2:
                    vel = hechos / max(1e-6, time.time() - t0)
                    resta = (n_total - hechos) / max(vel, 1e-6)
                    log(f'  {hechos}/{n_total} cuadros · {vel:.1f} cuadros/s · faltan ~{resta / 60:.1f} min')
        f += 1
    if pendientes:
        correr(pendientes)
    cap.release()
    return cuadros, colores, fps_real, time.time() - t0


# ── 3. EQUIPOS ──────────────────────────────────────────────────────────────
def separar_equipos(colores):
    """KMeans de 3 grupos sobre el color de cada seguimiento: los 2 más grandes son los equipos;
    el tercero junta árbitros y arqueros con colores distintos."""
    ids = [k for k, v in colores.items() if len(v) >= 5]
    if len(ids) < 3:
        return {k: 'otros' for k in colores}
    X = np.array([np.median(colores[k], axis=0) for k in ids])
    X[:, 0] *= 0.5  # la luz cambia el brillo más que el tono: le damos menos peso
    peso = np.array([len(colores[k]) for k in ids])
    km = KMeans(n_clusters=3, n_init=10, random_state=0).fit(X, sample_weight=peso)
    tam = [peso[km.labels_ == g].sum() for g in range(3)]
    orden = np.argsort(tam)[::-1]
    nombre = {orden[0]: 'A', orden[1]: 'B', orden[2]: 'otros'}
    eq = {k: nombre[g] for k, g in zip(ids, km.labels_)}
    for k in colores:
        eq.setdefault(k, 'otros')
    return eq


# ── 4. MÉTRICAS ─────────────────────────────────────────────────────────────
def suavizar(v, n):
    if len(v) < n or n < 2:
        return v
    k = np.ones(n) / n
    pad = np.pad(v, (n // 2, n - 1 - n // 2), mode='edge')
    return np.convolve(pad, k, mode='valid')


def metricas(cuadros, equipos, fps_real):
    series = {}
    for c in cuadros:
        for j in c['jugadores']:
            series.setdefault(j['id'], []).append((c['t'], j['x'], j['y']))
    n_suave = max(2, int(round(fps_real * 0.6)))
    filas = []
    for tid, s in series.items():
        s = np.array(s)
        t, x, y = s[:, 0], suavizar(s[:, 1], n_suave), suavizar(s[:, 2], n_suave)
        dur = t[-1] - t[0] if len(t) > 1 else 0
        if len(t) < 2:
            continue
        dt = np.diff(t)
        paso = np.hypot(np.diff(x), np.diff(y))
        vel = np.where(dt > 0, paso / np.maximum(dt, 1e-6), 0)
        validos = (vel <= VEL_MAX_REAL) & (dt < 1.0)
        dist = float(paso[validos].sum())
        v_ok = vel[validos]
        # sprints: tramos seguidos por encima del umbral durante al menos SPRINT_MIN_S
        sprints, corriendo, desde = 0, False, 0.0
        for k in range(len(vel)):
            rapido = validos[k] and vel[k] >= UMBRAL_SPRINT
            if rapido and not corriendo:
                corriendo, desde = True, t[k]
            elif not rapido and corriendo:
                corriendo = False
                if t[k] - desde >= SPRINT_MIN_S:
                    sprints += 1
        if corriendo and t[-1] - desde >= SPRINT_MIN_S:
            sprints += 1
        filas.append({
            'id': tid, 'equipo': equipos.get(tid, 'otros'), 'segundos': round(dur, 1),
            'distancia_m': round(dist, 1), 'm_por_min': round(dist / dur * 60, 1) if dur > 0 else 0,
            'vel_max_kmh': round(float(np.percentile(v_ok, 98)) * 3.6, 1) if len(v_ok) else 0,
            'vel_media_kmh': round(float(v_ok.mean()) * 3.6, 1) if len(v_ok) else 0,
            'sprints': sprints, 'x_media': round(float(x.mean()), 1), 'y_media': round(float(y.mean()), 1),
        })
    filas.sort(key=lambda r: (r['equipo'], -r['segundos']))
    return filas


def resumen(cuadros, filas, segundos_proceso, duracion_video):
    n = len(cuadros)
    por_eq = {'A': [], 'B': [], 'otros': []}
    equipos = {r['id']: r['equipo'] for r in filas}
    for c in cuadros:
        cuenta = {'A': 0, 'B': 0, 'otros': 0}
        for j in c['jugadores']:
            cuenta[equipos.get(j['id'], 'otros')] += 1
        for k in cuenta:
            por_eq[k].append(cuenta[k])
    con_pelota = sum(1 for c in cuadros if c['pelota'])
    largos = [r for r in filas if r['segundos'] >= TRACK_MIN_S]
    return {
        'cuadros_analizados': n,
        'segundos_de_video': round(duracion_video, 1),
        'minutos_de_proceso': round(segundos_proceso / 60, 1),
        'velocidad_proceso': f'{n / max(segundos_proceso, 1e-6):.1f} cuadros/s',
        'personas_por_cuadro': {k: round(float(np.mean(v)), 1) if v else 0 for k, v in por_eq.items()},
        'pelota_vista_pct': round(100 * con_pelota / max(n, 1), 1),
        'seguimientos_totales': len(filas),
        'seguimientos_de_3s_o_mas': len(largos),
        'distancia_total_m': {k: round(sum(r['distancia_m'] for r in filas if r['equipo'] == k), 0) for k in ('A', 'B')},
    }


# ── 5. SALIDAS ──────────────────────────────────────────────────────────────
def mapa_calor(puntos, ruta, titulo):
    radar = C.Radar(1000)
    acum = np.zeros((radar.h, radar.w), np.float32)
    for p in radar.px(puntos) if len(puntos) else []:
        if 0 <= p[0] < radar.w and 0 <= p[1] < radar.h:
            acum[p[1], p[0]] += 1
    acum = cv2.GaussianBlur(acum, (0, 0), radar.esc * 1.2)
    if acum.max() > 0:
        acum = acum / acum.max()
    color = cv2.applyColorMap((acum * 255).astype(np.uint8), cv2.COLORMAP_JET)
    lienzo = radar.lienzo()
    mezcla = np.where(acum[..., None] > 0.05, cv2.addWeighted(lienzo, 0.35, color, 0.65, 0), lienzo)
    for linea in C.lineas_cancha():
        cv2.polylines(mezcla, [radar.px(linea)], False, (235, 235, 235), 2, cv2.LINE_AA)
    cv2.putText(mezcla, titulo, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.imwrite(ruta, mezcla)


def video_resultado(ruta_video, cuadros, equipos, fps_real, salida):
    """Arriba el video con cajas; abajo el radar 2D."""
    radar = C.Radar(1280)
    alto = 720 + radar.h
    tmp = salida + '.tmp.mp4'
    vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), fps_real, (1280, alto))
    cap = cv2.VideoCapture(ruta_video)
    estela = {}
    for c in cuadros:
        cap.set(cv2.CAP_PROP_POS_FRAMES, c['frame'])
        ok, img = cap.read()
        if not ok:
            break
        lienzo = radar.lienzo()
        for j in c['jugadores']:
            col = COLORES_EQUIPO[equipos.get(j['id'], 'otros')]
            x1, y1, x2, y2 = j['caja']
            cv2.rectangle(img, (x1, y1), (x2, y2), col, 2)
            cv2.putText(img, str(j['id']), (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, col, 2)
            e = estela.setdefault(j['id'], [])
            e.append((j['x'], j['y']))
            del e[:-int(fps_real * 2)]
            if len(e) > 1:
                cv2.polylines(lienzo, [radar.px(e)], False, col, 1, cv2.LINE_AA)
            p = radar.px([(j['x'], j['y'])])[0]
            cv2.circle(lienzo, tuple(p), 11, col, -1, cv2.LINE_AA)
            cv2.putText(lienzo, str(j['id']), (p[0] - 8, p[1] + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)
        if c['pelota']:
            x1, y1, x2, y2 = c['pelota']['caja']
            cv2.rectangle(img, (x1 - 4, y1 - 4), (x2 + 4, y2 + 4), (0, 255, 255), 2)
            p = radar.px([(c['pelota']['x'], c['pelota']['y'])])[0]
            cv2.circle(lienzo, tuple(p), 6, (255, 255, 255), -1, cv2.LINE_AA)
        arriba = cv2.resize(img, (1280, 720))
        cv2.putText(arriba, f"{c['t']:.1f}s", (12, 34), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        vw.write(np.vstack([arriba, lienzo]))
    vw.release()
    cap.release()
    if shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-crf', '23', salida])
        os.remove(tmp)
    else:
        os.replace(tmp, salida)


def informe_html(carpeta, res, filas, args):
    def tabla(eq):
        rs = [r for r in filas if r['equipo'] == eq and r['segundos'] >= TRACK_MIN_S]
        if not rs:
            return '<p>Sin seguimientos largos.</p>'
        cab = ''.join(f'<th>{h}</th>' for h in ['ID', 'Seg. visto', 'Distancia (m)', 'm/min', 'Vel. máx (km/h)', 'Vel. media (km/h)', 'Sprints'])
        cuerpo = ''.join(
            f"<tr><td>{r['id']}</td><td>{r['segundos']}</td><td>{r['distancia_m']}</td><td>{r['m_por_min']}</td>"
            f"<td>{r['vel_max_kmh']}</td><td>{r['vel_media_kmh']}</td><td>{r['sprints']}</td></tr>" for r in rs)
        return f'<table><tr>{cab}</tr>{cuerpo}</table>'
    ppc = res['personas_por_cuadro']
    html = f"""<!doctype html><html lang="es"><meta charset="utf-8"><title>Analizador · {os.path.basename(carpeta)}</title>
<style>body{{background:#0b0b0b;color:#eee;font-family:system-ui,sans-serif;max-width:1300px;margin:auto;padding:24px}}
h1{{color:#00ff88}} h2{{margin-top:32px}} .kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}}
.k{{background:#151515;border:1px solid #2a2a2a;border-radius:10px;padding:14px}} .k b{{font:700 1.6rem 'JetBrains Mono',monospace;color:#00ff88;display:block}}
table{{border-collapse:collapse;width:100%;font-size:.9rem}} td,th{{border-bottom:1px solid #2a2a2a;padding:6px;text-align:right}} th{{color:#999}}
td:first-child,th:first-child{{text-align:left}} img,video{{max-width:100%;border-radius:10px;border:1px solid #2a2a2a}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px}} .nota{{color:#aaa;font-size:.9rem}}</style>
<h1>Prueba de análisis por IA</h1>
<p class="nota">Video: {args.video} · desde el segundo {args.desde} · {res['segundos_de_video']} s analizados · modelo RF-DETR {args.modelo} · {args.fps} cuadros/s</p>
<div class="kpis">
<div class="k"><b>{ppc['A']} / {ppc['B']}</b>Jugadores detectados por cuadro (equipo A / B). Lo ideal: 5 / 5</div>
<div class="k"><b>{ppc['otros']}</b>Otros por cuadro (árbitros, arqueros de otro color)</div>
<div class="k"><b>{res['pelota_vista_pct']}%</b>Cuadros con la pelota detectada</div>
<div class="k"><b>{res['seguimientos_de_3s_o_mas']}</b>Seguimientos de 3 s o más (de {res['seguimientos_totales']}). Lo ideal: ~12</div>
<div class="k"><b>{res['minutos_de_proceso']} min</b>Tiempo de proceso ({res['velocidad_proceso']})</div>
</div>
<h2>Video con el radar</h2><video src="resultado.mp4" controls muted></video>
<h2>Mapas de calor</h2><div class="grid"><img src="calor_A.png"><img src="calor_B.png"><img src="calor_pelota.png"></div>
<h2>Equipo A (verde)</h2>{tabla('A')}<h2>Equipo B (rojo)</h2>{tabla('B')}<h2>Otros (gris)</h2>{tabla('otros')}
<p class="nota">Cada ID es un seguimiento, no un jugador: cuando dos se cruzan o alguien queda tapado, el seguimiento se corta y
sigue con otro número. En la versión final esos tramos se unen con los cambios de la toma en vivo y una revisión corta.</p>
</html>"""
    open(os.path.join(carpeta, 'informe.html'), 'w', encoding='utf-8').write(html)


# ── PRINCIPAL ───────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='VirtualClub · prueba de análisis de video')
    ap.add_argument('--video', required=True, help='Link de YouTube/Vimeo/Drive o archivo .mp4')
    ap.add_argument('--desde', type=float, default=0, help='Segundo del video donde empezar')
    ap.add_argument('--duracion', type=float, default=300, help='Segundos a analizar (0 = todo)')
    ap.add_argument('--salida', default='resultados/prueba', help='Carpeta de resultados')
    ap.add_argument('--calib', help='calibracion.json ya hecho (para no marcar de nuevo)')
    ap.add_argument('--fps', type=float, default=10, help='Cuadros por segundo a analizar (10 alcanza; 25 para la pelota)')
    ap.add_argument('--modelo', choices=['nano', 'small', 'medium'], default='medium')
    ap.add_argument('--lote', type=int, default=0, help='Cuadros por tanda (0 = automático)')
    ap.add_argument('--no-abrir', action='store_true', help='No abrir el informe al terminar')
    args = ap.parse_args()

    os.makedirs(args.salida, exist_ok=True)
    ruta, desde = conseguir_video(args.video, args.desde, args.duracion, args.salida)
    duracion = args.duracion

    ruta_calib = os.path.join(args.salida, 'calibracion.json')
    if args.calib:
        calib = json.load(open(args.calib))
        shutil.copy(args.calib, ruta_calib) if os.path.abspath(args.calib) != os.path.abspath(ruta_calib) else None
    elif os.path.exists(ruta_calib):
        log('Uso la calibración guardada:', ruta_calib, '(borrala para marcar de nuevo)')
        calib = json.load(open(ruta_calib))
    else:
        log('Calibración: marcá los puntos de la cancha en la ventana que se abre.')
        calib = C.calibrar_interactivo(leer_cuadro(ruta, desde + 1), ruta_calib)
    H = C.homografia(calib)
    cv2.imwrite(os.path.join(args.salida, 'calibracion.jpg'), C.dibujar_sobre_video(leer_cuadro(ruta, desde + 1), H))

    import torch
    lote = args.lote or (8 if torch.cuda.is_available() else 1)
    cuadros, colores, fps_real, seg = procesar(ruta, desde, duracion, H, args.fps, lote, args.modelo)
    if not cuadros:
        sys.exit('No se analizó ningún cuadro.')
    equipos = separar_equipos(colores)
    filas = metricas(cuadros, equipos, fps_real)
    res = resumen(cuadros, filas, seg, cuadros[-1]['t'] - cuadros[0]['t'])
    log(json.dumps(res, ensure_ascii=False, indent=1))

    log('Armando el video y los mapas …')
    for eq in ('A', 'B'):
        pts = [(j['x'], j['y']) for c in cuadros for j in c['jugadores'] if equipos.get(j['id']) == eq]
        C_titulo = 'Equipo A (verde)' if eq == 'A' else 'Equipo B (rojo)'
        mapa_calor(np.array(pts), os.path.join(args.salida, f'calor_{eq}.png'), C_titulo)
    mapa_calor(np.array([(c['pelota']['x'], c['pelota']['y']) for c in cuadros if c['pelota']]),
               os.path.join(args.salida, 'calor_pelota.png'), 'Pelota')
    video_resultado(ruta, cuadros, equipos, fps_real, os.path.join(args.salida, 'resultado.mp4'))

    with open(os.path.join(args.salida, 'jugadores.csv'), 'w', encoding='utf-8') as fh:
        cols = list(filas[0].keys()) if filas else []
        fh.write(','.join(cols) + '\n')
        for r in filas:
            fh.write(','.join(str(r[c]) for c in cols) + '\n')
    json.dump({'resumen': res, 'equipos': {str(k): v for k, v in equipos.items()}, 'cuadros': cuadros},
              open(os.path.join(args.salida, 'datos.json'), 'w'))
    informe_html(args.salida, res, filas, args)
    ruta_inf = os.path.abspath(os.path.join(args.salida, 'informe.html'))
    log('Listo:', ruta_inf)
    if not args.no_abrir:
        webbrowser.open('file://' + ruta_inf)


if __name__ == '__main__':
    main()
