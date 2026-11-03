# Base de datos y operación

**Referencia reconstruida, pendiente de contrastar con el esquema real.** Las pruebas se hicieron con PostgreSQL 17.5 aislado y datos ficticios. No validan las bases reales, sus datos ni sus credenciales. No ejecutar el esquema inicial sobre una base existente.

## Configuración común

Los scripts Node se ejecutan desde `backend-papeletas/`, con Node 24 y las dependencias del lockfile instaladas (`npm ci`). Leen `.env` mediante dotenv y usan `config/env.js`, igual que la API: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` o `DB_PASSWORD_FILE`. En producción la contraseña es obligatoria. El archivo de secreto tiene prioridad y admite un único salto final LF/CRLF. No poner contraseñas en argumentos ni versionarlas.

Los scripts de `deploy/scripts/` se ejecutan desde la raíz del repositorio con Bash 4+ o PowerShell 7. Requieren herramientas cliente PostgreSQL compatibles con el servidor (17 para la referencia probada). Leen las mismas variables DB, o las equivalentes `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`; las PG tienen prioridad si ya estaban definidas. **No cargan `.env` automáticamente**: exportar las variables en la sesión o mediante el gestor de secretos. En MSYS/Git Bash se exporta MSYS2_ARG_CONV_EXCL=* para conservar las rutas del contenedor; para rutas absolutas locales use C:/... (no /c/...) en los argumentos de los clientes Windows. Autenticación por `PGPASSFILE` (permisos 0600 en Linux), `DB_PASSWORD_FILE` o entorno. `PG_BIN` permite localizar los binarios: directorio Windows en PowerShell o ruta Bash en Linux/Git Bash. Nunca pasan contraseñas en los argumentos.

Ejemplo Windows para el clúster aislado, sin claves reales:

```powershell
$env:DB_HOST='localhost'; $env:DB_PORT='55432'
$env:DB_USER='postgres'; $env:DB_NAME='bd_papeleta_tmp_instalacion'
$env:PG_BIN='C:\Program Files\PostgreSQL\17\bin'
```

`PG_CONTAINER` selecciona un **contenedor PostgreSQL ya creado** y ejecuta el cliente con `docker exec`. Configure host y puerto accesibles **desde ese contenedor**; si usa `PGPASSFILE`, su ruta debe existir allí. `DB_PASSWORD_FILE` se lee en el equipo que invoca la herramienta y su valor se transmite por entorno, sin aparecer en argumentos. Los archivos se transfieren con `docker cp`; no se canaliza el volcado binario por PowerShell. La imagen fijada, el servicio Compose, los volúmenes y su validación corresponden a **c005**. Aquí no se crea ni despliega ningún contenedor.

## Instalación nueva

Crear previamente una base **vacía**, con propietario y permisos definidos por el responsable. Comprobar la configuración DB antes de cada orden. SQL único: `backend-papeletas/db/`.

```bash
cd backend-papeletas
node scripts/migrar.js --inicializar
node scripts/migrar.js --estado
node scripts/migrar.js
node scripts/migrar.js --catalogos-iniciales
node scripts/crear-admin.js nombre_administrador
```

Escribir la contraseña por stdin (sin eco en terminal) o usar `--clave-archivo ruta_privada`. El paso de catálogos prepara los valores **existentes** de roles (administrador = 1, usuario = 2), tipos de formulario y estados; exige todas las tablas de negocio vacías y no crea usuarios ni papeletas. Es necesario porque el esquema inicial solo crea tablas y `crear-admin.js` exige el rol 1. No cambia permisos ni introduce reglas nuevas. En producción no ejecutar `cargar-demo.js` ni `db/demo/datos-demo.sql`.

`--inicializar` rechaza cualquier tabla de la aplicación preexistente, incluso en otro esquema. La instalación nueva crea tablas en `public`. No aplica migraciones ni carga datos. La API nunca invoca estas órdenes al arrancar.

Para una **base desechable de pruebas**, sustituir catálogos/administrador por `node scripts/cargar-demo.js --confirmar-demo`: carga exclusivamente datos ficticios. Se niega si cualquier tabla de la aplicación ya tiene filas, incluidos usuarios o papeletas. No mezcla demo con una instalación existente; no es un comando idempotente. Credenciales únicamente en la [guía de pruebas](../revision/README-revision.md).

## Adopción de una base existente

1. El responsable configura sus credenciales y obtiene un volcado de esquema sin datos, propietario ni privilegios:

   ```bash
   bash deploy/scripts/obtener-esquema.sh /ruta/privada/esquema-real.sql
   # Windows:
   # .\deploy\scripts\obtener-esquema.ps1 -Archivo C:\ruta\privada\esquema-real.sql
   ```

2. Desde el backend: `node scripts/comparar-esquema.js /ruta/privada/esquema-real.sql`. Código 0: sin diferencias estructurales en las diez tablas de la aplicación; 2: diferencias; 1: fallo de operación. Compara tablas, columnas, tipos, nulabilidad, autogeneración de columnas, claves primarias/foráneas, restricciones UNIQUE e índices (incluidos sus predicados WHERE), con la referencia inicial **más ambas migraciones**. Las ausencias de índices 001/002 pueden ser precisamente migraciones pendientes; revisar y planificar antes de actuar. No ejecuta el volcado ni se conecta a una base.

3. Cumplir la lista de [pendientes.md](../revision/pendientes.md): duplicados de números y centros; formatos históricos; columna `papeleta_equipos.id`; `papeletas.motivo/observaciones`; unicidad de códigos y DNI (no impuesta por el reconstruido); fecha DATE frente a TIMESTAMP; índices FK; tamaño/tipo de centros; `lc_ctype`. El comparador reconoce SERIAL, DEFAULT nextval(...) y GENERATED ... AS IDENTITY, también en ALTER TABLE de pg_dump 17/18; admite identificadores entre comillas y ALTER COLUMN SET NOT NULL. No inspecciona datos, funciones, permisos, triggers, parámetros de secuencias ni otros DEFAULT. Un resultado sin diferencias **no autoriza** migrar la base real.

4. Detener escrituras de la aplicación, realizar y verificar una copia, restaurarla en una base de ensayo y probar allí las migraciones. Resolver diferencias con el responsable; no corregir duplicados ni reglas de negocio automáticamente.

5. Si los índices de una migración ya están presentes, registrar sus nombres completos, separados por comas:

   ```bash
   node scripts/migrar.js --registrar-existentes 001_numero_papeleta_unico.sql,002_centro_nombre_unico.sql
   node scripts/migrar.js --estado
   node scripts/migrar.js
   ```

   Seleccionar **solo** las migraciones que realmente existen. Se verifica tabla, expresión, unicidad, número de columnas, validez y ausencia de predicado de cada índice antes de registrar. No se adopta por nombre únicamente. Para migraciones futuras habrá que ampliar esta comprobación si introducen otros objetos. Nunca usar `--inicializar` en este procedimiento.

## Migraciones y registro

`node scripts/migrar.js` aplica pendientes por nombre. Cada una tiene una transacción que incluye sus comprobaciones previas, el SQL y la fila de `esquema_migraciones` (nombre, SHA-256, fecha y versión del package). Las migraciones originales 001/002 se conservan byte por byte; se retiran sus delimitadores externos `BEGIN/COMMIT` solo en memoria. Si falla una migración se revierte esa migración; las anteriores ya confirmadas permanecen.

Un bloqueo consultivo de sesión compartido con inicialización, catálogos y demo impide dos operaciones simultáneas de estas herramientas. No bloquea escrituras de la API: realizar mantenimiento sin tráfico. `--estado` es de lectura, no crea siquiera la tabla de control, y también comprueba las sumas. Si cambia o falta un archivo aplicado, la orden se detiene; restaurar el archivo original, no editar el registro para eludirlo. La suma es SHA-256 del contenido UTF-8 con los finales de línea normalizados a LF. Así, una copia de Windows (CRLF) y una de Linux o de la imagen Docker (LF) dan la misma suma; cualquier otro cambio la altera. Añadir otra migración para cambios posteriores; no editar las aplicadas.

## Copias, restauración y verificación

```bash
bash deploy/scripts/respaldo.sh /ruta/privada/copias 14
bash deploy/scripts/verificar-respaldo.sh /ruta/privada/copias/papeletas-BASE-FECHA.dump
bash deploy/scripts/restaurar.sh /ruta/privada/copias/papeletas-BASE-FECHA.dump base_destino_explicita
```

```powershell
.\deploy\scripts\respaldo.ps1 -Directorio C:\ruta\privada\copias -RetencionDias 14
.\deploy\scripts\verificar-respaldo.ps1 -Archivo C:\ruta\privada\copias\papeletas-BASE-FECHA.dump
.\deploy\scripts\restaurar.ps1 -Archivo C:\ruta\privada\copias\papeletas-BASE-FECHA.dump -Destino base_destino_explicita
```

Cada copia usa `pg_dump -Fc`, nombre con fecha, `.sha256` y `.counts` (recuentos por tabla pública). Guardar los tres juntos, en almacenamiento privado y con espacio suficiente. La retención predeterminada es 14 días; solo elimina archivos con el prefijo de esta herramienta y la base origen. Mantener una copia independiente fuera del servidor. Los recuentos se consultan después de `pg_dump`, en otra instantánea: **pausar escrituras durante respaldo y manifiesto** para una comparación exacta. La copia custom en sí es consistente por la instantánea de pg_dump. El orden de escritura es volcado → .counts → .sha256; la suma se publica al final. Ante un fallo se eliminan los tres archivos. No se certifica una copia incompleta o con manifiesto ausente.

La restauración exige una base destino explícita y valida la suma **antes de crear o borrar**. Usa `pg_restore --no-owner --exit-on-error --single-transaction`. El rol conectado debe poder crear bases y ser propietario de la restaurada. No preserva propietarios originales; revisar permisos al habilitar el servicio. La restauración se realiza primero en una base temporal `<destino>_restaurando_<aleatorio>`. Su prefijo se acorta si hace falta para respetar 63 bytes. Un volcado corrupto o incompatible, aun con suma válida, falla antes de modificar el destino; la temporal se elimina. Después de restaurar correctamente se intercambian los nombres dentro de una transacción y se borra la copia anterior: si falla un renombrado, la transacción conserva el destino original. Si la limpieza posterior falla, se avisa del nombre anterior para revisarlo, sin ocultar un error previo.

Para sobrescribir una base existente se requieren ambas opciones y el texto exacto (operación destructiva, solo por decisión del responsable):

```bash
bash deploy/scripts/restaurar.sh copia.dump base_destino --reemplazar --confirmacion "REEMPLAZAR base_destino"
```

En Windows: `-Reemplazar -Confirmacion "REEMPLAZAR base_destino"`. Es obligatorio cerrar todas las conexiones al destino, deteniendo el backend antes de reemplazar; no se fuerzan cierres de sesiones. Una conexión activa impide el intercambio y conserva el destino. Las bases `postgres`, `template0`, `template1` y `bd_papeleta_test` están protegidas como destino. El verificador restaura con un nombre temporal aleatorio, compara **todas** las tablas públicas con `.counts` y borra la temporal incluso ante diferencias. Comprueba contenido y legibilidad del respaldo, no todas las reglas funcionales ni la integridad de medios a largo plazo. Los respaldos restauran SQL: usar únicamente archivos de procedencia confiable.

**Reversión de una migración:** detener escrituras, restaurar la copia anterior verificada en un destino explícito, comprobar recuentos y funciones de la aplicación, configurar la API hacia esa base y habilitar el servicio por decisión del responsable. El registro `esquema_migraciones` se restaura con los datos. Se pierden los cambios posteriores a la copia; definir ventana y punto de recuperación con el responsable. Las cabeceras SQL incluyen reversión de índices, pero eliminar el índice no revierte datos ni sustituye la copia.

## Evidencia c004

Codex ejecutó pruebas sobre el **esquema reconstruido** (ver [resultados](../revision/resultados-pruebas.md), sección c004). Los `.sh` se ejecutaron con Git Bash y clientes Windows PostgreSQL 17.5; las variantes `.ps1` también realizaron copias y restauraciones reales. Se compararon recuentos y PA-0001…PA-0003/CERCA de `bd_papeleta_test` mediante lecturas, sin modificarla. Ningún volcado se versiona: quedaron en `.local/codex-trabajo/`. La modalidad contenedor se deja preparada para c005 y no se ha probado aquí. Obtener y validar el esquema real sigue bloqueado por credenciales y corresponde al responsable.

En c004b se repitieron copias y restauraciones sobre el esquema reconstruido y se probaron los fallos de pg_restore con suma válida: el destino conserva sus datos. La suite backend pasa 263/263; detalles en cambios-entrega.md, apartado «Correcciones g011». Los dobles de Docker comprueban fallos y argumentos; la modalidad con contenedor real continúa pendiente de c005.


## c005 · Clientes Docker verificados

Los scripts Bash admiten PG_DOCKER=1 y PG_DOCKER_NETWORK. Usan un cliente PostgreSQL
17.11 fijado en etiqueta/digest, efímero y sin cliente instalado en el host. Sirve
para ambos escenarios, con DB_HOST/DB_PORT accesibles desde la red seleccionada.
PG_CONTAINER conserva prioridad si ya está definido. En Bash el dump custom se
transfiere por stdout/stdin de docker exec -i (Bash preserva los bytes), evitando
docker cp sobre tmpfs. Las variantes PowerShell conservan docker cp para evitar
canalizar binarios por PowerShell. Los recuentos aíslan stdin de cada consulta para
que docker exec no consuma la lista de tablas del bucle.

Codex verificó instalación demo en A y catálogos/crear-admin sin demo en B, copias,
verificación con **11 tablas** (10 de la aplicación + esquema_migraciones), reemplazo
con el backend detenido y recuperación de una papeleta tras borrar el volumen A.
Guía: [docker.md](docker.md). El clúster Windows solo escucha en localhost; B se
simuló con PostgreSQL independiente, sin cambiar ese clúster ni tocar bases reales.


## g012 · Propietario y usuario de servicio (c005b)

En Docker se separan DB_OWNER_USER/db_owner_password (operaciones) de
DB_USER/db_password (API). El servicio puntual operaciones usa el propietario;
la API no recibe ese secreto. Tras inicialización/migración, ejecutar
`docker compose run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app`.
La orden es explícita e idempotente; lee APP_DB_PASSWORD_FILE, verifica el rol
existente y aplica permisos actuales y por defecto del propietario sin DDL para API.
No edita ninguna migración ya aplicada. Solo sobre base dedicada: revoca CREATE/TEMP
de PUBLIC en la base y CREATE en public. Nombres y secreto deben coincidir con la API.

Al restaurar en otro servidor/volumen, crear antes el rol API para las ACL del dump,
y repetir --conceder-app después del intercambio de bases, antes de arrancar la API.
Copias/restauración usan el propietario mediante PGUSER y su archivo de secreto;
no exportar DB_USER del propietario en la sesión de Compose, para evitar que
sobrescriba la configuración del usuario API. Ejemplos A/B: [docker.md](docker.md).
