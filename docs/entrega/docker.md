# Docker para la versión candidata

Referencia reconstruida, pendiente de validar el esquema y los datos del servidor real.
Construcción y pruebas: Codex, c005/c005b, Linux x86_64 en WSL. La validación del responsable,
TLS y el despliegue institucional siguen pendientes. No ejecutar estos ejemplos sobre
una base existente sin seguir [base-de-datos.md](base-de-datos.md).

## Arquitectura y configuración

Navegador → puerto HTTP publicado → Nginx :8080 → `/api/` → backend :3000 → PostgreSQL.
Angular usa `/api`, sin host incorporado. En desarrollo `npm start` carga
`frontend-papeletas/proxy.conf.json` hacia :3000. No hace falta CORS en producción;
`CLIENT_URL` solo habilita un origen adicional explícito para desarrollo.

Las bases Node 24.21.0, Nginx unprivileged 1.30 y PostgreSQL 17.11 están fijadas con
etiqueta y digest en Dockerfiles/Compose por defecto; POSTGRES_IMAGE admite una etiqueta local verificada para transporte sin registro. La imagen frontend compila con `npm ci` y
Angular de producción; solo copia el resultado a Nginx. Backend instala únicamente
dependencias de producción y conserva `db/` y `scripts/`. No contiene `.env`, pruebas
ni secretos. `APP_VERSION`, `VCS_REF` y `SOURCE_URL` alimentan etiquetas OCI de ambas
imágenes. Usar la revisión real del árbol entregado; `sin-revision` es un marcador.

Copiar `deploy/.env.example` a `deploy/.env`, ajustar sus valores y crear los archivos
según [secretos/README.md](../../deploy/secretos/README.md). **No poner secretos en
`.env`**. Compose monta `DB_PASSWORD_FILE` y `JWT_SECRET_FILE`; PostgreSQL usa
`POSTGRES_PASSWORD_FILE` con el secreto independiente db_owner_password. Son archivos privados del host, no un gestor cifrado.
Comprobar su propietario uid 1000 y modo 0600 para que `node` pueda leerlos; Compose
con fuente `file` no aplica remapeo de propietario. Respaldar y rotar esos archivos
con el procedimiento de la institución. Cambiar JWT invalida todas las sesiones;
cambiar el archivo DB no cambia por sí solo la contraseña almacenada en PostgreSQL.

Variables principales: `HTTP_BIND=0.0.0.0`, `HTTP_PORT=8080`, `TZ=America/Lima`,
memoria frontend/backend/DB = 128m/256m/512m, registros 10m × 5 archivos por servicio.
Son límites iniciales configurables, no un dimensionamiento validado del servidor.
Las fechas de negocio siguen siendo texto `YYYY-MM-DD`.

## Escenario A: PostgreSQL en contenedor

Ejecutar desde `deploy/`, en Linux con Docker Engine y Compose v2:

```bash
cp .env.example .env
# Crear secretos antes de continuar; revisar todas las variables.
docker compose -p essalud -f compose.yaml -f compose.db.yaml build
docker compose -p essalud -f compose.yaml -f compose.db.yaml up -d db --wait
# Preparar esquema y rol API con operaciones; arrancar frontend/backend al terminar.
```

Se crean las redes `essalud_publica`, `essalud_api` (interna), `essalud_datos`
(interna) y el volumen `essalud_postgres_datos`. Solo frontend publica el puerto
HTTP. Backend y DB no publican puertos. El backend espera `pg_isready` al arrancar;
la inicialización del esquema, el rol API y la carga de datos son operaciones manuales.
`pg_isready` comprueba el servidor, no la existencia del esquema de la aplicación.

Instalación **nueva y vacía**, sin demostración:

```bash
dc() { docker compose -p essalud -f compose.yaml -f compose.db.yaml "$@"; }
dc run --rm -T operaciones scripts/migrar.js --inicializar
dc run --rm -T operaciones scripts/migrar.js --estado
dc run --rm -T operaciones scripts/migrar.js
dc run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app
dc run --rm -T operaciones scripts/migrar.js --catalogos-iniciales
dc run --rm operaciones scripts/crear-admin.js administrador
dc up -d --wait
```

La orden crear-admin pide la contraseña sin eco. Para automatizar, montar un tercer
archivo privado solo durante la orden (ruta absoluta del host):

```bash
dc run --rm -T -v /ruta/privada/clave-admin:/run/clave-admin:ro \
  operaciones scripts/crear-admin.js administrador --clave-archivo /run/clave-admin
```

Retirar ese archivo tras el alta. **Solo en una base desechable**, sustituir los pasos
de catálogos y administrador por `dc run --rm -T operaciones scripts/cargar-demo.js
--confirmar-demo`. Demo exige todas las tablas vacías; no combinarla con crear-admin.
Tras el camino demo, ejecutar también --conceder-app y dc up -d --wait. Ninguna de estas operaciones se ejecuta al arrancar la imagen.

En A, DB_OWNER_USER (papeletas_admin por defecto) es POSTGRES_USER, con el secreto
independiente db_owner_password. Solo el trabajo puntual operaciones usa esa cuenta;
su perfil herramientas no se arranca con up. La API usa DB_USER (papeletas_app),
db_password y ningún secreto del propietario. Las órdenes de operaciones usan la
misma imagen backend, con entrypoint node, sin servidor ni healthcheck de proceso.

Se eligió migrar.js --conceder-app en lugar de initdb.d: es explícito, repetible tras
restauración y sirve también para B o un volumen existente. La contraseña se lee de
APP_DB_PASSWORD_FILE, nunca de argumentos. Se envía un verificador SCRAM-SHA-256,
sin interpolar la contraseña en claro en SQL ni imprimirla. Se rechazan nombres no
válidos, el propio propietario y roles existentes privilegiados, con membresías u
objetos propios; estos exigen revisión manual. No se adopta silenciosamente un rol
de otra aplicación. [Formato SCRAM de PostgreSQL](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/common/scram-common.c).

La orden concede CONNECT, USAGE en public, DML (SELECT/INSERT/UPDATE/DELETE) y
USAGE/SELECT en secuencias; no concede DDL, TEMP, TRUNCATE ni setval. Aplica ALTER
DEFAULT PRIVILEGES del propietario para futuras tablas/secuencias. Revoca CREATE en
public y CREATE/TEMP de la base concedidos a PUBLIC: esta debe ser una base dedicada.
DB_USER debe coincidir con el nombre pasado a --conceder-app. Repetir la orden aplica
la contraseña del archivo actual; cambiar archivos/env no modifica por sí solo roles
ya guardados en el volumen. No cambiar propietario ni usar --inicializar en una base
existente. Tras restaurar, volver a conceder permisos antes de arrancar la API.

## Escenario B: PostgreSQL existente

Usar solo `compose.yaml`. Configurar `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y el
archivo de contraseña. `host.docker.internal` se resuelve mediante `host-gateway`
al host Linux del motor Docker; **en WSL ese host no es Windows**. Puede usarse una
IP o nombre accesible desde los contenedores. Nunca apuntar a otra base por omisión.

```bash
docker compose -p essalud -f compose.yaml build
docker compose -p essalud -f compose.yaml up -d --wait
dc() { docker compose -p essalud -f compose.yaml "$@"; }
# Para instalación nueva, ejecutar las mismas órdenes de migración y alta de A.
# Para base existente, seguir adopción/comparación/copia de base-de-datos.md.
```

La red `datos` de B permite salida para llegar al servidor. La red `api` sigue siendo
interna. Consultar la subred efectiva con `docker network inspect essalud_datos`.
PostgreSQL debe escuchar en la interfaz necesaria (`listen_addresses`, sin abrir
interfaces indiscriminadamente). Autorizar en `pg_hba.conf` solo la base, usuario
y subred de Docker requeridos, con autenticación `scram-sha-256` y cortafuegos.
No usar `trust` ni `0.0.0.0/0`. Considerar TLS de PostgreSQL según la red institucional;
esta configuración no incorpora todavía parámetros de certificados del driver.

Recomendada cuenta de servicio sin `SUPERUSER`, `CREATEDB`, `CREATEROLE`, replicación
ni BYPASSRLS, con CONNECT a esa base, USAGE en el esquema, SELECT/INSERT/UPDATE/DELETE
en tablas y USAGE/SELECT en secuencias. Migraciones se ejecutan con una cuenta de
operación propietaria de los objetos. Copia/restauración necesitan permisos propios;
la restauración actual necesita crear bases y ser propietaria de ellas. No conceder
esos permisos al proceso API solo para ejecutar copias.

Ejemplo B para el DBA en una base dedicada, conectado como propietario; los nombres
son ejemplos que deben coincidir con DB_USER/DB_OWNER_USER. La contraseña se fija con
\password en psql (sin eco), no escribiéndola en el SQL ni en el historial:

```sql
SELECT 'CREATE ROLE papeletas_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='papeletas_app') \gexec
\password papeletas_app
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE, TEMPORARY ON DATABASE papeletas FROM PUBLIC;
GRANT CONNECT ON DATABASE papeletas TO papeletas_app;
GRANT USAGE ON SCHEMA public TO papeletas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO papeletas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO papeletas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE papeletas_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO papeletas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE papeletas_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO papeletas_app;
```

Para un rol ya existente, revisar propiedad/membresías y retirar privilegios sobrantes
antes de adoptarlo. La orden --conceder-app realiza esa comprobación y la provisión
idempotente con secretos. No aplicar cambios de PUBLIC sobre una base compartida con
otros sistemas sin el DBA. El rol de operación debe poder crear/alterar el rol API.

La prueba B de c005 usa un PostgreSQL externo al proyecto en una red independiente;
la API se conecta por el puerto del host Docker. No se cambia la configuración del
clúster Windows :55432 si solo escucha en localhost. Detalle en los registros c005.

## Salud, seguridad y operación

- `/salud` de Nginx: vida del servidor HTTP. Rutas de Angular recargables mediante
  `try_files`; un archivo desconocido cae en el SPA.
- `GET /api/salud`: vida de Express, sin autenticación.
- `GET /api/salud/lista`: conexión independiente con `SELECT 1`; conexión y consulta
  limitadas a 1,5 s cada una, una comprobación en vuelo y resultado cacheado 2 s, HTTP 200 o 503 sin versiones ni errores internos.
  No comprueba todas las tablas ni sustituye la validación funcional.
- Healthcheck del backend usa Node y /api/salud (vida), sin curl; el de DB usa `pg_isready`. La API arranca
  aunque falte DB: up --wait puede terminar con el proceso sano y DB no disponible.
  Monitorizar /api/salud/lista para disponibilidad del servicio; puede tardar hasta
  dos segundos de caché más la comprobación en reflejar un cambio. /api/salud
  solo monitoriza el proceso. La API sirve 503 al necesitar DB y se recupera.
- `restart: unless-stopped` reinicia un proceso que termina. El estado `unhealthy`
  por sí solo **no reinicia** un contenedor. Los reinicios no aplican migraciones.
- Backend uid `node` (1000), frontend uid 101, raíces de solo lectura y tmpfs limitado;
  `cap_drop: ALL`, `no-new-privileges`, memoria limitada. PostgreSQL necesita volumen
  escribible y conserva CHOWN/FOWNER/SETUID/SETGID/DAC_OVERRIDE para su entrypoint,
  que baja al usuario postgres; no se fuerza un uid incompatible con la preparación.
- Cabeceras Nginx: una sola copia también en /api mediante proxy_hide_header;
  Cache-Control conserva el del backend, o no-store si falta. Sin versión, CSP del mismo origen, nosniff, referrer same-origin,
  DENY/frame-ancestors none y cámara/micrófono/geolocalización deshabilitados. CSP
  permite `style-src 'unsafe-inline'` por estilos de Angular, Bootstrap, SweetAlert y
  gráficos; scripts solo locales. Imágenes data/blob permiten PDF y recursos internos.
- `index.html`: no-store. Recursos con hash de Angular: un año e immutable; resto
  revalidable. gzip para CSS, JS, JSON y SVG. Límite HTTP/JSON 100k; proxy conecta en
  5 s y espera lectura/escritura 30 s. `BACKEND_URL` configurable, DNS revalidado cada
  10 s para soportar recreación del backend.

**IP y límite de login:** Nginx añade `$remote_addr` a la derecha de X-Forwarded-For
([referencia](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#var_proxy_add_x_forwarded_for)).
`TRUST_PROXY=1` hace que Express use esa dirección; una cabecera falsa añadida por el
cliente a la izquierda no cambia el cupo. Dos clientes distintos tienen cupos
distintos. Solo los intentos fallidos 4xx consumen el límite (no éxitos ni 5xx).
No publicar el backend ni añadir vecinos no confiables a sus redes.

Con proxy institucional delante, `TRUST_PROXY=2` requiere que Nginx solo sea accesible
desde ese proxy y que este sanee/añada la IP del cliente; bloquear el acceso directo
al puerto HTTP. No aumentar saltos si hay recorridos de distinta longitud. Nginx
envía X-Forwarded-Proto de su conexión local (`$scheme`); si se necesita conservar
HTTPS institucional, configurar explícitamente el proxy confiable y el saneamiento
de esa cabecera, sin aceptar valores arbitrarios del navegador. TLS/certificados no
se provisionan aquí. Las contraseñas requieren HTTPS en el despliegue real.

```bash
dc ps
dc logs --tail 100 backend
dc logs --tail 100 frontend
dc restart
dc down               # conserva el volumen de datos
dc up -d --wait
# down -v BORRA datos: solo para proyectos desechables o decisión expresa.
```

Logs de procesos en stdout/stderr, Docker `json-file` con `LOG_MAX_SIZE` y
`LOG_MAX_FILE`. No equivalen a auditoría persistente ni almacenamiento externo.
Controlar acceso al socket Docker (equivale a privilegio elevado), discos y copias.

## Copias y restauración usando Docker

Desde la raíz del repositorio, Bash en el host Docker. Los scripts c004 admiten
`PG_DOCKER=1`: crean un cliente efímero con la imagen PostgreSQL fijada en digest,
red seleccionada, raíz de solo lectura, tmpfs y sin capacidades. Se elimina incluso
si la orden falla. No requiere cliente PostgreSQL instalado; no carga `.env` por sí
solo. No heredar variables PG de otra base. En A:

```bash
export PG_DOCKER=1 PG_DOCKER_NETWORK=essalud_datos
export PGHOST=db PGPORT=5432 PGDATABASE=papeletas PGUSER=papeletas_admin
export DB_PASSWORD_FILE=/ruta/privada/db_owner_password
# Pausar escrituras y volver a arrancar incluso si falla la copia/verificación.
(
  set -e
  trap 'docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml start backend' EXIT
  docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml stop backend
  bash deploy/scripts/respaldo.sh deploy/respaldos 14
  bash deploy/scripts/verificar-respaldo.sh deploy/respaldos/papeletas-BASE-FECHA.dump
)
```

El trap reinicia el backend también ante fallo; revisar el resultado de copia y
verificación antes de dar por cerrada la operación. No exportar DB_USER con
el propietario en esta sesión: Compose usa esa variable para configurar la API.
Para los clientes de copia se usa PGUSER, que no cambia el usuario de Compose.

En B: `PG_DOCKER_NETWORK=essalud_datos`, PGHOST/PGPORT existentes y PGUSER de operación
del servidor; el cliente añade también `host.docker.internal:host-gateway`. Probar
conectividad, permisos y versión antes del mantenimiento. Las tres piezas `.dump`,
`.sha256` y `.counts` se conservan juntas. `PG_DOCKER_IMAGE` permite cambiar el cliente
con una imagen revisada compatible, fijada por digest. `PG_CONTAINER` previo sigue
disponible y tiene prioridad sobre el modo efímero.

**Restaurar sobre una base existente exige detener primero el backend** y escribir
ambas opciones. La base se restaura primero en una temporal y después se renombra:

```bash
# Revisar destino, copia y suma. Operación destructiva explícita.
docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml stop backend
bash deploy/scripts/restaurar.sh deploy/respaldos/papeletas-BASE-FECHA.dump \
  papeletas --reemplazar --confirmacion "REEMPLAZAR papeletas"
docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app
docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml up -d --wait
```

En B omitir `compose.db.yaml`. Para destino que no exista, omitir reemplazo y
confirmación. Si se perdió todo el volumen/servidor, preparar primero el propietario
y crear el rol API (con --conceder-app en la base vacía) antes de pg_restore, que
necesita que existan los roles referenciados en las ACL; repetir después de restaurar
para aplicar también los permisos de la base renombrada. No forzar cierre de conexiones ajenas. `bd_papeleta_test`, postgres y
templates están protegidos. Detalle y reversión en [base-de-datos.md](base-de-datos.md).

Ejemplo cron diario (ajustar ruta, usuario, ventana y destino externo):

```cron
15 2 * * * /bin/bash /opt/papeletas/operacion/copia-diaria.sh >> /var/log/papeletas-copias.log 2>&1
```

Ese script privado, con modo 0700, cambia al repositorio, exporta las variables
anteriores, detiene backend, ejecuta respaldo y usa `trap` para volver a arrancarlo
aunque falle. Programar la copia fuera de la ventana de uso y alertar ante errores;
la institución debe definir retención, acceso y copia fuera del servidor.

## Instalación sin Internet

En un equipo con acceso y arquitectura del destino, construir ambas imágenes y
descargar la de PostgreSQL. Transportar también Compose, documentación y scripts,
sin `node_modules`, secretos ni datos demo. Por ejemplo desde `deploy/`:

```bash
docker compose -f compose.yaml -f compose.db.yaml build
docker pull postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5
docker tag postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5 postgres:17.11-bookworm
docker image inspect postgres:17.11-bookworm --format '{{.Id}}' > postgres-imagen.id
docker save -o essalud-1.0.0-rc.1.tar essalud/frontend:1.0.0-rc.1 \
  essalud/backend:1.0.0-rc.1 postgres:17.11-bookworm
sha256sum essalud-1.0.0-rc.1.tar > essalud-1.0.0-rc.1.tar.sha256
# En el servidor destino:
sha256sum -c essalud-1.0.0-rc.1.tar.sha256
docker load -i essalud-1.0.0-rc.1.tar
test "$(docker image inspect postgres:17.11-bookworm --format '{{.Id}}')" = "$(cat postgres-imagen.id)"
# Si falta RepoDigests, persistir en deploy/.env y exportar para las copias:
export POSTGRES_IMAGE=postgres:17.11-bookworm
export PG_DOCKER_IMAGE=postgres:17.11-bookworm
docker compose -p essalud -f compose.yaml -f compose.db.yaml up -d --no-build --pull never --wait
```

Comprobar que el digest PostgreSQL fijado se resuelve localmente después del load;
no basta con una etiqueta homónima de contenido diferente. Si el motor destino no
puebla RepoDigests al cargar, verificar la suma del tar y comparar el Id esperado
(documentado junto al envío) antes de seleccionar una etiqueta local; nunca descargar
otra imagen por coincidencia de nombre. Para B no hace falta
arrancar el servicio DB; la imagen cliente sigue siendo necesaria para copias.
No ejecutar build en la intranet sin acceso a npm: usar las imágenes transportadas.
Inter, Bootstrap y sus iconos están dentro de la aplicación. CSP impide conexiones
ajenas; el E2E c005 verifica cero solicitudes externas durante login, CRUD y PDF.

El análisis de dist distingue recursos remotos de textos de bibliotecas: quedan
namespaces W3C, licencias/ayuda y el valor por defecto de `pdfobjectnewwindow` de
jsPDF (CDN), una función no usada por esta aplicación. La descarga usa `save` y no
invoca esa función; CSP tampoco permite cargar ese script. No se modifican paquetes
de terceros para borrar esos literales. Ver el registro `c005-dist-urls.log`.

## Evidencia y límites

Los registros y resultados de estas pruebas forman parte de la documentación interna de la revisión (no publicada).
Las pruebas no certifican recursos,
DNS, TLS, red, cuentas, esquema ni políticas del servidor institucional. Revisar
[datos-servidor.md](datos-servidor.md) antes de instalar. No hay despliegue real ni
actualización automática del esquema.
