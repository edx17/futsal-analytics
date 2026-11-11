-- ═══════════════════════════════════════════════════════════════════════════
--  V-DRAFT: DESAFÍO DEL DÍA Y TORNEO SEMANAL
--
--  Dos modos nuevos (vdraft_partidas.modo) además del de siempre ('normal'):
--
--  DESAFÍO DEL DÍA ('desafio')
--    · Una sola vez por día, gratis. Todos tienen la misma regla, las mismas
--      cartas para elegir (si eligen lo mismo, ven lo mismo) y los mismos
--      rivales. El partido sale igual para el mismo equipo: gana el que mejor
--      arma. Los penales sí los patea cada uno.
--    · Las reglas rotan (una por día, _vdraft_regla_del_dia):
--        solo_comunes    sólo cartas comunes (plata u oro), capitán incluido
--        sin_capitan     se arranca por el arquero (un especial menos)
--        formacion       todos con la misma formación (va rotando)
--        todo_especiales todas las opciones son especiales
--        sin_suplentes   cinco y nada más: sin banco ni cambios
--    · Ranking del día: partidos ganados, después diferencia de gol, goles a
--      favor, fuerza y el que terminó primero.
--    · Premio, al día siguiente (lo paga el primero que abre el V-Draft):
--      1º 1000, 2º 750, 3º 500 y 150 a los demás que jugaron al menos un
--      partido. Queda en vcoins_movimientos.
--
--  TORNEO SEMANAL ('torneo')
--    · Automático, de lunes a domingo (hora de Argentina). La entrada (1000
--      V-Coins) da 5 partidas propias del torneo, aparte de las normales.
--    · Tabla: la suma de partidos ganados en esas partidas; después
--      diferencia de gol, campeonatos y el que se anotó primero.
--    · El pozo (las entradas + un premio extra del club, si hay) se reparte
--      el lunes siguiente: 50 % / 30 % / 20 % entre los 3 primeros; con 2
--      anotados, 60 % / 40 %; si se anotó uno solo, se le devuelve la entrada.
--    · Entrada, partidas, premio extra y si está activo: Modo GOD
--      (god_torneo_config). Valen para las semanas que todavía no empezaron
--      a cobrarse (cada semana guarda los suyos al primer anotado).
--
--  Una sola partida activa por jugador, de cualquier modo (como siempre).
--  La partida gratis del día, el costo de 100 y el ranking semanal de
--  siempre cuentan sólo las partidas normales.
--
--  Recrea: _vdraft_oferta, _vdraft_rivales, _vdraft_terminar, vdraft_estado
--  (ahora volatile: cobra los premios pendientes), vdraft_nueva (con p_modo),
--  vdraft_elegir, vdraft_cambio y vdraft_jugar. Va después de
--  20261111120000_cartas_segunda_rueda.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── TABLAS ──────────────────────────────────────────────────────────────────

alter table public.vdraft_partidas add column if not exists modo text not null default 'normal';
alter table public.vdraft_partidas add column if not exists regla jsonb;     -- desafío: la regla del día
alter table public.vdraft_partidas add column if not exists semana date;     -- torneo: el lunes de su semana
alter table public.vdraft_partidas drop constraint if exists vdraft_partidas_modo_check;
alter table public.vdraft_partidas add constraint vdraft_partidas_modo_check check (modo in ('normal', 'desafio', 'torneo'));
create index if not exists vdraft_modo_dia on public.vdraft_partidas (club_id, modo, dia);

create table if not exists public.vdraft_torneo_config (
  club_id    uuid primary key references public.clubes(id) on delete cascade,
  entrada    int not null default 1000 check (entrada between 0 and 100000),
  partidas   int not null default 5 check (partidas between 1 and 20),
  extra      int not null default 0 check (extra between 0 and 100000),
  activo     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.vdraft_torneo_config enable row level security;   -- sólo por las funciones
comment on table public.vdraft_torneo_config is 'V-Draft: torneo semanal (entrada, partidas, premio extra del club).';

create table if not exists public.vdraft_torneo_semanas (
  club_id    uuid not null references public.clubes(id) on delete cascade,
  semana     date not null,                          -- el lunes
  entrada    int not null,
  partidas   int not null,
  extra      int not null default 0,
  pagado_at  timestamptz,
  resultado  jsonb,                                  -- [{ dueno, nombre, puesto, victorias, dg, premio }]
  primary key (club_id, semana)
);
alter table public.vdraft_torneo_semanas enable row level security;
comment on table public.vdraft_torneo_semanas is 'V-Draft: cada torneo semanal (lo que valía al abrirse y el reparto).';

create table if not exists public.vdraft_torneo_inscriptos (
  club_id    uuid not null references public.clubes(id) on delete cascade,
  semana     date not null,
  dueno      text not null,
  entrada    int not null,
  created_at timestamptz not null default now(),
  primary key (club_id, semana, dueno)
);
alter table public.vdraft_torneo_inscriptos enable row level security;
comment on table public.vdraft_torneo_inscriptos is 'V-Draft: quién pagó la entrada del torneo de cada semana.';

-- ── AYUDANTES ───────────────────────────────────────────────────────────────

-- Un número "al azar" fijo para un texto: [0, 1).
create or replace function public._vdraft_u(p_sal text)
returns double precision language sql immutable as $$
  select (('x' || lpad(substr(md5(p_sal), 1, 12), 16, '0'))::bit(64)::bigint)::double precision / 281474976710656.0
$$;

-- El nombre de un dueño (jugador, staff o hincha).
create or replace function public._juegos_nombre(p_dueno text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(j.apellido, j.nombre) from public.jugadores j
      where p_dueno like 'j:%' and j.id::text = substring(p_dueno from 3) limit 1),
    (select pf.nombre_completo from public.perfiles pf
      where p_dueno like 'u:%' and pf.id::text = substring(p_dueno from 3) limit 1),
    (select jc.nombre from public.juegos_cuentas jc
      where p_dueno like 'h:%' and jc.user_id::text = substring(p_dueno from 3) limit 1),
    'Staff')
$$;

-- La regla del desafío de un día (la misma para todos los clubes).
create or replace function public._vdraft_regla_del_dia(p_dia date)
returns jsonb language sql immutable as $$
  with n as (select (p_dia - date '2026-01-05') as d),
  f as (select (array['4-0', '2-2', '3-1', '1-2-1'])[(((select d from n) / 5) % 4 + 4) % 4 + 1] as formacion)
  select case ((select d from n) % 5 + 5) % 5
    when 0 then jsonb_build_object('id', 'solo_comunes', 'nombre', 'SOLO COMUNES',
                  'detalle', 'Ni el capitán es especial: todas las cartas son plata u oro.')
    when 1 then jsonb_build_object('id', 'sin_capitan', 'nombre', 'SIN CAPITÁN',
                  'detalle', 'Arrancás directo por el arquero: un especial menos.')
    when 2 then jsonb_build_object('id', 'formacion', 'nombre', 'FORMACIÓN ' || (select formacion from f),
                  'detalle', 'Todos juegan con la misma formación: ' || (select formacion from f) || '.',
                  'formacion', (select formacion from f))
    when 3 then jsonb_build_object('id', 'todo_especiales', 'nombre', 'TODO ESPECIALES',
                  'detalle', 'Las cuatro opciones de cada lugar son cartas especiales.')
    else        jsonb_build_object('id', 'sin_suplentes', 'nombre', 'SIN SUPLENTES',
                  'detalle', 'Cinco y nada más: no hay banco ni cambios.')
  end
$$;

/* Prepara las ofertas de un paso del draft (en la transacción):
   - desafío: 'vdraft.semilla' fija el azar (mismo paso, mismas cartas para
     todos) y 'vdraft.tipo' fuerza comunes o especiales según la regla;
   - los demás modos: azar de siempre, sin forzar nada. */
create or replace function public._vdraft_preparar(p public.vdraft_partidas, p_paso text)
returns void language plpgsql volatile as $$
begin
  if p.modo = 'desafio' then
    perform set_config('vdraft.semilla', format('desafio|%s|%s|%s', p.club_id, p.dia, p_paso), true);
    perform set_config('vdraft.tipo', case p.regla ->> 'id' when 'solo_comunes' then 'base'
                                                         when 'todo_especiales' then 'especial' else '' end, true);
  else
    perform set_config('vdraft.semilla', '', true);
    perform set_config('vdraft.tipo', '', true);
  end if;
end
$$;

/* n cartas al azar, de jugadores distintos (igual que antes), con dos
   agregados para el desafío: con 'vdraft.semilla' el orden es fijo (y no
   cuenta la memoria de cada uno) y 'vdraft.tipo' fuerza comunes o especiales. */
create or replace function public._vdraft_oferta(p_club uuid, p_n int, p_roles text[], p_excluir text[],
                                                p_tipo text, p_campo boolean)
returns jsonb language sql volatile security definer set search_path = public as $$
  with cfg as (
    select coalesce(current_setting('vdraft.semilla', true), '') as semilla,
           coalesce(nullif(current_setting('vdraft.tipo', true), ''), p_tipo) as tipo),
  vis as (
    select catalogo_id, public._vdraft_visto(veces, visto_at) as v
      from public.vdraft_vistas
     where club_id = p_club and dueno = nullif(current_setting('vdraft.dueno', true), '')
       and (select semilla from cfg) = ''),
  cand as (
    select k, -ln(1 - case when (select semilla from cfg) <> ''
                           then public._vdraft_u((select semilla from cfg) || '|' || k.id::text)
                           else random() end)
              / ((1.0 / (1 + 2 * coalesce(vis.v, 0)))
                 * case when k.alta_at > now() - interval '14 days' then 3 else 1 end) as clave
      from public.cartas_catalogo k
      left join vis on vis.catalogo_id = k.id
     where k.club_id = p_club and k.activa and not k.exclusiva_evento
       and (p_roles is null or k.carta ->> 'rol' = any (p_roles))
       and not (k.jugador_id = any (coalesce(p_excluir, '{}')))
       and ((select tipo from cfg) = 'todas'
            or ((select tipo from cfg) = 'especial' and k.rareza in ('totw', 'potw', 'totm', 'potm', 'toty'))
            or ((select tipo from cfg) = 'base' and k.rareza in ('bronce', 'plata', 'oro')))
       and (not p_campo or coalesce(k.carta ->> 'rol', '') <> 'ARQ'))
  select coalesce(jsonb_agg(public._vdraft_carta(d.k) order by d.clave), '[]'::jsonb)
    from (select * from (select distinct on ((c.k).jugador_id) c.k, c.clave from cand c
                          order by (c.k).jugador_id, c.clave) u
           order by u.clave limit greatest(p_n, 0)) d
$$;

-- Junta dos ofertas sin repetir jugador y las mezcla; con 'vdraft.semilla', siempre en el mismo orden.
create or replace function public._vdraft_sumar(p_a jsonb, p_b jsonb, p_n int)
returns jsonb language sql volatile as $$
  select coalesce(jsonb_agg(c order by case when coalesce(current_setting('vdraft.semilla', true), '') <> ''
                                            then public._vdraft_u(current_setting('vdraft.semilla', true) || '|mezcla|' || (c ->> 'catalogo_id'))
                                            else random() end), '[]'::jsonb) from (
    select c from (
      select distinct on (c ->> 'jugador_id') c, o
        from (select c, 1 as o from jsonb_array_elements(p_a) c
              union all select c, 2 from jsonb_array_elements(p_b) c) t
       order by c ->> 'jugador_id', o
    ) u order by o limit p_n
  ) x
$$;

-- Los 4 rivales: igual que antes; con 'vdraft.semilla', los mismos para todos.
create or replace function public._vdraft_rivales(p_club uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_nombre text := lower(coalesce((select nombre from public.clubes where id = p_club), ''));
  v_semilla text := coalesce(current_setting('vdraft.semilla', true), '');
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
  -- Desafío "solo comunes": los rivales se miden con las comunes (si no, no se le gana a nadie).
  if coalesce(current_setting('vdraft.tipo', true), '') = 'base' and v_comun is not null then
    v_media := v_comun;
  end if;
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
     order by case when v_semilla <> '' then public._vdraft_u(v_semilla || '|' || d.division || '|' || equipo) else random() end
     limit 1;

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

-- Lo que devuelve cada función: la partida tal como la ve el jugador (con el modo y la regla).
create or replace function public._vdraft_vista(p public.vdraft_partidas)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', p.id, 'estado', p.estado, 'paga', p.paga, 'formacion', p.formacion, 'lugares', p.lugares,
    'equipo', p.equipo, 'banco', p.banco, 'capitan', p.capitan, 'paso', p.paso, 'lugar_actual', p.lugar_actual,
    'oferta', p.oferta, 'rivales', p.rivales, 'partidos', p.partidos, 'victorias', p.victorias,
    'premio', p.premio, 'fuerza', public._vdraft_fuerza(p),
    'tanda', case when p.tanda is null then null
                  else p.tanda || jsonb_build_object('turno', public._vdraft_tanda_turno(p.tanda)) end,
    'modo', p.modo, 'regla', p.regla, 'semana', p.semana)
$$;

-- Termina la partida. Normal: el premio de siempre. Desafío: queda pendiente
-- hasta el reparto del día. Torneo: sin premio propio (va a la tabla).
create or replace function public._vdraft_terminar(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  p public.vdraft_partidas;
  v_coins int;
  v_sobre text;
begin
  select * into p from public.vdraft_partidas where id = p_id for update;
  if p.estado = 'terminada' then return; end if;

  if p.modo = 'desafio' then
    update public.vdraft_partidas
       set estado = 'terminada', paso = 'listo', oferta = '[]'::jsonb, tanda = null, updated_at = now(),
           premio = jsonb_build_object('vcoins', 0, 'sobre', null, 'pendiente', true, 'desafio', true)
     where id = p_id;
    return;
  end if;
  if p.modo = 'torneo' then
    update public.vdraft_partidas
       set estado = 'terminada', paso = 'listo', oferta = '[]'::jsonb, tanda = null, updated_at = now(),
           premio = jsonb_build_object('vcoins', 0, 'sobre', null, 'torneo', true)
     where id = p_id;
    return;
  end if;

  v_coins := case p.victorias when 1 then 25 when 2 then 75 when 3 then 150 when 4 then 300 else 0 end;
  v_coins := round(v_coins * public._vcoins_factor_en(p.club_id, 'vdraft'))::int;   -- evento de V-Coins dobles (si aplica al V-Draft)
  v_sobre := case when p.victorias >= 4 then 'premio_especial' when p.victorias = 3 then 'premio' else null end;

  insert into public.sobres_perfil (club_id, dueno) values (p.club_id, p.dueno) on conflict do nothing;
  update public.sobres_perfil
     set puntos = puntos + v_coins,
         sobres_premio = sobres_premio + case when v_sobre = 'premio' then 1 else 0 end,
         sobres_especiales = sobres_especiales + case when v_sobre = 'premio_especial' then 1 else 0 end
   where club_id = p.club_id and dueno = p.dueno;

  update public.vdraft_partidas
     set estado = 'terminada', paso = 'listo', oferta = '[]'::jsonb, updated_at = now(),
         premio = jsonb_build_object('vcoins', v_coins, 'sobre', v_sobre)
   where id = p_id;
end
$$;

-- Diferencia de gol y goles a favor de una partida.
create or replace function public._vdraft_goles(p_partidos jsonb)
returns table (gf int, dg int) language sql immutable as $$
  select coalesce(sum((x ->> 'goles_propios')::int), 0)::int,
         coalesce(sum((x ->> 'goles_propios')::int - (x ->> 'goles_rival')::int), 0)::int
    from jsonb_array_elements(coalesce(p_partidos, '[]'::jsonb)) x
$$;

-- ── DESAFÍO: EL REPARTO ─────────────────────────────────────────────────────

-- El ranking de un día del desafío (todas las partidas del día, terminadas o no).
create or replace function public._vdraft_desafio_tabla(p_club uuid, p_dia date)
returns table (id uuid, dueno text, puesto int, victorias int, dg int, gf int, fuerza numeric, jugados int, estado text, premio jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.dueno,
         (row_number() over (order by v.victorias desc, g.dg desc, g.gf desc,
                                      (public._vdraft_fuerza(v) ->> 'fuerza')::numeric desc, v.updated_at asc))::int,
         v.victorias, g.dg, g.gf, (public._vdraft_fuerza(v) ->> 'fuerza')::numeric,
         jsonb_array_length(v.partidos), v.estado, v.premio
    from public.vdraft_partidas v, lateral public._vdraft_goles(v.partidos) g
   where v.club_id = p_club and v.modo = 'desafio' and v.dia = p_dia
$$;

-- Paga los desafíos de los días que ya pasaron (una sola vez: el premio deja de estar pendiente).
create or replace function public._vdraft_desafio_cerrar(p_club uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_hoy date := public._sobres_hoy();
  d date;
  t record;
  v_coins int;
begin
  if not exists (select 1 from public.vdraft_partidas
                  where club_id = p_club and modo = 'desafio' and dia < v_hoy
                    and (estado <> 'terminada' or coalesce((premio ->> 'pendiente')::boolean, false))) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('vdraft_desafio|' || p_club::text));

  for d in select distinct dia from public.vdraft_partidas
            where club_id = p_club and modo = 'desafio' and dia < v_hoy
              and (estado <> 'terminada' or coalesce((premio ->> 'pendiente')::boolean, false))
            order by dia
  loop
    -- Las que quedaron a medias se cierran con lo que ganaron.
    perform public._vdraft_terminar(v.id) from public.vdraft_partidas v
      where v.club_id = p_club and v.modo = 'desafio' and v.dia = d and v.estado <> 'terminada';

    for t in select * from public._vdraft_desafio_tabla(p_club, d) loop
      continue when not coalesce((t.premio ->> 'pendiente')::boolean, false);
      v_coins := case when t.jugados = 0 then 0
                      when t.puesto = 1 then 1000 when t.puesto = 2 then 750 when t.puesto = 3 then 500
                      else 150 end;
      if v_coins > 0 then
        insert into public.sobres_perfil (club_id, dueno) values (p_club, t.dueno) on conflict do nothing;
        update public.sobres_perfil set puntos = puntos + v_coins where club_id = p_club and dueno = t.dueno;
        insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo, por)
          values (p_club, t.dueno, v_coins, format('Desafío del día %s · puesto %s', to_char(d, 'DD/MM'), t.puesto), null);
      end if;
      update public.vdraft_partidas
         set premio = jsonb_build_object('vcoins', v_coins, 'sobre', null, 'desafio', true, 'puesto', t.puesto)
       where id = t.id;
    end loop;
  end loop;
end
$$;

-- ── TORNEO: LA TABLA Y EL REPARTO ───────────────────────────────────────────

-- La config del torneo de un club (la de siempre si no hay).
create or replace function public._vdraft_torneo_cfg(p_club uuid)
returns public.vdraft_torneo_config language sql stable security definer set search_path = public as $$
  select coalesce((select t from public.vdraft_torneo_config t where t.club_id = p_club),
                  row(p_club, 1000, 5, 0, true, now())::public.vdraft_torneo_config)
$$;

-- La tabla de una semana: todos los anotados, con lo que sumaron.
create or replace function public._vdraft_torneo_tabla(p_club uuid, p_semana date)
returns table (dueno text, puesto int, victorias int, dg int, campeonatos int, jugadas int, en_juego boolean)
language sql stable security definer set search_path = public as $$
  with suma as (
    select i.dueno, i.created_at,
           coalesce(sum(v.victorias), 0)::int as victorias,
           coalesce(sum(g.dg), 0)::int as dg,
           (count(v.id) filter (where v.victorias >= 3))::int as campeonatos,
           count(v.id)::int as jugadas,
           bool_or(v.estado <> 'terminada') as en_juego
      from public.vdraft_torneo_inscriptos i
      left join public.vdraft_partidas v
        on v.club_id = i.club_id and v.dueno = i.dueno and v.modo = 'torneo' and v.semana = i.semana
      left join lateral public._vdraft_goles(v.partidos) g on true
     where i.club_id = p_club and i.semana = p_semana
     group by i.dueno, i.created_at)
  select s.dueno,
         (row_number() over (order by s.victorias desc, s.dg desc, s.campeonatos desc, s.created_at asc))::int,
         s.victorias, s.dg, s.campeonatos, s.jugadas, coalesce(s.en_juego, false)
    from suma s
$$;

-- Reparte los pozos de las semanas que ya terminaron.
create or replace function public._vdraft_torneo_cerrar(p_club uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_lunes date := date_trunc('week', public._sobres_hoy())::date;
  s public.vdraft_torneo_semanas;
  t record;
  v_n int;
  v_pozo int;
  v_partes numeric[];
  v_premio int;
  v_res jsonb;
begin
  if not exists (select 1 from public.vdraft_torneo_semanas where club_id = p_club and semana < v_lunes and pagado_at is null) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('vdraft_torneo|' || p_club::text));

  for s in select * from public.vdraft_torneo_semanas
            where club_id = p_club and semana < v_lunes and pagado_at is null order by semana for update
  loop
    perform public._vdraft_terminar(v.id) from public.vdraft_partidas v
      where v.club_id = p_club and v.modo = 'torneo' and v.semana = s.semana and v.estado <> 'terminada';

    select count(*), coalesce(sum(entrada), 0) into v_n, v_pozo
      from public.vdraft_torneo_inscriptos where club_id = p_club and semana = s.semana;
    v_partes := case when v_n >= 3 then array[0.5, 0.3, 0.2] when v_n = 2 then array[0.6, 0.4] else array[]::numeric[] end;
    if v_n >= 2 then v_pozo := v_pozo + s.extra; end if;
    v_res := '[]'::jsonb;

    for t in select * from public._vdraft_torneo_tabla(p_club, s.semana) order by puesto loop
      if v_n = 1 then
        v_premio := (select entrada from public.vdraft_torneo_inscriptos where club_id = p_club and semana = s.semana and dueno = t.dueno);
      elsif t.puesto <= coalesce(array_length(v_partes, 1), 0) then
        v_premio := floor(v_pozo * v_partes[t.puesto])::int;
        -- Lo que sobra del redondeo, al primero.
        if t.puesto = 1 then
          v_premio := v_premio + (v_pozo - (select coalesce(sum(floor(v_pozo * x)), 0)::int from unnest(v_partes) x));
        end if;
      else
        v_premio := 0;
      end if;
      if v_premio > 0 then
        insert into public.sobres_perfil (club_id, dueno) values (p_club, t.dueno) on conflict do nothing;
        update public.sobres_perfil set puntos = puntos + v_premio where club_id = p_club and dueno = t.dueno;
        insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo, por)
          values (p_club, t.dueno, v_premio,
                  case when v_n = 1 then format('Torneo semanal %s · único anotado: se devuelve la entrada', to_char(s.semana, 'DD/MM'))
                       else format('Torneo semanal %s · puesto %s', to_char(s.semana, 'DD/MM'), t.puesto) end, null);
      end if;
      v_res := v_res || jsonb_build_array(jsonb_build_object(
        'dueno', t.dueno, 'nombre', public._juegos_nombre(t.dueno), 'puesto', t.puesto,
        'victorias', t.victorias, 'dg', t.dg, 'premio', v_premio));
    end loop;

    update public.vdraft_torneo_semanas set pagado_at = now(), resultado = v_res
     where club_id = p_club and semana = s.semana;
  end loop;
end
$$;

-- Anotarse en el torneo de esta semana: paga la entrada.
create or replace function public.vdraft_torneo_anotarse(p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_lunes date := date_trunc('week', public._sobres_hoy())::date;
  cfg public.vdraft_torneo_config;
  s public.vdraft_torneo_semanas;
  pf public.sobres_perfil;
begin
  select * into c from public._sobres_ctx(p_token);
  cfg := public._vdraft_torneo_cfg(c.o_club);

  insert into public.vdraft_torneo_semanas (club_id, semana, entrada, partidas, extra)
    select c.o_club, v_lunes, cfg.entrada, cfg.partidas, cfg.extra
     where cfg.activo
    on conflict (club_id, semana) do nothing;
  select * into s from public.vdraft_torneo_semanas where club_id = c.o_club and semana = v_lunes;
  if not found then raise exception 'vdraft: esta semana no hay torneo' using errcode = 'P0001'; end if;

  if exists (select 1 from public.vdraft_torneo_inscriptos where club_id = c.o_club and semana = v_lunes and dueno = c.o_dueno) then
    raise exception 'vdraft: ya estás anotado en el torneo de esta semana' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into pf from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;
  if pf.puntos < s.entrada then
    raise exception 'vdraft: te faltan V-Coins (la entrada al torneo cuesta %)', s.entrada using errcode = 'P0001';
  end if;
  update public.sobres_perfil set puntos = puntos - s.entrada where club_id = c.o_club and dueno = c.o_dueno;
  insert into public.vdraft_torneo_inscriptos (club_id, semana, dueno, entrada) values (c.o_club, v_lunes, c.o_dueno, s.entrada);
  if s.entrada > 0 then
    insert into public.vcoins_movimientos (club_id, dueno, cantidad, motivo, por)
      values (c.o_club, c.o_dueno, -s.entrada, format('Entrada al torneo semanal %s', to_char(v_lunes, 'DD/MM')), null);
  end if;
  return public.vdraft_estado(p_token);
end
$$;

-- Modo GOD: la entrada, las partidas, el premio extra y si hay torneo.
create or replace function public.god_torneo_config(p_club uuid, p_entrada int, p_partidas int, p_extra int, p_activo boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  t public.vdraft_torneo_config;
begin
  perform public._god_o_error();
  insert into public.vdraft_torneo_config as x (club_id, entrada, partidas, extra, activo, updated_at)
    values (p_club, p_entrada, p_partidas, p_extra, p_activo, now())
  on conflict (club_id) do update set entrada = excluded.entrada, partidas = excluded.partidas,
    extra = excluded.extra, activo = excluded.activo, updated_at = now()
  returning * into t;
  -- La semana en curso, si todavía nadie se anotó, toma los valores nuevos;
  -- el premio extra se puede subir aunque ya haya anotados.
  update public.vdraft_torneo_semanas s
     set entrada = case when exists (select 1 from public.vdraft_torneo_inscriptos i where i.club_id = s.club_id and i.semana = s.semana)
                        then s.entrada else t.entrada end,
         partidas = case when exists (select 1 from public.vdraft_torneo_inscriptos i where i.club_id = s.club_id and i.semana = s.semana)
                         then s.partidas else t.partidas end,
         extra = t.extra
   where s.club_id = p_club and s.semana = date_trunc('week', public._sobres_hoy())::date and s.pagado_at is null;
  return to_jsonb(t);
end
$$;

create or replace function public.god_torneo_estado(p_club uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._god_o_error();
  return jsonb_build_object(
    'config', to_jsonb(public._vdraft_torneo_cfg(p_club)),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('semana', s.semana, 'entrada', s.entrada, 'partidas', s.partidas,
                                                             'extra', s.extra, 'pagado_at', s.pagado_at, 'resultado', s.resultado,
                                                             'anotados', (select count(*) from public.vdraft_torneo_inscriptos i
                                                                           where i.club_id = s.club_id and i.semana = s.semana))
                                          order by s.semana desc)
                           from (select * from public.vdraft_torneo_semanas where club_id = p_club order by semana desc limit 6) s), '[]'::jsonb));
end
$$;

-- ── LO QUE LLAMA LA APP ─────────────────────────────────────────────────────

-- Estado: el de siempre (contando sólo las partidas normales), más el desafío
-- y el torneo. Antes de responder cobra lo que haya quedado pendiente.
create or replace function public.vdraft_estado(p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  v_lunes date := date_trunc('week', v_hoy)::date;
  p public.vdraft_partidas;
  v_gratis boolean;
  v_puntos int;
  v_regla jsonb := public._vdraft_regla_del_dia(v_hoy);
  cfg public.vdraft_torneo_config;
  s public.vdraft_torneo_semanas;
  v_yo_desafio jsonb;
  v_yo_torneo jsonb;
  v_anterior public.vdraft_torneo_semanas;
begin
  select * into c from public._sobres_ctx(p_token);
  perform public._vdraft_desafio_cerrar(c.o_club);
  perform public._vdraft_torneo_cerrar(c.o_club);

  select * into p from public.vdraft_partidas
   where club_id = c.o_club and dueno = c.o_dueno and estado <> 'terminada' limit 1;
  v_gratis := not exists (select 1 from public.vdraft_partidas
    where club_id = c.o_club and dueno = c.o_dueno and dia = v_hoy and not paga and modo = 'normal');
  select coalesce(puntos, 0) into v_puntos from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno;

  -- El desafío de hoy: lo mío y el ranking.
  select jsonb_build_object('puesto', t.puesto, 'victorias', t.victorias, 'dg', t.dg, 'estado', t.estado)
    into v_yo_desafio
    from public._vdraft_desafio_tabla(c.o_club, v_hoy) t where t.dueno = c.o_dueno;

  -- El torneo de esta semana.
  cfg := public._vdraft_torneo_cfg(c.o_club);
  select * into s from public.vdraft_torneo_semanas where club_id = c.o_club and semana = v_lunes;
  if exists (select 1 from public.vdraft_torneo_inscriptos where club_id = c.o_club and semana = v_lunes and dueno = c.o_dueno) then
    select jsonb_build_object('puesto', t.puesto, 'victorias', t.victorias, 'dg', t.dg, 'jugadas', t.jugadas,
                              'restantes', greatest(coalesce(s.partidas, cfg.partidas) - t.jugadas, 0))
      into v_yo_torneo
      from public._vdraft_torneo_tabla(c.o_club, v_lunes) t where t.dueno = c.o_dueno;
  end if;
  select * into v_anterior from public.vdraft_torneo_semanas
   where club_id = c.o_club and semana < v_lunes and pagado_at is not null order by semana desc limit 1;

  return jsonb_build_object(
    'partida', case when p.id is null then null else public._vdraft_vista(p) end,
    'gratis_hoy', v_gratis,
    'puntos', coalesce(v_puntos, 0),
    'costo', 100,
    'es_staff', c.o_jugador is null,
    'ultimas', coalesce((
      select jsonb_agg(jsonb_build_object('dia', x.dia, 'victorias', x.victorias, 'premio', x.premio, 'formacion', x.formacion,
                                          'modo', x.modo) order by x.created_at desc)
        from (select * from public.vdraft_partidas
               where club_id = c.o_club and dueno = c.o_dueno and estado = 'terminada'
               order by created_at desc limit 5) x), '[]'::jsonb),
    -- Ranking de la semana (lunes a domingo, hora de Argentina) del club: sólo las partidas normales.
    'ranking', coalesce((
      select jsonb_agg(r order by (r ->> 'campeonatos')::int desc, (r ->> 'victorias')::int desc)
        from (
          select jsonb_build_object(
                   'dueno', v.dueno,
                   'nombre', public._juegos_nombre(v.dueno),
                   'yo', v.dueno = c.o_dueno,
                   'partidas', count(*),
                   'victorias', sum(v.victorias),
                   'campeonatos', count(*) filter (where v.victorias >= 3)) as r
            from public.vdraft_partidas v
           where v.club_id = c.o_club and v.estado = 'terminada' and v.modo = 'normal'
             and v.dia >= v_lunes
           group by v.dueno
           order by count(*) filter (where v.victorias >= 3) desc, sum(v.victorias) desc
           limit 10) t), '[]'::jsonb),
    'desafio', jsonb_build_object(
      'dia', v_hoy,
      'regla', v_regla,
      'premios', jsonb_build_array(1000, 750, 500, 150),
      'jugado', exists (select 1 from public.vdraft_partidas where club_id = c.o_club and dueno = c.o_dueno and modo = 'desafio' and dia = v_hoy),
      'yo', v_yo_desafio,
      'ranking', coalesce((
        select jsonb_agg(jsonb_build_object('puesto', t.puesto, 'nombre', public._juegos_nombre(t.dueno), 'yo', t.dueno = c.o_dueno,
                                            'victorias', t.victorias, 'dg', t.dg, 'en_juego', t.estado <> 'terminada') order by t.puesto)
          from public._vdraft_desafio_tabla(c.o_club, v_hoy) t where t.puesto <= 10), '[]'::jsonb),
      'ayer', coalesce((
        select jsonb_agg(jsonb_build_object('puesto', t.puesto, 'nombre', public._juegos_nombre(t.dueno), 'yo', t.dueno = c.o_dueno,
                                            'victorias', t.victorias, 'premio', t.premio -> 'vcoins') order by t.puesto)
          from public._vdraft_desafio_tabla(c.o_club, v_hoy - 1) t where t.puesto <= 3), '[]'::jsonb)),
    'torneo', jsonb_build_object(
      'activo', s.club_id is not null or cfg.activo,
      'semana', v_lunes,
      'hasta', v_lunes + 6,
      'entrada', coalesce(s.entrada, cfg.entrada),
      'partidas', coalesce(s.partidas, cfg.partidas),
      'extra', coalesce(s.extra, cfg.extra),
      'anotados', (select count(*) from public.vdraft_torneo_inscriptos where club_id = c.o_club and semana = v_lunes),
      'pozo', coalesce((select sum(entrada) from public.vdraft_torneo_inscriptos where club_id = c.o_club and semana = v_lunes), 0)
              + coalesce(s.extra, cfg.extra),
      'yo', v_yo_torneo,
      'tabla', coalesce((
        select jsonb_agg(jsonb_build_object('puesto', t.puesto, 'nombre', public._juegos_nombre(t.dueno), 'yo', t.dueno = c.o_dueno,
                                            'victorias', t.victorias, 'dg', t.dg, 'jugadas', t.jugadas) order by t.puesto)
          from public._vdraft_torneo_tabla(c.o_club, v_lunes) t where t.puesto <= 10), '[]'::jsonb),
      'anterior', case when v_anterior.club_id is null then null
                       else jsonb_build_object('semana', v_anterior.semana, 'resultado', v_anterior.resultado) end)
  );
end
$$;

-- Nueva partida: p_modo 'normal' (la de siempre), 'desafio' o 'torneo'.
drop function if exists public.vdraft_nueva(text, uuid);
create or replace function public.vdraft_nueva(p_formacion text, p_token uuid default null, p_modo text default 'normal')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  v_hoy date := public._sobres_hoy();
  v_lunes date := date_trunc('week', v_hoy)::date;
  v_paga boolean := false;
  v_formacion text := p_formacion;
  v_regla jsonb;
  pf public.sobres_perfil;
  s public.vdraft_torneo_semanas;
  p public.vdraft_partidas;
begin
  if coalesce(p_modo, 'normal') not in ('normal', 'desafio', 'torneo') then
    raise exception 'vdraft: modo inválido' using errcode = '22023';
  end if;
  select * into c from public._sobres_ctx(p_token);
  perform set_config('vdraft.dueno', c.o_dueno, true);

  if p_modo = 'desafio' then
    v_regla := public._vdraft_regla_del_dia(v_hoy);
    if v_regla ? 'formacion' then v_formacion := v_regla ->> 'formacion'; end if;
  end if;
  if v_formacion not in ('2-2', '1-2-1', '3-1', '4-0') then
    raise exception 'vdraft: formación inválida' using errcode = '22023';
  end if;

  if exists (select 1 from public.vdraft_partidas where club_id = c.o_club and dueno = c.o_dueno and estado <> 'terminada') then
    raise exception 'vdraft: ya tenés una partida en juego' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cartas_catalogo where club_id = c.o_club) < 8 then
    raise exception 'vdraft: el club todavía no tiene cartas suficientes' using errcode = 'P0001';
  end if;

  insert into public.sobres_perfil (club_id, dueno) values (c.o_club, c.o_dueno) on conflict do nothing;
  select * into pf from public.sobres_perfil where club_id = c.o_club and dueno = c.o_dueno for update;

  if p_modo = 'normal' then
    v_paga := exists (select 1 from public.vdraft_partidas
      where club_id = c.o_club and dueno = c.o_dueno and dia = v_hoy and not paga and modo = 'normal');
    if v_paga then
      if pf.puntos < 100 then
        raise exception 'vdraft: te faltan V-Coins (la partida extra cuesta 100)' using errcode = 'P0001';
      end if;
      update public.sobres_perfil set puntos = puntos - 100 where club_id = c.o_club and dueno = c.o_dueno;
    end if;
  elsif p_modo = 'desafio' then
    if exists (select 1 from public.vdraft_partidas where club_id = c.o_club and dueno = c.o_dueno and modo = 'desafio' and dia = v_hoy) then
      raise exception 'vdraft: el desafío de hoy ya lo jugaste. Mañana hay otro' using errcode = 'P0001';
    end if;
  else
    select * into s from public.vdraft_torneo_semanas where club_id = c.o_club and semana = v_lunes;
    if not exists (select 1 from public.vdraft_torneo_inscriptos where club_id = c.o_club and semana = v_lunes and dueno = c.o_dueno) then
      raise exception 'vdraft: primero anotate en el torneo de esta semana' using errcode = 'P0001';
    end if;
    if (select count(*) from public.vdraft_partidas
         where club_id = c.o_club and dueno = c.o_dueno and modo = 'torneo' and semana = v_lunes) >= s.partidas then
      raise exception 'vdraft: ya jugaste tus % partidas del torneo de esta semana', s.partidas using errcode = 'P0001';
    end if;
  end if;

  insert into public.vdraft_partidas (club_id, dueno, dia, paga, formacion, lugares, modo, regla, semana)
    values (c.o_club, c.o_dueno, v_hoy, v_paga, v_formacion, public._vdraft_lugares(v_formacion), p_modo, v_regla,
            case when p_modo = 'torneo' then v_lunes end)
    returning * into p;

  if p.regla ->> 'id' = 'sin_capitan' then
    -- Sin capitán: directo al arco.
    perform public._vdraft_preparar(p, 'l0');
    update public.vdraft_partidas set paso = 'lugar', lugar_actual = 0, oferta = public._vdraft_oferta_lugar(p, 0)
     where id = p.id returning * into p;
  else
    -- El capitán: 5 especiales de campo (si el club no tiene, cualquier carta).
    perform public._vdraft_preparar(p, 'capitan');
    update public.vdraft_partidas
       set oferta = public._vdraft_sumar(public._vdraft_oferta(c.o_club, 5, null, '{}', 'especial', true),
                                         public._vdraft_oferta(c.o_club, 5, null, '{}', 'todas', false), 5)
     where id = p.id returning * into p;
  end if;
  perform public._vdraft_anotar(c.o_club, c.o_dueno, p.oferta);

  return public._vdraft_vista(p);
end
$$;

-- Elegir: igual que antes, con el azar del desafío y la regla sin suplentes.
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
  v_bancos int;
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

  v_lugar := null;
  for i in 0..4 loop
    if jsonb_typeof(p.equipo -> i) <> 'object' then v_lugar := i; exit; end if;
  end loop;
  v_bancos := case when p.regla ->> 'id' = 'sin_suplentes' then 0 else 2 end;

  if v_lugar is not null then
    p.paso := 'lugar';
    p.lugar_actual := v_lugar;
    perform public._vdraft_preparar(p, 'l' || v_lugar);
    p.oferta := public._vdraft_oferta_lugar(p, v_lugar);
  elsif jsonb_array_length(p.banco) < v_bancos then
    p.paso := 'banco';
    p.lugar_actual := null;
    perform public._vdraft_preparar(p, 'b' || jsonb_array_length(p.banco));
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
    perform public._vdraft_preparar(p, 'rivales');
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

-- Cambios entre partidos: igual que antes (sin banco no hay a quién cambiar).
create or replace function public.vdraft_cambio(p_partida uuid, p_lugar int, p_banco int, p_token uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c record;
  p public.vdraft_partidas;
  v_tit jsonb;
  v_sup jsonb;
begin
  select * into c from public._sobres_ctx(p_token);
  select * into p from public.vdraft_partidas
   where id = p_partida and club_id = c.o_club and dueno = c.o_dueno for update;
  if not found or p.estado <> 'torneo' then raise exception 'vdraft: no se puede cambiar ahora' using errcode = 'P0001'; end if;
  if p_lugar not between 0 and 4 or p_banco < 0 or p_banco >= jsonb_array_length(p.banco) then
    raise exception 'vdraft: cambio inválido' using errcode = '22023';
  end if;
  v_tit := p.equipo -> p_lugar;
  v_sup := p.banco -> p_banco;
  p.equipo := jsonb_set(p.equipo, array[p_lugar::text], v_sup);
  p.banco := jsonb_set(p.banco, array[p_banco::text], v_tit);
  update public.vdraft_partidas set equipo = p.equipo, banco = p.banco, updated_at = now() where id = p.id;
  return public._vdraft_vista(p);
end
$$;

/* Jugar el partido: igual que antes. En el desafío el azar sale del día, del
   número de partido y de las cartas en cancha: el mismo equipo saca el mismo
   resultado. Después se vuelve al azar de siempre. */
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

  if p.modo = 'desafio' then
    perform setseed(public._vdraft_u(format('partido|%s|%s|%s|%s', p.club_id, p.dia, v_n,
      (select string_agg(coalesce(x ->> 'catalogo_id', '-'), ',' order by o) from jsonb_array_elements(p.equipo) with ordinality e(x, o)))) * 2 - 1);
  end if;

  v_gp := least(public._vdraft_poisson(2.5 * exp(v_dif / 15.0)), 20);
  v_gr := least(public._vdraft_poisson(2.5 * exp(-v_dif / 15.0)), 20);

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

  if p.modo = 'desafio' then
    -- De vuelta al azar de siempre (para los penales y todo lo demás de esta conexión).
    perform setseed((extract(microseconds from clock_timestamp())::bigint % 1000000) / 1000000.0 * 2 - 1);
  end if;

  v_gano := case when v_gp > v_gr then true when v_gp < v_gr then false else null end;

  p.partidos := p.partidos || jsonb_build_array(jsonb_build_object(
    'ronda', v_rival ->> 'ronda', 'rival', v_rival ->> 'equipo', 'division', v_rival ->> 'division',
    'goles_propios', v_gp, 'goles_rival', v_gr, 'penales', null, 'pendiente', v_gano is null,
    'gano', v_gano, 'goles', v_goles,
    'fuerza_propia', v_f ->> 'fuerza', 'fuerza_rival', v_rival ->> 'fuerza'));

  if v_gano is null then
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

-- ── PERMISOS ────────────────────────────────────────────────────────────────

revoke all on table public.vdraft_torneo_config, public.vdraft_torneo_semanas, public.vdraft_torneo_inscriptos from anon, authenticated;
revoke all on function public._vdraft_u(text) from public, anon, authenticated;
revoke all on function public._juegos_nombre(text) from public, anon, authenticated;
revoke all on function public._vdraft_regla_del_dia(date) from public, anon, authenticated;
revoke all on function public._vdraft_preparar(public.vdraft_partidas, text) from public, anon, authenticated;
revoke all on function public._vdraft_oferta(uuid, int, text[], text[], text, boolean) from public, anon, authenticated;
revoke all on function public._vdraft_rivales(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_sumar(jsonb, jsonb, int) from public, anon, authenticated;
revoke all on function public._vdraft_terminar(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_goles(jsonb) from public, anon, authenticated;
revoke all on function public._vdraft_desafio_tabla(uuid, date) from public, anon, authenticated;
revoke all on function public._vdraft_desafio_cerrar(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_torneo_cfg(uuid) from public, anon, authenticated;
revoke all on function public._vdraft_torneo_tabla(uuid, date) from public, anon, authenticated;
revoke all on function public._vdraft_torneo_cerrar(uuid) from public, anon, authenticated;
revoke all on function public.god_torneo_config(uuid, int, int, int, boolean) from public, anon;
revoke all on function public.god_torneo_estado(uuid) from public, anon;
grant execute on function public.god_torneo_config(uuid, int, int, int, boolean) to authenticated;
grant execute on function public.god_torneo_estado(uuid) to authenticated;
grant execute on function public.vdraft_estado(uuid) to anon, authenticated;
grant execute on function public.vdraft_nueva(text, uuid, text) to anon, authenticated;
grant execute on function public.vdraft_elegir(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.vdraft_cambio(uuid, int, int, uuid) to anon, authenticated;
grant execute on function public.vdraft_jugar(uuid, uuid) to anon, authenticated;
grant execute on function public.vdraft_torneo_anotarse(uuid) to anon, authenticated;
