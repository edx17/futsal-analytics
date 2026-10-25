-- ═══════════════════════════════════════════════════════════════════════════
--  MYSQUAD: LOS MANAGERS ADMINISTRAN LAS CARTAS Y LOS SOBRES DE SU CLUB
--
--  La vista simple del club (Sobres · CARTAS Y SOBRES DEL CLUB) deja al
--  manager / admin corregir la media de una carta (cartas_ajustes) y cambiar
--  los sobres de su club (sobres_config: activos, nombre, cantidad, precio,
--  cinemática). Hasta ahora eso era sólo del superusuario. Las cartas
--  (cartas_catalogo) y sus fotos (cartas_fotos) el staff ya las podía tocar.
--
--  Además, los sobres creados en el Modo GOD (eventos sin fecha marcados
--  `sobre.permanente`) se avisan como tales en el estado de los sobres.
--
--  Va después de 20261022140000. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "Manager ALL cartas_ajustes" on public.cartas_ajustes;
create policy "Manager ALL cartas_ajustes" on public.cartas_ajustes for all to authenticated
  using ((select public.get_user_rol()) in ('manager', 'admin') and club_id::text = (select public.get_user_club_id()))
  with check ((select public.get_user_rol()) in ('manager', 'admin') and club_id::text = (select public.get_user_club_id()));

drop policy if exists "Manager ALL sobres_config" on public.sobres_config;
create policy "Manager ALL sobres_config" on public.sobres_config for all to authenticated
  using ((select public.get_user_rol()) in ('manager', 'admin') and club_id::text = (select public.get_user_club_id()))
  with check ((select public.get_user_rol()) in ('manager', 'admin') and club_id::text = (select public.get_user_club_id()));

-- Los eventos que corren hoy para un dueño, ahora diciendo si es un sobre fijo (sin fecha).
create or replace function public._sobres_eventos_de(p_club uuid, p_dueno text, p_puntos int, p_hoy date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nombre', e.nombre, 'escena', e.escena, 'desde', e.desde, 'hasta', e.hasta,
           'permanente', coalesce((e.sobre ->> 'permanente')::boolean, false),
           'cartas', public._evento_regla(e, 'cartas', 3, 1, 10),
           'costo', public._evento_regla(e, 'costo', 0, 0, 5000),
           'por_dia', public._evento_regla(e, 'por_dia', 1, 1, 5),
           'abiertos_hoy', x.hoy,
           'total_cartas', x.total,
           'disponible', x.total > 0
                         and x.hoy < public._evento_regla(e, 'por_dia', 1, 1, 5)
                         and p_puntos >= public._evento_regla(e, 'costo', 0, 0, 5000))
         order by e.created_at), '[]'::jsonb)
    from public.sobres_eventos e
    cross join lateral (select
        (select count(*) from public.sobres_abiertos a
          where a.club_id = p_club and a.dueno = p_dueno and a.evento_id = e.id and a.dia = p_hoy) as hoy,
        (select count(*) from public.cartas_catalogo k
          where k.club_id = p_club and k.activa and k.clave = any (e.cartas)) as total) x
   where e.club_id = p_club and e.activo
     and (e.desde is null or e.desde <= p_hoy) and (e.hasta is null or e.hasta >= p_hoy)
$$;
revoke all on function public._sobres_eventos_de(uuid, text, int, date) from public, anon, authenticated;
