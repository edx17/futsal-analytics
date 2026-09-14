-- ═══════════════════════════════════════════════════════════════════════════
--  QUÉ PLAN MIRÓ EL QUE SE REGISTRA
--
--  Desde que el landing tiene precios, cada tarjeta de plan manda a
--  /registro?plan=dt|ct|club. Ese dato se perdía: todos entran con el trial,
--  así que `plan_actual` queda en 'trial' y no había dónde anotar cuál le
--  había interesado.
--
--  Es el único dato comercial del alta: dice qué venderle cuando se le termine
--  la prueba, sin tener que preguntarlo de nuevo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clubes
  add column if not exists plan_interes text;

comment on column public.clubes.plan_interes is
  'Plan que eligió en el landing al registrarse (dt/ct/club). Informativo: el acceso lo definen plan_actual y suscripcion_activa.';
