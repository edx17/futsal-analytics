-- ═══════════════════════════════════════════════════════════════════════════
--  LIGA: ETAPAS (PLAYOFFS, DESEMPATES, TRIANGULARES, COPA FUTURO)
--
--  Cada división define su cierre a su manera (playoff de 1ra e inferiores en
--  la A, del 2º al 9º en la B y la C, cruces del 2º al 5º por zona en la D,
--  triangulares de desempate, Copa Futuro de Oro / Plata en inferiores…) y
--  cambia de un año a otro. En vez de programar cada formato, se guarda lo que
--  dice segundopalo de cada partido y la app arma la etapa sola:
--
--    etapa         null en el torneo regular. Si no, el nombre de la etapa
--                  según segundopalo: "Playoff", "Desempate Descenso",
--                  "Copa Futuro de Oro"…
--    etapa_tabla   true si segundopalo dice que esa etapa se muestra con tabla
--                  de posiciones (un triangular); null si no lo dice (la app
--                  lo deduce: sin fase de copa → tabla; con fase → cruces)
--    grupo         el grupo dentro de la etapa (grupo_copas), si hay varios
--    torneo_tipo   primera: el tipo de fase de segundopalo; inferiores: el
--                  tipo de torneo (1 regular, 4 Copa Futuro, 5 playoff,
--                  8 Copa Futuro de Oro, 9 de Plata…)
--
--  Correr ANTES de desplegar la función liga-sync nueva (que manda estos
--  campos). Después, "Actualizar" en Otras competencias completa las etapas:
--  la primera vez marca como cambiados casi todos los partidos (es el
--  relleno de las columnas nuevas) y baja los playoffs de inferiores.
--  Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.liga_partidos
  add column if not exists etapa text,
  add column if not exists etapa_tabla boolean,
  add column if not exists grupo text,
  add column if not exists torneo_tipo int;

comment on column public.liga_partidos.etapa is
  'null = torneo regular. Si no, la etapa según segundopalo (playoff, desempate, Copa Futuro…).';

-- Los playoffs que ya estaban (con fase) son de la etapa Playoff.
update public.liga_partidos set etapa = 'Playoff' where fase is not null and etapa is null;

create index if not exists liga_partidos_etapa on public.liga_partidos (competencia_id, etapa) where etapa is not null;
