-- ════════════════════════════════════════════════════════════════════════════
--  KIOSCO PRIVADO ENTRE COMPAÑEROS, ALTA DE PERFILES CERRADA Y REGISTRO
--
--  1. Kiosco: después del PIN, un jugador leía la fila completa de sus
--     compañeros (DNI, celular, PIN, obra social…) y el wellness de todos.
--     Ahora:
--       · jugadores_kiosco: una vista con lo que las pantallas del kiosco
--         muestran de los compañeros (nombre, apellido, apodo, dorsal,
--         posición, categoría, foto). De su propia fila, además, el
--         nacimiento, el apto y el físico. La app la usa en modo kiosco.
--       · La tabla jugadores, para el kiosco: sólo su propia fila.
--       · wellness, para el kiosco: sólo el suyo (leer, cargar y corregir).
--  2. "Propio INSERT perfiles" dejaba que cualquiera que se creara una cuenta
--     se insertara un perfil con el rol que quisiera, incluso superuser. Se
--     borra: los perfiles los crea el superuser (Gestión master) o el
--     registro de clubes (punto 3), del lado del servidor.
--  3. Registro de clubes: la pantalla creaba el club desde el navegador, cosa
--     que la base no permite (sólo el superuser), así que el alta fallaba.
--     Ahora el club y el perfil los crea la base al crearse la cuenta, si la
--     cuenta trae los datos del registro (vc_registro en los metadatos). El
--     que registra el club queda como manager.
--
--  Cómo corre: funciones primero; después cada tabla en su propia
--  transacción corta con lock_timeout (nunca dos bloqueadas a la vez). Si
--  corta con "lock timeout", volver a correr el archivo: se puede repetir.
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

-- ════ PARTE 1: FUNCIONES Y VISTA (no bloquean tablas en uso) ═══════════════
begin;

-- El jugador de la sesión del kiosco que viene en el header (mismo criterio
-- que kiosco_club()). NULL si no es el kiosco, no hay token o venció.
create or replace function public.kiosco_jugador()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_token text;
  v_jug   text;
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
  select s.jugador_id into v_jug
    from public.kiosco_sesiones s
   where s.token = v_token::uuid and s.expira_at > now();
  return v_jug;
end
$$;
grant execute on function public.kiosco_jugador() to anon, authenticated;

-- Lo que el kiosco ve del plantel de su club. Corre con los permisos del
-- dueño de la vista: el filtro de acá abajo (el club del token) es lo que
-- la protege, y sin token de kiosco no devuelve nada.
create or replace view public.jugadores_kiosco
with (security_barrier = true) as
select j.id, j.club_id, j.nombre, j.apellido, j.apodo, j.dorsal, j.posicion, j.categoria,
       j.foto, j.activo, j.estado_ficha,
       case when j.id::text = k.jugador then j.fechanac end         as fechanac,
       case when j.id::text = k.jugador then j.vencimiento_apto end as vencimiento_apto,
       case when j.id::text = k.jugador then j.pierna end           as pierna,
       case when j.id::text = k.jugador then j.peso end             as peso,
       case when j.id::text = k.jugador then j.altura end           as altura
  from public.jugadores j
 cross join lateral (select public.kiosco_club() as club, public.kiosco_jugador() as jugador) k
 where k.club is not null
   and j.club_id::text = k.club;

revoke all on public.jugadores_kiosco from public, anon;
grant select on public.jugadores_kiosco to authenticated;

comment on view public.jugadores_kiosco is
  'Plantel visto desde el kiosco: sólo el club del token (x-kiosco-token), sin datos personales de los compañeros.';

-- Registro de club: al crearse la cuenta, si trae vc_registro en los
-- metadatos, crea el club (prueba de 30 días) y el perfil de quien lo
-- registra como manager. Si algo falla no frena la creación de la cuenta.
create or replace function public.registrar_club_nuevo()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_reg  jsonb := new.raw_user_meta_data -> 'vc_registro';
  v_club uuid;
  v_nombre_club text;
begin
  if v_reg is null or jsonb_typeof(v_reg) <> 'object' then
    return new;
  end if;
  v_nombre_club := nullif(trim(v_reg ->> 'club'), '');
  if v_nombre_club is null then
    return new;
  end if;

  begin
    insert into public.clubes (nombre, plan_actual, plan_interes, suscripcion_activa, fecha_vencimiento)
    values (left(v_nombre_club, 120), 'trial', nullif(v_reg ->> 'plan_interes', ''), true,
            (now() at time zone 'America/Argentina/Buenos_Aires')::date + 30)
    returning id into v_club;

    insert into public.perfiles (id, club_id, rol, nombre_completo, email)
    values (new.id, v_club, 'manager', left(nullif(trim(v_reg ->> 'nombre_completo'), ''), 120), new.email)
    on conflict (id) do update
      set club_id = excluded.club_id, rol = excluded.rol,
          nombre_completo = coalesce(excluded.nombre_completo, perfiles.nombre_completo),
          email = coalesce(perfiles.email, excluded.email)
      where perfiles.club_id is null;
  exception when others then
    raise warning 'registrar_club_nuevo(%): %', new.id, sqlerrm;
  end;
  return new;
end
$$;

commit;

-- ════ PARTE 2: TABLA POR TABLA ═════════════════════════════════════════════

-- ── jugadores: el kiosco, sólo su propia fila (el resto, por la vista) ──
begin;
set local lock_timeout = '10s';
lock table public.jugadores in access exclusive mode;
drop policy if exists "Kiosco_select_jugadores" on public.jugadores;
create policy "Kiosco_select_jugadores" on public.jugadores for select to authenticated
  using (club_id::text = (select public.kiosco_club())
         and id::text = (select public.kiosco_jugador()));
commit;

-- ── wellness: el kiosco, sólo el del jugador que entró ──
begin;
set local lock_timeout = '10s';
lock table public.wellness in access exclusive mode;
drop policy if exists "Kiosco_select_wellness" on public.wellness;
create policy "Kiosco_select_wellness" on public.wellness for select to authenticated
  using (club_id::text = (select public.kiosco_club())
         and jugador_id::text = (select public.kiosco_jugador()));
drop policy if exists "Kiosco_insert_wellness" on public.wellness;
create policy "Kiosco_insert_wellness" on public.wellness for insert to authenticated
  with check (club_id::text = (select public.kiosco_club())
              and jugador_id::text = (select public.kiosco_jugador()));
drop policy if exists "Kiosco_update_wellness" on public.wellness;
create policy "Kiosco_update_wellness" on public.wellness for update to authenticated
  using (club_id::text = (select public.kiosco_club())
         and jugador_id::text = (select public.kiosco_jugador()))
  with check (club_id::text = (select public.kiosco_club())
              and jugador_id::text = (select public.kiosco_jugador()));
commit;

-- ── perfiles: nadie se da de alta a sí mismo con el rol que quiera ──
begin;
set local lock_timeout = '10s';
lock table public.perfiles in access exclusive mode;
drop policy if exists "Propio INSERT perfiles" on public.perfiles;
commit;

-- ── auth.users: el registro de clubes ──
-- El nombre empieza con zz_ para correr después de cualquier otro trigger
-- que ya cree perfiles al darse de alta una cuenta.
begin;
set local lock_timeout = '10s';
drop trigger if exists zz_vc_registrar_club on auth.users;
create trigger zz_vc_registrar_club
  after insert on auth.users
  for each row execute function public.registrar_club_nuevo();
commit;

notify pgrst, 'reload schema';

-- ── CÓMO QUEDÓ ──
select tablename as tabla, policyname as politica, cmd as operacion, coalesce(qual, with_check) as condicion
  from pg_policies
 where schemaname = 'public'
   and (policyname in ('Kiosco_select_jugadores', 'Kiosco_select_wellness', 'Kiosco_insert_wellness',
                       'Kiosco_update_wellness', 'Propio INSERT perfiles'))
 order by 1, 2;
