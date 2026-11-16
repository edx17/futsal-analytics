-- ═══════════════════════════════════════════════════════════════════════════
--  CONFIGURADOR GENERAL DEL CLUB: RAMAS, PAÍS, LIGAS Y CATEGORÍAS
--
--  clubes.pais        'AR', 'UY', … (el país arma las plantillas de ligas)
--  clubes.ramas       '{Masculino,Femenino}'
--  clubes.ligas       [{ "id": "afa", "nombre": "AFA" }, …]
--  clubes.categorias  [{ "nombre": "Primera", "rama": "Masculino", "ligas": ["afa"],
--                        "tipo": "division" | "sub" | "promocional" | "otra",
--                        "edad_max": 17, "anio": 2014, "activa": true }, …]
--                     (el orden del array es el orden en la app)
--  Las categorías se siguen guardando por nombre en cada tabla (jugadores,
--  partidos…). El configurador dice cuáles existen, en qué orden y en qué
--  ligas juegan; la app ofrece ésas.
--
--  unificar_categoria(club, desde, hacia): renombra una categoría en todas las
--  tablas del club, en una sola transacción. Para "3ra" → "Tercera".
--  Sólo superusuario, manager o admin del club.
--
--  Idempotente. Depende de 20261118120000_pruebas_entregas_ligas.sql.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clubes add column if not exists pais text;
alter table public.clubes add column if not exists ramas text[] not null default '{}';
alter table public.clubes add column if not exists ligas jsonb not null default '[]'::jsonb;
alter table public.clubes add column if not exists categorias jsonb not null default '[]'::jsonb;

-- El manager/admin puede editar estas columnas (además de las de siempre).
create or replace function public.proteger_columnas_club()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_rol text := public.get_user_rol();
  v_permitidas text[];
begin
  if auth.uid() is null or v_rol = 'superuser' then
    return new;
  end if;
  v_permitidas := case
    when v_rol = 'tesorero' then array['alias_cobro', 'cbu', 'cvu', 'whatsapp_tesoreria']
    else array['nombre', 'escudo_url', 'alias_cobro', 'cbu', 'cvu', 'whatsapp_tesoreria', 'citacion_config', 'plan_interes',
               'pais', 'ramas', 'ligas', 'categorias']
  end;
  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'No tenés permiso para cambiar esos datos del club' using errcode = '42501';
  end if;
  return new;
end
$function$;

-- ── Mientras se unifica una categoría, los triggers que protegen datos ya
--    cerrados no tienen que frenar un cambio que sólo toca el nombre de la
--    categoría. La marca vive sólo dentro de la transacción de unificar. ──
create or replace function public._unificando_categoria()
returns boolean language sql stable as $$
  select coalesce(current_setting('vc.unificando_categoria', true), '') = 'si'
$$;

create or replace function public._pruebas_eval_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.pruebas_sesiones;
  k public.pruebas_candidatos;
  asignado uuid;
begin
  if tg_op = 'UPDATE' and public._unificando_categoria() then return new; end if;
  select * into s from public.pruebas_sesiones where id = new.sesion_id;
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  if s.id is null or k.id is null then raise exception 'pruebas: sesión o candidato inexistente' using errcode = 'P0001'; end if;
  if s.club_id <> k.club_id or s.categoria <> k.categoria then
    raise exception 'pruebas: el candidato no es de la categoría de la sesión' using errcode = 'P0001';
  end if;
  if new.bloque = 'juego_real' and s.etapa <> 2 then
    raise exception 'pruebas: el juego real se evalúa en la etapa 2' using errcode = 'P0001';
  end if;
  if s.etapa = 2 and exists (select 1 from public.pruebas_cierres c where c.candidato_id = k.id and c.etapa = 1
                                and c.estado = 'decidido' and c.decision = 'no_incorporar') then
    raise exception 'pruebas: en la etapa 1 se decidió no incorporarlo' using errcode = 'P0001';
  end if;
  if public._pruebas_entregado(k.id, s.etapa, new.evaluador_id) then
    raise exception 'pruebas: ya guardaste tu evaluación de este candidato en esta etapa (usá CORREGIR)' using errcode = 'P0001';
  end if;
  asignado := public._pruebas_asignado(k.id);
  if asignado is not null and asignado <> new.evaluador_id and coalesce((select public.get_user_rol()), '') <> 'superuser' then
    raise exception 'pruebas: los candidatos de este puesto los evalúa sólo quien tiene asignado el puesto' using errcode = 'P0001';
  end if;
  new.club_id := s.club_id;
  new.categoria := s.categoria;
  new.updated_at := now();
  return new;
end
$$;

create or replace function public._pruebas_cierre_antes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k public.pruebas_candidatos;
begin
  if tg_op = 'UPDATE' and public._unificando_categoria() then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'decidido' then
    raise exception 'pruebas: el cierre ya está decidido y queda congelado' using errcode = 'P0001';
  end if;
  select * into k from public.pruebas_candidatos where id = new.candidato_id;
  new.club_id := k.club_id;
  new.categoria := k.categoria;
  if new.estado = 'decidido' and (tg_op = 'INSERT' or old.estado = 'revision') then
    new.decidido_por := auth.uid();
    new.decidido_at := now();
  end if;
  return new;
end
$$;

create or replace function public._cartas_destacadas_sincronizar()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'UPDATE' and public._unificando_categoria() then return null; end if;
  update public.cartas_catalogo k set activa = false
   where k.club_id = old.club_id
     and k.tipo <> 'BASE' and k.activa
     and split_part(k.clave, '|', 1) = old.tipo
     and split_part(k.clave, '|', 2) = old.periodo
     and not public._carta_premio_vigente(k.club_id, k.clave);
  return null;
end
$function$;

-- ── Unificar ────────────────────────────────────────────────────────────────
create or replace function public.unificar_categoria(p_club uuid, p_desde text, p_hacia text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rol text := coalesce(public.get_user_rol(), '');
  v_club text := p_club::text;
  r jsonb := '{}'::jsonb;
  n int;
  t record;
begin
  if not (v_rol = 'superuser' or (v_rol in ('manager', 'admin') and v_club = public.get_user_club_id())) then
    raise exception 'Sólo el manager o el admin del club pueden unificar categorías' using errcode = '42501';
  end if;
  p_desde := coalesce(p_desde, ''); p_hacia := trim(coalesce(p_hacia, ''));
  if p_desde = '' or p_hacia = '' or p_desde = p_hacia then
    raise exception 'Elegí una categoría de origen y otra de destino distintas' using errcode = 'P0001';
  end if;
  perform set_config('vc.unificando_categoria', 'si', true);

  -- La configuración de pruebas es única por categoría: si el destino ya tiene, gana la del destino.
  if exists (select 1 from public.pruebas_config where club_id::text = v_club and categoria = p_hacia) then
    delete from public.pruebas_config where club_id::text = v_club and categoria = p_desde;
  end if;

  -- Columnas de texto con el nombre de la categoría (tabla, columna).
  for t in select * from (values
      ('asistencias', 'categoria'), ('cartas_destacadas', 'categoria'), ('disciplina_sanciones', 'categoria'),
      ('jugadores', 'categoria'), ('partidos', 'categoria'), ('torneos', 'categoria'), ('transferencias', 'categoria'),
      ('sesiones', 'categoria_equipo'), ('temas_semana', 'categoria_equipo'), ('tareas', 'categoria_recomendada'),
      ('tesoreria_tarifas', 'categoria'), ('video_analisis', 'categoria'), ('video_clips', 'categoria'),
      ('pruebas_candidatos', 'categoria'), ('pruebas_sesiones', 'categoria'), ('pruebas_evaluaciones', 'categoria'),
      ('pruebas_cierres', 'categoria'), ('pruebas_entregas', 'categoria'), ('pruebas_config', 'categoria')
    ) as x(tabla, columna)
  loop
    if to_regclass('public.' || t.tabla) is null then continue; end if;
    execute format('update public.%I set %I = $1 where club_id::text = $2 and %I = $3', t.tabla, t.columna, t.columna)
      using p_hacia, v_club, p_desde;
    get diagnostics n = row_count;
    if n > 0 then r := r || jsonb_build_object(t.tabla, n); end if;
  end loop;

  -- Listas de categorías (text[]): se reemplaza y se sacan duplicados.
  update public.novedades set categorias = (select array_agg(distinct case when x = p_desde then p_hacia else x end) from unnest(categorias) x)
   where club_id::text = v_club and p_desde = any(categorias);
  get diagnostics n = row_count; if n > 0 then r := r || jsonb_build_object('novedades', n); end if;
  update public.perfiles set categorias_asignadas = (select array_agg(distinct case when x = p_desde then p_hacia else x end) from unnest(categorias_asignadas) x)
   where club_id::text = v_club and p_desde = any(categorias_asignadas);
  get diagnostics n = row_count; if n > 0 then r := r || jsonb_build_object('perfiles', n); end if;
  -- Listas en jsonb (["Primera", …]).
  update public.video_playlists set compartida_categorias = (
      select coalesce(jsonb_agg(distinct case when x = p_desde then p_hacia else x end), '[]'::jsonb)
        from jsonb_array_elements_text(compartida_categorias) x)
   where club_id::text = v_club and jsonb_typeof(compartida_categorias) = 'array' and compartida_categorias ? p_desde;
  get diagnostics n = row_count; if n > 0 then r := r || jsonb_build_object('video_playlists', n); end if;

  -- El propio configurador: si "desde" estaba configurada y "hacia" no, se renombra; si estaban las dos, se saca "desde".
  update public.clubes c set categorias = (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from (
        select case when e->>'nombre' = p_desde then jsonb_set(e, '{nombre}', to_jsonb(p_hacia)) else e end as e, i
          from jsonb_array_elements(c.categorias) with ordinality as a(e, i)
         where not (e->>'nombre' = p_desde and exists (select 1 from jsonb_array_elements(c.categorias) y where y->>'nombre' = p_hacia))
      ) z)
   where c.id = p_club and jsonb_typeof(c.categorias) = 'array';

  perform set_config('vc.unificando_categoria', '', true);
  return r;
end
$$;

revoke all on function public.unificar_categoria(uuid, text, text) from public, anon;
grant execute on function public.unificar_categoria(uuid, text, text) to authenticated;
revoke all on function public._unificando_categoria() from public, anon;
grant execute on function public._unificando_categoria() to authenticated;
