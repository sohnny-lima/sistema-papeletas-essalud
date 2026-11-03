-- =====================================================================
-- Migración 001 — Número de papeleta único
-- ---------------------------------------------------------------------
-- Motivo: el backend asigna ahora números correlativos PA-NNNN bajo un
-- bloqueo de transacción (utils/papeletaNumber.js). Este índice es la
-- segunda barrera: si algo intenta repetir un número, PostgreSQL lo rechaza
-- (23505) y la API responde 409 en lugar de guardar un duplicado.
--
-- Probada en la base aislada (esquema reconstruido). PENDIENTE de probar
-- contra una copia de la base real.
--
-- ANTES de aplicarla en la base real, revise si ya hay duplicados
-- (con el número aleatorio anterior eran posibles):
--
--   SELECT numero_papeleta, COUNT(*) AS veces, ARRAY_AGG(id_papeleta ORDER BY id_papeleta) AS ids
--   FROM papeletas GROUP BY numero_papeleta HAVING COUNT(*) > 1;
--
-- Si aparecen filas, hay que decidir con el área usuaria cómo renumerarlas;
-- la migración se detiene sin cambiar nada mientras existan.
--
-- Reversión:  DROP INDEX IF EXISTS ux_papeletas_numero_papeleta;
-- =====================================================================

BEGIN;

DO $$
DECLARE
    duplicados INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicados
    FROM (
        SELECT numero_papeleta FROM papeletas
        GROUP BY numero_papeleta HAVING COUNT(*) > 1
    ) d;

    IF duplicados > 0 THEN
        RAISE EXCEPTION 'Hay % números de papeleta repetidos; resuélvalos antes de aplicar la migración 001.', duplicados;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_papeletas_numero_papeleta
    ON papeletas (numero_papeleta);

COMMIT;
