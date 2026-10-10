-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: HISTORIAL DE CARTAS DESTACADAS
--
--  Los premios de MySquad (POTW, TOTW, POTM, TOTM, TOTY) se calculan al vuelo
--  desde los partidos. Eso alcanza para "lo de ahora", pero no para mirar
--  atrás: si se recalibra el rating o se corrige un partido, el ganador de un
--  mes viejo puede cambiar sin que nadie lo note. Esta tabla congela lo que se
--  decidió, junto con una foto de cada carta (nombre, foto, nota, partidos) tal
--  como se veía ese día.
--
--  Qué guarda cada fila:
--    tipo        POTW | TOTW | POTM | TOTM | TOTY
--    periodo     id del partido (POTW/TOTW), 'YYYY-MM' (POTM/TOTM) o 'YYYY' (TOTY)
--    categoria / torneo_id   el filtro con el que se calculó ('Todas' / 'Todos'
--                si no había filtro): el mismo mes da otro quinteto por categoría
--    destacado_id            el jugador del partido / mes / temporada
--    jugadores   la foto de las cartas: uno para POTW, POTM y TOTY; cinco para
--                TOTW y TOTM (arquero primero)
--
--  Quién puede qué, igual que MySquad en la pantalla (superuser, manager,
--  administrador y cuerpo técnico) y con los mismos helpers que el resto de
--  las tablas.
--
--  Es idempotente: se puede correr por arriba de un intento anterior.
-- ═══════════════════════════════════════════════════════════════════════════

do $cartas$
begin
  if to_regprocedure('public.get_user_rol()') is null
     or to_regprocedure('public.get_user_club_id()') is null then
    raise exception
      'Faltan las funciones get_user_rol() / get_user_club_id(), que son las que usan las políticas del resto de las tablas. Revisá que existan antes de correr esta migración.';
  end if;
end
$cartas$;

create table if not exists public.cartas_destacadas (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubes(id) on delete cascade,
  tipo          text not null check (tipo in ('POTW', 'TOTW', 'POTM', 'TOTM', 'TOTY')),
  periodo       text not null,
  categoria     text not null default 'Todas',
  torneo_id     text not null default 'Todos',
  fecha_ref     date,
  destacado_id  bigint,
  jugadores     jsonb not null default '[]'::jsonb,
  contexto      jsonb not null default '{}'::jsonb,
  creado_por    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint cartas_destacadas_unica unique (club_id, tipo, periodo, categoria, torneo_id)
);

comment on table public.cartas_destacadas is
  'Historial de premios de MySquad (POTW, TOTW, POTM, TOTM, TOTY), congelado con una foto de cada carta.';
comment on column public.cartas_destacadas.periodo is
  'POTW/TOTW: id del partido. POTM/TOTM: YYYY-MM. TOTY: YYYY.';
comment on column public.cartas_destacadas.jugadores is
  'Foto de las cartas al guardar: [{id, nombre, apellido, dorsal, rol, foto, categoria, nota, ovr, pj, goles, asistencias}]. El arquero va primero en TOTW/TOTM.';

create index if not exists cartas_destacadas_club_fecha
  on public.cartas_destacadas (club_id, fecha_ref desc);

alter table public.cartas_destacadas enable row level security;

drop policy if exists "Staff SELECT cartas_destacadas" on public.cartas_destacadas;
create policy "Staff SELECT cartas_destacadas" on public.cartas_destacadas
  for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())));

drop policy if exists "Staff ALL cartas_destacadas" on public.cartas_destacadas;
create policy "Staff ALL cartas_destacadas" on public.cartas_destacadas
  for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));
