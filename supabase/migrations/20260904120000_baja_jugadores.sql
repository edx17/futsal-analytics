-- ════════════════════════════════════════════════════════════════════════════
--  Dar de baja a un jugador sin borrarlo
--
--  Hasta ahora la única forma de sacar del plantel a alguien que dejó de venir
--  era eliminarlo, y eso se lleva puesto todo lo que aportó en el año: sus
--  goles, sus asistencias, sus minutos, su disciplina. La baja es un estado,
--  no un borrado.
--
--  `activo` arranca en true para todos los que ya están cargados, así que
--  correr esto no cambia nada de lo que ves hoy.
--
--  El default y el not null se agregan juntos a propósito: desde Postgres 11
--  eso no reescribe la tabla, así que es instantáneo por más jugadores que
--  haya.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.jugadores
  add column if not exists activo      boolean not null default true,
  add column if not exists fecha_baja  date,
  add column if not exists motivo_baja text;

comment on column public.jugadores.activo is
  'false = dado de baja del plantel. Se conserva toda su historia (eventos, asistencias, disciplina); sólo deja de aparecer en las listas del día a día.';
comment on column public.jugadores.fecha_baja is
  'Cuándo se lo dio de baja. Null si está activo.';
comment on column public.jugadores.motivo_baja is
  'Texto libre: por qué dejó el club. Null si está activo.';

-- El plantel siempre se pide por club, y ahora además por activo.
create index if not exists jugadores_club_activo_idx
    on public.jugadores (club_id, activo);
