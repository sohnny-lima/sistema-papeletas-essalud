# Guía de instalación

Solo instalar con autorización del responsable. Los nombres y rutas de ejemplo
deben ajustarse a [datos-servidor.md](datos-servidor.md). No ejecutar la demo en
producción. Las órdenes siguientes se ejecutan en Linux desde la raíz del paquete,
salvo donde se indica. No contienen contraseñas.

## 1. Comprobar requisitos

Confirmar SO, arquitectura, recursos, disco para datos/copias, Docker Engine ≥24,
Compose v2, Buildx si se construye, Bash, OpenSSL y curl. Referencia ensayada:
Linux x86_64, Docker 29.1.3/Compose 2.40.3. Las bases están fijadas por digest;
arm64 requiere construir y probar para esa plataforma. Obtener dominio, TLS,
ventana de mantenimiento, política de copias y elección A/B del responsable.
Si faltan, la instalación institucional queda pendiente.

```bash
docker version
docker compose version
docker buildx version
df -h
```

## 2. Preparar configuración y secretos

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
mkdir -p deploy/secretos
chmod 700 deploy/secretos
umask 077
openssl rand -hex 32 > deploy/secretos/jwt_secret
openssl rand -hex 32 > deploy/secretos/db_password
openssl rand -hex 32 > deploy/secretos/db_owner_password
chmod 600 deploy/secretos/{jwt_secret,db_password,db_owner_password}
sudo chown 1000:1000 deploy/secretos/{jwt_secret,db_password,db_owner_password}
```

En B, los dos archivos DB deben contener las contraseñas asignadas por el DBA;
no generar nuevas sin cambiar los roles correspondientes. Mantener tres secretos
independientes. Compose monta archivos y no cifra ni remapea uid/gid. Para rootless
o WSL/NTFS seguir [secretos](../../deploy/secretos/README.md). No usar chmod 644.
Editar deploy/.env con los valores de [configuracion.md](configuracion.md):
APP_VERSION/VCS_REF de la entrega, HTTP_BIND/HTTP_PORT, nombres de base y roles,
rutas de secretos y, en B, servidor/puerto PostgreSQL. No poner claves en .env.

## 3. Construir o cargar imágenes

Con acceso a los registros y npm, desde deploy/:

```bash
cd deploy
# Seleccionar A; para B omitir -f compose.db.yaml en todas las órdenes.
dc() { docker compose -p essalud -f compose.yaml -f compose.db.yaml "$@"; }
dc config --quiet
dc build
```

Sin Internet, construir antes en un equipo compatible, exportar backend/frontend
y PostgreSQL con docker save, transportar con SHA-256 y cargar con docker load.
Seguir las órdenes completas de [transporte en docker.md](docker.md#traslado-sin-internet).
Verificar la suma del tar y el Id esperado de PostgreSQL antes de usar una etiqueta
local si RepoDigests no se repuebla. Persistir POSTGRES_IMAGE en deploy/.env y
exportar PG_DOCKER_IMAGE para copias. No reconstruir en el servidor sin acceso a npm.
Conservar imágenes y manifiestos del envío para reversión.

## 4. Escenario A: PostgreSQL en contenedor

```bash
# Desde deploy/, usando la función dc del paso 3.
dc up -d db --wait --wait-timeout 120
```

El volumen essalud_postgres_datos conserva los datos; **no usar down -v** en operación.
DB_OWNER_USER inicializa PostgreSQL como cuenta de operación; DB_USER es la cuenta
limitada de la API. Solo frontend publica HTTP. Inicializar mediante el paso 6.

## 5. Escenario B: PostgreSQL existente

```bash
# Desde deploy/: reemplaza la función de A.
dc() { docker compose -p essalud -f compose.yaml "$@"; }
dc config --quiet
dc create backend
docker network inspect essalud_datos --format '{{json .IPAM.Config}}'
```

La creación prepara las redes sin arrancar la API. El DBA debe reservar una base
dedicada, propietario de objetos para operaciones y un rol API LOGIN sin SUPERUSER,
CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, membresías ni objetos propios.
Conceder CONNECT, USAGE public, DML de tablas y USAGE/SELECT de secuencias, también
por defecto para objetos futuros del propietario. SQL y provisión idempotente en
[docker.md](docker.md#escenario-b-postgresql-existente). El propietario necesita
privilegios para crear/alterar el rol; si no los tiene, lo prepara el DBA.

DB_HOST debe ser alcanzable desde essalud_datos. host.docker.internal apunta al
host del motor Linux; en WSL no equivale a Windows. Ajustar listen_addresses solo
a la interfaz necesaria. En pg_hba.conf autorizar base, roles y subred efectiva
de Docker con scram-sha-256, sin trust ni 0.0.0.0/0. Ejemplo ilustrativo que el DBA
debe sustituir por la subred real:

```text
host papeletas papeletas_app,papeletas_admin 172.30.10.0/24 scram-sha-256
```

Recargar PostgreSQL según su procedimiento y limitar el cortafuegos a esos orígenes.
La subred puede cambiar al recrear redes: comprobarla de nuevo o planificar una
subred fija sin colisiones con el equipo de redes. El driver no configura todavía
TLS de PostgreSQL: si la institución lo exige, queda pendiente implementar y probar
esa conexión antes de habilitar B. No abrir puertos de la base a los usuarios web.

Para una base existente, **antes de migrar** obtener el esquema, comparar sin
ejecutarlo y resolver diferencias/datos pendientes con el responsable. No usar
--inicializar. Seguir íntegramente [adopción](base-de-datos.md#adopción-de-una-base-existente):
copia verificada, ensayo restaurado, registro únicamente de índices comprobados y
migración en mantenimiento. El esquema real aún no se ha validado.

## 6. Preparar esquema y primer administrador

Solo sobre base **nueva y vacía**, tanto A como B:

```bash
dc run --rm -T operaciones scripts/migrar.js --inicializar
dc run --rm -T operaciones scripts/migrar.js --estado
dc run --rm -T operaciones scripts/migrar.js
dc run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app
dc run --rm -T operaciones scripts/migrar.js --catalogos-iniciales
dc run --rm operaciones scripts/crear-admin.js administrador
```

Sustituir papeletas_app por DB_USER si se ha configurado otro nombre. La contraseña
del administrador se solicita sin eco; usar una distinta de los secretos de DB/JWT.
Para automatización usar archivo privado temporal como documenta docker.md y
retirarlo al terminar. Los catálogos solo funcionan con tablas de negocio vacías.
No cargar demo ni usuarios de prueba. Migraciones no se aplican al arrancar la API.

En adopción ejecutar únicamente las operaciones aprobadas para la base existente;
no repetir catálogos ni crear un administrador si ya existe. Tras restaurar o migrar,
reaplicar --conceder-app con el propietario previsto antes de arrancar la API.

## 7. Arrancar y verificar

```bash
dc up -d --no-build --pull never --wait --wait-timeout 120
dc ps
# Ajustar a HTTP_BIND/HTTP_PORT y después repetir a través del dominio HTTPS.
curl --fail http://127.0.0.1:8080/salud
curl --fail http://127.0.0.1:8080/api/salud
curl --fail http://127.0.0.1:8080/api/salud/lista
curl --fail -I http://127.0.0.1:8080/menu-principal/papeletas
dc port backend 3000
# Solo A; ambas órdenes port deben quedar sin puerto publicado.
dc port db 5432
```

up --wait comprueba vida, no instalación del esquema ni disponibilidad DB; exigir
también /api/salud/lista 200 y login funcional. Revisar que cada cabecera CSP,
X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy y
Cache-Control aparezca una vez. Validar login, consulta y PDF con el responsable,
según lista-aceptacion.md. Programar y verificar una copia antes de abrir el servicio.

## 8. HTTPS y cortafuegos

**Pendiente de datos institucionales:** la entrega sirve HTTP dentro del perímetro;
no contiene certificados, renovación ni un listener TLS de Nginx. Preferir el proxy
institucional con certificado válido. Restringir HTTP_BIND/cortafuegos para que
solo ese proxy llegue al puerto web; backend y A/DB carecen de puertos publicados.
TRUST_PROXY=1 corresponde a Nginx directo; 2 exige un proxy confiable adicional,
recorrido fijo y ausencia de acceso directo. Nginx genera X-Forwarded-Proto con su
propio esquema: conservar el HTTPS original exige configuración explícita revisada
del proxy/Nginx, no basta cambiar TRUST_PROXY.

Sin proxy, falta montar certificado/cadena/clave de forma privada, configurar
listen ssl y la renovación y probar Nginx/HTTPS antes de entregar. No habilitar
usuarios sobre HTTP público. El cortafuegos debe publicar solo el puerto web
aprobado (normalmente 443 en el proxy); SSH de administración se rige por la política
institucional. Verificar desde otro equipo, incluyendo las reglas Docker, que no
se accede a 3000/5432. B admite conexión DB exclusivamente desde la red autorizada.
