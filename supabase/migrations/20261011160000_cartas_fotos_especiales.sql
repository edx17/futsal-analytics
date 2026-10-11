-- ═══════════════════════════════════════════════════════════════════════════
--  SOBRES: FOTOS ESPECIALES POR CARTA
--
--  El staff le puede poner a cualquier carta del catálogo una foto especial
--  (como las cartas de edición limitada del FIFA), ANTES o DESPUÉS de publicarla.
--  Se guarda aparte, por (club, clave de la carta): la clave es la misma que usa
--  el catálogo (por ejemplo 'TOTY|2026|12'), así que existe antes de que la carta
--  se publique y sobrevive a republicar el catálogo.
--
--  Las funciones de los sobres y de la colección devuelven la carta con esa foto
--  puesta; no hace falta republicar para que se vea.
--
--  Las imágenes se suben al bucket público "foto" (el mismo del plantel), en la
--  carpeta cartas/<club>/. Acá sólo va la dirección.
--
--  Requiere haber corrido antes 20261011120000_sobres.sql.
--  Es idempotente: se puede correr por arriba de un intento anterior.
-- ═══════════════════════════════════════════════════════════════════════════

do $fotos$
begin
  if to_regclass('public.cartas_catalogo') is null then
    raise exception 'Falta correr antes 20261011120000_sobres.sql (tabla cartas_catalogo).';
  end if;
end
$fotos$;

create table if not exists public.cartas_fotos (
  club_id    uuid not null references public.clubes(id) on delete cascade,
  clave      text not null,
  url        text not null,
  updated_at timestamptz not null default now(),
  primary key (club_id, clave)
);

alter table public.cartas_fotos enable row level security;

drop policy if exists "Staff ALL cartas_fotos" on public.cartas_fotos;
create policy "Staff ALL cartas_fotos" on public.cartas_fotos
  for all to authenticated
  using ((select public.get_user_rol()) = 'superuser'
         or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
             and club_id::text = (select public.get_user_club_id())))
  with check ((select public.get_user_rol()) = 'superuser'
              or ((select public.get_user_rol()) in ('ct', 'manager', 'admin')
                  and club_id::text = (select public.get_user_club_id())));

-- La carta tal como se publicó, con la foto especial si tiene.
create or replace function public._sobres_carta(k public.cartas_catalogo)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when f.url is not null
              then k.carta || jsonb_build_object('foto', f.url, 'fotoEspecial', true)
              else k.carta end
    from (select 1) x
    left join public.cartas_fotos f on f.club_id = k.club_id and f.clave = k.clave
$$;

revoke all on function public._sobres_carta(public.cartas_catalogo) from public, anon, authenticated;

create or replace function public.sobres_abrir(p_tipo text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  p public.sobres_perfil;
  v_cantidad int;
  v_ids uuid[] := '{}';
  v_rareza text;
  v_tirada double precision;
  k public.cartas_catalogo;
  v_tiene boolean;
  v_pts int;
  v_ganados int := 0;
  v_cartas jsonb := '[]'::jsonb;
  v_sobre uuid := gen_random_uuid();
  v_racha int;
  i int;
begin
  if p_tipo not in ('diario', 'wellness', 'racha', 'puntos') then
    raise exception 'sobres: tipo de sobre inválido' using errcode = '22023';
  end if;

  select * into c from public._sobres_ctx(p_token);

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno)
    on conflict do nothing;
  -- Bloquea la fila: dos pedidos a la vez no pasan los dos.
  select * into p from public.sobres_perfil
   where club_id = c.o_club and dueno = c.o_dueno for update;

  if not exists (select 1 from public.cartas_catalogo where club_id = c.o_club) then
    raise exception 'sobres: el club todavía no publicó cartas' using errcode = 'P0001';
  end if;

  if p_tipo <> 'puntos' and exists (select 1 from public.sobres_abiertos
       where club_id = c.o_club and dueno = c.o_dueno and tipo = p_tipo and dia = v_hoy) then
    raise exception 'sobres: ya abriste este sobre hoy' using errcode = 'P0001';
  end if;
  if p_tipo = 'wellness' and not public._sobres_wellness_hoy(c.o_jugador) then
    raise exception 'sobres: completá el wellness de hoy para abrirlo' using errcode = 'P0001';
  end if;
  if p_tipo = 'racha' and coalesce(p.premio_racha_dia, date '1900-01-01') <> v_hoy then
    raise exception 'sobres: todavía no completaste la semana' using errcode = 'P0001';
  end if;
  if p_tipo = 'puntos' and p.puntos < 50 then
    raise exception 'sobres: te faltan puntos (hacen falta 50)' using errcode = 'P0001';
  end if;

  v_cantidad := case when p_tipo = 'racha' then 4 else 3 end;

  for i in 1..v_cantidad loop
    -- 1) la rareza, entre las que todavía tienen cartas para sacar en este sobre.
    --    Una sola tirada por lugar (random() dentro del WHERE se sortearía por fila).
    v_tirada := random();
    with pesos(rareza, peso, orden) as (values
      ('bronce', 42.0, 1), ('plata', 30.0, 2), ('oro', 15.0, 3), ('totw', 5.0, 4),
      ('potw', 3.0, 5), ('totm', 2.5, 6), ('potm', 1.5, 7), ('toty', 1.0, 8)),
    disp as (
      select pe.rareza, pe.peso, pe.orden from pesos pe
       where exists (select 1 from public.cartas_catalogo x
                      where x.club_id = c.o_club and x.rareza = pe.rareza and not (x.id = any (v_ids)))),
    acum as (
      select d.rareza, sum(d.peso) over (order by d.orden) as hasta, sum(d.peso) over () as total from disp d)
    select a.rareza into v_rareza
      from acum a
     where a.hasta > v_tirada * a.total
     order by a.hasta limit 1;

    exit when v_rareza is null;

    -- 2) una carta de esa rareza
    select * into k from public.cartas_catalogo
     where club_id = c.o_club and rareza = v_rareza and not (id = any (v_ids))
     order by random() limit 1;
    exit when not found;
    v_ids := v_ids || k.id;

    -- 3) nueva: va a la colección. Repetida: da puntos.
    v_tiene := exists (select 1 from public.cartas_coleccion
                        where club_id = c.o_club and dueno = c.o_dueno and catalogo_id = k.id);
    v_pts := case when v_tiene then public._sobres_puntos(k.rareza) else 0 end;
    v_ganados := v_ganados + v_pts;
    v_cartas := v_cartas || jsonb_build_array(jsonb_build_object(
      'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'carta', public._sobres_carta(k),
      'nueva', not v_tiene, 'puntos', v_pts));
  end loop;

  insert into public.sobres_abiertos (id, club_id, dueno, tipo, dia, cartas, puntos_ganados)
    values (v_sobre, c.o_club, c.o_dueno, p_tipo, v_hoy, v_cartas, v_ganados);

  insert into public.cartas_coleccion (club_id, dueno, catalogo_id, sobre_id)
    select c.o_club, c.o_dueno, (x ->> 'catalogo_id')::uuid, v_sobre
      from jsonb_array_elements(v_cartas) x
     where (x ->> 'nueva')::boolean
    on conflict do nothing;

  -- puntos: se suman las repetidas y, si el sobre se pagó con puntos, se restan 50
  update public.sobres_perfil
     set puntos = puntos + v_ganados - case when p_tipo = 'puntos' then 50 else 0 end
   where club_id = c.o_club and dueno = c.o_dueno;

  -- racha: el sobre diario es "la visita del día"
  if p_tipo = 'diario' then
    v_racha := case
      when p.ultima_visita = v_hoy - 1 then p.racha + 1
      else 1 end;
    if v_racha >= 7 then
      update public.sobres_perfil set racha = 0, ultima_visita = v_hoy, premio_racha_dia = v_hoy
       where club_id = c.o_club and dueno = c.o_dueno;
    else
      update public.sobres_perfil set racha = v_racha, ultima_visita = v_hoy
       where club_id = c.o_club and dueno = c.o_dueno;
    end if;
  end if;

  return jsonb_build_object('sobre_id', v_sobre, 'tipo', p_tipo, 'cartas', v_cartas, 'puntos_ganados', v_ganados)
         || jsonb_build_object('estado', public.sobres_estado(p_token));
end
$$;

create or replace function public.sobres_coleccion(p_token uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public._sobres_ctx(p_token);
  return jsonb_build_object(
    'cartas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'catalogo_id', k.id, 'rareza', k.rareza, 'tipo', k.tipo, 'clave', k.clave,
               'carta', public._sobres_carta(k), 'obtenida_at', cc.obtenida_at)
             order by cc.obtenida_at desc)
        from public.cartas_coleccion cc
        join public.cartas_catalogo k on k.id = cc.catalogo_id
       where cc.club_id = c.o_club and cc.dueno = c.o_dueno), '[]'::jsonb),
    'total', (select count(*) from public.cartas_catalogo where club_id = c.o_club),
    'por_rareza', coalesce((
      select jsonb_object_agg(r.rareza, jsonb_build_object('total', r.total, 'tengo', coalesce(t.tengo, 0)))
        from (select rareza, count(*) as total from public.cartas_catalogo where club_id = c.o_club group by rareza) r
        left join (select k.rareza, count(*) as tengo
                     from public.cartas_coleccion cc join public.cartas_catalogo k on k.id = cc.catalogo_id
                    where cc.club_id = c.o_club and cc.dueno = c.o_dueno group by k.rareza) t using (rareza)), '{}'::jsonb)
  );
end
$$;

grant execute on function public.sobres_abrir(text, uuid)   to anon, authenticated;
grant execute on function public.sobres_coleccion(uuid)     to anon, authenticated;
