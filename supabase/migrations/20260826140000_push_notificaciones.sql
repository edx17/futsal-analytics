-- ════════════════════════════════════════════════════════════════════════════
--  Notificaciones push — tablas de soporte
--
--  El envío ya existe (supabase/functions/smart-service): firma con VAPID y
--  manda a cada fila de push_subscriptions. Lo que faltaba versionado son las
--  dos tablas de las que depende, y sobre todo el índice único en `endpoint`:
--  sin él, el alta de un dispositivo falla con 42P10 porque el upsert del
--  frontend usa onConflict:'endpoint'.
--
--  Es idempotente y no destructiva: si las tablas ya existen las deja como
--  están y sólo agrega lo que falte. Correla sólo si el diagnóstico de la
--  campanita marca en rojo "Tabla push_subscriptions" o avisa que falta el
--  índice. Si está todo verde, no hace falta.
--
--  El tipo de club_id se copia de `eventos` en tiempo de migración, igual que
--  en la migración de captura offline, para no clavar uuid a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tablas ──────────────────────────────────────────────────────────────
do $tablas$
declare
  tipo_club text;
begin
  select format_type(a.atttypid, a.atttypmod) into tipo_club
    from pg_attribute a
   where a.attrelid = 'public.eventos'::regclass and a.attname = 'club_id';

  if tipo_club is null then
    raise exception 'No se pudo leer el tipo de public.eventos.club_id';
  end if;

  execute format($t$
    create table if not exists public.push_subscriptions (
      id          bigint generated always as identity primary key,
      club_id     %1$s not null,
      perfil_id   uuid,
      endpoint    text not null,
      p256dh      text not null,
      auth        text not null,
      user_agent  text,
      created_at  timestamptz not null default now()
    )
  $t$, tipo_club);

  execute format($t$
    create table if not exists public.tablon_notificado (
      id         bigint generated always as identity primary key,
      club_id    %1$s not null,
      run_key    text not null,
      created_at timestamptz not null default now()
    )
  $t$, tipo_club);
end
$tablas$;

-- ── 2. Un endpoint, una fila ───────────────────────────────────────────────
-- El índice no se puede crear si ya hay endpoints repetidos, así que primero
-- se limpian los duplicados dejando la fila más nueva de cada endpoint (que
-- es la que tiene las claves vigentes).
do $indices$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'push_subscriptions'
       and indexdef ilike '%unique%(endpoint)%'
  ) then
    delete from public.push_subscriptions a
     using public.push_subscriptions b
     where a.endpoint = b.endpoint and a.id < b.id;

    create unique index push_subscriptions_endpoint_uniq
        on public.push_subscriptions (endpoint);
  end if;
end
$indices$;

create index if not exists push_subscriptions_club_idx
    on public.push_subscriptions (club_id);

-- El dedupe del cron: una notificación por club y por run_key, para que
-- correrlo tres veces al día no mande el mismo aviso tres veces.
do $dedupe$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'tablon_notificado'
       and indexdef ilike '%unique%(club_id, run_key)%'
  ) then
    delete from public.tablon_notificado a
     using public.tablon_notificado b
     where a.club_id = b.club_id and a.run_key = b.run_key and a.id < b.id;

    create unique index tablon_notificado_club_run_uniq
        on public.tablon_notificado (club_id, run_key);
  end if;
end
$dedupe$;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
-- push_subscriptions: cualquiera del club puede dar de alta y de baja SU
-- dispositivo. No hay dato sensible: son claves de envío del propio navegador.
-- tablon_notificado: sólo la toca el Edge Function con service role, que
-- ignora RLS. Se prende sin políticas, o sea que desde el navegador no se ve.
do $rls$
begin
  alter table public.push_subscriptions enable row level security;
  alter table public.tablon_notificado  enable row level security;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'push_subscriptions'
                    and policyname = 'Staff SELECT push_subscriptions') then
    create policy "Staff SELECT push_subscriptions" on public.push_subscriptions
      for select using ((club_id)::text = get_user_club_id());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'push_subscriptions'
                    and policyname = 'Staff ALL push_subscriptions') then
    create policy "Staff ALL push_subscriptions" on public.push_subscriptions
      for all using ((club_id)::text = get_user_club_id())
             with check ((club_id)::text = get_user_club_id());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'push_subscriptions'
                    and policyname = 'Superuser ALL push_subscriptions') then
    create policy "Superuser ALL push_subscriptions" on public.push_subscriptions
      for all using (get_user_rol() = 'superuser'::text);
  end if;
end
$rls$;
