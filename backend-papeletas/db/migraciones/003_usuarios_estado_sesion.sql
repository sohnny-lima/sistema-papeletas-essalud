-- U1: estado e invalidación de sesiones. Esquema reconstruido.
-- Las cuentas existentes quedan activas, con versión 0 y fecha de esta migración;
-- fecha_creacion no reconstruye la fecha histórica. Se conservan hashes y UNIQUE.
-- Reversión con backend detenido y copia previa (invalida sesiones):
-- BEGIN;
-- DROP INDEX IF EXISTS ux_usuarios_nombre_lower;
-- ALTER TABLE usuarios DROP COLUMN fecha_creacion;
-- ALTER TABLE usuarios DROP COLUMN version_sesion;
-- ALTER TABLE usuarios DROP COLUMN activo;
-- DELETE FROM esquema_migraciones WHERE nombre = '003_usuarios_estado_sesion.sql';
-- COMMIT;

BEGIN;
-- Impide duplicados entre la comprobación y la creación del índice.
LOCK TABLE usuarios IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
    duplicados TEXT;
BEGIN
    SELECT string_agg(format('%s (ids: %s)', nombre, ids), '; ' ORDER BY nombre)
    INTO duplicados
    FROM (
        SELECT lower(nombre_usuario) AS nombre,
               string_agg(id_usuario::text, ', ' ORDER BY id_usuario) AS ids
        FROM usuarios GROUP BY lower(nombre_usuario) HAVING COUNT(*) > 1
    ) d;
    IF duplicados IS NOT NULL THEN
        RAISE EXCEPTION 'U1 migración 003: nombres de usuario duplicados sin distinguir mayúsculas: %. Resuélvalos antes de continuar.', duplicados;
    END IF;
END
$$;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_nombre_lower
    ON usuarios (lower(nombre_usuario));
COMMIT;
