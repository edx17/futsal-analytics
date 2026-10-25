"""LA MÚSICA DE LAS CINEMÁTICAS (síntesis propia, sin samples ni licencias)

Una pieza épica por variante, compuesta a partir de los cuadros de cada guion
(escena_pasillo.py / escena_pabellon.py) para que los golpes caigan donde pasa
algo en el video: el sobre que se rompe, las luces que se prenden, el clímax y
el destello final. Cada pieza dura lo que el video más una cola de ~3,5 s que
acompaña la aparición de la mejor carta.

Todo se sintetiza con numpy/scipy:
  - cuerdas y metales: sierras sin aliasing (PolyBLEP), desafinadas y filtradas
    con un filtro que se abre en el tiempo ("braams");
  - coro: sierras por filtros de formantes ("ah"/"oh");
  - percusión: taikos y timbales (seno con caída de tono + ruido), platos al revés;
  - subidas (risers), impactos con sub-grave y campanas FM;
  - la hinchada del final (festejo): voces que gritan, el rumor de la tribuna,
    aplausos y silbidos, que entran con el clímax y crecen con la mejor carta;
  - reverb por convolución con una respuesta sintética, y un master suave.

Uso:  python3 cine/musica.py [variante ...]   (sin argumentos: todas)
Sale: public/cine/musica/<variante>.m4a (AAC 160 kb/s, estéreo, 48 kHz).
"""
import os
import subprocess
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
COLA = 3.5
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, '..', 'public', 'cine', 'musica')
rng = np.random.default_rng(7)


# ── utilidades ──────────────────────────────────────────────────────────────

# Para reusar una pieza en otra tonalidad (y en menor): ver `en_tono`.
_TONO = {'semitonos': 0, 'menor': False}


def nota(n):
    """'A2', 'C#3', 'Bb1'… → Hz (con la transposición de `en_tono`, si hay)."""
    nombres = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    semi = nombres[n[0]]
    resto = n[1:]
    if resto[0] == '#':
        semi += 1; resto = resto[1:]
        # La mayor → La menor: el do#, fa# y sol# bajan medio tono.
        if _TONO['menor'] and n[0] in 'CFG':
            semi -= 1
    elif resto[0] == 'b':
        semi -= 1; resto = resto[1:]
    midi = 12 * (int(resto) + 1) + semi + _TONO['semitonos']
    return 440.0 * 2 ** ((midi - 69) / 12)


class en_tono:
    """with en_tono(-5, menor=True): pieza() → la misma pieza, en otra tonalidad."""

    def __init__(self, semitonos=0, menor=False):
        self.nuevo = {'semitonos': semitonos, 'menor': menor}

    def __enter__(self):
        self.antes = dict(_TONO); _TONO.update(self.nuevo)

    def __exit__(self, *a):
        _TONO.update(self.antes)


def acorde(*ns):
    return [nota(n) for n in ns]


def muestras(seg):
    return int(round(seg * SR))


def envolvente(n, ataque=0.01, caida=0.3, sostener=1.0, soltar=0.2, curva=3.0):
    """ADSR exponencial sobre n muestras (el 'soltar' ocupa el final)."""
    t = np.arange(n) / SR
    dur = n / SR
    e = np.ones(n) * sostener
    a = t < ataque
    e[a] = (t[a] / max(ataque, 1e-6)) ** 0.8
    d = (t >= ataque) & (t < ataque + caida)
    e[d] = sostener + (1 - sostener) * np.exp(-curva * (t[d] - ataque) / max(caida, 1e-6))
    r = t > dur - soltar
    if soltar > 0:
        e[r] *= np.clip((dur - t[r]) / soltar, 0, 1) ** 1.5
    return e


def poly_blep(fase, dt):
    out = np.zeros_like(fase)
    a = fase < dt
    x = fase[a] / dt[a]
    out[a] = x + x - x * x - 1.0
    b = fase > 1.0 - dt
    x = (fase[b] - 1.0) / dt[b]
    out[b] = x * x + x + x + 1.0
    return out


def sierra(frec, n, fase0=None):
    """Sierra sin aliasing; frec puede ser un número o un array (glissando)."""
    f = np.broadcast_to(np.asarray(frec, dtype=float), (n,))
    dt = f / SR
    fase = (np.cumsum(dt) + (rng.random() if fase0 is None else fase0)) % 1.0
    return 2.0 * fase - 1.0 - poly_blep(fase, dt)


def seno(frec, n):
    f = np.broadcast_to(np.asarray(frec, dtype=float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def ruido(n):
    return rng.standard_normal(n)


def pasabajos(x, corte, orden=2):
    sos = signal.butter(orden, min(corte, SR * 0.45), 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def pasaaltos(x, corte, orden=2):
    sos = signal.butter(orden, corte, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def pasabanda(x, centro, q=4.0):
    b, a = signal.iirpeak(min(centro, SR * 0.45), q, fs=SR)
    return signal.lfilter(b, a, x)


def filtro_variable(x, cortes, bloque=256):
    """Pasabajos resonante cuyo corte sigue la curva `cortes` (una por muestra)."""
    y = np.zeros_like(x)
    zi = np.zeros((1, 2))
    for i in range(0, len(x), bloque):
        c = float(np.clip(cortes[min(i, len(cortes) - 1)], 40, SR * 0.45))
        sos = signal.butter(2, c, 'low', fs=SR, output='sos')
        y[i:i + bloque], zi = signal.sosfilt(sos, x[i:i + bloque], zi=zi)
    return y


def rampa(n, puntos):
    """Curva por tramos: puntos = [(fracción 0-1, valor), …] (interpolación exponencial)."""
    xs = np.array([p[0] for p in puntos]) * (n - 1)
    ys = np.log(np.array([p[1] for p in puntos], dtype=float))
    return np.exp(np.interp(np.arange(n), xs, ys))


class Pista:
    """Un lienzo estéreo donde se suman los instrumentos en su segundo."""

    def __init__(self, dur):
        self.n = muestras(dur)
        self.seco = np.zeros((2, self.n))
        self.envio = np.zeros((2, self.n))   # a la reverb

    def poner(self, seg, mono, vol=1.0, pan=0.0, reverb=0.3, ancho=0.0):
        i = muestras(seg)
        if i >= self.n:
            return
        x = mono[: self.n - i] * vol
        izq = x * np.sqrt((1 - pan) / 2)
        der = x * np.sqrt((1 + pan) / 2)
        if ancho:
            # un poco de Haas para abrir el estéreo
            d = muestras(0.012 * ancho)
            der = np.concatenate([np.zeros(d), der[: len(der) - d]]) if d else der
        self.seco[0, i:i + len(x)] += izq * (1 - reverb * 0.4)
        self.seco[1, i:i + len(x)] += der * (1 - reverb * 0.4)
        self.envio[0, i:i + len(x)] += izq * reverb
        self.envio[1, i:i + len(x)] += der * reverb

    def mezclar(self, sala=2.6, brillo=6000, dinamica=None):
        """Reverb + master. `dinamica` = [(segundo, dB), …]: la forma de la pieza
        (la construcción más baja, el clímax arriba de todo)."""
        ir_n = muestras(sala)
        t = np.arange(ir_n) / SR
        caida = np.exp(-6.9 * t / sala)
        mojado = np.zeros_like(self.envio)
        for c in range(2):
            ir = pasabajos(ruido(ir_n), brillo) * caida
            ir[: muestras(0.012)] *= np.linspace(0, 1, muestras(0.012))
            ir /= np.sqrt(np.sum(ir ** 2))
            mojado[c] = signal.fftconvolve(self.envio[c], ir)[: self.n]
        mezcla = self.seco + mojado * 0.9
        if dinamica:
            t = np.arange(self.n) / SR
            mezcla *= 10 ** (np.interp(t, [d[0] for d in dinamica], [d[1] for d in dinamica]) / 20)
        mezcla = np.stack([pasaaltos(m, 28) for m in mezcla])
        # master: un poco de saturación suave y normalización a -1 dBFS
        pico = np.max(np.abs(mezcla)) + 1e-9
        mezcla = np.tanh(1.6 * mezcla / pico) / np.tanh(1.6)
        mezcla *= 10 ** (-1 / 20) / (np.max(np.abs(mezcla)) + 1e-9)
        # fundido final
        f = muestras(0.8)
        mezcla[:, -f:] *= np.linspace(1, 0, f) ** 2
        return mezcla


# ── instrumentos ────────────────────────────────────────────────────────────

def cuerdas(frecs, dur, ataque=0.3, soltar=0.6, brillo=2400, vibrato=True):
    """Sección de cuerdas: varias sierras desafinadas por nota."""
    n = muestras(dur)
    x = np.zeros(n)
    t = np.arange(n) / SR
    for f in frecs:
        for d in (-0.08, -0.03, 0.03, 0.08):
            fv = f * 2 ** (d / 12)
            if vibrato:
                fv = fv * (1 + 0.004 * np.sin(2 * np.pi * (5.2 + rng.random()) * t) * np.clip(t / 0.6, 0, 1))
            x += sierra(fv, n)
    x = pasabajos(x, brillo, 2)
    return x * envolvente(n, ataque, 0.1, 1.0, soltar) / (len(frecs) * 4)


def ostinato(frecs, pasos, tempo, dur, brillo=3000, staccato=0.6):
    """Cuerdas en semicorcheas (el pulso de la acción). `pasos` indexa `frecs`."""
    n = muestras(dur)
    x = np.zeros(n)
    paso = 60 / tempo / 4
    largo = muestras(paso * staccato)
    k = 0
    i = 0
    while i < n:
        f = frecs[pasos[k % len(pasos)]]
        m = min(largo, n - i)
        v = (sierra(f, m) + sierra(f * 1.004, m) + 0.5 * sierra(f * 2, m)) * envolvente(m, 0.004, 0.08, 0.5, 0.03)
        acento = 1.0 if k % 4 == 0 else 0.72
        x[i:i + m] += v * acento
        k += 1
        i += muestras(paso)
    return pasabajos(x, brillo, 2) * 0.4


def braam(frecs, dur, abre=0.35, pico=2600, distorsion=2.5):
    """Metales graves enormes: el filtro se abre de golpe y se cierra despacio."""
    n = muestras(dur)
    x = np.zeros(n)
    for f in frecs:
        for d in (-0.12, 0.0, 0.12):
            x += sierra(f * 2 ** (d / 12), n)
        x += 0.6 * sierra(f / 2, n)
    cortes = rampa(n, [(0, 120), (min(abre / dur, 0.5), pico), (1, 180)])
    x = filtro_variable(x, cortes)
    x = np.tanh(distorsion * x / (len(frecs) * 3))
    return x * envolvente(n, 0.06, dur * 0.6, 0.35, dur * 0.35)


def metales(frecs, dur, ataque=0.08, brillo=3200):
    """Fanfarria / coral de metales (menos distorsión que el braam)."""
    n = muestras(dur)
    x = np.zeros(n)
    for f in frecs:
        x += sierra(f, n) + sierra(f * 1.003, n) + 0.4 * sierra(f * 0.997, n)
    cortes = rampa(n, [(0, 400), (min(0.25 / dur, 0.5), brillo), (1, brillo * 0.5)])
    x = filtro_variable(x, cortes)
    return np.tanh(1.4 * x / (len(frecs) * 2.4)) * envolvente(n, ataque, 0.3, 0.75, min(0.6, dur * 0.4))


FORMANTES = {'ah': ((800, 1.0), (1150, 0.5), (2900, 0.25)), 'oh': ((450, 1.0), (800, 0.45), (2830, 0.12)),
             'oo': ((325, 1.0), (700, 0.3), (2530, 0.08))}


def coro(frecs, dur, vocal='ah', ataque=0.8, soltar=1.2):
    n = muestras(dur)
    t = np.arange(n) / SR
    fuente = np.zeros(n)
    for f in frecs:
        for d in (-0.1, -0.04, 0.04, 0.1):
            vib = 1 + 0.006 * np.sin(2 * np.pi * (4.6 + rng.random()) * t + rng.random() * 6)
            fuente += sierra(f * 2 ** (d / 12) * vib, n)
    x = sum(g * pasabanda(fuente, fc, 5.0) for fc, g in FORMANTES[vocal])
    x = x + 0.03 * pasaaltos(ruido(n), 4000) * np.abs(fuente).mean()  # aire
    x /= (len(frecs) * 4)
    return x * envolvente(n, ataque, 0.2, 1.0, soltar)


def taiko(tono=70, vol=1.0, largo=0.9):
    n = muestras(largo)
    t = np.arange(n) / SR
    f = tono + tono * 1.6 * np.exp(-t * 28)
    cuerpo = seno(f, n) * np.exp(-t * 5.5)
    golpe = pasabajos(ruido(n), 1800) * np.exp(-t * 45) * 0.6
    return np.tanh(1.8 * (cuerpo + golpe)) * vol


def timbal(frec, vol=1.0, largo=1.6):
    n = muestras(largo)
    t = np.arange(n) / SR
    x = (seno(frec * (1 + 0.08 * np.exp(-t * 20)), n) + 0.5 * seno(frec * 1.5, n) * np.exp(-t * 3)
         + 0.25 * seno(frec * 1.99, n) * np.exp(-t * 4))
    x *= np.exp(-t * 2.4)
    x += pasabajos(ruido(n), 900) * np.exp(-t * 30) * 0.5
    return x * vol * 0.8


def caja_marcial(vol=1.0):
    n = muestras(0.35)
    t = np.arange(n) / SR
    x = pasabanda(ruido(n), 2200, 1.2) * np.exp(-t * 18) + seno(190 * (1 + 0.3 * np.exp(-t * 40)), n) * np.exp(-t * 25) * 0.6
    return x * vol


def impacto(vol=1.0, sub=42, largo=3.2):
    """Golpe de tráiler: sub-grave que cae, explosión de ruido y cola."""
    n = muestras(largo)
    t = np.arange(n) / SR
    s = seno(sub * (1 + 1.5 * np.exp(-t * 9)), n) * np.exp(-t * 1.3)
    r = pasabajos(ruido(n), 5000) * np.exp(-t * 7) * 0.7
    cuerpo = taiko(55, 1.0, largo)
    return np.tanh(2.0 * (s + r + 0.6 * cuerpo)) * vol


def plato_reves(dur):
    n = muestras(dur)
    t = np.arange(n) / SR
    x = pasaaltos(ruido(n), 3500) * (t / dur) ** 3
    return x * 0.5


def subida(dur, f0=200, f1=2400):
    """Riser: ruido en barrido + tono que sube, crece hasta cortarse."""
    n = muestras(dur)
    t = np.arange(n) / SR
    k = t / dur
    barrido = f0 * (f1 / f0) ** k
    x = filtro_variable(ruido(n), barrido * 2.5) * 0.5
    x += 0.35 * sierra(barrido * 0.5, n) * k
    x = pasaaltos(x, 120)
    return x * k ** 2.2


def campana(f, vol=1.0, largo=2.8):
    """Campana / celesta FM."""
    n = muestras(largo)
    t = np.arange(n) / SR
    indice = 3.0 * np.exp(-t * 3)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * indice
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.6)
    x += 0.3 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 3)
    return x * vol * 0.5


def latido(vol=1.0):
    n = muestras(0.5)
    t = np.arange(n) / SR
    a = seno(55 * (1 + 0.6 * np.exp(-t * 30)), n) * np.exp(-t * 14)
    return a * vol


def dron(f, dur, brillo=500):
    n = muestras(dur)
    x = sierra(f, n) + sierra(f * 1.002, n) + sierra(f / 2, n)
    x = pasabajos(x, brillo, 2)
    t = np.arange(n) / SR
    x *= 1 + 0.15 * np.sin(2 * np.pi * 0.35 * t)
    return x * envolvente(n, min(1.2, dur * 0.3), 0.1, 1.0, min(1.0, dur * 0.3)) * 0.3


def brillo_agudo(frecs, dur):
    """Destello agudo (shimmer): senos altos con trémolo, para la luz."""
    n = muestras(dur)
    t = np.arange(n) / SR
    x = sum(seno(f, n) * (0.6 + 0.4 * np.sin(2 * np.pi * (6 + i) * t)) for i, f in enumerate(frecs))
    return x * envolvente(n, dur * 0.4, 0.1, 1.0, dur * 0.5) / len(frecs) * 0.5


# ── las piezas ──────────────────────────────────────────────────────────────

# ── la hinchada (el festejo del final) ──────────────────────────────────────

def _suave(n, corte):
    """Una curva lenta al azar, de desvío 1 (para temblores y oleadas)."""
    x = pasabajos(ruido(n), corte)
    return x / (np.std(x) + 1e-9)


def grito(dur, f0, vocal='ah', ataque=0.25):
    """Una voz de la tribuna: un "¡aaah!" que sube, se sostiene y tiembla, con aire."""
    n = muestras(dur)
    t = np.arange(n) / SR
    sube = 0.78 + 0.3 * (1 - np.exp(-t / rng.uniform(0.15, 0.35)))
    cae = 1 - rng.uniform(0.03, 0.1) * t / dur
    temblor = 1 + 0.012 * np.sin(2 * np.pi * rng.uniform(4.5, 7) * t + rng.random() * 6) + 0.01 * _suave(n, 6)
    fuente = sierra(f0 * sube * cae * temblor, n)
    voz = sum(g * pasabanda(fuente, fc * rng.uniform(0.9, 1.12), 4.0) for fc, g in FORMANTES[vocal])
    voz /= np.std(voz) + 1e-9
    aire = pasabanda(ruido(n), rng.uniform(1200, 2600), 1.2)
    voz += 0.35 * aire / (np.std(aire) + 1e-9)
    oleada = np.clip(1 + 0.25 * _suave(n, 3), 0.3, 2)
    return voz * oleada * envolvente(n, ataque, 0.4, rng.uniform(0.55, 0.8), soltar=dur * 0.45)


def aplausos(dur, por_segundo=160, crece=0.8):
    """Palmas: golpecitos de ruido al azar, cada vez más seguidos."""
    n = muestras(dur)
    x = np.zeros(n)
    largo = muestras(0.014)
    caida = np.exp(-np.arange(largo) / (largo / 4))
    t = 0.0
    while t < dur:
        i = muestras(t)
        golpe = pasabanda(ruido(largo), rng.uniform(900, 2600), 1.5) * caida * rng.uniform(0.4, 1.0)
        x[i:i + largo] += golpe[: n - i]
        t += rng.exponential(1 / (por_segundo * min(1.0, crece + t / dur)))
    return x / (np.std(x) + 1e-9) * envolvente(n, 0.3, 0.2, 1.0, soltar=dur * 0.4)


def silbido(dur=0.7):
    """Un silbido con los dedos: sube, se sostiene y cae."""
    n = muestras(dur)
    f = rampa(n, [(0, 2300), (0.25, 3200), (0.8, 3100), (1, 2500)]) * (1 + 0.004 * _suave(n, 20))
    x = seno(f, n) + 0.08 * pasabanda(ruido(n), 3000, 3)
    return x * envolvente(n, 0.05, 0.1, 0.8, soltar=0.25)


def festejo(p, s, fuerza=1.0, voces=36):
    """La hinchada, desde el segundo `s` hasta el final de la pieza: el grito de
    gol (graves y agudos, cada uno a su tiempo y en su lugar), el rumor de la
    tribuna, aplausos y un par de silbidos."""
    dur = p.n / SR - s
    for _ in range(voces):
        f0 = rng.uniform(105, 190) if rng.random() < 0.6 else rng.uniform(210, 360)
        tarde = rng.uniform(0, 0.35)
        p.poner(s + tarde, grito(dur - tarde, f0, rng.choice(['ah', 'ah', 'oh']), rng.uniform(0.12, 0.4)),
                0.05 * fuerza, pan=rng.uniform(-0.9, 0.9), reverb=0.55)
    n = muestras(dur)
    rumor = pasaaltos(pasabajos(ruido(n), 2800), 260)
    rumor *= np.clip(1 + 0.3 * _suave(n, 2), 0.3, 2) / (np.std(rumor) + 1e-9)
    p.poner(s, rumor * envolvente(n, 0.35, 0.5, 0.7, soltar=dur * 0.5), 0.09 * fuerza, reverb=0.6, ancho=1.5)
    for pan in (-0.7, -0.25, 0.25, 0.7):
        p.poner(s + 0.35 + rng.uniform(0, 0.3), aplausos(dur - 0.6), 0.05 * fuerza, pan=pan, reverb=0.5)
    for tarde, pan in ((0.7, -0.5), (1.8, 0.6)):
        if tarde < dur - 0.8:
            p.poner(s + tarde, silbido(), 0.05 * fuerza, pan=pan, reverb=0.5)


def pieza_vdraft():
    """V-Draft (6,5 s): el sobre se carga, el portal, la caminata por el pasillo
    violeta (taikos + cuerdas), el coro solemne y el golpe final. Re menor."""
    dur = 6.5
    p = Pista(dur + COLA)
    p.poner(0.0, dron(nota('D2'), 6.3, 380), 0.9, reverb=0.3)
    for s in (0.15, 0.85):                                       # latidos mientras carga
        p.poner(s, latido(), 0.9, reverb=0.15); p.poner(s + 0.22, latido(), 0.6, reverb=0.15)
    p.poner(0.2, subida(1.3, 300, 3000), 0.5, reverb=0.4, ancho=1)
    p.poner(1.5, braam(acorde('D2', 'A2', 'F3'), 2.2, abre=0.25), 0.85, reverb=0.45)   # el portal
    p.poner(1.5, impacto(0.8, 40, 2.0), 0.8, reverb=0.4)
    tempo = 112
    negra = 60 / tempo
    p.poner(2.1, ostinato(acorde('D3', 'A3', 'F3', 'C4', 'Bb3'), [0, 0, 1, 0, 2, 0, 3, 0, 0, 0, 1, 0, 4, 0, 2, 1], tempo, 3.4), 0.6, pan=-0.2, reverb=0.3)
    for k in range(int(3.2 / (negra / 2))):                      # taikos en corcheas
        s = 2.1 + k * negra / 2
        fuerte = k % 4 == 0
        p.poner(s, taiko(68 if fuerte else 82, 1.0 if fuerte else 0.55), 0.9, pan=0.15 * ((k % 2) * 2 - 1), reverb=0.35)
    p.poner(2.1, cuerdas(acorde('D3', 'A3', 'D4'), 3.3, ataque=1.2), 0.55, reverb=0.5)
    p.poner(4.3, subida(1.8), 0.55, reverb=0.4, ancho=1)
    p.poner(4.8, plato_reves(1.3), 0.6, reverb=0.3, ancho=1)
    p.poner(5.3, coro(acorde('D4', 'F4', 'A4', 'D5'), 1.0, 'ah', ataque=0.5, soltar=0.3), 0.7, reverb=0.6)
    p.poner(6.1, impacto(1.0, 38, 3.4), 1.0, reverb=0.45)                               # el golpe
    p.poner(6.1, braam(acorde('Bb1', 'F2', 'D3'), 3.6, abre=0.15, pico=3200), 0.9, reverb=0.5)
    p.poner(6.1, coro(acorde('D4', 'F4', 'A4', 'D5', 'F5'), 3.6, 'ah', ataque=0.05, soltar=2.0), 0.6, reverb=0.7)
    p.poner(6.1, cuerdas(acorde('D4', 'F4', 'A4', 'D5'), 3.6, ataque=0.05, soltar=2.2, brillo=3600), 0.5, reverb=0.6)
    festejo(p, 6.1)                                                     # la hinchada
    return p.mezclar(2.8, dinamica=[(0, -8), (6.0, -5), (6.1, 0)])


def pieza_elite():
    """Élite (7 s): velocidad. Mi menor, 140 BPM, semicorcheas desde que se rompe
    el sobre, golpes con la ola de luz y un clímax de metales."""
    dur = 7.0
    p = Pista(dur + COLA)
    tempo = 140
    negra = 60 / tempo
    p.poner(0.0, subida(1.2, 400, 4000), 0.5, reverb=0.3, ancho=1)
    p.poner(0.0, dron(nota('E2'), 1.4, 600), 0.6)
    p.poner(1.2, impacto(0.85, 44, 1.6), 0.85, reverb=0.35)                              # se rompe el sobre
    em = acorde('E3', 'B3', 'G3', 'D4', 'C4', 'F#3')
    p.poner(1.2, ostinato(em, [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 3, 4, 1, 2], tempo, 5.0, brillo=3600), 0.75, pan=-0.25, reverb=0.25)
    p.poner(1.2, ostinato([e * 2 for e in em], [0, 1, 2, 1, 3, 1, 2, 1], tempo, 5.0, brillo=4200, staccato=0.4), 0.35, pan=0.3, reverb=0.3)
    k = 0
    s = 1.2
    while s < 6.1:                                               # bombo-taiko en corcheas, cajas en 2 y 4
        p.poner(s, taiko(72 if k % 2 == 0 else 90, 0.95 if k % 2 == 0 else 0.5), 0.85, reverb=0.25)
        if k % 4 == 2:
            p.poner(s, caja_marcial(0.7), 0.6, pan=0.2, reverb=0.35)
        k += 1
        s += negra / 2
    for j in range(7):                                           # la ola de filas de luz
        p.poner(2.8 + j * 0.2, campana(nota('E5') * 2 ** ([0, 3, 7, 10, 12, 15, 19][j] / 12), 0.6, 1.4), 0.5, pan=-0.6 + j * 0.2, reverb=0.5)
    p.poner(3.07, braam(acorde('E2', 'B2', 'G3'), 1.8), 0.85, reverb=0.4)               # los focos
    p.poner(3.07, cuerdas(acorde('E3', 'B3', 'E4', 'G4'), 3.1, ataque=0.6, brillo=3000), 0.45, reverb=0.45)
    p.poner(4.6, subida(1.6, 250, 5000), 0.7, reverb=0.3, ancho=1)
    p.poner(5.2, plato_reves(1.0), 0.6, ancho=1)
    for j, s in enumerate((5.55, 5.7, 5.85, 5.95, 6.05)):        # redoble antes del clímax
        p.poner(s, taiko(80 + j * 6, 0.8), 0.9, reverb=0.2)
    p.poner(6.2, impacto(1.0, 40, 3.6), 1.0, reverb=0.45)                               # clímax
    p.poner(6.2, metales(acorde('C3', 'G3', 'E4'), 0.35), 0.8, reverb=0.4)
    p.poner(6.53, metales(acorde('E3', 'B3', 'G#4', 'E4'), 3.8, ataque=0.03, brillo=3800), 0.85, reverb=0.5)
    p.poner(6.53, braam(acorde('E1', 'B1', 'E2'), 3.8, abre=0.12, pico=2000), 0.8, reverb=0.5)
    p.poner(6.53, brillo_agudo(acorde('E6', 'B6', 'G#6'), 3.6), 0.5, reverb=0.7, ancho=1)
    festejo(p, 6.2)                                                     # la hinchada
    return p.mezclar(2.4, dinamica=[(0, -7), (6.1, -4), (6.2, 0)])


def pieza_epico():
    """Épico (7 s): misterio. Do# frigio, coro oscuro, campanas en tonos enteros,
    el portal (plato al revés + braam), los haces y la convergencia."""
    dur = 7.0
    p = Pista(dur + COLA)
    p.poner(0.0, coro(acorde('C#3', 'G#3', 'C#4'), 3.4, 'oo', ataque=1.0, soltar=0.6), 0.6, reverb=0.7)
    p.poner(0.0, dron(nota('C#2'), 3.4, 320), 0.8, reverb=0.3)
    p.poner(1.4, timbal(nota('C#2'), 0.9), 0.9, reverb=0.5)                              # se rompe el sobre
    for j, n in enumerate(('C#5', 'D#5', 'F5', 'G5', 'A5', 'B5')):                       # tonos enteros: el misterio
        p.poner(1.6 + j * 0.24, campana(nota(n), 0.55, 2.2), 0.55, pan=-0.5 + j * 0.2, reverb=0.7)
    p.poner(2.0, plato_reves(1.2), 0.6, reverb=0.5, ancho=1)
    p.poner(2.2, subida(1.0, 150, 3000), 0.4, reverb=0.5, ancho=1)
    p.poner(3.2, braam(acorde('C#2', 'G#2', 'D3'), 2.4, abre=0.3, pico=2200), 0.9, reverb=0.5)   # el portal
    p.poner(3.2, impacto(0.8, 40, 2.4), 0.8, reverb=0.5)
    p.poner(3.2, coro(acorde('C#4', 'E4', 'G#4', 'D5'), 2.9, 'ah', ataque=0.4, soltar=0.6), 0.6, reverb=0.7)
    tempo = 100
    negra = 60 / tempo
    for k in range(6):                                            # pulso lento de timbales
        p.poner(3.93 + k * negra / 2, timbal(nota('C#2') * (1.5 if k % 3 == 2 else 1), 0.7 if k % 2 else 0.9), 0.8, reverb=0.45)
    p.poner(3.93, ostinato(acorde('C#3', 'D3', 'G#3', 'E3'), [0, 1, 0, 2, 0, 1, 3, 1], tempo * 1.5, 2.3, brillo=2200), 0.5, reverb=0.4)
    p.poner(5.0, brillo_agudo(acorde('G#5', 'C#6', 'D6'), 1.4), 0.6, reverb=0.6, ancho=1)   # se prende el pabellón
    p.poner(5.0, subida(1.27, 200, 4500), 0.65, reverb=0.4, ancho=1)
    p.poner(6.27, impacto(1.0, 37, 3.6), 1.0, reverb=0.5)                                    # convergencia
    p.poner(6.27, braam(acorde('A1', 'E2', 'C#3'), 4.0, abre=0.15, pico=2800), 0.9, reverb=0.55)
    p.poner(6.27, coro(acorde('C#4', 'E4', 'A4', 'C#5', 'E5'), 4.0, 'ah', ataque=0.06, soltar=2.4), 0.7, reverb=0.75)
    p.poner(6.6, campana(nota('C#6'), 0.6, 3.0), 0.5, reverb=0.8)
    festejo(p, 6.27)                                                     # la hinchada
    return p.mezclar(3.2, 5000, dinamica=[(0, -7), (6.2, -4), (6.27, 0)])


def pieza_leyenda():
    """Leyenda (8 s): solemne, lenta. Si bemol, casi silencio; cada sector que se
    enciende es un timbal + un acorde de metales que sube, y el final es un coral
    completo de metales y coro."""
    dur = 8.0
    p = Pista(dur + COLA)
    p.poner(0.0, dron(nota('Bb1'), 6.6, 260), 0.8, reverb=0.4)
    p.poner(0.3, coro(acorde('Bb3', 'F4'), 1.9, 'oo', ataque=1.2, soltar=0.5), 0.35, reverb=0.8)
    p.poner(2.13, timbal(nota('Bb1'), 0.7), 0.8, reverb=0.6)                             # se rompe el sobre
    p.poner(2.13, campana(nota('F5'), 0.4, 2.6), 0.4, reverb=0.8)
    sectores = [(3.13, acorde('Bb2', 'F3', 'Db4'), 'Bb1'),          # arco lejano
                (3.93, acorde('Gb2', 'Db3', 'Bb3'), 'Gb1'),          # grada izquierda
                (4.6, acorde('Ab2', 'Eb3', 'C4'), 'Ab1'),            # grada derecha
                (5.33, acorde('Bb2', 'F3', 'D4'), 'Bb1')]            # la cancha (mayor: luz)
    for s, ac, grave in sectores:
        p.poner(s, timbal(nota(grave) * 2, 1.0, 2.0), 0.9, reverb=0.6)
        p.poner(s, impacto(0.45, nota(grave), 1.6), 0.6, reverb=0.5)
        p.poner(s, metales(ac, 0.9, ataque=0.05, brillo=2400), 0.6, reverb=0.65)
    p.poner(5.33, cuerdas(acorde('Bb3', 'D4', 'F4'), 1.3, ataque=0.7, brillo=2600), 0.4, reverb=0.6)
    p.poner(5.6, plato_reves(0.93), 0.45, reverb=0.5, ancho=1)
    p.poner(6.53, impacto(0.95, 36, 4.0), 1.0, reverb=0.6)                               # composición central
    p.poner(6.53, metales(acorde('Bb2', 'F3', 'D4', 'Bb4'), 4.6, ataque=0.25, brillo=3000), 0.85, reverb=0.7)
    p.poner(6.53, coro(acorde('Bb3', 'D4', 'F4', 'Bb4', 'D5'), 4.6, 'ah', ataque=0.5, soltar=2.6), 0.6, reverb=0.8)
    p.poner(6.53, cuerdas(acorde('Bb2', 'F3', 'Bb3', 'D4'), 4.6, ataque=0.4, brillo=2800), 0.45, reverb=0.7)
    p.poner(7.53, campana(nota('Bb5'), 0.6, 3.4), 0.45, reverb=0.85)
    p.poner(7.53, brillo_agudo(acorde('D6', 'F6', 'Bb6'), 3.2), 0.4, reverb=0.8, ancho=1)
    festejo(p, 6.53)                                                     # la hinchada
    return p.mezclar(3.6, 4800, dinamica=[(0, -7), (6.4, -4), (6.53, 0)])


def pieza_evento_demo():
    """Evento (perfil demo, 7 s): himno festivo. La mayor, 120 BPM, fanfarria de
    metales cuando se viste el pabellón (banderas, logo)."""
    dur = 7.0
    p = Pista(dur + COLA)
    tempo = 120
    negra = 60 / tempo
    p.poner(0.0, subida(1.33, 300, 3500), 0.5, reverb=0.3, ancho=1)
    for k in range(3):
        p.poner(0.0 + k * negra, caja_marcial(0.4 + 0.15 * k), 0.6, reverb=0.3)
    p.poner(1.33, impacto(0.85, 45, 1.8), 0.9, reverb=0.4)                               # se rompe el sobre
    k = 0
    s = 1.33
    while s < 6.1:                                               # marcha: taikos + cajas
        p.poner(s, taiko(70 if k % 4 == 0 else 85, 0.9 if k % 2 == 0 else 0.5), 0.8, reverb=0.3)
        if k % 2 == 1:
            p.poner(s, caja_marcial(0.55), 0.5, pan=-0.2, reverb=0.35)
        k += 1
        s += negra / 2
    la = acorde('A3', 'C#4', 'E4', 'F#4', 'D4')
    p.poner(1.33, ostinato(la, [0, 2, 1, 2, 0, 2, 3, 2, 4, 2, 1, 2, 0, 2, 1, 2], tempo, 4.8, brillo=3400), 0.55, pan=0.25, reverb=0.3)
    fanfarria = [(3.07, ('A3', 'C#4', 'E4'), 0.24), (3.33, ('A3', 'C#4', 'E4'), 0.24), (3.58, ('B3', 'D4', 'F#4'), 0.24),
                 (3.83, ('C#4', 'E4', 'A4'), 0.9), (4.83, ('D4', 'F#4', 'A4'), 0.45), (5.33, ('E4', 'G#4', 'B4'), 0.7)]
    for s, ac, d in fanfarria:                                    # se viste el pabellón
        p.poner(s, metales(acorde(*ac), d + 0.15, ataque=0.03, brillo=3600), 0.65, reverb=0.5)
    p.poner(3.33, braam(acorde('A1', 'E2', 'A2'), 1.5, abre=0.2), 0.6, reverb=0.4)
    p.poner(4.8, subida(1.4, 250, 4800), 0.6, reverb=0.3, ancho=1)
    p.poner(6.2, impacto(1.0, 41, 3.6), 1.0, reverb=0.45)                                 # clímax
    p.poner(6.2, metales(acorde('A2', 'E3', 'A3', 'C#4', 'E4'), 4.0, ataque=0.03, brillo=4000), 0.9, reverb=0.55)
    p.poner(6.2, coro(acorde('A3', 'C#4', 'E4', 'A4'), 4.0, 'ah', ataque=0.1, soltar=2.4), 0.5, reverb=0.7)
    p.poner(6.6, brillo_agudo(acorde('A6', 'E6', 'C#7'), 3.0), 0.45, reverb=0.7, ancho=1)
    festejo(p, 6.2)                                                     # la hinchada
    return p.mezclar(2.6, dinamica=[(0, -7), (6.1, -4), (6.2, 0)])


def pieza_excepcional():
    """Recompensa excepcional (8,5 s): un segundo de casi silencio, el haz central
    abre con un coro etéreo, crece hasta el sobre que se rompe (el golpe más grande
    de todos), anillos de campanas con cada anillo de luz y el coral final."""
    dur = 8.5
    p = Pista(dur + COLA)
    p.poner(0.0, dron(nota('D1'), 1.4, 120), 0.2, reverb=0.2)                     # casi silencio
    p.poner(1.0, brillo_agudo(acorde('A5', 'D6', 'E6'), 4.4), 0.45, reverb=0.8, ancho=1)  # se abre el haz
    p.poner(1.0, coro(acorde('D4', 'A4', 'E5'), 4.4, 'oo', ataque=1.8, soltar=0.4), 0.55, reverb=0.85)
    p.poner(1.3, cuerdas(acorde('D2', 'A2', 'D3'), 4.1, ataque=2.5, brillo=1200, vibrato=False), 0.5, reverb=0.5)
    for k in range(8):                                            # latidos que se aceleran
        s = 1.6 + 3.5 * (1 - (1 - k / 8) ** 1.6)
        p.poner(s, latido(0.6 + 0.05 * k), 0.8, reverb=0.25)
    p.poner(3.4, subida(1.93, 120, 6000), 0.7, reverb=0.4, ancho=1)
    p.poner(4.2, plato_reves(1.13), 0.65, reverb=0.4, ancho=1)
    p.poner(5.33, impacto(1.0, 34, 4.2), 1.15, reverb=0.55)                              # se rompe el sobre
    p.poner(5.33, braam(acorde('D1', 'A1', 'D2', 'F2'), 2.0, abre=0.12, pico=3400, distorsion=3.2), 0.95, reverb=0.5)
    anillo = ['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7']
    for k, n in enumerate(anillo):                                # los anillos de luz
        p.poner(5.73 + k * 0.167, campana(nota(n), 0.6, 2.6), 0.5, pan=(-1) ** k * 0.4, reverb=0.7)
        p.poner(5.73 + k * 0.167, taiko(64 + 4 * k, 0.6), 0.6, reverb=0.4)
    p.poner(5.73, cuerdas(acorde('D3', 'F#3', 'A3', 'D4'), 1.5, ataque=0.5, brillo=3000), 0.5, reverb=0.6)
    p.poner(7.13, metales(acorde('D3', 'A3', 'F#4', 'D4'), 4.6, ataque=0.12, brillo=3600), 0.9, reverb=0.65)  # los focos
    p.poner(7.13, coro(acorde('D4', 'F#4', 'A4', 'D5', 'F#5'), 4.6, 'ah', ataque=0.3, soltar=2.8), 0.7, reverb=0.8)
    p.poner(7.13, cuerdas(acorde('D4', 'F#4', 'A4', 'D5', 'A5'), 4.6, ataque=0.3, brillo=4200), 0.5, reverb=0.7)
    p.poner(7.13, braam(acorde('D1', 'A1', 'D2'), 4.6, abre=0.2, pico=1800), 0.7, reverb=0.6)
    p.poner(8.0, impacto(0.8, 38, 3.4), 0.8, reverb=0.6)                                # el destello
    p.poner(8.0, brillo_agudo(acorde('D7', 'A6', 'F#6'), 3.2), 0.5, reverb=0.85, ancho=1)
    festejo(p, 7.13)                                                     # la hinchada
    return p.mezclar(3.8, 5200, dinamica=[(0, -24), (0.95, -24), (1.2, -14), (5.2, -7), (5.33, -1), (7.0, -3), (7.13, 0)])


def pieza_evento_goleadores():
    """Evento Goleadores: el himno del evento en Mi menor, más oscuro y agresivo
    (mismo guion 'evento': los golpes caen en los mismos cuadros)."""
    with en_tono(-5, menor=True):
        return pieza_evento_demo()


def pieza_evento_recuperadores():
    """Evento Recuperadores: el himno del evento en Re menor, más contenido."""
    with en_tono(-7, menor=True):
        return pieza_evento_demo()


def pieza_evento_heroes():
    """Héroes del club: el himno del evento en Si bemol mayor, tibio y nostálgico
    (mismo guion 'evento': los golpes caen en los mismos cuadros)."""
    with en_tono(-2):
        return pieza_evento_demo()


PIEZAS = {'vdraft': pieza_vdraft, 'elite': pieza_elite, 'epico': pieza_epico, 'leyenda': pieza_leyenda,
          'evento_demo': pieza_evento_demo, 'excepcional': pieza_excepcional,
          'evento_goleadores': pieza_evento_goleadores, 'evento_recuperadores': pieza_evento_recuperadores,
          'evento_heroes': pieza_evento_heroes}


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def generar(nombre):
    audio = PIEZAS[nombre]()
    os.makedirs(SALIDA, exist_ok=True)
    wav = os.path.join('/tmp', f'musica_{nombre}.wav')
    wavfile.write(wav, SR, audio.T.astype(np.float32))
    destino = os.path.join(SALIDA, f'{nombre}.m4a')
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '160k',
                    '-movflags', '+faststart', destino], check=True)
    print(f'{nombre}: {audio.shape[1] / SR:.1f} s → {os.path.relpath(destino)} ({os.path.getsize(destino) // 1024} KB)')


if __name__ == '__main__':
    for nombre in (sys.argv[1:] or PIEZAS):
        generar(nombre)
