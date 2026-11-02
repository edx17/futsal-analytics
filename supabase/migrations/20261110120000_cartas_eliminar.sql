-- ═══════════════════════════════════════════════════════════════════════════
--  MySquad: ELIMINAR cartas del catálogo para siempre (Modo GOD → CARTAS)
--
--  Dar de baja deja la carta en las colecciones; eliminar la borra del
--  catálogo y de la colección de todos los que la tienen (y de las vistas del
--  V-Draft, por cascada). A cada dueño se le devuelven V-Coins por cada copia
--  que pierde: los puntos de la rareza × p_factor. Cada devolución queda en
--  vcoins_movimientos, con el motivo.
--
--  La clave de cada carta eliminada se guarda en cartas_eliminadas, para que
--  el Modo GOD no la vuelva a ofrecer como "pendiente de publicar" (el premio
--  sigue en HISTORIAL).
--
--  god_eliminar_cartas(..., p_simular => true) no toca nada: devuelve lo que
--  pasaría (cartas, dueños, copias, V-Coins) para mostrarlo antes de confirmar.
--  Sólo el superusuario. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cartas_eliminadas (
  club_id      uuid not null references public.clubes(id) on delete cascade,
  clave        text not null,
  carta        jsonb,
  duenos       integer not null default 0,
  vcoins       integer not null default 0,
  motivo       text,
  por          uuid default auth.uid(),
  eliminada_at timestamptz not null default now(),
  primary key (club_id, clave)
);
comment on table public.cartas_eliminadas is 'MySquad: cartas borradas del catálogo por el superusuario (no se vuelven a ofrecer para publicar).';

alter table public.cartas_eliminadas enable row level security;
-- La leen el superusuario y el staff del club (el panel del club también ofrece publicar).
drop policy if exists "Staff SELECT cartas_eliminadas" on public.cartas_eliminadas;
create policy "Staff SELECT cartas_eliminadas" on public.cartas_eliminadas for select to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin') and club_id::text = (select public.get_user_club_id())));

-- Los puntos de cada rareza (los mismos de RAREZAS en src/analytics/sobres.js).
create or replace function public._puntos_rareza(p_rareza text)
returns int language sql immutable set search_path = public as $$
  select case p_rareza
    when 'bronce' then 5 when 'plata' then 10 when 'oro' then 25
    when 'totw' then 40 when 'potw' then 50 when 'totm' then 60
    when 'potm' then 75 when 'toty' then 100 else 25 end
$$;

create or replace function public.god_eliminar_cartas(
  p_club uuid, p_ids uuid[], p_factor numeric default 2, p_motivo text default null, p_simular boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_cartas int;
  v_duenos int;
  v_copias int;
  v_vcoins int;
  v_motivo text := coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 'Carta eliminada');
begin
  perform public._god_o_error();
  if p_factor is null or p_factor < 0 or p_factor > 100 then
    raise exception 'god: el factor de devolución tiene que estar entre 0 y 100' using errcode = '22023';
  end if;

  drop table if exists _elim, _dev;
  create temp table _elim on commit drop as
    select k.id, k.clave, k.carta, public._puntos_rareza(k.rareza) as puntos
      from public.cartas_catalogo k
     where k.club_id = p_club and k.id = any (coalesce(p_ids, '{}'));

  create temp table _dev on commit drop as
    select cc.dueno, count(*)::int as copias, round(sum(e.puntos) * p_factor)::int as vcoins
      from public.cartas_coleccion cc join _elim e on e.id = cc.catalogo_id
     where cc.club_id = p_club
     group by cc.dueno;

  select count(*) into v_cartas from _elim;
  select count(*), coalesce(sum(copias), 0), coalesce(sum(vcoins), 0) into v_duenos, v_copias, v_vcoins from _dev;

  if not p_simular and v_cartas > 0 then
    update public.sobres_perfil sp set puntos = sp.puntos + d.vcoins
      from _dev d where sp.club_id = p_club and sp.dueno = d.dueno and d.vcoins > 0;
    insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo)
      select p_club, d.dueno, d.vcoins, v_motivo || ' (' || d.copias || ' carta' || case when d.copias > 1 then 's' else '' end || ')'
        from _dev d where d.vcoins > 0;
    insert into public.cartas_eliminadas (club_id, clave, carta, duenos, vcoins, motivo)
      select p_club, e.clave, e.carta,
             (select count(*) from public.cartas_coleccion cc where cc.club_id = p_club and cc.catalogo_id = e.id),
             (select coalesce(round(count(*) * e.puntos * p_factor), 0) from public.cartas_coleccion cc where cc.club_id = p_club and cc.catalogo_id = e.id),
             v_motivo
        from _elim e
    on conflict (club_id, clave) do update set carta = excluded.carta, duenos = excluded.duenos, vcoins = excluded.vcoins,
      motivo = excluded.motivo, por = auth.uid(), eliminada_at = now();
    delete from public.cartas_catalogo k using _elim e where k.id = e.id;   -- colecciones y vistas, por cascada
  end if;

  return jsonb_build_object('cartas', v_cartas, 'duenos', v_duenos, 'copias', v_copias, 'vcoins', v_vcoins, 'simulado', p_simular);
end
$$;

revoke all on function public._puntos_rareza(text) from public, anon, authenticated;
revoke all on function public.god_eliminar_cartas(uuid, uuid[], numeric, text, boolean) from public, anon;
grant execute on function public.god_eliminar_cartas(uuid, uuid[], numeric, text, boolean) to authenticated;
