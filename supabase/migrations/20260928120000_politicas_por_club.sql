-- ════════════════════════════════════════════════════════════════════════════
--  CADA CLUB, LO SUYO: LAS ÚLTIMAS POLÍTICAS QUE CRUZABAN CLUBES
--
--  Revisadas con pg_policies el 27/09/2026. Estas siete miraban el rol pero
--  no el club (o dejaban al admin de cualquier club):
--
--    eventos      "Escritura de eventos"      un admin escribía en cualquier club
--    partidos     "Escritura de partidos"     ídem
--    rendimiento  "Escritura de rendimiento"  ídem
--    partidos     "insertar_partidos"         ct/manager creaban partidos de otro club
--    rendimiento  "ver_rendimiento"           staff y 'kiosco' leían todos los clubes
--    wellness     "acceso_wellness"           ct/manager leían el wellness de todos
--    novedades    "Borrado_Novedades"         admin/manager borraban novedades ajenas
--
--  Quedan con el mismo nombre y los mismos roles, pero sólo sobre su club.
--  El superuser sigue viendo y editando todo. El jugador con usuario sigue
--  viendo lo suyo. El kiosco no pierde nada: sus políticas propias ya lo
--  dejan ver su club (migración 20260927120000).
--
--  Cómo corre: cada tabla en su propia transacción corta (nunca dos
--  bloqueadas a la vez, así no se cruza con la app). Si una está ocupada más
--  de 10 segundos corta con "lock timeout": volver a correr el archivo.
--  Se puede correr más de una vez.
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

-- ── eventos ──
begin;
set local lock_timeout = '10s';
lock table public.eventos in access exclusive mode;
drop policy if exists "Escritura de eventos" on public.eventos;
create policy "Escritura de eventos" on public.eventos for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));
commit;

-- ── partidos ──
begin;
set local lock_timeout = '10s';
lock table public.partidos in access exclusive mode;
drop policy if exists "Escritura de partidos" on public.partidos;
create policy "Escritura de partidos" on public.partidos for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));
drop policy if exists insertar_partidos on public.partidos;
create policy insertar_partidos on public.partidos for insert to authenticated
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager')
                  and club_id::text = (select public.get_user_club_id())));
commit;

-- ── rendimiento ──
begin;
set local lock_timeout = '10s';
lock table public.rendimiento in access exclusive mode;
drop policy if exists "Escritura de rendimiento" on public.rendimiento;
create policy "Escritura de rendimiento" on public.rendimiento for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));
drop policy if exists ver_rendimiento on public.rendimiento;
create policy ver_rendimiento on public.rendimiento for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'admin', 'manager')
             and club_id::text = (select public.get_user_club_id()))
         or id_jugador in (select j.id from public.jugadores j where j.user_id = auth.uid()));
commit;

-- ── wellness ──
begin;
set local lock_timeout = '10s';
lock table public.wellness in access exclusive mode;
drop policy if exists acceso_wellness on public.wellness;
create policy acceso_wellness on public.wellness for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager')
             and club_id::text = (select public.get_user_club_id()))
         or jugador_id in (select j.id from public.jugadores j where j.user_id = auth.uid()));
commit;

-- ── novedades ──
begin;
set local lock_timeout = '10s';
lock table public.novedades in access exclusive mode;
drop policy if exists "Borrado_Novedades" on public.novedades;
create policy "Borrado_Novedades" on public.novedades for delete to authenticated
  using (autor_id = auth.uid()
         or (select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('admin', 'manager')
             and club_id::text = (select public.get_user_club_id())));
commit;

-- ── CÓMO QUEDÓ ──
select tablename as tabla, policyname as politica, cmd as operacion, qual as condicion, with_check
  from pg_policies
 where schemaname = 'public'
   and policyname in ('Escritura de eventos', 'Escritura de partidos', 'insertar_partidos',
                      'Escritura de rendimiento', 'ver_rendimiento', 'acceso_wellness', 'Borrado_Novedades')
 order by 1, 2;
