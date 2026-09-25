-- ════════════════════════════════════════════════════════════════════════════
--  PERFILES: CADA UNO PUEDE ACTUALIZAR EL SUYO (SIN "INFINITE RECURSION")
--
--  "Propio UPDATE perfiles" controlaba que nadie se cambiara el rol ni el
--  club leyendo la tabla perfiles DESDE ADENTRO de una política de perfiles.
--  Postgres no lo permite: cualquier update de un usuario sobre su propio
--  perfil (aceptar los términos, por ejemplo) fallaba con
--  "infinite recursion detected in policy for relation perfiles" (42P17).
--
--  Misma regla, mismo nombre: cada uno actualiza su perfil pero no puede
--  cambiarse el rol ni el club. El rol y el club actuales se leen con
--  get_user_rol() / get_user_club_id(), que no pasan por las políticas.
--
--  Una sola tabla, transacción corta con lock_timeout. Se puede repetir.
-- ════════════════════════════════════════════════════════════════════════════

set client_min_messages = warning;

begin;
set local lock_timeout = '10s';
lock table public.perfiles in access exclusive mode;
drop policy if exists "Propio UPDATE perfiles" on public.perfiles;
create policy "Propio UPDATE perfiles" on public.perfiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid()
              and rol is not distinct from (select public.get_user_rol())
              and club_id::text is not distinct from (select public.get_user_club_id()));
commit;

notify pgrst, 'reload schema';

-- Ninguna política de perfiles debería leer la tabla perfiles directamente.
-- Esto tiene que devolver 0 filas.
select policyname as politica_que_se_lee_a_si_misma, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'perfiles'
   and (coalesce(qual, '') || coalesce(with_check, '')) ~* 'from\s+perfiles';
