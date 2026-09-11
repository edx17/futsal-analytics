-- ═══════════════════════════════════════════════════════════════════════════
--  CITACIÓN DEL PRÓXIMO PARTIDO
--
--  La citación al grupo se escribía a mano en WhatsApp, partido por partido:
--  la fecha, la sede, la dirección, el horario de citación y la lista de
--  convocados uno por uno. Todo eso ya vive en la base, menos tres cosas:
--  el horario de citación, la dirección de la cancha y el texto final.
--
--  Esta migración agrega SOLO eso. Es aditiva: nada de lo que existe cambia
--  de forma ni de tipo, así que NUEVO PARTIDO, el fixture y los resúmenes
--  siguen funcionando igual con o sin ella corrida.
--
--  La convocatoria en sí NO necesita columna nueva: se guarda en
--  `partidos.plantilla`, que es la misma que ya llena NUEVO PARTIDO. Así lo
--  que se cita acá alimenta el partido, el conteo de "citados vs jugados"
--  del perfil del jugador y la estadística de la temporada, sin duplicar
--  la verdad en dos lugares.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LO QUE LE FALTA AL PARTIDO ──────────────────────────────────────────
alter table public.partidos
  -- A qué hora tienen que estar en la cancha. Texto y no `time` a propósito:
  -- el club escribe "19.00hs." y variantes, y forzar un tipo estricto haría
  -- fallar el guardado por un punto mal puesto.
  add column if not exists hora_citacion text,

  -- La dirección de la cancha. `lugar` ya guarda el NOMBRE de la sede
  -- ("Juventud de Tapiales"); esto es la calle y altura, que es lo que
  -- el jugador necesita para poner en el GPS.
  add column if not exists direccion text,

  -- Todo lo propio de la citación de ESTE partido, junto:
  --   { mensaje, indumentaria, entrada, guardada_at, publicada_at }
  -- `publicada_at` es además lo que mira el cron de push (smart-service) para
  -- avisar UNA sola vez por partido cuando la citación se publica al Tablón.
  -- En jsonb y no en cuatro columnas porque es un bloque que se lee y se
  -- escribe siempre entero, y así sumar un campo mañana no pide migración.
  add column if not exists citacion jsonb;

-- ── 2. LA CANCHA DEL RIVAL, RECORDADA ──────────────────────────────────────
-- La dirección de un rival no cambia entre temporadas. Guardándola en su
-- ficha, la segunda vez que vas a esa cancha la citación se autocompleta.
alter table public.rivales
  add column if not exists sede text,
  add column if not exists direccion text;

-- ── 3. EL MENSAJE TIPO DEL CLUB ────────────────────────────────────────────
-- La plantilla se escribe una vez y se reusa todo el año:
--   { plantilla, indumentaria, entrada, minutos_antes }
alter table public.clubes
  add column if not exists citacion_config jsonb;
