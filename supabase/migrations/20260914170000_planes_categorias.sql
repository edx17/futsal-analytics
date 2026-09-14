-- ═══════════════════════════════════════════════════════════════════════════
--  PLANES POR CANTIDAD DE CATEGORÍAS + SOCIOS FUNDADORES
--
--  Los planes (trial / basico / pro / premium) existían como etiqueta pero no
--  limitaban nada: los cuatro daban acceso a todo. Ahora la escalera es real y
--  lo único que cambia entre planes es CUÁNTAS CATEGORÍAS puede manejar el
--  club. Ningún plan esconde funciones, para que el más barato no sea una
--  versión mutilada del producto.
--
--      dt    → 1 categoría
--      ct    → 3 categorías
--      club  → sin límite
--
--  LOS QUE YA ESTABAN NO PAGAN. Todos los clubes que existen al momento de
--  correr esta migración quedan marcados como socios fundadores: plan Club,
--  sin límite de categorías y sin vencimiento. Es deliberado y es para
--  siempre: acompañaron el producto antes de que tuviera precio.
--
--  ⚠️ Correr UNA sola vez, al lanzar los precios. Los clubes que se registren
--     después NO son fundadores (la condición `socio_fundador = false` sólo
--     alcanza a los que existen ahora, pero si se corre dos veces también
--     alcanzaría a los nuevos).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clubes
  -- Override manual por club. NULL = usar el límite que corresponde al plan.
  -- Sirve para casos puntuales (un club que negoció 5 categorías) sin tener
  -- que inventar un plan nuevo.
  add column if not exists limite_categorias int,

  -- El que estaba antes del precio. No paga y no tiene tope.
  add column if not exists socio_fundador boolean not null default false;

comment on column public.clubes.limite_categorias is
  'Tope de categorías distintas. NULL = el límite del plan (ver src/utils/planes.js). Los socios fundadores no tienen tope.';

-- ── SOCIOS FUNDADORES ──────────────────────────────────────────────────────
update public.clubes
   set socio_fundador    = true,
       plan_actual       = 'club',
       limite_categorias = null,
       suscripcion_activa = true,
       -- Sin fecha de vencimiento no hay corte: App.jsx sólo bloquea cuando
       -- `fecha_vencimiento` ya pasó, y con NULL nunca pasa.
       fecha_vencimiento = null
 where socio_fundador = false;
