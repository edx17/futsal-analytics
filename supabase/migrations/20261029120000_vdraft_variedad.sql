-- ═══════════════════════════════════════════════════════════════════════════
--  V-DRAFT: MÁS VARIEDAD DE CARTAS (y un gol por minuto)
--
--  Va después de 20261026120000_vdraft_penales.sql.
--
--  Antes los lugares de campo ofrecían sólo cartas comunes de su puesto, y el
--  club tiene pocas (18 entre oro y plata): salían siempre las mismas. Ahora:
--    - cada lugar de campo trae 2 especiales y 2 comunes de su puesto
--      (completa con comunes de otro puesto, como antes);
--    - los suplentes, igual: 2 especiales y 2 comunes;
--    - cada jugador tiene memoria de lo que le salió (vdraft_vistas): una
--      carta recién vista tiene 1/3 de chance de volver a salir y se va
--      "olvidando" a la mitad cada 2 días;
--    - las cartas nuevas del catálogo (alta_at de los últimos 14 días) salen
--      3 veces más. Cuando se publican cartas nuevas no hay que hacer nada:
--      entran solas al V-Draft y se destacan dos semanas (con 'nueva' en la
--      carta, para mostrarlo en la app).
--  Para que no se vuelva fácil, la fuerza de los rivales sale de las cartas
--  activas del catálogo: 55 % la media de las comunes + 45 % la de las
--  especiales (antes, sólo las comunes), más el mismo plus por división.
--  Simulado contra el catálogo real (20.000 drafts): eligiendo siempre la
--  mejor carta se gana todo ~13 % de las veces (antes ~14 %); al azar, casi
--  nunca. Se recalcula sola cuando cambian las cartas.
--
--  Además: los minutos de los goles de un partido ya no se repiten.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cuándo entró cada carta al catálogo (las que ya estaban no cuentan como nuevas).
alter table public.cartas_catalogo add column if not exists alta_at timestamptz;
update public.cartas_catalogo set alta_at = now() - interval '60 days' where alta_at is null;
alter table public.cartas_catalogo alter column alta_at set default now();
alter table public.cartas_catalogo alter column alta_at set not null;

-- Lo que le salió a cada uno en el draft. `veces` se guarda ya "olvidado"
-- hasta visto_at; al leerlo se le aplica lo que pasó desde entonces.
create table if not exists public.vdraft_vistas (
  club_id     uuid not null,
  dueno       text not null,
  catalogo_id uuid not null references public.cartas_catalogo(id) on delete cascade,
  veces       double precision not null default 0,
  visto_at    timestamptz not null default now(),
  primary key (club_id, dueno, catalogo_id)
);
alter table public.vdraft_vistas enable row level security;  -- sólo por las funciones

-- Cuánto la vio (con el olvido: la mitad cada 2 días).
create or replace function public._vdraft_visto(p_veces double precision, p_cuando timestamptz)
returns double precision language sql stable as $$
  select coalesce(p_veces, 0) * power(0.5, greatest(extract(epoch from now() - p_cuando), 0) / 172800.0)
$$;

-- Anota las cartas de una oferta como vistas.
create or replace function public._vdraft_anotar(p_club uuid, p_dueno text, p_oferta jsonb)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.vdraft_vistas as v (club_id, dueno, catalogo_id, veces, visto_at)
  select p_club, p_dueno, (x ->> 'catalogo_id')::uuid, 1, now()
    from jsonb_array_elements(coalesce(p_oferta, '[]'::jsonb)) x
   where x ->> 'catalogo_id' is not null
  on conflict (club_id, dueno, catalogo_id)
  do update set veces = public._vdraft_visto(v.veces, v.visto_at) + 1, visto_at = now()
$$;

-- Una carta como la guarda el draft (con 'nueva' si entró hace menos de 14 días).
create or replace function public._vdraft_carta(k public.cartas_catalogo)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('catalogo_id', k.id, 'jugador_id', k.jugador_id, 'rareza', k.rareza,
                            'tipo', k.tipo, 'carta', public._sobres_carta(k),
                            'nueva', k.alta_at > now() - interval '14 days')
$$;

/* n cartas al azar, de jugadores distintos, con peso: las que el jugador vio
   hace poco salen menos y las nuevas, más (muestreo ponderado: la clave es
   -ln(u)/peso y ganan las más chicas). El jugador sale de 'vdraft.dueno',
   que fijan vdraft_nueva y vdraft_elegir; sin él, todas pesan igual.
   p_roles null = cualquier puesto; p_campo = sin arqueros.
   p_tipo: 'base' (bronce, plata, oro), 'especial' o 'todas'. */
create or replace function public._vdraft_oferta(p_club uuid, p_n int, p_roles text[], p_excluir text[],
                                                p_tipo text, p_campo boolean)
returns jsonb language sql volatile security definer set search_path = public as $$
  with vis as (
    select catalogo_id, public._vdraft_visto(veces, visto_at) as v
      from public.vdraft_vistas
     where club_id = p_club and dueno = nullif(current_setting('vdraft.dueno', true), '')),
  cand as (
    select k, -ln(1 - random())
              / ((1.0 / (1 + 2 * coalesce(vis.v, 0)))
                 * case when k.alta_at > now() - interval '14 days' then 3 else 1 end) as clave
      from public.cartas_catalogo k
      left join vis on vis.catalogo_id = k.id
     where k.club_id = p_club and k.activa and not k.exclusiva_evento
       and (p_roles is null or k.carta ->> 'rol' = any (p_roles))
       and not (k.jugador_id = any (coalesce(p_excluir, '{}')))
       and (p_tipo = 'todas'
            or (p_tipo = 'especial' and k.rareza in ('totw', 'potw', 'totm', 'potm', 'toty'))
            or (p_tipo = 'base' and k.rareza in ('bronce', 'plata', 'oro')))
       and (not p_campo or coalesce(k.carta ->> 'rol', '') <> 'ARQ'))
  select coalesce(jsonb_agg(public._vdraft_carta(d.k) order by d.clave), '[]'::jsonb)
    from (select * from (select distinct on ((c.k).jugador_id) c.k, c.clave from cand c
                          order by (c.k).jugador_id, c.clave) u
           order by u.clave limit greatest(p_n, 0)) d
$$;

/* La oferta para un lugar:
   - el arco: 2 arqueros comunes y 2 especiales (se completa con lo que haya);
   - el campo: 2 especiales y 2 comunes de su puesto; si no alcanzan, comunes
     de otro puesto de campo (juegan fuera de puesto) y después lo que haya. */
create or replace function public._vdraft_oferta_lugar(p public.vdraft_partidas, p_lugar int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_roles text[] := array(select jsonb_array_elements_text(p.lugares -> p_lugar -> 'roles'));
  v_usados text[] := public._vdraft_usados(p);
  v_of jsonb;
begin
  if p_lugar = 0 then
    v_of := public._vdraft_sumar(public._vdraft_oferta(p.club_id, 2, array['ARQ'], v_usados, 'base', false),
                                 public._vdraft_oferta(p.club_id, 2, array['ARQ'], v_usados, 'especial', false), 4);
    v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, array['ARQ'], v_usados, 'todas', false), 4);
    if jsonb_array_length(v_of) < 2 then
      v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, null, v_usados, 'todas', false), 4);
    end if;
    return v_of;
  end if;

  v_of := public._vdraft_sumar(public._vdraft_oferta(p.club_id, 2, v_roles, v_usados, 'especial', true),
                               public._vdraft_oferta(p.club_id, 2, v_roles, v_usados, 'base', true), 4);
  v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, null, v_usados, 'base', true), 4);
  v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, v_roles, v_usados, 'todas', true), 4);
  if jsonb_array_length(v_of) < 2 then
    v_of := public._vdraft_sumar(v_of, public._vdraft_oferta(p.club_id, 4, null, v_usados, 'todas', true), 4);
  end if;
  return v_of;
end
$$;

-- Los 4 rivales: como antes, pero la base de la fuerza mezcla comunes y especiales.
create or replace function public._vdraft_rivales(p_club uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_nombre text := lower(coalesce((select nombre from public.clubes where id = p_club), ''));
  v_comun numeric := (select avg((carta ->> 'ovr')::numeric) from public.cartas_catalogo
                       where club_id = p_club and activa and not exclusiva_evento and rareza in ('bronce', 'plata', 'oro'));
  v_esp numeric := (select avg((carta ->> 'ovr')::numeric) from public.cartas_catalogo
                     where club_id = p_club and activa and not exclusiva_evento
                       and rareza in ('totw', 'potw', 'totm', 'potm', 'toty'));
  v_media numeric := coalesce(0.55 * v_comun + 0.45 * v_esp, v_comun, v_esp - 14,
    (select avg((carta ->> 'ovr')::numeric) - 14 from public.cartas_catalogo where club_id = p_club),
    72);
  v_res jsonb := '[]'::jsonb;
  d record;
  r record;
begin
  for d in select * from (values ('D', 10.5, 'CUARTOS DE FINAL'), ('C', 14.0, 'SEMIFINAL'),
                                 ('B', 17.0, 'FINAL'), ('A', 20.0, 'CAMPEÓN DE CAMPEONES')) v(division, plus, ronda)
  loop
    with comp as (
      select id from public.liga_competencias
       where division = d.division and categoria = '1ra' and activa
       order by anio desc limit 1),
    lados as (
      select p.local as equipo, p.zona, p.goles_local as gf, p.goles_visitante as gc from public.liga_partidos p
       where p.competencia_id = (select id from comp) and p.estado ilike 'finalizado' and p.goles_local is not null
      union all
      select p.visitante, p.zona, p.goles_visitante, p.goles_local from public.liga_partidos p
       where p.competencia_id = (select id from comp) and p.estado ilike 'finalizado' and p.goles_local is not null),
    tabla as (
      select equipo, max(zona) as zona, count(*) as pj,
             sum(case when gf > gc then 3 when gf = gc then 1 else 0 end) as pts
        from lados group by equipo),
    pos as (
      select t.*, rank() over (partition by t.zona order by t.pts desc, t.pj asc) as puesto,
             count(*) over (partition by t.zona) as de
        from tabla t)
    select * into r from pos
     where v_nombre = '' or position(lower(equipo) in v_nombre) = 0
     order by random() limit 1;

    if r.equipo is null then
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'division', d.division, 'ronda', d.ronda, 'equipo', 'Primera ' || d.division, 'puesto', null, 'de', null,
        'zona', null, 'fuerza', round(v_media + d.plus, 1)));
    else
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'division', d.division, 'ronda', d.ronda, 'equipo', r.equipo, 'puesto', r.puesto, 'de', r.de,
        'zona', r.zona, 'pts', r.pts, 'pj', r.pj,
        'fuerza', round(v_media + d.plus + (case when r.pj > 0 then r.pts::numeric / r.pj else 1.5 end - 1.5) * 3, 1)));
    end if;
  end loop;
  return v_res;
end
$$;

-- Nueva partida: igual que antes, con la memoria del jugador.
create or replace function public.vdraft_nueva(p_formacion text, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  v_paga boolean;
  pf public.sobres_perfil;
  p public.vdraft_partidas;
begin
  if p_formacion not in ('2-2', '1-2-1', '3-1', '4-0') then
    raise exception 'vdraft: formación inválida' using errcode = '22023';
  end if;
  select * into c from public._sobres_ctx(p_token);
  perform set_config('vdraft.dueno', c.o_dueno, true);

  if exists (select 1 from public.vdraft_partidas where club_id = c.o_club and dueno = c.o_dueno and estado <> 'terminada') then
    raise exception 'vdraft: ya tenés una partida en juego' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cartas_catalogo where club_id = c.o_club) < 8 then
    raise exception 'vdraft: el club todavía no tiene cartas suficientes' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into pf from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;

  v_paga := exists (select 1 from public.vdraft_partidas
    where club_id = c.o_club and dueno = c.o_dueno and dia = v_hoy and not paga);
  if v_paga then
    if pf.puntos < 100 then
      raise exception 'vdraft: te faltan V-Coins (la partida extra cuesta 100)' using errcode = 'P0001';
    end if;
    update public.sobres_perfil set puntos = puntos - 100 where club_id = c.o_club and dueno = c.o_dueno;
  end if;

  insert into public.vdraft_partidas (club_id, dueno, dia, paga, formacion, lugares)
    values (c.o_club, c.o_dueno, v_hoy, v_paga, p_formacion, public._vdraft_lugares(p_formacion))
    returning * into p;

  -- El capitán: 5 especiales de campo (si el club no tiene, cualquier carta).
  update public.vdraft_partidas
     set oferta = public._vdraft_sumar(public._vdraft_oferta(c.o_club, 5, null, '{}', 'especial', true),
                                       public._vdraft_oferta(c.o_club, 5, null, '{}', 'todas', false), 5)
   where id = p.id returning * into p;
  perform public._vdraft_anotar(c.o_club, c.o_dueno, p.oferta);

  return public._vdraft_vista(p);
end
$$;

create or replace function public.vdraft_elegir(p_partida uuid, p_catalogo uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_carta jsonb;
  v_rol text;
  v_lugar int;
  v_campo boolean;
  i int;
begin
  select * into c from public._sobres_ctx(p_token);
  perform set_config('vdraft.dueno', c.o_dueno, true);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found then raise exception 'vdraft: partida inexistente' using errcode = 'P0001'; end if;
  if p.estado <> 'draft' then raise exception 'vdraft: el draft ya terminó' using errcode = 'P0001'; end if;

  select x into v_carta from jsonb_array_elements(p.oferta) x where x ->> 'catalogo_id' = p_catalogo::text limit 1;
  if v_carta is null then raise exception 'vdraft: esa carta no estaba en la oferta' using errcode = 'P0001'; end if;
  v_rol := v_carta -> 'carta' ->> 'rol';

  if p.paso = 'capitan' then
    -- El capitán va al primer lugar de su puesto; si no hay, al primer lugar
    -- de campo (un arquero, siempre al arco).
    v_lugar := null;
    for i in 0..4 loop
      if (p.lugares -> i -> 'roles') ? v_rol then v_lugar := i; exit; end if;
    end loop;
    if v_lugar is null then v_lugar := case when v_rol = 'ARQ' then 0 else 1 end; end if;
    p.equipo := jsonb_set(p.equipo, array[v_lugar::text], v_carta);
    p.capitan := p_catalogo;
  elsif p.paso = 'lugar' then
    p.equipo := jsonb_set(p.equipo, array[p.lugar_actual::text], v_carta);
  elsif p.paso = 'banco' then
    p.banco := p.banco || jsonb_build_array(v_carta);
  end if;

  -- Lo que sigue: el próximo lugar vacío, después el banco, después el torneo.
  v_lugar := null;
  for i in 0..4 loop
    if jsonb_typeof(p.equipo -> i) <> 'object' then v_lugar := i; exit; end if;
  end loop;

  if v_lugar is not null then
    p.paso := 'lugar';
    p.lugar_actual := v_lugar;
    p.oferta := public._vdraft_oferta_lugar(p, v_lugar);
  elsif jsonb_array_length(p.banco) < 2 then
    p.paso := 'banco';
    p.lugar_actual := null;
    -- Suplentes: 2 especiales y 2 comunes; el 1ro de campo, el 2do cualquiera.
    v_campo := jsonb_array_length(p.banco) = 0;
    p.oferta := public._vdraft_sumar(
      public._vdraft_oferta(p.club_id, 2, null, public._vdraft_usados(p), 'especial', v_campo),
      public._vdraft_oferta(p.club_id, 2, null, public._vdraft_usados(p), 'base', v_campo), 4);
    p.oferta := public._vdraft_sumar(p.oferta,
      public._vdraft_oferta(p.club_id, 4, null, public._vdraft_usados(p), 'todas', v_campo), 4);
  else
    p.paso := 'listo';
    p.lugar_actual := null;
    p.oferta := '[]'::jsonb;
    p.estado := 'torneo';
    p.rivales := public._vdraft_rivales(p.club_id);
  end if;
  perform public._vdraft_anotar(p.club_id, p.dueno, p.oferta);

  update public.vdraft_partidas
     set equipo = p.equipo, banco = p.banco, capitan = p.capitan, paso = p.paso, lugar_actual = p.lugar_actual,
         oferta = p.oferta, estado = p.estado, rivales = p.rivales, updated_at = now()
   where id = p.id;
  return public._vdraft_vista(p);
end
$$;

-- Jugar el partido: igual que antes, pero sin dos goles en el mismo minuto.
create or replace function public.vdraft_jugar(p_partida uuid, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_n int;
  v_rival jsonb;
  v_f jsonb;
  v_dif numeric;
  v_gp int;
  v_gr int;
  v_goles jsonb := '[]'::jsonb;
  v_mins int[];
  v_orden text[];
  v_autor int;
  v_asis int;
  v_gano boolean;
  i int;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado <> 'torneo' then raise exception 'vdraft: no hay partido para jugar' using errcode = 'P0001'; end if;
  if p.tanda is not null then raise exception 'vdraft: primero terminá la tanda de penales' using errcode = 'P0001'; end if;

  v_n := jsonb_array_length(p.partidos);
  v_rival := p.rivales -> v_n;
  v_f := public._vdraft_fuerza(p);
  v_dif := (v_f ->> 'fuerza')::numeric - (v_rival ->> 'fuerza')::numeric;

  -- Unos 2,5 goles por equipo entre parejos; la diferencia de fuerza los mueve.
  v_gp := least(public._vdraft_poisson(2.5 * exp(v_dif / 15.0)), 20);
  v_gr := least(public._vdraft_poisson(2.5 * exp(-v_dif / 15.0)), 20);

  -- Minutos distintos del 1 al 40 (a lo sumo 40 goles: con el tope de 20 por equipo, alcanza).
  v_mins := array(select m from (select m from generate_series(1, 40) m order by random() limit v_gp + v_gr) s order by m);
  v_orden := array(select e from (select 'propio' as e from generate_series(1, v_gp)
                                  union all select 'rival' from generate_series(1, v_gr)) s order by random());
  for i in 1..(v_gp + v_gr) loop
    if v_orden[i] = 'propio' then
      v_autor := public._vdraft_elegir_jugador(p.equipo, 'TIR', -1);
      v_asis := case when random() < 0.7 then public._vdraft_elegir_jugador(p.equipo, 'PAS', v_autor) else null end;
      v_goles := v_goles || jsonb_build_array(jsonb_build_object(
        'minuto', v_mins[i], 'equipo', 'propio',
        'autor', p.equipo -> v_autor -> 'carta' ->> 'apellido',
        'asistencia', case when v_asis is null then null else p.equipo -> v_asis -> 'carta' ->> 'apellido' end));
    else
      v_goles := v_goles || jsonb_build_array(jsonb_build_object('minuto', v_mins[i], 'equipo', 'rival'));
    end if;
  end loop;

  v_gano := case when v_gp > v_gr then true when v_gp < v_gr then false else null end;

  p.partidos := p.partidos || jsonb_build_array(jsonb_build_object(
    'ronda', v_rival ->> 'ronda', 'rival', v_rival ->> 'equipo', 'division', v_rival ->> 'division',
    'goles_propios', v_gp, 'goles_rival', v_gr, 'penales', null, 'pendiente', v_gano is null,
    'gano', v_gano, 'goles', v_goles,
    'fuerza_propia', v_f ->> 'fuerza', 'fuerza_rival', v_rival ->> 'fuerza'));

  if v_gano is null then
    -- Empate: la tanda la juega el jugador (vdraft_penal).
    update public.vdraft_partidas set partidos = p.partidos, tanda = public._vdraft_tanda_nueva(v_n), updated_at = now()
     where id = p.id;
  else
    p.victorias := p.victorias + case when v_gano then 1 else 0 end;
    update public.vdraft_partidas set partidos = p.partidos, victorias = p.victorias, updated_at = now() where id = p.id;
    if not v_gano or p.victorias >= 4 then perform public._vdraft_terminar(p.id); end if;
  end if;

  select * into p from public.vdraft_partidas where id = p.id;
  return public._vdraft_vista(p) || jsonb_build_object('ultimo', p.partidos -> (jsonb_array_length(p.partidos) - 1));
end
$$;

revoke all on table public.vdraft_vistas from anon, authenticated;
revoke all on function public._vdraft_visto(double precision, timestamptz) from public, anon, authenticated;
revoke all on function public._vdraft_anotar(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
revoke all on function public._vdraft_oferta_lugar(public.vdraft_partidas, int) from public, anon, authenticated;
revoke all on function public._vdraft_rivales(uuid) from public, anon, authenticated;
grant execute on function public.vdraft_nueva(text, uuid)        to anon, authenticated;
grant execute on function public.vdraft_elegir(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.vdraft_jugar(uuid, uuid)        to anon, authenticated;
