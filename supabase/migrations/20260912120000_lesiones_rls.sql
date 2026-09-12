-- ═══════════════════════════════════════════════════════════════════════════
--  RLS DE `lesiones`  — ARREGLO
--
--  La migración 20260911170000 creó la tabla y dejó, COMENTADA, una política
--  de ejemplo que estaba mal:
--
--    for all using (club_id = (select club_id from public.usuarios where id = auth.uid()))
--
--  Esa subconsulta lee `usuarios`, que tiene su propio RLS, así que desde el
--  navegador devuelve NULL: la comparación da NULL, nunca true, y cualquier
--  INSERT termina en
--      "new row violates row-level security policy for table lesiones" (403).
--
--  Acá se reemplaza por las MISMAS tres políticas y los MISMOS helpers que ya
--  usan sesiones, eventos, jugadores y temas_semana. get_user_club_id()
--  devuelve text, por eso el club_id se castea.
--
--  Quién puede qué, igual que en la pantalla:
--    · leer     → todo el staff del club (el manager ve el parte, no lo toca)
--    · escribir → CT y superuser, que es lo que se definió para datos médicos
--    · jugador  → NO lee la tabla directo. En esta app el "jugador" entra por
--                 el kiosco, que es una sesión del club y no un usuario por
--                 persona, así que una política por jugador no se puede
--                 expresar: le abriría las lesiones de todo el plantel. El
--                 recorte a "sólo lo mío" lo hace la pantalla, igual que en
--                 Wellness y Fisiología.
--
--  Es idempotente: se puede correr por arriba de un intento anterior.
-- ═══════════════════════════════════════════════════════════════════════════

do $rls$
begin
  -- Si faltan los helpers, avisar con un mensaje que se entienda en vez de
  -- fallar con "function does not exist" a mitad de camino.
  if to_regprocedure('public.get_user_rol()') is null
     or to_regprocedure('public.get_user_club_id()') is null then
    raise exception
      'Faltan las funciones get_user_rol() / get_user_club_id(), que son las que usan las políticas del resto de las tablas. Revisá que existan antes de correr esta migración.';
  end if;

  alter table public.lesiones enable row level security;

  -- Por si quedó creada la política del ejemplo viejo, que es la que rompía.
  drop policy if exists "lesiones del propio club" on public.lesiones;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'lesiones'
                    and policyname = 'Staff SELECT lesiones') then
    create policy "Staff SELECT lesiones" on public.lesiones
      for select using (
        (get_user_rol() = any (array['ct'::text, 'admin'::text, 'manager'::text, 'superuser'::text]))
        and ((club_id)::text = get_user_club_id())
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'lesiones'
                    and policyname = 'CT ALL lesiones') then
    create policy "CT ALL lesiones" on public.lesiones
      for all using (
        (get_user_rol() = 'ct'::text)
        and ((club_id)::text = get_user_club_id())
      );
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'lesiones'
                    and policyname = 'Superuser ALL lesiones') then
    create policy "Superuser ALL lesiones" on public.lesiones
      for all using (get_user_rol() = 'superuser'::text);
  end if;
end
$rls$;
