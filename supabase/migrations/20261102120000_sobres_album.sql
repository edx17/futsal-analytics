-- ═══════════════════════════════════════════════════════════════════════════
-- SOBRES · EL ÁLBUM
--
-- La colección con las figuritas que faltan: todo el catálogo activo del club
-- (más las cartas que tenés aunque ya no estén activas). De las que no tenés
-- sólo viaja la rareza, el tipo y la posición, para la silueta y los filtros;
-- la carta completa (nombre, foto, medias) sólo si es tuya.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sobres_album(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'catalogo_id', k.id,
             'rareza', k.rareza,
             'tipo', k.tipo,
             'rol', k.carta->>'rol',
             'tengo', cc.catalogo_id is not null,
             'carta', case when cc.catalogo_id is not null then public._sobres_carta(k) end,
             'obtenida_at', cc.obtenida_at)
           order by (cc.catalogo_id is null), k.rareza, k.carta->>'apellido')
      from public.cartas_catalogo k
      left join public.cartas_coleccion cc
        on cc.catalogo_id = k.id and cc.club_id = c.o_club and cc.dueno = c.o_dueno
     where k.club_id = c.o_club
       and (k.activa or cc.catalogo_id is not null)), '[]'::jsonb);
end
$$;

grant execute on function public.sobres_album(uuid) to anon, authenticated;
