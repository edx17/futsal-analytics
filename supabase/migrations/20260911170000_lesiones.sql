-- ═══════════════════════════════════════════════════════════════════════════
--  ENFERMERÍA: SEGUIMIENTO DE LESIONES
--
--  Hasta ahora una lesión no existía en ningún lado. El jugador lesionado se
--  marcaba 'ausente' o 'justificado' al pasar lista, y como el presentismo
--  cuenta presentes sobre el TOTAL de días, dos meses de lesión le hundían el
--  porcentaje. Peor todavía desde que la CITACIÓN usa ese mismo porcentaje
--  para sugerir convocatorias: el que vuelve de una lesión larga quedaba
--  penalizado meses por algo que no es su culpa.
--
--  Esta tabla es la fuente de verdad de "quién está disponible", y la
--  consultan la Citación, Nuevo Partido, el Microciclo, el Presentismo y el
--  perfil del jugador a través de un único helper (utils/disponibilidad.js).
--
--  Dos campos que no son obvios y valen la pena:
--
--   · partido_id  → si se lesionó jugando, queda linkeado al partido. Con una
--                   temporada de datos se puede ver EN QUÉ partidos nos
--                   lesionamos y con qué carga previa.
--   · estado='recaida' → la tasa de recaída es la métrica que le dice al CT
--                   si está dando altas antes de tiempo. Sin el campo no hay
--                   forma de medirla.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lesiones (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  jugador_id bigint not null,

  -- ── QUÉ PASÓ ──
  fecha_lesion date not null,
  zona text,            -- Isquiosurales, Tobillo, Rodilla…  (lista fija en el front)
  tipo text,            -- Muscular, Articular, Ligamentaria, Ósea, Golpe, Otra
  lateralidad text,     -- Izquierda / Derecha / Bilateral / N-A
  gravedad text,        -- Leve / Moderada / Grave
  mecanismo text,       -- Sin contacto / Con contacto / Sobrecarga
  contexto text,        -- Partido / Entrenamiento / Fuera del club
  partido_id uuid,      -- el partido donde se lesionó, si fue jugando
  descripcion text,

  -- ── EL TIEMPO ──
  fecha_alta_estimada date,
  fecha_alta_real date,

  -- ── EL PROCESO ──
  -- activa → de baja | readaptacion → entrena aparte | alta → disponible
  -- recaida → se volvió a lesionar de lo mismo
  estado text not null default 'activa',
  tratamiento text,
  profesional text,
  -- Partes de evolución: [{ fecha, nota, autor }]. En jsonb y no en una tabla
  -- aparte porque se lee y se escribe siempre entero, con la lesión.
  evolucion jsonb default '[]'::jsonb,

  -- ── AUDITORÍA ──
  creado_por uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Las consultas siempre son "las lesiones de este club" y "las de este
-- jugador", en ese orden.
create index if not exists lesiones_club_fecha_idx on public.lesiones (club_id, fecha_lesion desc);
create index if not exists lesiones_jugador_idx on public.lesiones (jugador_id, fecha_lesion desc);

-- ── PRESENTISMO: EL ESTADO NUEVO ───────────────────────────────────────────
-- `asistencias.estado` es texto libre, así que 'lesionado' no necesita
-- migración. Se documenta acá para que quede el registro de que a partir de
-- esta versión existe un quinto estado, y que ese estado NO cuenta como falta:
-- sale del denominador del porcentaje, no suma como ausencia.
comment on column public.asistencias.estado is
  'presente | tarde | ausente | justificado | lesionado. "lesionado" se excluye del cálculo de presentismo (no cuenta como presente ni como falta).';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Las políticas de esta tabla están en la migración 20260912120000_lesiones_rls.sql.
--
-- Acá había un ejemplo comentado que estaba MAL (usaba una subconsulta a
-- `usuarios`, que tiene su propio RLS y devuelve NULL desde el navegador, así
-- que rechazaba todos los INSERT). Se quitó para que nadie lo copie: las
-- políticas buenas usan los helpers get_user_rol() / get_user_club_id(), que
-- son los que ya usan sesiones, eventos, jugadores y temas_semana.
