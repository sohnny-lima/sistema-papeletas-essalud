-- =====================================================================
-- Migración 002 — Nombre de centro asistencial único
-- ---------------------------------------------------------------------
-- Motivo: la API ya impide crear o renombrar un centro con un nombre que
-- coincida con otro sin distinguir mayúsculas, espacios al principio o al
-- final ni espacios repetidos (controllers/centrosAsistencialesController.js,
-- bajo un bloqueo de transacción). Este índice es la segunda barrera para
-- escrituras que no pasen por la API: PostgreSQL rechaza el duplicado
-- (23505) y la API responde 409.
--
-- La API compara en JavaScript (toUpperCase y \s de Unicode); el índice usa
-- upper() y \s de PostgreSQL, en el mismo orden: primero une los espacios
-- (también tabuladores y saltos de línea) y después recorta los extremos.
-- Coinciden en los casos habituales; con
-- espacios especiales (p. ej. no separables) o letras acentuadas en una base
-- con configuración regional "C" el índice puede ser menos estricto que la API.
--
-- Probada en la base aislada (esquema reconstruido). PENDIENTE de probar
-- contra una copia de la base real.
--
-- ANTES de aplicarla en la base real, revise si ya hay nombres repetidos:
--
--   SELECT upper(btrim(regexp_replace(nombre_centro, '\s+', ' ', 'g'))) AS nombre,
--          COUNT(*) AS veces, ARRAY_AGG(id_centro ORDER BY id_centro) AS ids
--   FROM centros_asistenciales
--   GROUP BY 1 HAVING COUNT(*) > 1;
--
-- Si aparecen filas, hay que decidir con el área usuaria qué centro se
-- conserva y reasignar sus lugares; la migración se detiene sin cambiar
-- nada mientras existan.
--
-- Reversión:  DROP INDEX IF EXISTS ux_centros_asistenciales_nombre;
-- =====================================================================

BEGIN;

DO $$
DECLARE
    duplicados INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicados
    FROM (
        SELECT 1 FROM centros_asistenciales
        GROUP BY upper(btrim(regexp_replace(nombre_centro, '\s+', ' ', 'g')))
        HAVING COUNT(*) > 1
    ) d;

    IF duplicados > 0 THEN
        RAISE EXCEPTION 'Hay % nombres de centro asistencial repetidos; resuélvalos antes de aplicar la migración 002.', duplicados;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_centros_asistenciales_nombre
    ON centros_asistenciales (upper(btrim(regexp_replace(nombre_centro, '\s+', ' ', 'g'))));

COMMIT;
