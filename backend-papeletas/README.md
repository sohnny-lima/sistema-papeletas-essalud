# Backend · API REST

API del Sistema de Papeletas (Node.js 24, Express 4, PostgreSQL 17). Visión general, instalación y seguridad: [README principal](../README.md).

- **Capas:** `routes/` → `controllers/` → `config/database.js` (pool `pg`); validaciones en `utils/`; autenticación y autorización en `middlewares/authMiddleware.js` (JWT y rol leído de la base en cada petición).
- **Base de datos:** `db/esquema/` (esquema inicial), `db/migraciones/` y `db/demo/` (datos ficticios, solo para pruebas).
- **Herramientas** (`scripts/`):
  - `migrar.js` (`--estado`, `--inicializar`, `--catalogos-iniciales` y `--conceder-app`);
  - `crear-admin.js` (primer administrador, con la contraseña sin eco);
  - `comparar-esquema.js`;
  - `cargar-demo.js` (solo entornos de prueba, sobre una base vacía).
- **Configuración:** `.env.example` y `docs/entrega/configuracion.md`.
- **Arranque:** `npm ci` y `npm start` (puerto 3000).
- **Pruebas:** `npm test`, que crea su propia base `bd_papeleta_ci`.
