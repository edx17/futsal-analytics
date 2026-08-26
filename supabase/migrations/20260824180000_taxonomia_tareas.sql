-- ═══════════════════════════════════════════════════════════════════════════
--  TAXONOMÍA DE TAREAS
--
--  `fase_juego` venía guardando DOS vocabularios distintos en la misma
--  columna: el de las tareas normales (Ataque Posicional, Transición
--  Ofensiva…) y el del Libro Táctico (Laterales Altos, Corners, 5v4…). Por
--  eso los filtros mezclaban las dos familias y no había forma de buscar
--  "todo lo de balón parado" sin nombrar cada situación una por una.
--
--  Se parte en dos campos:
--     fase_juego     → el momento del juego  (6 valores)
--     subfase_juego  → la situación adentro  (nuevo)
--
--  La columna `fase_juego_previa` guarda el valor original de cada fila.
--  Es la red para poder volver atrás; una vez que esté todo verificado se
--  puede borrar sin consecuencias.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tareas
  add column if not exists subfase_juego text,
  add column if not exists fase_juego_previa text;

comment on column public.tareas.fase_juego is
  'Momento del juego: Ataque · Defensa · Transiciones · Situaciones Especiales · Balón Parado · Sup/Inf';
comment on column public.tareas.subfase_juego is
  'Situación dentro de la fase. Ej: fase "Balón Parado" + subfase "Lateral alto".';
comment on column public.tareas.fase_juego_previa is
  'Valor original de fase_juego antes de la migración de taxonomía. Se puede borrar una vez verificado.';

-- ── Guardamos el original una sola vez ─────────────────────────────────────
update public.tareas
   set fase_juego_previa = fase_juego
 where fase_juego_previa is null
   and fase_juego is not null;

-- ── El remapeo ─────────────────────────────────────────────────────────────
-- Sólo toca las filas que todavía tienen un valor viejo, así correr la
-- migración dos veces no cambia nada.
with mapa(viejo, fase, subfase) as (
  values
    ('Ataque Posicional',      'Ataque',                 'Sistema'),
    ('Defensa Posicional',     'Defensa',                'Zona'),
    ('Transición Ofensiva',    'Transiciones',           'Contraataque'),
    ('Transición Defensiva',   'Transiciones',           'Repliegue'),
    ('Situaciones Especiales', 'Situaciones Especiales',  null),
    ('ABP / Pelota Parada',    'Balón Parado',            null),
    ('ABP',                    'Balón Parado',            null),
    -- Las del Libro Táctico, que compartían la columna
    ('Salida de Presión',      'Ataque',                 'Salida de presión'),
    ('Saque Inicial',          'Balón Parado',           'Inicio'),
    ('Laterales Bajos',        'Balón Parado',           'Lateral bajo'),
    ('Laterales Medios',       'Balón Parado',           'Lateral medio'),
    ('Laterales Altos',        'Balón Parado',           'Lateral alto'),
    ('Corners',                'Balón Parado',           'Corner'),
    ('Tiros Libres',           'Balón Parado',           'Tiro libre'),
    ('5v4',                    'Situaciones Especiales', '5v4')
)
update public.tareas t
   set fase_juego    = m.fase,
       subfase_juego = coalesce(t.subfase_juego, m.subfase)
  from mapa m
 where t.fase_juego = m.viejo;

-- Las tareas físicas guardan en fase_juego el tipo de trabajo
-- ('Fuerza / Prevención', 'Acondicionamiento Metabólico'). No son fases de
-- juego: se mueven a la subfase y la fase queda vacía, que es la verdad.
update public.tareas
   set subfase_juego = coalesce(subfase_juego, fase_juego),
       fase_juego    = null
 where categoria_ejercicio = 'Físico'
   and fase_juego in ('Fuerza / Prevención', 'Acondicionamiento Metabólico');

-- ── Índices para que los filtros no barran la tabla entera ────────────────
create index if not exists tareas_fase_idx    on public.tareas (club_id, fase_juego);
create index if not exists tareas_subfase_idx on public.tareas (club_id, subfase_juego);
create index if not exists tareas_formato_idx on public.tareas (club_id, formato_tarea);

-- ── Control: qué quedó sin reconocer ──────────────────────────────────────
-- Si esta consulta devuelve filas, son valores de fase que no estaban en el
-- mapa. Se corrigen a mano desde el Banco de Tareas.
--
--   select fase_juego, count(*)
--     from public.tareas
--    where fase_juego is not null
--      and fase_juego not in ('Ataque','Defensa','Transiciones',
--                             'Situaciones Especiales','Balón Parado','Sup/Inf')
--    group by 1 order by 2 desc;
