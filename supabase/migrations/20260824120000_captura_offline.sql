-- ═══════════════════════════════════════════════════════════════════════════
--  ANÁLISIS OFFLINE
--
--  Agrega lo que hace falta para analizar un partido con calma, sin conexión,
--  sobre los eventos que YA cargó el tracker en vivo:
--
--   · cadenas de pases, con origen y destino de cada pase y si se completó
--   · pérdidas clasificadas: forzada (te presionaron) o no forzada (error)
--   · seguimiento posicional de cada jugador mientras está en cancha
--   · la posición de la PELOTA en cada foto, que es lo que permite contar
--     cuántos quedamos por detrás de su línea y detectar el 3v2 momentáneo
--   · el tiempo real en cancha, corregible a mano
--
--  Todo es aditivo. Nada de lo que existe cambia de forma ni de tipo, así que
--  el tracker en vivo y los reportes actuales siguen funcionando igual.
--
--  Los tipos de club_id / id_partido / id_jugador se copian de `eventos` en
--  tiempo de migración (id_partido es uuid, id_jugador bigint, club_id uuid),
--  para no adivinarlos ni quedar desfasados si alguna vez cambian.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. COLUMNAS NUEVAS EN `eventos` ────────────────────────────────────────
alter table public.eventos
  -- Identidad generada en el dispositivo. Es la clave de la sincronización:
  -- subir dos veces el mismo evento no lo duplica.
  add column if not exists local_id text,

  -- Destino de la acción. En un pase: dónde llegó. En una recepción: desde
  -- dónde venía el jugador. En un remate queda null.
  add column if not exists zona_x_fin double precision,
  add column if not exists zona_y_fin double precision,

  -- Zona táctica: cuatro zonas de 10 metros desde nuestro arco (Z1..Z4) por
  -- tres carriles (I/C/D). 'Z2-C' se entiende sin explicación y se agrupa en
  -- una consulta sin tener que rehacer la cuenta desde las coordenadas.
  add column if not exists zona_tactica text,
  add column if not exists zona_tactica_fin text,

  -- Cadena de pases a la que pertenece el evento, y su lugar dentro de ella.
  add column if not exists secuencia_id uuid,
  add column if not exists orden_secuencia smallint,

  -- Tiempo del período en milisegundos. Más fino que minuto+segundos, que se
  -- mantienen intactos para todo lo que ya los lee.
  add column if not exists t_ms integer,

  -- 'vivo' = tracker en cancha · 'offline' = analizado después.
  add column if not exists origen_captura text,

  -- Pases: si llegó a destino. NULL en acciones que no son pase.
  add column if not exists pase_completado boolean,

  -- Pérdidas: 'forzada' (te presionaron) o 'no_forzada' (error técnico).
  add column if not exists tipo_perdida text,
  add column if not exists bajo_presion boolean,
  add column if not exists de_espaldas boolean,

  -- LÍNEA DE LA PELOTA. Lo que responde "se nos rompió la presión y quedó un
  -- 3v2": cuántos nuestros quedaron entre la pelota y nuestro arco, contra
  -- cuántos rivales quedaron a la altura de la pelota o por delante.
  -- balance_linea = defensores - atacantes. Negativo = inferioridad.
  add column if not exists defensores_linea smallint,
  add column if not exists atacantes_linea smallint,
  add column if not exists balance_linea smallint;

comment on column public.eventos.local_id is 'ID generado en el dispositivo. Único: hace idempotente la sincronización offline.';
comment on column public.eventos.zona_x_fin is 'X destino 0-100 (0 = arco propio, 100 = arco rival), misma convención que zona_x.';
comment on column public.eventos.zona_tactica is 'Zona de 10m (Z1 nuestra, Z4 rival) y carril (I/C/D) del punto de origen. Ej: Z2-C.';
comment on column public.eventos.tipo_perdida is 'forzada = hubo presión rival · no_forzada = error técnico propio.';
comment on column public.eventos.balance_linea is 'Defensores propios detrás de la pelota menos rivales a su altura o por delante. Negativo = inferioridad numérica momentánea.';
comment on column public.eventos.posiciones is 'Foto posicional del momento del evento: [{id_jugador, equipo, x, y, dorsal}]. La escribe el análisis offline.';

-- Índice único SIN predicado, a propósito. Postgres no considera dos NULL
-- iguales entre sí, así que los eventos viejos (que tienen local_id NULL)
-- conviven sin problema. Y tiene que ser sin predicado porque un índice
-- parcial no sirve de árbitro para ON CONFLICT (local_id), que es
-- exactamente lo que usa el sincronizador para no duplicar nada.
create unique index if not exists eventos_local_id_key
  on public.eventos (local_id);

create index if not exists eventos_secuencia_idx
  on public.eventos (secuencia_id) where secuencia_id is not null;

-- ── 2. TABLAS NUEVAS ───────────────────────────────────────────────────────
do $mig$
declare
  t_club text;
  t_part text;
  t_jug  text;
begin
  select format_type(a.atttypid, a.atttypmod) into t_club
    from pg_attribute a
   where a.attrelid = 'public.eventos'::regclass and a.attname = 'club_id';
  select format_type(a.atttypid, a.atttypmod) into t_part
    from pg_attribute a
   where a.attrelid = 'public.eventos'::regclass and a.attname = 'id_partido';
  select format_type(a.atttypid, a.atttypmod) into t_jug
    from pg_attribute a
   where a.attrelid = 'public.eventos'::regclass and a.attname = 'id_jugador';

  if t_club is null or t_part is null or t_jug is null then
    raise exception 'No se pudieron leer los tipos de public.eventos (club_id/id_partido/id_jugador)';
  end if;

  -- 2.a  LA FOTO: dónde estaban los diez Y LA PELOTA en un instante.
  --      `posiciones` es [{id_jugador, equipo, x, y, dorsal}].
  --      La pelota va aparte porque es la que define la línea de referencia.
  execute format($f$
    create table if not exists public.snapshots_posicionales (
      id                bigserial primary key,
      local_id          text unique not null,
      club_id           %1$s not null,
      id_partido        %2$s not null references public.partidos(id) on delete cascade,
      id_evento         bigint references public.eventos(id) on delete set null,
      periodo           text not null default 'PT',
      t_ms              integer not null default 0,
      minuto            integer,
      segundos          integer,
      posiciones        jsonb not null default '[]'::jsonb,
      x_balon           double precision,
      y_balon           double precision,
      defensores_linea  smallint,
      atacantes_linea   smallint,
      balance_linea     smallint,
      contexto_juego    text,
      etiqueta_tactica  text,
      nota              text,
      creado_en         timestamptz not null default now()
    )$f$, t_club, t_part);

  -- 2.b  SEGUIMIENTO: el rastro de UN jugador mientras estuvo en cancha.
  --      Cada vez que lo movés en el mapa se agrega un punto {x, y, t_ms}.
  --      `stint_local_id` lo ata al tramo: el rastro empieza cuando entra y
  --      termina cuando sale.
  execute format($f$
    create table if not exists public.recorridos_jugador (
      id             bigserial primary key,
      local_id       text unique not null,
      club_id        %1$s not null,
      id_partido     %2$s not null references public.partidos(id) on delete cascade,
      id_jugador     %3$s,
      equipo         text not null default 'Propio',
      dorsal_rival   smallint,
      stint_local_id text,
      periodo        text not null default 'PT',
      t_inicio_ms    integer not null default 0,
      t_fin_ms       integer,
      puntos         jsonb not null default '[]'::jsonb,
      tipo           text not null default 'seguimiento',
      creado_en      timestamptz not null default now()
    )$f$, t_club, t_part, t_jug);

  -- 2.c  TIEMPO EN CANCHA: un tramo continuo de un jugador dentro del campo.
  --      Se siembra desde los eventos 'Cambio' y después se corrige a mano.
  execute format($f$
    create table if not exists public.stints_cancha (
      id           bigserial primary key,
      local_id     text unique not null,
      club_id      %1$s not null,
      id_partido   %2$s not null references public.partidos(id) on delete cascade,
      id_jugador   %3$s not null,
      periodo      text not null default 'PT',
      entrada_ms   integer not null default 0,
      salida_ms    integer,
      ajustado     boolean not null default false,
      creado_en    timestamptz not null default now()
    )$f$, t_club, t_part, t_jug);

  -- 2.d  CADENA DE PASES. `id_evento_final` apunta al gol o remate que la
  --      cierra, que normalmente ya existe cargado por el tracker en vivo.
  execute format($f$
    create table if not exists public.secuencias_pase (
      id                 uuid primary key,
      club_id            %1$s not null,
      id_partido         %2$s not null references public.partidos(id) on delete cascade,
      equipo             text not null default 'Propio',
      periodo            text not null default 'PT',
      t_inicio_ms        integer not null default 0,
      t_fin_ms           integer,
      cantidad_pases     smallint not null default 0,
      pases_completados  smallint not null default 0,
      pases_incompletos  smallint not null default 0,
      resultado          text,
      id_evento_final    bigint references public.eventos(id) on delete set null,
      etiqueta_tactica   text,
      creado_en          timestamptz not null default now()
    )$f$, t_club, t_part);
end
$mig$;

create index if not exists snapshots_partido_idx  on public.snapshots_posicionales (id_partido, t_ms);
create index if not exists recorridos_partido_idx on public.recorridos_jugador (id_partido, id_jugador);
create index if not exists stints_partido_idx     on public.stints_cancha (id_partido, id_jugador);
create index if not exists secuencias_partido_idx on public.secuencias_pase (id_partido);

-- La FK va NOT VALID: no revalida los eventos viejos (que tienen secuencia_id
-- NULL de todos modos) y la migración entra en segundos.
do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'eventos_secuencia_fk'
                                  and conrelid = 'public.eventos'::regclass
  ) then
    alter table public.eventos
      add constraint eventos_secuencia_fk
      foreign key (secuencia_id) references public.secuencias_pase(id) on delete set null
      not valid;
  end if;
end
$fk$;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
-- Mismas tres políticas por tabla que ya usás en eventos, partidos y
-- jugadores, con tus mismas funciones helper. Ojo: get_user_club_id()
-- devuelve text, por eso el club_id se castea.
do $rls$
declare
  t text;
begin
  foreach t in array array[
    'snapshots_posicionales', 'recorridos_jugador', 'stints_cancha', 'secuencias_pase'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t
                      and policyname = 'Staff SELECT ' || t) then
      execute format($p$
        create policy %I on public.%I
          for select using ((club_id)::text = get_user_club_id())
      $p$, 'Staff SELECT ' || t, t);
    end if;

    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t
                      and policyname = 'CT/Admin ALL ' || t) then
      execute format($p$
        create policy %I on public.%I
          for all using (
            (get_user_rol() = any (array['ct'::text, 'admin'::text, 'manager'::text]))
            and ((club_id)::text = get_user_club_id())
          )
      $p$, 'CT/Admin ALL ' || t, t);
    end if;

    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t
                      and policyname = 'Superuser ALL ' || t) then
      execute format($p$
        create policy %I on public.%I
          for all using (get_user_rol() = 'superuser'::text)
      $p$, 'Superuser ALL ' || t, t);
    end if;
  end loop;
end
$rls$;
