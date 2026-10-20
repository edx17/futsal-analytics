"""LOS EFECTOS DE LAS CARTAS (grabaciones reales de público)

Al dar vuelta una carta suena el público. Sale de grabaciones de Pixabay
(licencia de Pixabay: uso libre, también comercial, sin atribución), guardadas
en cine/sonidos/:
  - stadium-roar.mp3            "Stadium Roar" (mrmark81)
  - powerful-stomps.mp3         "Powerful Stomps, Claps, Cheering" (DJARTMUSIC)
  - crowd-shocked-reaction.mp3  "Crowd Shocked Reaction" (Universfield)
  - crowd-cheer-applause.mp3    "Crowd Cheer and Applause" (Dragon Studio)

  publico_especial  carta especial: los primeros 6 s del rugido de la tribuna,
                    que crece solo y se va apagando de a poco hacia el final;
  publico_oro       carta de oro: festejo con aplausos;
  publico_carta     carta de plata o bronce: la tribuna que se sorprende (en la
                    app suena más bajo);
  publico_evento    las cartas de un sobre de evento: pisotones, palmas y gritos.

Cada uno se normaliza al mismo nivel (el volumen de cada uno lo da la app).
Uso:  python3 cine/efectos.py      Sale: public/cine/efectos/<efecto>.m4a
"""
import os
import subprocess
import tempfile

import numpy as np
from scipy.io import wavfile

SR = 48000
AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.join(AQUI, 'sonidos')
SALIDA = os.path.join(AQUI, '..', 'public', 'cine', 'efectos')
NIVEL = -16  # dBFS RMS de la parte fuerte


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def leer(nombre):
    """El mp3 como float estéreo (2, n) a 48 kHz."""
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', os.path.join(FUENTES, nombre),
                        '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_f32le', wav], check=True)
        _, x = wavfile.read(wav)
    return x.T.astype(np.float64)


def tramo(x, desde, hasta):
    return x[:, int(desde * SR):int(hasta * SR)]


def fundido(x, entra=0.0, sale_desde=None, curva=1.6):
    """Entrada lineal de `entra` s; desde `sale_desde` (s) baja de a poco hasta el final."""
    n = x.shape[1]
    g = np.ones(n)
    if entra:
        k = int(entra * SR)
        g[:k] = np.linspace(0, 1, k)
    if sale_desde is not None:
        k = int(sale_desde * SR)
        g[k:] *= np.linspace(1, 0, n - k) ** curva
    return x * g


def nivelar(x):
    """Al mismo nivel RMS (de su medio segundo más fuerte), sin pasar de -1 dBFS."""
    paso = SR // 2
    rms = max(np.sqrt(np.mean(x[:, i:i + paso] ** 2)) for i in range(0, x.shape[1] - paso + 1, paso // 2))
    x = x * 10 ** (NIVEL / 20) / (rms + 1e-12)
    pico = np.max(np.abs(x))
    techo = 10 ** (-1 / 20)
    return np.tanh(x / techo) * techo if pico > techo else x


def guardar(nombre, x):
    os.makedirs(SALIDA, exist_ok=True)
    destino = os.path.join(SALIDA, f'{nombre}.m4a')
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        wavfile.write(wav, SR, x.T.astype(np.float32))
        subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '160k',
                        '-movflags', '+faststart', destino], check=True)
    print(f'{nombre}: {x.shape[1] / SR:.1f} s → {os.path.relpath(destino)} ({os.path.getsize(destino) // 1024} KB)')


if __name__ == '__main__':
    rugido = leer('stadium-roar.mp3')
    pisotones = leer('powerful-stomps.mp3')
    sorpresa = leer('crowd-shocked-reaction.mp3')
    aplausos = leer('crowd-cheer-applause.mp3')
    guardar('publico_especial', nivelar(fundido(tramo(rugido, 0, 6), sale_desde=1.8)))
    guardar('publico_oro', nivelar(fundido(aplausos, sale_desde=3.0)))
    guardar('publico_carta', nivelar(fundido(sorpresa, sale_desde=2.0)))
    guardar('publico_evento', nivelar(fundido(tramo(pisotones, 0, 6), sale_desde=3.6, curva=1.2)))
