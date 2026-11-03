# Guía de solución de problemas del sistema de papeletas

Esta guía proporciona instrucciones técnicas para diagnosticar, aislar y resolver los incidentes y mensajes de error más comunes durante la instalación y operación del sistema en servidores Linux de EsSalud.

Para todas las operaciones de consulta, inspección de contenedores y visualización de registros se debe emplear el script envoltorio [`scripts/compose.sh`](file:///D:/Proyectos/sistema-papeletas-essalud/deploy/paquete/scripts/compose.sh) (`sudo bash scripts/compose.sh <orden>`).

---

## 1. Diagnóstico general y consulta de registros

Antes de intervenir cualquier configuración, recopile el estado general y los registros de los contenedores.

### 1.1 Comprobación rápida del estado
```bash
sudo bash scripts/comprobar.sh
```
Muestra el estado de salud de los servicios, sondas HTTP, exposición de puertos y estado de migraciones.

### 1.2 Inspección de contenedores mediante `compose.sh`
```bash
# Ver estado y puertos de los contenedores del proyecto
sudo bash scripts/compose.sh ps

# Inspeccionar el estado de salud detallado de un servicio
docker inspect --format '{{json .State.Health}}' $(sudo bash scripts/compose.sh ps -q backend)
```

### 1.3 Visualización de registros (Logs)
Los registros de los servicios se emiten a la salida estándar en formato JSON estructurado delimitado por líneas:

```bash
# Ver las últimas 100 líneas del backend en tiempo real
sudo bash scripts/compose.sh logs --tail 100 -f backend

# Ver las últimas 100 líneas del frontend (Nginx) en tiempo real
sudo bash scripts/compose.sh logs --tail 100 -f frontend

# En escenario A, ver registros del motor PostgreSQL
sudo bash scripts/compose.sh logs --tail 100 -f db
```

### 1.4 Trazabilidad de peticiones mediante `idPeticion`
Para permitir una auditoría precisa y resolución de incidencias sin exponer contraseñas ni datos personales de los trabajadores:
1. Cada petición HTTP entrante recibe o genera un identificador único correlacionado: **`idPeticion`** (un UUID v4).
2. Este `idPeticion` se registra tanto en la línea de acceso de Nginx (frontend) como en el registro estructurado de la API Express (backend).
3. Si un usuario reporta un error en la aplicación o si en la consola del navegador aparece una respuesta con código 500, 502 o 503:
   - Localice el `idPeticion` en los registros del frontend:
     ```bash
     sudo bash scripts/compose.sh logs frontend | grep "503"
     ```
   - Rastree ese mismo identificador en los registros del backend para conocer la causa exacta:
     ```bash
     sudo bash scripts/compose.sh logs backend | grep "<idPeticion>"
     ```
   - La línea del backend indicará la causa del error (por ejemplo, `timeout de conexión`, `sentencia cancelada`, `violación de restricción`) sin exponer tokens de sesión ni contraseñas.

---

## 2. Tabla de síntomas, causas probables y acciones

A continuación se detallan los mensajes de error de los scripts del paquete, códigos HTTP anómalos y situaciones operativas comunes.

| Síntoma / Mensaje de error | Causa probable | Qué hacer |
|---|---|---|
| **`ERROR: falta SHA256SUMS.`** | El paquete se descomprimió de forma incompleta o el archivo fue eliminado. | Vuelva a descomprimir el paquete desde el archivo `.tar.gz` original descargado: `tar -xzf papeletas-essalud-<VERSION>.tar.gz`. |
| **`ERROR: algún archivo no coincide con SHA256SUMS.`** | Uno o varios archivos del paquete están dañados, truncados o fueron alterados. | **No instale este paquete.** Compruebe la suma del archivo recibido: `sha256sum -c papeletas-essalud-<VERSION>.tar.gz.sha256`. Si coincide, descomprima de nuevo en una carpeta limpia; si no, solicite una nueva copia del paquete a EsSalud. |
| **`AVISO: Docker o Docker Compose v2 no están disponibles (o requieren sudo).`** | Docker no está instalado en el servidor o el usuario actual no tiene privilegios para acceder al socket de Docker (`/var/run/docker.sock`). | Ejecute el script anteponiendo `sudo`: `sudo bash scripts/verificar-paquete.sh`. Si Docker no está instalado, instale Docker Engine y el complemento `docker-compose-plugin`. |
| **`ERROR: Docker Compose X.Y.Z es antiguo: se necesita 2.20 o posterior.`** | La versión del complemento Docker Compose instalada en el sistema operativo no cumple el requisito mínimo. | Actualice el paquete `docker-compose-plugin` del sistema operativo (en Ubuntu/Debian: `sudo apt update && sudo apt install --only-upgrade docker-compose-plugin`). |
| **`ERROR: Falta compose/.env. Copie compose/env.example a compose/.env y ajústelo.`** | No se ha creado el archivo de configuración del entorno para la instalación. | Ejecute `cp compose/env.example compose/.env`, ajuste las variables necesarias y asigne permisos seguros: `chmod 600 compose/.env`. |
| **`ERROR: PROYECTO inválido: minúsculas, dígitos, - y _.`** | El parámetro `PROYECTO` en `compose/.env` contiene caracteres especiales, espacios o letras mayúsculas. | Edite `compose/.env` y asigne un nombre en minúsculas (por ejemplo `PROYECTO=papeletas`). |
| **`ERROR: ESCENARIO debe ser A o B.`** | La variable `ESCENARIO` en `compose/.env` tiene un valor diferente a `A` o `B`. | Configure `ESCENARIO=A` para PostgreSQL en contenedor o `ESCENARIO=B` para PostgreSQL externo administrado por el DBA. |
| **`ERROR: TLS debe ser institucional o propio.`** | La variable `TLS` en `compose/.env` tiene un valor no reconocido. | Configure `TLS=institucional` si hay un proxy corporativo delante, o `TLS=propio` si este servidor maneja el certificado SSL directamente. |
| **`ERROR: TRUST_PROXY debe ser false, un número de saltos o las IP/subredes del proxy.`** | El valor de `TRUST_PROXY` en `compose/.env` contiene un formato no válido (como `true` o caracteres incompatibles). | Configure `TRUST_PROXY=false`, un número entero de saltos (ej. `2`) o la lista separada por comas de las IPs o subredes del proxy de confianza corporativo. Nunca use `true`. |
| **`ERROR: Escenario B: falta DB_HOST (dato del DBA).`** | Se seleccionó el escenario B pero no se configuró la dirección del servidor PostgreSQL. | Solicite al DBA de EsSalud la IP o nombre resoluble del servidor de base de datos y configúrelo en `compose/.env` en la variable `DB_HOST=`. |
| **`ERROR: No se encuentra imagenes/*-imagenes.tar.gz.`** | El archivo que contiene las imágenes de los contenedores fue borrado o movido de la carpeta `imagenes/`. | Restaure el archivo `.tar.gz` de la carpeta `imagenes/` desde la entrega original. |
| **`ERROR: Las imágenes cargadas no coinciden con VERSION: el paquete puede estar dañado.`** | La suma SHA-256 de las capas del sistema de archivos de las imágenes cargadas no coincide con las registradas bajo `capas:` en el archivo `VERSION`. | 1. Ejecute `sudo bash scripts/verificar-paquete.sh` para comprobar si el archivo de imágenes está íntegro.<br>2. Verifique que no se hayan mezclado archivos de entregas distintas.<br>3. Si el archivo está íntegro, recargue las imágenes con `docker load -i imagenes/*-imagenes.tar.gz`. Si el error persiste, solicite un nuevo paquete oficial. |
| **`ERROR: Escenario B: falta secretos/db_password...`** | En el escenario B, el instalador no genera contraseñas aleatorias; requiere las credenciales suministradas por el DBA. | Cree los archivos `secretos/db_password` y `secretos/db_owner_password` con las contraseñas correspondientes entregadas por el DBA de EsSalud (permisos `0600`, propietario `1000:1000`). |
| **`ERROR: TLS=propio: faltan el certificado y la clave de EsSalud...`** | Se seleccionó `TLS=propio` pero no se han colocado los archivos de certificados en la carpeta `secretos/`. | Deposite el certificado con su cadena en `secretos/tls.crt` y la clave privada en `secretos/tls.key` con permisos `0600` y propietario `101:101`. |
| **`ERROR: Inicialización rechazada: ya existen tablas de la aplicación.`** | La base de datos ya contiene tablas creadas previamente. | Si la base de datos ya contiene tablas de una versión anterior o existente de EsSalud, **no use la inicialización de una base nueva**. Debe seguir el procedimiento de adopción de base de datos documentado en `documentacion/base-de-datos.md`. |
| **`ERROR: Catálogos iniciales rechazados: la instalación debe estar vacía.`** | Se intentó ejecutar `--catalogos-iniciales` sobre una base de datos que ya tiene datos registrados en sus tablas de negocio. | Si ya existen registros, no ejecute catálogos iniciales. Esta operación está reservada exclusivamente para la primera puesta en marcha con tablas de negocio vacías. |
| **`ERROR: Suma alterada o archivo ausente de una migración aplicada: NNN`** | El archivo SQL de una migración ya aplicada fue editado o borrado en el disco, o su suma SHA-256 no coincide con el registro histórico de `esquema_migraciones`. | **Nunca edite una migración ya aplicada.** Restaure el archivo SQL original desde el paquete. Para realizar cambios estructurales posteriores, cree una nueva migración; no modifique las anteriores. |
| **`ERROR: El rol API debe ser distinto del propietario.`** | En `compose/.env`, `DB_USER` y `DB_OWNER_USER` tienen configurado el mismo nombre de usuario. | La API de la aplicación debe operar bajo un rol de mínimos privilegios (`DB_USER=papeletas_app`), separado del rol propietario de esquema (`DB_OWNER_USER=papeletas_admin`). Asigne nombres distintos en `compose/.env`. |
| **`ERROR: El rol existente tiene privilegios, membresías u objetos propios...`** | El usuario de base de datos asignado en `DB_USER` ya existía en PostgreSQL con permisos excesivos (como `SUPERUSER`, `CREATEDB`, `CREATEROLE` o pertenencia a grupos privilegiados). | Por directriz de seguridad de mínimos privilegios, la API no puede operar con roles administrativos. Solicite al DBA revocar los permisos sobrantes de ese rol o crear un rol dedicado exclusivo para la aplicación. |
| **`ERROR: No se puede leer DB_PASSWORD_FILE; revise los permisos.`** | Los scripts de copias o herramientas no pueden leer el archivo de contraseña especificado. | Compruebe la existencia y permisos del archivo (debe ser legible por el usuario que ejecuta el comando): `sudo chmod 600 secretos/db_owner_password`. |
| **`ERROR: Respaldo incompleto eliminado; revise conexión, permisos y espacio disponible.`** | El proceso `pg_dump` falló durante la ejecución de `scripts/copia.sh`. | 1. Compruebe si el disco tiene espacio libre con `df -h`.<br>2. Verifique que la carpeta de destino de copias tenga permisos de escritura.<br>3. Compruebe en los registros de PostgreSQL si el motor cerró la conexión por tiempo de espera o caída del servicio. |
| **`ERROR: Falta el archivo de suma SHA-256 del respaldo.`** | El archivo `.sha256` asociado al volcado `.dump` no existe. | La copia está incompleta o fue interrumpida antes de concluir. **No intente restaurar este volcado.** Genere una nueva copia íntegra con `scripts/copia.sh`. |
| **`ERROR: Suma SHA-256 incorrecta.`** | El cálculo SHA-256 del archivo `.dump` no coincide con el contenido de su archivo `.sha256`. | El archivo de respaldo se encuentra corrupto o modificado. No puede restaurarse. Utilice una copia de respaldo íntegra anterior y pruébela con `sudo bash scripts/verificar-copia.sh <copia.dump>`. |
| **`ERROR: La base existe; requiere --reemplazar y confirmación escrita.`** | Se intentó restaurar una copia sobre una base de datos ya existente sin ingresar la confirmación requerida. | Invoque la restauración mediante `scripts/restaurar-copia.sh <archivo>` y escriba exactamente el texto de confirmación solicitado: `REEMPLAZAR <nombre_base>`. |
| **`ERROR: La base tiene migraciones que esta versión no conoce. Revierta con --restaurar-bd...`** | Al ejecutar `scripts/revertir.sh`, se detectó que la base de datos contiene migraciones aplicadas por una versión posterior. | La reversión del código no es suficiente porque la base ya fue modificada estructuralmente. Debe revertir restaurando la copia de respaldo tomada antes de la actualización (registrada en `estado/actualizacion/copia`): `sudo bash scripts/revertir.sh --restaurar-bd <copia.dump>`. |
| **Servicio en estado `unhealthy` en `comprobar.sh`** | La sonda interna de salud del contenedor falló de manera reiterada. | Consulte la sección 3.1 de esta guía para diagnosticar según el contenedor afectado (`frontend`, `backend` o `db`). |
| **Error HTTP 502 Bad Gateway en el navegador** | Nginx (frontend) no puede conectarse con Node.js (backend) en el puerto 3000. | Consulte la sección 3.2 de esta guía. |
| **Error HTTP 503 Servicio no disponible en el navegador** | La API backend está activa pero no puede consultar PostgreSQL, o la consulta superó el límite de tiempo. | Consulte la sección 3.3 de esta guía. |
| **Error de permisos al iniciar contenedores (`EACCES: permission denied`)** | Los procesos dentro de los contenedores corren sin privilegios de root (backend con UID 1000, frontend con UID 101) y no pueden leer sus archivos montados. | Consulte la sección 3.4 de esta guía para corregir propietarios con `chown`. |
| **Fallo al arrancar: `port is already allocated`** | El puerto `8080`, `80` o `443` ya está en uso por otro proceso del servidor anfitrión. | Consulte la sección 3.5 de esta guía. |
| **Desfase en fechas y horas de creación o token de sesión inválido inmediato** | Desalineación de la zona horaria en el servidor anfitrión o en la configuración de los contenedores. | Consulte la sección 3.6 de esta guía. |
| **Base de datos detenida por espacio en disco (`No space left on device`)** | La partición donde residen los volúmenes de Docker se ha quedado sin espacio de almacenamiento disponible. | Consulte la sección 3.7 de esta guía. |
| **Error de certificado en el navegador (`SEC_ERROR_EXPIRED_CERTIFICATE`)** | El certificado SSL/TLS institucional ha superado su fecha de vigencia o la clave privada no coincide. | Consulte la sección 3.8 de esta guía. |

---

## 3. Casos operativos específicos de infraestructura

### 3.1 Contenedor permanece en estado `unhealthy`

Cuando `comprobar.sh` o `scripts/compose.sh ps` reporta un servicio en estado `unhealthy`:
- **Si el contenedor es `frontend`:**
  - Nginx ejecuta su sonda consultando `http://127.0.0.1:8080/salud`.
  - Verifique los registros: `sudo bash scripts/compose.sh logs frontend`.
  - Compruebe que no se haya modificado la directiva `listen 8080` en la plantilla de configuración de Nginx.
- **Si el contenedor es `backend`:**
  - El backend ejecuta su sonda consultando internamente `http://127.0.0.1:3000/api/salud`.
  - Verifique los registros: `sudo bash scripts/compose.sh logs backend`.
  - Si el proceso está reiniciándose continuamente (CrashLoop), suele deberse a que no puede leer los archivos de secretos (`secretos/db_password` o `secretos/jwt_secret`).
- **Si el contenedor es `db` (Escenario A):**
  - PostgreSQL ejecuta `pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.
  - Verifique los registros: `sudo bash scripts/compose.sh logs db`.
  - Si PostgreSQL no inicia, compruebe si el disco está lleno o si el volumen tiene permisos corruptos.

### 3.2 Error HTTP 502 (Bad Gateway)
El servidor web Nginx responde con un error 502 cuando no puede establecer conexión TCP con el backend Node.js en el puerto interno 3000:
1. Compruebe si el backend está en ejecución:
   ```bash
   sudo bash scripts/compose.sh ps backend
   ```
2. Si el backend está en estado `restarting` o `exited`, revise los registros del backend:
   ```bash
   sudo bash scripts/compose.sh logs --tail 50 backend
   ```
3. Si el backend está corriendo normalmente pero Nginx sigue dando 502, verifique que ambos contenedores compartan la red `api`:
   ```bash
   docker network inspect papeletas_api
   ```
   Ambos contenedores deben figurar conectados en esta red interna.

### 3.3 Error HTTP 503 (Servicio no disponible)
La API Express responde con error 503 en dos circunstancias concretas:
1. **La base de datos no está disponible o rechaza conexiones:** La sonda periódica `/api/salud/lista` no logra ejecutar `SELECT 1` dentro de la ventana de 1.5 segundos. En este caso la interfaz web mostrará una alerta de error de conexión con el servidor. Cuando la base de datos se restablece, el sistema se recupera automáticamente en menos de 15 segundos sin necesidad de reiniciar la API ni la sesión del usuario.
2. **Límite de tiempo excedido en consultas (Timeouts):** Una operación o reporte complejo tardó más de los milisegundos configurados en `DB_QUERY_TIMEOUT_MS` (por defecto 18 segundos) o `DB_STATEMENT_TIMEOUT_MS` (15 segundos). La transacción se cancela de forma segura en PostgreSQL para evitar bloqueos del pool de conexiones.
   - Diagnóstico: Localice en los registros del backend la línea con la etiqueta del error:
     ```bash
     sudo bash scripts/compose.sh logs backend | grep "503"
     ```

### 3.4 Permisos incorrectos en la carpeta de secretos
Los contenedores operan bajo el principio de mínimos privilegios con usuarios sin privilegios de superusuario:
- El backend corre con el usuario `node` (UID `1000`, GID `1000`).
- El proxy TLS corre con el usuario `nginx` (UID `101`, GID `101`).

Si los archivos de la carpeta `secretos/` fueron creados por `root` con máscara restrictiva, los contenedores no podrán leerlos al arrancar. Para corregir los permisos:
```bash
# Propietario para secretos de base de datos y JWT
sudo chown 1000:1000 secretos/jwt_secret secretos/db_password secretos/db_owner_password
sudo chmod 600 secretos/jwt_secret secretos/db_password secretos/db_owner_password

# Propietario para certificados TLS (si aplica)
if [ -f secretos/tls.crt ]; then
  sudo chown 101:101 secretos/tls.crt secretos/tls.key
  sudo chmod 600 secretos/tls.crt secretos/tls.key
fi

# Permisos de la carpeta
sudo chmod 700 secretos
```

### 3.5 Conflicto de puertos en el servidor anfitrión
Si al ejecutar `instalar.sh` o `scripts/compose.sh up` aparece el error:
```text
Bind for 0.0.0.0:8080 failed: port is already allocated
```
Significa que otro software en el servidor anfitrión (como Apache, otro Nginx del sistema o un servicio existente) ya está utilizando ese puerto.
1. Identifique el proceso en conflicto:
   ```bash
   sudo ss -tulpn | grep -E ':8080|:443|:80'
   ```
2. Si se trata de un puerto web interno, edite `compose/.env` y cambie el puerto del frontend (por ejemplo `HTTP_PORT=8085`).
3. Reintente el arranque de los contenedores.

### 3.6 Desfase de zona horaria y marcas de tiempo
Si las papeletas muestran horas de registro desfasadas o si las sesiones cierran inmediatamente después de autenticarse:
1. Compruebe la zona horaria del servidor host:
   ```bash
   timedatectl status
   ```
   Asegúrese de que el servidor esté sincronizado mediante NTP con los servidores de tiempo institucionales de EsSalud.
2. Compruebe que la variable `TZ` esté configurada como `America/Lima` en `compose/.env`.
3. Verifique la hora dentro de los contenedores:
   ```bash
   sudo bash scripts/compose.sh exec backend date
   ```

### 3.7 Saturación de disco y volumen de base de datos lleno
Si la partición de disco donde reside Docker (`/var/lib/docker`) alcanza el 100% de uso:
- PostgreSQL se bloquea automáticamente en modo de solo lectura o aborta transacciones emitiendo: `could not write to file ... No space left on device`.
- Las copias de seguridad de `scripts/copia.sh` fallan y son eliminadas preventivamente.

**Acciones de recuperación:**
1. Revise el espacio libre de las particiones: `df -h`.
2. Verifique el tamaño de la carpeta local de copias de seguridad (`copias/`) y transfiera las copias más antiguas al almacenamiento externo de EsSalud.
3. Elimine imágenes residuales antiguas que no estén en uso:
   ```bash
   docker image prune -a --filter "until=72h"
   ```
   *(Tenga la precaución de no eliminar las imágenes etiquetadas de la versión activa).*
4. Verifique que los registros de los contenedores estén rotando correctamente según `LOG_MAX_SIZE=10m` y `LOG_MAX_FILE=5`.

### 3.8 Expiración o incoherencia de certificados TLS (solo con `TLS=propio`)
Si los usuarios reciben avisos de certificado no seguro o si el contenedor `proxy` falla al arrancar:
1. Verifique la fecha de vigencia del certificado:
   ```bash
   openssl x509 -in secretos/tls.crt -noout -dates
   ```
2. Verifique que la clave privada corresponda exactamente al certificado:
   ```bash
   # Las sumas md5 de ambos comandos deben ser idénticas:
   openssl x509 -noout -modulus -in secretos/tls.crt | openssl md5
   openssl rsa -noout -modulus -in secretos/tls.key | openssl md5
   ```
3. Si los certificados han caducado o no coinciden, sustitúyalos por los nuevos certificados emitidos por la autoridad de certificación de EsSalud siguiendo el procedimiento documentado en `documentacion/guia-instalacion.md` («Cambiar secretos»).
