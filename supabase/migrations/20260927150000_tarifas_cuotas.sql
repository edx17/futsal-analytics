-- ════════════════════════════════════════════════════════════════════════════
--  TARIFAS POR CATEGORÍA, DESCUENTO POR HERMANOS Y CUOTA MENSUAL AUTOMÁTICA
--
--  · tesoreria_tarifas: cuánto paga cada categoría por mes.
--  · tesoreria_config: si la cuota se genera sola, qué día vence, el
--    descuento para hermanos (%) y cómo se llama el concepto ("Cuota").
--  · jugadores.grupo_familiar: los jugadores con el mismo texto son
--    hermanos. En cada grupo paga completo el de la tarifa más alta (a
--    igualdad, el que se cargó primero) y el resto, con el descuento.
--  · tesoreria_deudas.tipo: 'mensual' (la genera el sistema) o 'extra'
--    (las cuotas extraordinarias, que se cargan a mano).
--  · generar_cuotas_mes(club, 'AAAA-MM', simular): crea las cuotas del mes
--    de los jugadores activos que tienen tarifa y todavía no la tienen. Con
--    simular = true sólo devuelve lo que crearía. No duplica: se puede
--    llamar todas las veces que haga falta.
--  · El smart-service la llama en cada corrida para los clubes con la cuota
--    automática prendida, y le avisa a cada jugador (push del kiosco y, si
--    hay plantilla, WhatsApp).
--
--  Quién puede: superuser, admin, manager y tesorero del club (y el
--  servidor). Idempotente. Requiere 20260927120000 (maneja_plata).
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

-- ── ANTES QUE NADA: TODO O NADA, Y SIN TRABARSE CON LA APP ──────────────────
-- Corre entera en una transacción: si algo falla, no queda nada a medias.
-- Toma de entrada los bloqueos de las tablas que toca, todos juntos y con
-- perfiles al final (las políticas de la app leen perfiles después de la
-- tabla que consultan; tomarla última evita el "deadlock detected"). Si una
-- tabla está ocupada más de 10 segundos, corta con "lock timeout" en vez de
-- quedarse esperando: en ese caso, volver a correrla.
begin;
set local lock_timeout = '10s';
lock table public.tesoreria_deudas, public.jugadores in access exclusive mode;

-- ── 1. TABLAS Y COLUMNAS ──────────────────────────────────────────────────
create table if not exists public.tesoreria_config (
  club_id            uuid primary key references public.clubes(id) on delete cascade,
  cuota_automatica   boolean not null default false,
  dia_vencimiento    integer not null default 10 check (dia_vencimiento between 1 and 28),
  descuento_hermanos numeric not null default 0 check (descuento_hermanos between 0 and 100),
  concepto           text not null default 'Cuota',
  updated_at         timestamptz not null default now()
);

create table if not exists public.tesoreria_tarifas (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubes(id) on delete cascade,
  categoria  text not null,
  monto      numeric not null check (monto >= 0),
  updated_at timestamptz not null default now(),
  unique (club_id, categoria)
);

alter table public.jugadores add column if not exists grupo_familiar text;
comment on column public.jugadores.grupo_familiar is
  'Hermanos: los jugadores del club con el mismo texto (sin importar mayúsculas) son un grupo familiar para el descuento de la cuota.';

alter table public.tesoreria_deudas add column if not exists tipo text not null default 'extra';
comment on column public.tesoreria_deudas.tipo is
  '''mensual'' = cuota del mes generada por el sistema; ''extra'' = cargada a mano (cuota extraordinaria, rifa, indumentaria…).';

create index if not exists tesoreria_deudas_mes_idx on public.tesoreria_deudas (club_id, mes_correspondiente, jugador_id);

do $$
declare t text;
begin
  foreach t in array array['tesoreria_config', 'tesoreria_tarifas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'Plata ALL ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Superuser ALL ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.maneja_plata(club_id))) with check ((select public.maneja_plata(club_id)))',
      'Plata ALL ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.get_user_rol()) = ''superuser'') with check ((select public.get_user_rol()) = ''superuser'')',
      'Superuser ALL ' || t, t);
  end loop;
end $$;

-- ── 2. HERMANOS ───────────────────────────────────────────────────────────
-- El tesorero no edita fichas de jugadores; esto es lo único que toca.
create or replace function public.asignar_grupo_familiar(p_jugador_id bigint, p_grupo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_club uuid;
begin
  select club_id into v_club from public.jugadores where id = p_jugador_id;
  if v_club is null then
    raise exception 'El jugador no existe' using errcode = 'P0002';
  end if;
  if not (public.maneja_plata(v_club) or public.get_user_rol() = 'superuser') then
    raise exception 'No tenés permiso para cambiar esto' using errcode = '42501';
  end if;
  update public.jugadores set grupo_familiar = nullif(trim(p_grupo), '') where id = p_jugador_id;
end
$$;

-- ── 3. GENERAR LAS CUOTAS DEL MES ─────────────────────────────────────────
create or replace function public.generar_cuotas_mes(
  p_club_id uuid, p_periodo text, p_simular boolean default false
) returns table (deuda_id uuid, jugador_id bigint, categoria text, concepto text, monto numeric, descuento numeric, fecha_vencimiento date)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  cfg public.tesoreria_config;
  v_meses constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  v_mes int;
  v_anio int;
  v_concepto text;
  v_vence date;
begin
  -- Desde el navegador, sólo quien maneja la plata del club. El servidor
  -- (cron, sin usuario) puede siempre.
  if auth.uid() is not null and not (public.maneja_plata(p_club_id) or public.get_user_rol() = 'superuser') then
    raise exception 'No tenés permiso para generar cuotas en este club' using errcode = '42501';
  end if;
  if coalesce(p_periodo, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Período inválido (AAAA-MM): %', p_periodo using errcode = '22023';
  end if;

  select * into cfg from public.tesoreria_config c where c.club_id = p_club_id;
  if not found then
    cfg.dia_vencimiento := 10; cfg.descuento_hermanos := 0; cfg.concepto := 'Cuota';
  end if;

  v_anio := split_part(p_periodo, '-', 1)::int;
  v_mes := split_part(p_periodo, '-', 2)::int;
  v_concepto := trim(coalesce(nullif(trim(cfg.concepto), ''), 'Cuota')) || ' ' || v_meses[v_mes] || ' ' || v_anio;
  v_vence := make_date(v_anio, v_mes, cfg.dia_vencimiento);

  return query
  with base as (
    select j.id, j.categoria, t.monto as tarifa,
           nullif(lower(trim(j.grupo_familiar)), '') as grupo
      from public.jugadores j
      join public.tesoreria_tarifas t on t.club_id = j.club_id and t.categoria = j.categoria
     where j.club_id = p_club_id
       and j.activo is not false
       and t.monto > 0
  ),
  -- El orden dentro del grupo mira a todos los hermanos activos con tarifa,
  -- aunque alguno ya tenga la cuota del mes: así el descuento no cambia de
  -- dueño según quién se generó primero.
  orden as (
    select b.*, case when b.grupo is null then 1
                     else row_number() over (partition by b.grupo order by b.tarifa desc, b.id) end as puesto
      from base b
  ),
  pendientes as (
    select o.*,
           case when o.puesto > 1 then round(o.tarifa * cfg.descuento_hermanos / 100, 2) else 0 end as desc_monto
      from orden o
     where not exists (
       select 1 from public.tesoreria_deudas d
        where d.club_id = p_club_id and d.jugador_id = o.id
          and d.mes_correspondiente = p_periodo
          and (d.tipo = 'mensual' or d.concepto ilike 'cuota%')
     )
  ),
  nuevas as (
    insert into public.tesoreria_deudas (club_id, jugador_id, concepto, monto_original, fecha_vencimiento, mes_correspondiente, estado, tipo)
    select p_club_id, p.id, v_concepto, p.tarifa - p.desc_monto, v_vence, p_periodo, 'Pendiente', 'mensual'
      from pendientes p
     where not p_simular
    returning id as nid, tesoreria_deudas.jugador_id as njug
  )
  select n.nid, p.id, p.categoria, v_concepto, p.tarifa - p.desc_monto, p.desc_monto, v_vence
    from pendientes p
    left join nuevas n on n.njug = p.id
   where p_simular or n.nid is not null
   order by p.categoria, p.id;
end
$$;

revoke execute on function public.generar_cuotas_mes(uuid, text, boolean) from anon;
revoke execute on function public.asignar_grupo_familiar(bigint, text) from anon;
grant execute on function public.generar_cuotas_mes(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.asignar_grupo_familiar(bigint, text) to authenticated;

commit;

notify pgrst, 'reload schema';
