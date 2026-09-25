-- ════════════════════════════════════════════════════════════════════════════
--  SEGURIDAD: TESORERÍA CERRADA POR CLUB Y ROL, Y EL KIOSCO ATADO A SU CLUB
--
--  Lo que había (revisado con pg_policies el 25/09/2026):
--
--  1. El usuario compartido del kiosco (kiosco@virtualstats.com) tiene la
--     contraseña adentro de la app, así que cualquiera puede entrar con él.
--     Sus políticas no miraban el club: con ese usuario se leían TODOS los
--     perfiles (con la columna password_clara), TODOS los jugadores (DNI,
--     celular, PIN) y TODAS las deudas, de todos los clubes.
--  2. Tesorería y sponsors: sólo admin y manager (el tesorero no podía
--     guardar nada) y el kiosco leía las deudas de todos.
--  3. Lecturas y escrituras entre clubes: un admin o manager leía todos los
--     clubes y todos los jugadores, y un admin escribía jugadores de
--     cualquier club.
--  4. Un admin o manager podía cambiarle el rol a cualquiera de su club,
--     incluso a sí mismo, a 'superuser' (que ve y edita todos los clubes).
--  5. Nadie salvo el superuser podía actualizar su club: la configuración
--     bancaria, la citación y el escudo fallaban para el admin.
--
--  Lo que queda:
--
--  · El kiosco manda en cada pedido el token de la sesión del jugador
--    (header x-kiosco-token, lo agrega src/supabase.js). kiosco_club()
--    devuelve el club de ese token, y todas las políticas del kiosco pasan a
--    ser "sólo filas de ese club". Sin PIN no hay token, y sin token el
--    kiosco no ve nada (la lista para elegir jugador sale de
--    obtener_plantel_kiosco, que no expone datos personales).
--  · El kiosco deja de leer perfiles y deudas. El saldo lo trae
--    kiosco_estado_cuenta(token), sólo del jugador que entró.
--  · 5 PIN mal seguidos bloquean a ese jugador 15 minutos.
--  · Tesorería, cajas y sponsors: superuser, admin, manager y tesorero, sólo
--    de su club.
--  · Clubes y jugadores: cada uno el suyo (el superuser conserva lo global).
--  · Perfiles: el admin o manager no puede crear, tocar ni convertir a nadie
--    en superuser.
--  · Clubes: admin, manager y tesorero actualizan su club; el tesorero sólo
--    los datos de cobro, y nadie salvo el superuser el plan o la suscripción.
--
--  CÓMO CORRE (para no trabarse con la app en uso)
--  Cambiar una política bloquea su tabla un instante. Si se bloquean varias
--  a la vez, un pedido de la app que usa dos de ellas puede quedar cruzado
--  con la migración ("deadlock detected"). Por eso cada tabla va en su
--  propia transacción corta: nunca hay más de una tabla bloqueada.
--  Si una está ocupada más de 10 segundos, ese paso corta con "lock
--  timeout": lo anterior ya quedó guardado y alcanza con volver a correr
--  todo el archivo (cada paso se puede repetir sin problema).
--
--  Al final muestra cómo quedaron las políticas que mencionan al kiosco.
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

-- ════ PARTE 1: FUNCIONES (no bloquean ninguna tabla en uso) ════════════════
begin;

-- El club de la sesión del kiosco que viene en el header. NULL si quien
-- pregunta no es el usuario del kiosco, si no mandó token o si venció.
create or replace function public.kiosco_club()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_token text;
  v_club  text;
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'kiosco@virtualstats.com' then
    return null;
  end if;
  begin
    v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-kiosco-token';
  exception when others then
    return null;
  end;
  if v_token is null or v_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  select s.club_id into v_club
    from public.kiosco_sesiones s
   where s.token = v_token::uuid and s.expira_at > now();
  return v_club;
end
$$;

-- ¿Quien pregunta maneja la plata de este club?
create or replace function public.maneja_plata(p_club uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles p
     where p.id = auth.uid()
       and p.rol in ('superuser', 'admin', 'manager', 'tesorero')
       and p.club_id = p_club
  );
$$;

-- Qué columnas puede cambiar cada uno. El plan y la suscripción, sólo el
-- superuser (o el servidor).
create or replace function public.proteger_columnas_club()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.get_user_rol();
  v_permitidas text[];
begin
  if auth.uid() is null or v_rol = 'superuser' then
    return new;
  end if;
  v_permitidas := case
    when v_rol = 'tesorero' then array['alias_cobro', 'cbu', 'cvu', 'whatsapp_tesoreria']
    else array['nombre', 'escudo_url', 'alias_cobro', 'cbu', 'cvu', 'whatsapp_tesoreria', 'citacion_config', 'plan_interes']
  end;
  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'No tenés permiso para cambiar esos datos del club' using errcode = '42501';
  end if;
  return new;
end
$$;

-- ── 5. PIN: LISTA SIN DATOS, SESIÓN CON LÍMITE DE INTENTOS ────────────────

-- La lista para elegir jugador: sólo nombre, apellido, apodo, categoría y
-- foto de los activos. Se recrea para asegurar que no devuelva nada más.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'obtener_plantel_kiosco'
  loop
    execute format('drop function %s', f.firma);
  end loop;
end $$;

create function public.obtener_plantel_kiosco(codigo_club text)
returns table (id bigint, nombre text, apellido text, apodo text, categoria text, foto text)
language sql stable security definer set search_path = public as $$
  select j.id, j.nombre, j.apellido, j.apodo, j.categoria, j.foto
    from public.jugadores j
   where j.club_id::text = codigo_club
     and j.activo is not false;
$$;

grant execute on function public.obtener_plantel_kiosco(text) to anon, authenticated;

-- verificar_pin_kiosco se reemplaza por kiosco_abrir_sesion (que ya valida
-- el PIN y devuelve el token). Se borra para que no quede una puerta sin
-- límite de intentos.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'verificar_pin_kiosco'
  loop
    execute format('drop function %s', f.firma);
  end loop;
end $$;

create table if not exists public.kiosco_intentos (
  id         bigserial primary key,
  jugador_id text not null,
  club_id    text not null,
  creado_at  timestamptz not null default now()
);
alter table public.kiosco_intentos enable row level security;
create index if not exists kiosco_intentos_jugador_idx on public.kiosco_intentos (jugador_id, creado_at);

create or replace function public.kiosco_abrir_sesion(
  p_jugador_id text, p_club_id text, p_pin text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  -- 5 PIN mal en 15 minutos: ese jugador queda bloqueado un rato.
  if (select count(*) from public.kiosco_intentos i
       where i.jugador_id = p_jugador_id and i.creado_at > now() - interval '15 minutes') >= 5 then
    raise exception 'kiosco: demasiados intentos, probá en unos minutos' using errcode = 'P0429';
  end if;

  if coalesce(p_pin, '') !~ '^\d{4}$' or not exists (
    select 1 from public.jugadores j
     where j.id::text = p_jugador_id
       and j.club_id::text = p_club_id
       and j.pin_kiosco::text = p_pin
       and j.activo is not false
  ) then
    insert into public.kiosco_intentos (jugador_id, club_id) values (p_jugador_id, p_club_id);
    return null;
  end if;

  delete from public.kiosco_intentos
   where jugador_id = p_jugador_id or creado_at < now() - interval '1 day';
  delete from public.kiosco_sesiones where expira_at < now();

  insert into public.kiosco_sesiones (jugador_id, club_id)
  values (p_jugador_id, p_club_id)
  returning token into v_token;

  return v_token;
end
$$;

-- Estado de cuenta.
-- ── 6. ESTADO DE CUENTA DEL JUGADOR (KIOSCO) ──────────────────────────────
-- Lo que debe el jugador que entró y cómo pagarle al club. Nada de los demás.
create or replace function public.kiosco_estado_cuenta(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.kiosco_sesiones;
  v_club jsonb;
  v_deudas jsonb;
begin
  select * into s from public.kiosco_sesiones
   where token = p_token and expira_at > now();
  if not found then
    raise exception 'kiosco: sesión vencida o inexistente' using errcode = '28000';
  end if;

  select jsonb_build_object(
           'nombre', c.nombre, 'escudo_url', c.escudo_url, 'alias_cobro', c.alias_cobro,
           'cbu', c.cbu, 'cvu', c.cvu, 'whatsapp_tesoreria', c.whatsapp_tesoreria)
    into v_club
    from public.clubes c where c.id::text = s.club_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'concepto', d.concepto, 'monto_original', d.monto_original,
           'monto_pagado', coalesce(d.monto_pagado, 0), 'fecha_vencimiento', d.fecha_vencimiento,
           'mes_correspondiente', d.mes_correspondiente, 'estado', d.estado)
         order by d.fecha_vencimiento, d.created_at), '[]'::jsonb)
    into v_deudas
    from public.tesoreria_deudas d
   where d.jugador_id::text = s.jugador_id
     and d.club_id::text = s.club_id
     and d.estado in ('Pendiente', 'Parcial');

  return jsonb_build_object('club', coalesce(v_club, '{}'::jsonb), 'deudas', v_deudas, 'pagos', '[]'::jsonb);
end
$$;

grant execute on function public.kiosco_estado_cuenta(uuid) to anon, authenticated;
grant execute on function public.kiosco_club() to anon, authenticated;
grant execute on function public.maneja_plata(uuid) to authenticated;


-- Ayudantes de esta migración (se borran al final).
create or replace function public._vc_bloquear(p_tabla text)
returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_tabla) is not null then
    execute format('lock table public.%I in access exclusive mode', p_tabla);
  end if;
end $$;

create or replace function public._vc_plata(p_tabla text)
returns void language plpgsql as $$
begin
  if to_regclass('public.' || p_tabla) is null then return; end if;
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('drop policy if exists %I on public.%I', 'Admin ALL ' || p_tabla, p_tabla);
  execute format('drop policy if exists %I on public.%I', 'Plata ALL ' || p_tabla, p_tabla);
  execute format(
    'create policy %I on public.%I for all to authenticated
       using ((select public.maneja_plata(club_id)))
       with check ((select public.maneja_plata(club_id)))',
    'Plata ALL ' || p_tabla, p_tabla);
end $$;

-- Toda política que habilitaba al usuario del kiosco por su email pasa a
-- exigir, además, que la fila sea del club de su token. En las tablas sin
-- club_id alcanza con tener un token válido (hay que tener un PIN).
create or replace function public._vc_kiosco_a_su_club(p_tabla text)
returns void
language plpgsql set search_path = public as $$
declare
  r record;
  v_cond_vieja constant text := '((auth.jwt() ->> ''email''::text) = ''kiosco@virtualstats.com''::text)';
  v_cond text;
  v_using text;
  v_check text;
  v_roles text;
begin
  for r in
    select p.*
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = p_tabla
       and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%kiosco@virtualstats.com%'
       and (coalesce(p.qual, '') || coalesce(p.with_check, '')) not like '%kiosco_club()%'
  loop
    if r.tablename = 'clubes' then
      v_cond := '(id::text = (select public.kiosco_club()))';
    elsif exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = r.tablename and c.column_name = 'club_id') then
      v_cond := '(club_id::text = (select public.kiosco_club()))';
    else
      v_cond := '((select public.kiosco_club()) is not null)';
    end if;

    v_using := replace(r.qual, v_cond_vieja, v_cond);
    v_check := replace(r.with_check, v_cond_vieja, v_cond);

    -- Si la condición estaba escrita de otra forma, no se toca: se lista al final.
    if (v_using is not null and v_using like '%kiosco@virtualstats.com%')
       or (v_check is not null and v_check like '%kiosco@virtualstats.com%') then
      raise notice 'Revisar a mano: % en %', r.policyname, r.tablename;
      continue;
    end if;

    select string_agg(quote_ident(x), ', ') into v_roles from unnest(r.roles) x;

    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s%s%s',
      r.policyname, r.tablename, r.permissive, r.cmd, v_roles,
      case when v_using is not null then ' using (' || v_using || ')' else '' end,
      case when v_check is not null then ' with check (' || v_check || ')' else '' end);
  end loop;
end $$;

commit;

-- ════ PARTE 2: TABLA POR TABLA (cada una, un instante) ══════════════════════

-- ── Tesorería y sponsors: club + rol ──
-- tesoreria_pagos
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_pagos');
select public._vc_plata('tesoreria_pagos');
commit;

-- tesoreria_egresos
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_egresos');
select public._vc_plata('tesoreria_egresos');
commit;

-- tesoreria_empleados
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_empleados');
select public._vc_plata('tesoreria_empleados');
commit;

-- tesoreria_ingresos_extra
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_ingresos_extra');
select public._vc_plata('tesoreria_ingresos_extra');
commit;

-- sponsors
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('sponsors');
select public._vc_plata('sponsors');
commit;

-- sponsors_pagos
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('sponsors_pagos');
select public._vc_plata('sponsors_pagos');
commit;

-- tesoreria_cajas
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_cajas');
select public._vc_plata('tesoreria_cajas');
drop policy if exists acceso_tesoreria on public.tesoreria_cajas;
commit;

-- tesoreria_deudas
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('tesoreria_deudas');
select public._vc_plata('tesoreria_deudas');
-- El saldo del kiosco sale de kiosco_estado_cuenta().
drop policy if exists "Kiosco_select_tesoreria_deudas" on public.tesoreria_deudas;
commit;

-- ── Clubes: cada uno el suyo; admin, manager y tesorero actualizan el propio ──
-- clubes
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('clubes');
-- "Lectura de clubes" dejaba a cualquier admin o manager leer todos los
-- clubes. El propio lo cubre "Staff SELECT clubes".
drop policy if exists "Lectura de clubes" on public.clubes;
drop policy if exists "Staff UPDATE clubes" on public.clubes;
create policy "Staff UPDATE clubes" on public.clubes for update to authenticated
  using (id::text = (select public.get_user_club_id())
         and (select public.get_user_rol()) in ('admin', 'manager', 'tesorero'))
  with check (id::text = (select public.get_user_club_id())
              and (select public.get_user_rol()) in ('admin', 'manager', 'tesorero'));
drop trigger if exists proteger_columnas_club on public.clubes;
create trigger proteger_columnas_club
  before update on public.clubes
  for each row execute function public.proteger_columnas_club();
select public._vc_kiosco_a_su_club('clubes');
commit;

-- ── Jugadores: cada club los suyos ──
-- jugadores
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('jugadores');
-- "ver_jugadores" y "Escritura de jugadores" abrían jugadores de otros
-- clubes. El propio lo cubren "Lectura de jugadores", "Staff SELECT
-- jugadores" y "CT/Admin ALL jugadores"; el superuser tiene lo suyo.
drop policy if exists ver_jugadores on public.jugadores;
drop policy if exists "Escritura de jugadores" on public.jugadores;
select public._vc_kiosco_a_su_club('jugadores');
commit;

-- ── Perfiles: nadie se hace superuser; el kiosco no los lee ──
-- perfiles
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('perfiles');
drop policy if exists "Admin ALL perfiles" on public.perfiles;
create policy "Admin ALL perfiles" on public.perfiles for all to authenticated
  using ((select public.get_user_rol()) in ('admin', 'manager')
         and club_id::text = (select public.get_user_club_id())
         and rol is distinct from 'superuser')
  with check ((select public.get_user_rol()) in ('admin', 'manager')
              and club_id::text = (select public.get_user_club_id())
              and rol is distinct from 'superuser');
-- El kiosco sólo los usaba para el autor de las novedades.
drop policy if exists "Lectura_Perfiles_Kiosco" on public.perfiles;
drop policy if exists "Staff SELECT perfiles" on public.perfiles;
create policy "Staff SELECT perfiles" on public.perfiles for select to authenticated
  using (club_id::text = (select public.get_user_club_id()) or id = auth.uid());
select public._vc_kiosco_a_su_club('perfiles');
commit;

-- ── El resto de las tablas que lee el kiosco: sólo su club ──
-- eventos
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('eventos');
select public._vc_kiosco_a_su_club('eventos');
commit;

-- novedades
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('novedades');
select public._vc_kiosco_a_su_club('novedades');
commit;

-- partidos
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('partidos');
select public._vc_kiosco_a_su_club('partidos');
commit;

-- rendimiento
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('rendimiento');
select public._vc_kiosco_a_su_club('rendimiento');
commit;

-- video_analisis
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('video_analisis');
select public._vc_kiosco_a_su_club('video_analisis');
commit;

-- video_clips
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('video_clips');
select public._vc_kiosco_a_su_club('video_clips');
commit;

-- video_playlists
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('video_playlists');
select public._vc_kiosco_a_su_club('video_playlists');
commit;

-- wellness
begin;
set local lock_timeout = '10s';
select public._vc_bloquear('wellness');
select public._vc_kiosco_a_su_club('wellness');
commit;


-- ════ PARTE 3: LIMPIEZA ════════════════════════════════════════════════════
begin;
drop function if exists public._vc_bloquear(text);
drop function if exists public._vc_plata(text);
drop function if exists public._vc_kiosco_a_su_club(text);
commit;

notify pgrst, 'reload schema';

-- ── 7. CÓMO QUEDÓ ─────────────────────────────────────────────────────────
-- Todas deberían mencionar kiosco_club(). Si alguna todavía dice
-- kiosco@virtualstats.com sin kiosco_club() (una tabla que no estaba en la
-- lista de arriba), pasame esta lista.
select tablename as tabla, policyname as politica, cmd as operacion, qual as condicion
  from pg_policies
 where schemaname = 'public'
   and (qual like '%kiosco%' or with_check like '%kiosco%')
 order by 1, 2;
