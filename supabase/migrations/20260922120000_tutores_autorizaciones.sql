-- ═══════════════════════════════════════════════════════════════════════════
--  TUTORES Y AUTORIZACIONES
--
--  Un club con inferiores maneja menores de edad, y hoy no hay dónde guardar
--  a quién se llama si al chico le pasa algo, quién lo puede retirar del
--  club, ni si la familia autorizó que viaje, que se le publique una foto o
--  que lo atienda un médico en una urgencia.
--
--  Eso no es un detalle administrativo: es la diferencia entre resolver un
--  problema en la cancha y quedar expuesto. El dato existe, pero vive en el
--  grupo de WhatsApp del entrenador de turno, y se pierde cuando el
--  entrenador cambia.
--
--  Dos piezas, a propósito separadas:
--
--   · public.tutores → LA GENTE. Un jugador puede tener varios (madre, padre,
--     un tío que lo lleva los martes). Cada uno con su teléfono y si puede o
--     no retirarlo.
--
--   · columnas en public.jugadores → LOS PERMISOS. Son del jugador, no del
--     tutor: quién los firmó queda registrado aparte. Van como columnas y no
--     como tabla 1:1 porque media app ya lee `jugadores` entero, y un join
--     más en cada pantalla no compra nada.
--
--  LA DECISIÓN QUE MÁS IMPORTA: los permisos son booleanos ANULABLES.
--    NULL  → nadie preguntó todavía
--    false → la familia dijo que no
--    true  → la familia dijo que sí
--  Tratar "sin responder" como "no autoriza" esconde el trabajo pendiente;
--  tratarlo como "autoriza" es peor todavía. Son tres estados distintos y la
--  pantalla los muestra como tres.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── LA GENTE ───────────────────────────────────────────────────────────────
create table if not exists public.tutores (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  jugador_id bigint not null,

  nombre text not null,
  parentesco text,          -- Madre / Padre / Tutor legal / Abuelo/a / Hermano/a / Otro
  telefono text,
  email text,
  dni text,

  -- A quién se llama primero. Uno solo por jugador (ver el índice de abajo).
  principal boolean not null default false,
  -- Si puede retirar al jugador del club. Por defecto sí: el que está cargado
  -- como tutor normalmente puede, y la excepción se marca a mano.
  puede_retirar boolean not null default true,

  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Un solo principal por jugador. Es un índice parcial y no un CHECK porque la
-- regla es "a lo sumo uno en true", que un CHECK por fila no puede expresar.
create unique index if not exists tutores_principal_unico
  on public.tutores (jugador_id) where principal;

-- Las consultas siempre son "los tutores de este jugador" y "los de este club".
create index if not exists tutores_jugador_idx on public.tutores (jugador_id);
create index if not exists tutores_club_idx on public.tutores (club_id);

-- ── LOS PERMISOS ───────────────────────────────────────────────────────────
alter table public.jugadores
  add column if not exists autoriza_traslado boolean,
  add column if not exists autoriza_imagen boolean,
  add column if not exists autoriza_atencion_medica boolean,
  add column if not exists retira_solo boolean,
  add column if not exists autorizaciones_firmadas_por text,
  add column if not exists autorizaciones_fecha date;

comment on column public.jugadores.autoriza_traslado is
  'Viajar con el club a partidos y torneos. NULL = sin responder, false = no autoriza, true = autoriza.';
comment on column public.jugadores.autoriza_imagen is
  'Uso de fotos y video del jugador en redes y placas del club. NULL = sin responder.';
comment on column public.jugadores.autoriza_atencion_medica is
  'Atención médica de urgencia sin la familia presente. NULL = sin responder.';
comment on column public.jugadores.retira_solo is
  'El jugador puede irse solo del club. En mayores de edad no aplica. NULL = sin responder.';
comment on column public.jugadores.autorizaciones_firmadas_por is
  'Nombre de quien firmó las autorizaciones, tal como se registró. Texto libre a propósito: puede ser alguien que no está cargado como tutor.';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Mismos helpers y mismo criterio que `lesiones`: get_user_rol() y
-- get_user_club_id(), que es lo que ya usan sesiones, eventos y jugadores.
--
-- Quién puede qué:
--   · leer     → todo el staff del club. Un entrenador en la cancha necesita
--                el teléfono del tutor tanto como el manager.
--   · escribir → CT, admin y superuser. El admin carga la ficha al inscribir.
--   · jugador  → no lee la tabla. En esta app el jugador entra por el kiosco,
--                que es una sesión del club y no un usuario por persona, así
--                que una política "sólo lo mío" le abriría los datos de
--                contacto de todo el plantel. Mismo criterio que en lesiones.
--
-- Es idempotente: se puede correr por arriba de un intento anterior.
do $rls$
begin
  if to_regprocedure('public.get_user_rol()') is null
     or to_regprocedure('public.get_user_club_id()') is null then
    raise exception
      'Faltan las funciones get_user_rol() / get_user_club_id(), que son las que usan las políticas del resto de las tablas. Revisá que existan antes de correr esta migración.';
  end if;

  alter table public.tutores enable row level security;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutores'
                    and policyname = 'Staff SELECT tutores') then
    create policy "Staff SELECT tutores" on public.tutores
      for select using (
        (get_user_rol() = any (array['ct'::text, 'admin'::text, 'manager'::text, 'superuser'::text]))
        and ((club_id)::text = get_user_club_id())
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutores'
                    and policyname = 'Staff ALL tutores') then
    create policy "Staff ALL tutores" on public.tutores
      for all using (
        (get_user_rol() = any (array['ct'::text, 'admin'::text]))
        and ((club_id)::text = get_user_club_id())
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'tutores'
                    and policyname = 'Superuser ALL tutores') then
    create policy "Superuser ALL tutores" on public.tutores
      for all using (get_user_rol() = 'superuser'::text);
  end if;
end
$rls$;
