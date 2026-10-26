# Arquitectura · Juegos de Virtual.Club

Referencia para trabajar en la sección de **Juegos** (MySquad, Sobres, V-Draft y
Penales). El resto de la app (gestión del cuerpo técnico) usa la misma base pero
no se describe acá.

## 1. Stack

| Capa | Qué se usa |
|---|---|
| Front | React 19 + Vite, React Router 7. JS (sin TypeScript). |
| Estilos | CSS propio: variables globales en `src/index.css` (`--bg`, `--panel`, `--accent`…), una hoja por pantalla (`src/pages/vdraft.css`, `src/components/sobres/apertura.css`, `src/components/quinteto/quinteto.css`) y bastante estilo en línea. Los juegos tienen además su design system en `src/juegos/` (ver §6). |
| Estado | `useState`/`useEffect` por pantalla. React Query y Zustand están instalados pero los juegos no los usan. |
| Backend | Supabase (Postgres). **Toda la lógica que da premios corre en la base** (funciones `security definer`): sorteos, V-Coins, partidas, penales. El front muestra lo que devuelve. |
| Auth | Supabase Auth para el staff (`perfiles.rol`: superuser, manager, admin, ct, jugador). Los jugadores entran por el **kiosco** (`/kiosco`): eligen su nombre y ponen el PIN; `kiosco_abrir_sesion` devuelve un token que dura 120 días y viaja como `p_token` en cada llamada (`src/utils/kiosco.js`). |
| Tests | Vitest. Las reglas puras viven en `src/analytics/*.js` y se prueban en `src/analytics/__pruebas__/`. |
| Renders | Blender 4.2 (`cine/`): cinemáticas de sobres, escena de penales y el arquero (`cine/modelos/arquero.glb`). Salen a `public/cine/` y `public/penales/`; los paquetes de sobres (`cine/sobres3d.py`) a `public/juegos/sobres/<tipo>.webp` (el `neutro` se tiñe por CSS para eventos y sobres del club). |

## 2. Dónde vive cada cosa

```
src/pages/
  Juegos.jsx            menú de juegos (/juegos, /kiosco/juegos)
  MiQuinteto.jsx        MySquad (sólo staff)
  Sobres.jsx            pestañas SOBRES (paquetes 3D, disponibles/bloqueados) y COLECCIÓN
                        (álbum con siluetas, filtros por rareza y posición) + Modo GOD
  VDraft.jsx            V-Draft: inicio, draft, torneo, partido en vivo
  PenalesJuego.jsx      modo Penales: pateador y arquero de tus cartas, con premio (o práctica)
  vdraft.css            estilos de V-Draft y penales
src/components/
  quinteto/             cartas (CartaJugador, CartaEspecial, CartaGiratoria…), cancha en perspectiva
  sobres/               apertura (AperturaSobre, VideoApertura, RevelacionCartas, PaqueteSobre),
                        Modo GOD (PanelGod, God*), PanelClub (manager)
  vdraft/               CanchaPlana, Penales (la tanda), EscenaPenales (la escena 3D)
  kiosco/               JuegoEnElCelular (QR / instalar)
src/analytics/          reglas puras: sobres.js, sobresVista.js, vdraftVista.js, partidoVista.js, penalesCartas.js, aperturas.js, vdraft.js, penales.js, penales3d.js,
                        especialesCartas.js, eventos.js, god.js
src/utils/              llamadas a la base: sobres.js, vdraft.js, god.js, usuarios.js, eventos.js;
                        sonidoApertura.js (audio), escenaPenales.js (carga de la escena)
src/juegos/             design system de juegos (§6)
cine/                   scripts de Blender y audio de las cinemáticas
public/cine/            videos, pósters, música y efectos de las aperturas
public/penales/         fondo, red, pelota y tiras del arquero (penales.json = medidas)
supabase/migrations/    sobres_*, vdraft_*, juegos_misiones, penales_cartas, usuarios_vcoins, admin_club…
```

### Rutas

| Staff | Kiosco | Pantalla |
|---|---|---|
| `/juegos` | `/kiosco/juegos` | Menú de juegos |
| `/mysquad` | — | MySquad |
| `/sobres` | `/kiosco/sobres` | Sobres (superusuario: Modo GOD) |
| `/vdraft` | `/kiosco/vdraft` | V-Draft (el superusuario no juega) |
| `/penales` | `/kiosco/penales` | Penales |

### Apertura de sobres (cinemáticas existentes)
- `AperturaSobre` arma la secuencia según `varianteDeApertura` (`analytics/aperturas.js`): estándar (tiembla → abre → cartas) o con video (`VIDEOS`: vdraft, elite, epico, leyenda, excepcional, eventos…).
- Videos en `public/cine/<id>.webm|mp4`, música en `public/cine/musica/`, público en `public/cine/efectos/`.
- **No se tocan**: las pantallas nuevas sólo invocan la apertura con el resultado de `sobres_abrir` / `sobres_abrir_evento`.

### Partido del V-Draft
- `vdraft_jugar` simula en la base: Poisson con la diferencia de fuerza; devuelve `goles` = [{ minuto, equipo, autor, asistencia }]. **No hay** atajadas, tarjetas, figura ni estadísticas.
- `PartidoVivo` (en `VDraft.jsx`) anima los 40 minutos con `CanchaPlana` y `pelotaEn`.
- Empate → tanda de penales (`vdraft_penal`, la decide la base).

### Penales
- Reglas: `analytics/penales.js` (`DIFICULTAD` por ronda, `patear`, `atajar`, `turno`, `ganador`). Espejo exacto de `vdraft_penal`.
- Escena: `EscenaPenales` + `analytics/penales3d.js` (dónde va la pelota, qué parada hace el arquero, tiras de cuadros). 6 paradas renderizadas (izq alta/media/baja, centro alto/medio/bajo) + espejo = 9 zonas.

## 3. La carta

`CartaJugador({ carta, chica, seleccionada, etiqueta, fueraDePuesto, onClick })`.
La `carta` (lo que guarda el catálogo en `cartas_catalogo.carta`, más foto y ajustes) trae:
- `nombre`, `apellido`, `dorsal`, `foto`, `rol` (ARQ / CIE / ALA / PIV), `ovr` (media);
- `tier` (oro / plata / bronce / figura / evaluacion) y `premio` (POTW, TOTW, POTM, TOTM, TOTY, GOLR, ASIR, MVPR, HERO…);
- `stats`: de campo `TIR, PAS, REG, DEF, IMP, FIS`; de arquero `ATA, PIE, EVI, SAL, IMP, FIS`.

Las especiales (`premio` en `especialesCartas.ESPECIALES`) se dibujan con `CartaEspecial` (familias con su marco, textura e insignia). La rareza del sobre (`cartas_catalogo.rareza`): bronce, plata, oro, totw, potw, totm, potm, toty.

## 4. V-Coins, sobres y ranking

- **V-Coins**: `sobres_perfil.puntos` por (club, dueño). Dueño = `u:<uid>` (staff) o `j:<jugador>` (kiosco). Cada movimiento manual queda en `vcoins_movimientos`. Eventos x1,5/x2/x3 en `vcoins_multiplicadores`.
- **El día** es el de Argentina: `_sobres_hoy()` = `now() at time zone 'America/Argentina/Buenos_Aires'`. Todo lo "diario" se reinicia a las 00:00 de ahí.
- **`sobres_estado`** devuelve: `puntos`, `racha` (días seguidos, premio a los 7), `disponibles` (diario, racha, wellness, puntos, mega, premio…), `tipos` (config por club), `eventos`, `cartas_tengo` / `cartas_total`, `multiplicador`, `suspendidos`, `es_staff`, `es_superuser`.
- **Abrir**: `sobres_abrir(tipo)` / `sobres_abrir_evento(id)`: sortean en la base, registran el sobre en `sobres_abiertos`, y las repetidas pagan V-Coins.
- **Colección**: `sobres_coleccion()` → `{ total, cartas, por_rareza }`.
- **V-Draft**: `vdraft_estado()` → `{ puntos, costo, gratis_hoy, partida, ultimas, ranking }`. Una partida gratis por día; las siguientes cuestan 100. Premios por victorias: 1 → 25, 2 → 75, 3 → 150 + sobre, 4 → 300 + sobre (`analytics/vdraft.js · PREMIOS`). `ranking`: [{ dueno, nombre, partidas, victorias, campeonatos, yo }].
- **Superusuario**: no tiene colección ni compite (`_sobres_ctx` no lo deja jugar). Administra todo desde el Modo GOD.

## 5. Colores y tipografía actuales

- Fondo `#000`, superficie `#111`, borde `#222`, acento neón `#00ff88`, texto `#fff` / atenuado `#888` (`src/index.css`).
- Avisos: ok `#10b981`, aviso `#f59e0b`, peligro `#ef4444`, info `#60a5fa`, amarillo `#facc15`.
- Tipografías: Outfit (títulos y texto), JetBrains Mono (números).
- V-Draft usa oro `#fbbf24`; penales, naranja `#f97316`.

## 6. Design system de juegos (`src/juegos/`)

- `juegos.css`: tokens `--jg-*` (fondo, superficies, neón, oro/plata/bronce, un color por rareza, glows, radios, tipografías), breakpoints (móvil < 768, tablet 768–1199, PC ≥ 1200), toques de 44 px y texto base de 16 px en el celular, `prefers-reduced-motion`.
- `ui.jsx`: `GameButton` (primary / secondary / ghost), `Panel`, `Badge`, `Countdown`, `ProgressBar`, `Hoja` (BottomSheet en el celular, panel lateral en tablet/PC).
- `useFeedback()`: `sound(id)` y `vibrate(patron)` con preferencias (sonido / vibración) guardadas en el dispositivo. Eventos: `click`, `gol`, `especial`, `victoria`, `derrota`, `premio`.
- `useCuenta(valor)`: un número que cuenta hasta su valor nuevo (química, fuerza, marcador).
- `volarCarta(origen, destino)` (`volar.js`): la carta elegida vuela a su lugar; la copia queda hasta que llega la respuesta de la base.
- `LayoutJuegos`: en el celular, barra inferior fija con Juegos, Sobres, V-Draft y Penales (sólo dentro de los juegos; la app del staff mantiene su menú lateral).
