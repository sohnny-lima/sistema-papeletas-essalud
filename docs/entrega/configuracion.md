# Configuración

Las variables de la instalación con Docker están en `deploy/.env`, creado desde `deploy/.env.example`. Las del backend fuera de Docker (desarrollo) están en `backend-papeletas/.env`, creado desde `backend-papeletas/.env.example`.

**Ninguna clave va en estos archivos.** Las claves son archivos de `deploy/secretos/` (ver su `README.md`), y el backend los lee mediante las variables `*_FILE`.

## Instalación con Docker (`deploy/.env`)

| Variable | Valor por defecto | Efecto | ¿Secreta? |
|---|---|---|---|
| `APP_VERSION` | `1.0.0-rc.2` | Etiqueta de las imágenes `essalud/frontend` y `essalud/backend` | No |
| `VCS_REF`, `SOURCE_URL` | `sin-revision`, `local/...` | Etiquetas OCI de trazabilidad de la imagen | No |
| `FRONTEND_IMAGE`, `BACKEND_IMAGE` | `essalud/frontend`, `essalud/backend` | Nombre de las imágenes (por ejemplo, de un registro interno) | No |
| `HTTP_BIND` | `0.0.0.0` | Interfaz donde se publica la web. Con un proxy institucional en el mismo equipo, `127.0.0.1` | No |
| `HTTP_PORT` | `8080` | Puerto publicado de la web. **El único puerto publicado** | No |
| `TZ` | `America/Lima` | Zona horaria de los contenedores (registros y nombres de las copias). Las fechas de negocio no dependen de ella | No |
| `DB_HOST`, `DB_PORT` | `host.docker.internal`, `5432` | Servidor PostgreSQL en el escenario B. En el A se fuerzan `db:5432` | No |
| `DB_NAME` | `papeletas` | Base de la aplicación | No |
| `DB_USER` | `papeletas_app` | Rol **limitado** de la API: solo datos, sin DDL | No |
| `DB_PASSWORD_PATH` | `./secretos/db_password` | Archivo con la clave de `DB_USER` | **Sí (archivo)** |
| `DB_OWNER_USER` | `papeletas_admin` | Propietario de la base: migraciones, primer administrador y copias. Nunca lo usa la API | No |
| `DB_OWNER_PASSWORD_PATH` | `./secretos/db_owner_password` | Archivo con la clave del propietario | **Sí (archivo)** |
| `JWT_SECRET_PATH` | `./secretos/jwt_secret` | Archivo con el secreto de firma de las sesiones (32 caracteres o más) | **Sí (archivo)** |
| `JWT_EXPIRES_IN` | `1h` | Duración de la sesión (`30m`, `8h`…). No hay renovación automática: al caducar, se vuelve al login | No |
| `DB_CONNECTION_TIMEOUT_MS` | `10000` | Espera máxima para abrir una conexión nueva con PostgreSQL. Pasado ese tiempo, la API responde 503. Si la base rechaza la conexión, el 503 es inmediato; esta espera solo se agota con un servidor lento o inalcanzable. **No bajar de 10000:** el pool cierra las conexiones inactivas a los 10 s, de modo que la primera petición tras una pausa abre una conexión nueva, y con 3000 un retraso pasajero daba 503 con la base sana (incidencia VM1) | No |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | Límite de cada sentencia en PostgreSQL (`statement_timeout`). Al superarlo, PostgreSQL la cancela y la API responde 503 «La base de datos tardó demasiado en responder». Las consultas de la aplicación tardan milisegundos | No |
| `DB_QUERY_TIMEOUT_MS` | `18000` | Espera máxima del backend por la respuesta de una consulta (`query_timeout`), por si se pierde la red. **Debe ser mayor** que `DB_STATEMENT_TIMEOUT_MS`, para que cancele antes el servidor. La conexión afectada se descarta | No |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `30000` | PostgreSQL cierra una transacción abandonada a medias y libera sus bloqueos | No |
| `ACCESS_LOG_ENABLED` | `true` | Una línea JSON por petición en el registro del backend (§ Registros) | No |

**Los límites son por consulta, no por petición.** Una petición hace de 1 a 6 consultas, cada una con su propio límite. Ninguna queda colgada indefinidamente, pero una petición con varias consultas lentas puede superar los 30 s de Nginx (`proxy_read_timeout`). En ese caso el navegador recibe 504, mientras el backend termina o revierte la operación sin dejar datos a medias. Solo se aplican al pool de la API: las migraciones, las copias, el alta del administrador y la sonda de salud conservan su configuración.

### Registros
`docker compose logs` de cada servicio. Sin query string, cuerpos, contraseñas ni tokens.
- **Nginx (frontend):**
  - línea JSON `"evento":"nginx"`, con `idPeticion`, IP, método, ruta sin argumentos y estado;
  - `duracion` (total), `backendConexion`, `backendCabecera` y `backendTotal` (segundos) y `backendEstado`.
- **Backend:**
  - `"evento":"acceso"` (método, ruta como patrón, estado, `duracionMs`, `idUsuario` e `interrumpida`);
  - `"evento":"auditoria"` (escrituras);
  - las líneas de error, con una etiqueta y `id=<idPeticion>`.
- **Correlación:** el mismo `idPeticion` en Nginx, en el backend y en la cabecera `X-Request-Id` de la respuesta (visible en las herramientas del navegador).
- **Etiquetas de error de conexión:**
  - `TIEMPO_APERTURA_AGOTADO`: abrir la conexión superó el límite;
  - `TIEMPO_CONEXION_AGOTADO`: el pool estaba lleno;
  - `TIEMPO_CONSULTA_AGOTADO`: sentencia, consulta o transacción abandonada;
  - `CONEXION_INTERRUMPIDA` y `CONEXION_TERMINADA`: la conexión se cortó;
  - además, los códigos de red y de PostgreSQL, como `EAI_AGAIN` o `ECONNREFUSED`.
| `TRUST_PROXY` | `1` | Saltos de proxy de confianza para conocer la IP del cliente. `1` = Nginx directo; `2` = proxy institucional delante de Nginx y sin acceso directo. No se admite `true` | No |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Intentos **fallidos** de login por IP y ventana. Los correctos y los errores 5xx no cuentan. Súbalo si muchos usuarios comparten IP | No |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Ventana del límite | No |
| `AUDIT_ENABLED` | `true` | Una línea JSON por cada escritura (usuario, método, ruta, estado), en el registro del backend | No |
| `CLIENT_URL` | vacío | Origen adicional permitido por CORS. Vacío en producción: mismo origen y sin CORS | No |
| `LOG_MAX_SIZE`, `LOG_MAX_FILE` | `10m`, `5` | Rotación de los registros de cada contenedor | No |
| `FRONTEND_MEMORY`, `BACKEND_MEMORY`, `DB_MEMORY` | `128m`, `256m`, `512m` | Límite de memoria de cada contenedor | No |
| `POSTGRES_IMAGE` | `postgres:17.11-bookworm@sha256:839f…` | Imagen de PostgreSQL del escenario A. Se cambia solo en una instalación sin Internet (ver `docker.md`) | No |
| `BACKEND_URL` | `http://backend:3000` | Destino interno del proxy `/api` de Nginx | No |
| `PG_DOCKER_IMAGE` | la misma que `POSTGRES_IMAGE` | Cliente de las copias en modo `PG_DOCKER=1`. Se exporta en la sesión, no en `.env` | No |

## Solo del backend (desarrollo o instalación sin Docker)

| Variable | Valor por defecto | Efecto | ¿Secreta? |
|---|---|---|---|
| `PORT` | `3000` | Puerto de la API | No |
| `NODE_ENV` | `development` | `production` exige `DB_PASSWORD` (o su archivo) y un secreto JWT de 32 caracteres o más | No |
| `DB_PASSWORD` / `DB_PASSWORD_FILE` | — | Clave de la base. El archivo tiene prioridad; admite un único salto de línea final | **Sí** |
| `JWT_SECRET` / `JWT_SECRET_FILE` | — | Secreto JWT. Sin él la API no arranca. No se admiten espacios al principio o al final | **Sí** |
| `PASSWORD_MIN_LENGTH` | `10` | Longitud mínima de las contraseñas de usuario (10-72). Exige además letra y número, y que sea distinta del usuario | No |
| `APP_DB_PASSWORD_FILE` | — | Solo para `migrar.js --conceder-app`: clave que se asigna al rol de la API | **Sí** |
| `TEST_DB_*`, `PSQL` | `localhost:55432`… | Solo para las pruebas automáticas (`npm test`). Nunca apuntan a una base real | No |

En desarrollo, el frontend (`npm start`) llama a `/api` y `proxy.conf.json` lo redirige a `http://localhost:3000`.

## Reglas
- Cambiar un secreto exige reiniciar el servicio afectado. Si cambia `jwt_secret`, todas las sesiones abiertas se cierran; si cambia la clave de una base, primero hay que cambiarla en PostgreSQL.
- Los **tres** archivos de secretos tienen modo `600` y pertenecen al uid 1000, el usuario `node` de las imágenes:
  - la API lee `db_password` y `jwt_secret`;
  - el servicio `operaciones` lee `db_owner_password`;
  - PostgreSQL lee también ese último, pero como root al inicializar, así que no necesita otro dueño.
- `deploy/.env` y `deploy/secretos/*` están en `.gitignore`. No se copian a las imágenes: se comprueba con `docker image inspect` y listando la imagen (`docker.md`).
