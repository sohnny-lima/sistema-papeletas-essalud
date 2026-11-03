# Guía de instalación y operación del sistema de papeletas

Esta guía está destinada al personal técnico responsable de la instalación, puesta en marcha y mantenimiento del **Sistema de Papeletas de Movimiento de Bienes Patrimoniales (Formato Único Patrimonial)** en servidores Linux de EsSalud.

El sistema se entrega como un **paquete independiente con Docker**. No requiere conexión a Internet, repositorios de código ni herramientas de compilación: todas las imágenes, scripts de automatización y esquemas de base de datos vienen incorporados en el paquete.

Para cualquier operación de consulta, inspección o mantenimiento de los contenedores se utiliza el envoltorio oficial [`scripts/compose.sh`](file:///D:/Proyectos/sistema-papeletas-essalud/deploy/paquete/scripts/compose.sh) (`sudo bash scripts/compose.sh <orden>`), el cual carga automáticamente el proyecto, el archivo `.env`, el escenario y la configuración HTTPS correspondiente, y bloquea opciones destructivas como `-v` o `--volumes`.

---

## 1. Requisitos del servidor y preparación

### 1.1 Requisitos de hardware y sistema operativo
- **Arquitectura:** Linux x86_64.
- **Memoria RAM:** mínimo 2 GB (recomendado 4 GB o superior).
- **Almacenamiento:** mínimo 10 GB de espacio libre en disco para imágenes Docker, volúmenes de datos y copias de seguridad locales.
- **Permisos:** acceso con cuenta `root` o usuario con privilegios de `sudo`.

### 1.2 Requisitos de software
- **Docker Engine:** versión 24.0 o posterior (`docker version`).
- **Docker Compose:** complemento v2, versión 2.20 o posterior (`docker compose version`).
- **Utilidades del sistema:** `bash` (versión 4+), `coreutils` (`sha256sum`, `od`, `tr`), `tar`, `gzip`, y `curl` (o `wget`).

### 1.3 Parámetros de red institucional (A DEFINIR por EsSalud)
Antes de iniciar, el equipo de infraestructura de EsSalud debe suministrar o confirmar los siguientes datos:
- **Nombre de dominio o FQDN del sistema:** `<dominio A DEFINIR por EsSalud>`
- **Dirección IP del servidor Linux:** `<IP interna de este servidor A DEFINIR>`
- **Modalidad TLS/HTTPS:** Elección entre proxy corporativo institucional (recomendado) o terminación TLS propia en el servidor.
- **Datos del DBA (solo si se conecta a un PostgreSQL existente corporativo - Escenario B):** Servidor (`DB_HOST`), puerto (`DB_PORT`), nombre de base (`DB_NAME`) y credenciales de usuario propietario y de aplicación.
- **Destino externo de copias de seguridad:** `<destino externo A DEFINIR por EsSalud>` (ruta NFS/SMB, servidor remoto para rsync o repositorio institucional de respaldos).

---

## 2. Verificación e integridad del paquete

El paquete de instalación se entrega como un archivo comprimido con su suma SHA-256 de control:
- `papeletas-essalud-<VERSION>.tar.gz`
- `papeletas-essalud-<VERSION>.tar.gz.sha256`

### 2.1 Descompresión
En el servidor Linux donde se realizará la instalación (en el directorio asignado por la institución, representado como `<carpeta del paquete>`):

```bash
# 1. Comprobar la integridad del archivo descargado
sha256sum -c papeletas-essalud-<VERSION>.tar.gz.sha256

# 2. Descomprimir el paquete
tar -xzf papeletas-essalud-<VERSION>.tar.gz

# 3. Entrar en la carpeta del paquete
cd papeletas-essalud-<VERSION>
```

### 2.2 Comprobación de integridad interna del paquete
Ejecute el script de verificación antes de tocar cualquier archivo:

```bash
sudo bash scripts/verificar-paquete.sh
```

El script comprueba la suma SHA-256 de cada uno de los archivos del paquete frente a `SHA256SUMS`, lee la información de `VERSION` y valida la disponibilidad de Docker y Docker Compose v2. Si algún archivo estuviera corrupto o incompleto, el script se detendrá con un mensaje de error; en ese caso no continúe y solicite una copia nueva del paquete.

---

## 3. Configuración del entorno (`compose/.env`)

Copie la plantilla de configuración a su archivo definitivo:

```bash
cp compose/env.example compose/.env
chmod 600 compose/.env
```

> **IMPORTANTE:** En el archivo `compose/.env` **NUNCA** se escriben contraseñas ni claves de cifrado. Todas las credenciales se almacenan exclusivamente como archivos de texto protegidos dentro de la carpeta `secretos/`.

Edite `compose/.env` con un editor de texto (`nano compose/.env` o `vi compose/.env`) ajustando los parámetros según su entorno:

### 3.1 Identificación de la versión y proyecto
- `APP_VERSION`: Versión del paquete. Viene fijada automáticamente desde el archivo `VERSION`. **No modificar manualmente**.
- `FRONTEND_IMAGE`, `BACKEND_IMAGE`, `POSTGRES_IMAGE`: Nombres y etiquetas de las imágenes de los contenedores incluidas en el paquete. No modificar salvo indicación expresa de soporte.
- `PROYECTO`: Nombre del proyecto de Docker Compose (por defecto `papeletas`). Determina el prefijo de los nombres de contenedores, redes y volúmenes generados.

### 3.2 Escenario de base de datos
- `ESCENARIO`: Seleccione `A` o `B`:
  - **`A` (Predeterminado - Recomendado):** PostgreSQL 17 se ejecuta dentro de un contenedor dedicado gestionado por el paquete, con almacenamiento persistente en el volumen Docker `papeletas_postgres_datos`, aislado en una red interna privada y **sin ningún puerto expuesto al exterior**.
  - **`B` (PostgreSQL existente de EsSalud):** El sistema se conecta a un servidor PostgreSQL ya administrado por el área de base de datos de EsSalud (ver `documentacion/base-de-datos.md`).
- `DB_NAME`: Nombre de la base de datos (por defecto `papeletas`).
- `DB_USER`: Rol de la aplicación utilizado por el backend Express (por defecto `papeletas_app`). Rol de mínimos privilegios (solo permisos DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`; sin permisos de modificación de esquema DDL ni superusuario).
- `DB_OWNER_USER`: Rol de operaciones y migraciones (por defecto `papeletas_admin`). Propietario de las tablas y objetos del esquema.
- `DB_HOST`: Nombre o dirección IP del servidor PostgreSQL existente (**A DEFINIR por el DBA de EsSalud**; obligatorio únicamente en escenario B; en escenario A se ignora).
- `DB_PORT`: Puerto del servidor PostgreSQL existente (por defecto `5432`; solo escenario B).

### 3.3 Acceso web, HTTPS y cortafuegos
- `TLS`: Modalidad de cifrado web. Opciones:
  - `institucional` (Recomendado): EsSalud dispone un proxy inverso corporativo o balanceador HTTPS delante (F5, Nginx central, etc.) que termina TLS en el puerto 443 y reenvía el tráfico HTTP al puerto interno del servidor.
  - `propio`: El propio paquete levanta un contenedor proxy Nginx (`compose.prod.tls.yml`) que atiende en el puerto 443 utilizando los certificados provistos en `secretos/tls.crt` y `secretos/tls.key`.
- `HTTP_BIND`: Dirección IP donde escuchará el contenedor frontend HTTP.
  - Deje `127.0.0.1` si el proxy corporativo está en este mismo servidor físico o si usa `TLS=propio`.
  - Si el proxy corporativo está en otro servidor de la red interna, configure la IP de la interfaz interna de este servidor (`<IP interna de este servidor A DEFINIR>`) y restrinja el cortafuegos.
- `HTTP_PORT`: Puerto HTTP del frontend (por defecto `8080`).
- `HTTPS_BIND`: Interfaz para HTTPS propio (por defecto `0.0.0.0`; solo con `TLS=propio`).
- `HTTPS_PORT`: Puerto HTTPS de escucha pública (por defecto `443`; solo con `TLS=propio`).
- `HTTP_REDIRECT_PORT`: Puerto de redirección HTTP a HTTPS (por defecto `80`; solo con `TLS=propio`). Redirige al puerto indicado por `HTTPS_PORT`.
- `TRUST_PROXY`: Configuración de saltos o direcciones de proxy de confianza ante el backend Express.
  - **Valores admitidos:** `false`, un número entero de saltos (ej. `2`), o una lista separada por comas de direcciones IP o subredes del proxy de confianza (formato de ejemplo con direcciones reservadas para documentación: `192.0.2.10, 198.51.100.0/24`). **Nunca configure `true`**.
  - **Recomendación:** Cuando el proxy institucional resida en otra máquina física o virtual y `HTTP_BIND` no sea `127.0.0.1`, se recomienda explícitamente configurar las **IP o subredes exactas del proxy institucional** en lugar de un número genérico de saltos.
  - **Número de saltos (si se usa):**
    - `2`: correspondiente a proxy corporativo HTTPS + Nginx del contenedor frontend.
    - `1`: si solo hay Nginx frontend directo sin proxy institucional previo.
    - `3`: si existe un balanceador de carga institucional adicional delante del proxy corporativo.
  - **RIESGO DE SEGURIDAD:** Nunca configure más saltos de los reales ni utilice `true`. Configurar saltos excesivos permitiría a un cliente falsear cabeceras `X-Forwarded-For` para eludir el limitador de tasa de inicio de sesión o alterar la auditoría de direcciones IP.

#### Reglas de cortafuegos del servidor
En el cortafuegos del sistema operativo (`ufw`, `firewalld` o `iptables`):
- **Permitido desde la red de usuarios:** Únicamente el puerto **443 (HTTPS)** (y el puerto 80 únicamente para redirección si aplica).
- **Prohibido al exterior:** La API de backend (puerto 3000) y PostgreSQL (puerto 5432) **NUNCA** deben tener puertos publicados ni ser accesibles desde fuera de las redes internas de Docker.
- **Acceso de administración SSH:** Restringido exclusivamente a las redes de gestión técnica autorizadas de EsSalud.

### 3.4 Sesión y seguridad
- `JWT_EXPIRES_IN`: Tiempo de validez del token de sesión tras autenticación (por defecto `1h`).
- `LOGIN_RATE_LIMIT_MAX`: Número máximo de intentos fallidos de inicio de sesión permitidos por dirección IP antes de aplicar bloqueo temporal (por defecto `10`).
- `LOGIN_RATE_LIMIT_WINDOW_MS`: Duración de la ventana de bloqueo de intentos de inicio de sesión en milisegundos (por defecto `900000` = 15 minutos).
- `AUDIT_ENABLED`: Habilitación de registros de auditoría de seguridad en la salida estándar de los contenedores (por defecto `true`).
- `ACCESS_LOG_ENABLED`: Registro de peticiones HTTP entrantes con su tiempo de respuesta (por defecto `true`).

### 3.5 Tiempos de espera de base de datos
- `DB_CONNECTION_TIMEOUT_MS`: Tiempo máximo de espera para establecer conexión con PostgreSQL (`10000` ms = 10 segundos). **No reducir por debajo de 10000**: este valor garantiza estabilidad ante reinicios o pausas del servicio de base de datos.
- `DB_STATEMENT_TIMEOUT_MS`: Tiempo máximo permitido para la ejecución de sentencias SQL (`15000` ms = 15 segundos).
- `DB_QUERY_TIMEOUT_MS`: Límite máximo de espera para una consulta completa de la API (`18000` ms = 18 segundos).
- `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`: Límite de desconexión de transacciones inactivas (`30000` ms = 30 segundos).

### 3.6 Copias de seguridad y recursos
- `COPIAS_DIR`: Directorio de almacenamiento de respaldos locales (por defecto `copias`, relativo a la raíz del paquete).
- `COPIAS_DIAS`: Días de retención de las copias locales antes de su rotación automática (por defecto `14`).
- `TZ`: Zona horaria oficial (`America/Lima`).
- `FRONTEND_MEMORY`, `BACKEND_MEMORY`, `DB_MEMORY`: Límites de memoria asignados a cada contenedor (`128m`, `256m`, `512m` respectivamente).
- `LOG_MAX_SIZE`, `LOG_MAX_FILE`: Rotación de registros de Docker para evitar saturación de disco (`10m` por archivo, máximo `5` archivos rotados).

---

## 4. Gestión de secretos (`secretos/`)

La carpeta `secretos/` almacena las claves privadas y contraseñas. Cada secreto reside en un archivo de texto independiente:

| Archivo | Función | Quién lo genera / provee |
|---|---|---|
| `secretos/jwt_secret` | Clave secreta para la firma y verificación de tokens de sesión JWT (64 caracteres hexadecimales). | `scripts/instalar.sh` lo genera aleatoriamente si no existe. |
| `secretos/db_password` | Contraseña del rol de aplicación de la API (`DB_USER`). | Escenario A: `scripts/instalar.sh` lo genera aleatoriamente. Escenario B: **El DBA de EsSalud**. |
| `secretos/db_owner_password` | Contraseña del rol propietario para migraciones y copias (`DB_OWNER_USER`). | Escenario A: `scripts/instalar.sh` lo genera aleatoriamente. Escenario B: **El DBA de EsSalud**. |
| `secretos/tls.crt` | Certificado público del servidor y su cadena intermedia completa. | Solo si `TLS=propio`: **Lo entrega el área de seguridad de EsSalud**. |
| `secretos/tls.key` | Clave privada del certificado HTTPS (sin contraseña). | Solo si `TLS=propio`: **Lo entrega el área de seguridad de EsSalud**. |

### 4.1 Carga manual segura de secretos (Escenario B o certificados)
Si necesita ingresar las contraseñas suministradas por el DBA de EsSalud, créelas directamente en el servidor sin dejarlas registradas en el historial de comandos de Bash:

```bash
mkdir -p secretos
chmod 700 secretos
umask 077

# Ingresar contraseña de la API (DB_USER) sin eco en pantalla:
read -r -s -p 'Contraseña de DB_USER (papeletas_app): ' clave && printf '%s' "$clave" > secretos/db_password && unset clave; echo

# Ingresar contraseña del propietario (DB_OWNER_USER) sin eco en pantalla:
read -r -s -p 'Contraseña de DB_OWNER_USER (papeletas_admin): ' clave && printf '%s' "$clave" > secretos/db_owner_password && unset clave; echo
```

En caso de utilizar `TLS=propio`, copie el certificado y la clave privada:
```bash
cp /ruta/privada/certificado.crt secretos/tls.crt
cp /ruta/privada/clave.key secretos/tls.key
chmod 600 secretos/tls.crt secretos/tls.key
```

El script de instalación ajustará automáticamente los propietarios de los archivos: usuario `1000:1000` (`node`) para los secretos de base de datos y JWT, y usuario `101:101` (`nginx`) para los certificados TLS.

---

## 5. Ejecución de la instalación (`scripts/instalar.sh`)

La instalación se realiza de forma guiada y automatizada. El script es **reanudable e idempotente**: si ocurre un fallo externo (por ejemplo, falta de un parámetro o de un secreto en Escenario B), puede corregir la causa y volver a ejecutar el comando sin duplicar pasos ni alterar datos.

### 5.1 Ejecución interactiva
Ejecute como superusuario desde el directorio del paquete:

```bash
sudo bash scripts/instalar.sh
```

### 5.2 Desglose de los 9 pasos del instalador
1. **Paso 1/9 (Requisitos e integridad):** Verifica Docker Engine (≥24), Docker Compose v2 (≥2.20), `sha256sum`, valida la integridad de cada archivo mediante `scripts/verificar-paquete.sh` y comprueba la validez sintáctica de `compose/.env`.
2. **Paso 2/9 (Imágenes):** Inspecciona si las imágenes exactas de la versión ya están cargadas comparando el hash de las capas (`capas:` en `VERSION`). Si no lo están, ejecuta `docker load` desde el archivo empaquetado en `imagenes/*-imagenes.tar.gz`.
   > *Nota técnica:* Se comparan las capas del sistema de archivos (`.RootFS.Layers`) y no el ID de imagen, ya que el ID depende del almacén de almacenamiento de Docker (containerd o clásico) y variaría entre el entorno de construcción y el servidor.
3. **Paso 3/9 (Secretos):** Verifica los archivos de la carpeta `secretos/`. En escenario A genera valores aleatorios de 64 caracteres criptográficos para los que no existan; en escenario B exige la presencia de las contraseñas provistas por el DBA. Ajusta propietarios y permisos a modo estricto `0600`.
4. **Paso 4/9 (Validación Compose):** Valida la coherencia de los archivos Compose correspondientes a la configuración elegida.
5. **Paso 5/9 (Arranque de base de datos):** En escenario A arranca el contenedor de PostgreSQL (`db`) y espera hasta que su sonda de salud interna (`pg_isready`) reporte estado `healthy` (tiempo de espera hasta 120 segundos). En escenario B comprueba la conectividad hacia `DB_HOST:DB_PORT`.
6. **Paso 6/9 (Esquema y migraciones):**
   - Ejecuta `migrar.js --inicializar` sobre la base de datos vacía.
   - Aplica en orden transaccional todas las migraciones registradas.
   - Ejecuta `migrar.js --conceder-app "$DB_USER"`, configurando el rol de la API con los privilegios mínimos necesarios mediante autenticación robusta `SCRAM-SHA-256`.
7. **Paso 7/9 (Catálogos iniciales):** Ejecuta `migrar.js --catalogos-iniciales` para insertar los registros estructurales de catálogos requeridos por el sistema:
   - Roles de usuario: `1 = ADMINISTRADOR`, `2 = USUARIO`.
   - Tipos de formulario: `TOMA DE INVENTARIO`, `CUADRO DE ASIGNACION`, `DESPLAZAMIENTO`, `MANTENIMIENTO`, `DEVOLUCION`.
   - Estados de papeletas: `REGISTRADA`, `ANULADA`.
   - *Nota:* No se cargan datos de prueba ni de demostración.
8. **Paso 8/9 (Creación del primer administrador):**
   - El instalador solicita ingresar el nombre de usuario deseado para la primera cuenta administradora.
   - Solicita la contraseña para esta cuenta a través del terminal **sin eco visual** (la contraseña debe tener al menos 10 caracteres, combinando letras y números).
   - Registra el usuario con rol de Administrador activo en la base de datos.
   - **ENTREGA DE LA CONTRASEÑA TEMPORAL:** Esta contraseña es estrictamente **temporal**. El instalador debe entregarla al responsable designado del área usuaria por un canal seguro y separado (comunicación directa presencial, sobre cerrado o canal institucional cifrado; **nunca por correo ordinario ni en tickets de soporte**). En su primer acceso, el responsable debe entrar al módulo «Usuarios» y cambiar su contraseña de inmediato.
9. **Paso 9/9 (Arranque de servicios y comprobación):** Levanta los contenedores de backend y frontend con la opción `--wait` e invoca inmediatamente `scripts/comprobar.sh` para verificar el estado de salud de todos los componentes.

### 5.3 Opción para despliegues desatendidos
Si se automatiza la instalación, se pueden pasar variables de entorno previas para el administrador:

```bash
# Crear temporalmente el archivo de contraseña con permisos estrictos
umask 077
printf '%s' "ClaveTemporalSegura2026" > /tmp/admin.pass
chmod 600 /tmp/admin.pass

# Ejecutar el instalador
sudo ADMIN_NOMBRE=administrador ADMIN_CLAVE_ARCHIVO=/tmp/admin.pass bash scripts/instalar.sh

# Eliminar inmediatamente el archivo temporal
rm -f /tmp/admin.pass
```

---

## 6. Comprobación del estado del sistema (`scripts/comprobar.sh`)

Para diagnosticar el estado del sistema en cualquier momento sin modificar configuraciones ni datos, ejecute:

```bash
sudo bash scripts/comprobar.sh
```

El script efectúa cuatro comprobaciones fundamentales:
1. **Servicios y salud de contenedores:** Comprueba que `frontend`, `backend` y (en escenario A) `db` se encuentren en estado `healthy`.
2. **Salud por HTTP:**
   - Consulta `http://<HTTP_BIND>:<HTTP_PORT>/salud` (responde HTTP 200 si Nginx frontend está operativo).
   - Consulta `http://<HTTP_BIND>:<HTTP_PORT>/api/salud/lista` (responde HTTP 200 si la API Express está activa y la conexión de prueba contra PostgreSQL `SELECT 1` fue exitosa).
   - Si `TLS=propio`, verifica la respuesta segura en `https://127.0.0.1:<HTTPS_PORT>/salud`.
3. **Exposición de puertos:** Comprueba que la API (puerto 3000) y PostgreSQL (puerto 5432) no tengan puertos mapeados al host.
4. **Migraciones:** Ejecuta `migrar.js --estado` para confirmar que todas las migraciones del paquete están registradas como `Aplicada`.

Si todas las pruebas son satisfactorias, el script muestra `RESULTADO: todo correcto.` con código de salida 0.

---

## 7. Configuración de HTTPS

### 7.1 Escenario A (Recomendado): Proxy HTTPS institucional de EsSalud
En este esquema, el servidor web corporativo o balanceador de EsSalud recibe las peticiones en el puerto público 443, realiza la terminación TLS y reenvía el tráfico internamente a este servidor.

#### Requisitos de configuración en el proxy institucional
El proxy institucional debe enviar obligatoriamente las siguientes cabeceras hacia el servidor de papeletas:
- `Host: $host`
- `X-Real-IP: $remote_addr`
- `X-Forwarded-For: $proxy_add_x_forwarded_for`
- `X-Forwarded-Proto: https`

#### Ejemplo de bloque de configuración para Nginx institucional (referencial):
```nginx
server {
    listen 443 ssl http2;
    server_name <dominio A DEFINIR por EsSalud>;

    ssl_certificate     /ruta/al/certificado/<dominio A DEFINIR por EsSalud>.crt;
    ssl_certificate_key /ruta/a/la/clave/<dominio A DEFINIR por EsSalud>.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://<IP interna de este servidor A DEFINIR>:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
}
```

En `compose/.env`, mantenga:
```dotenv
TLS=institucional
HTTP_BIND=127.0.0.1   # o <IP interna de este servidor A DEFINIR> alcanzable solo por el proxy corporativo
HTTP_PORT=8080
TRUST_PROXY=2         # o las IP del proxy corporativo si HTTP_BIND no es 127.0.0.1
```

### 7.2 Escenario B: HTTPS propio (`TLS=propio`)
Si no existe un proxy corporativo y este servidor debe exponer directamente el puerto 443:
1. En `compose/.env` configure:
   ```dotenv
   TLS=propio
   HTTP_BIND=127.0.0.1
   HTTPS_BIND=0.0.0.0
   HTTPS_PORT=443
   HTTP_REDIRECT_PORT=80
   TRUST_PROXY=2
   ```
2. Deposite en `secretos/tls.crt` el certificado institucional con su cadena completa y en `secretos/tls.key` la clave privada sin contraseña.
3. El paquete levantará el servicio `proxy` basado en la plantilla `nginx-tls.conf.template`. Este servicio:
   - Utiliza el DNS interno de Docker (`resolver 127.0.0.11 valid=10s`) para volver a resolver automáticamente la dirección del frontend si este es recreado.
   - Redirige el tráfico HTTP del puerto `HTTP_REDIRECT_PORT` (puerto 80) hacia el puerto público `HTTPS_PORT` (puerto 443).
   - Termina TLS y reenvía el tráfico seguro internamente hacia `http://frontend:8080`.

---

## 8. Copias de seguridad programadas con systemd

El script `scripts/copia.sh` genera respaldos consistentes de la base de datos utilizando un contenedor cliente de PostgreSQL efímero (`PG_DOCKER=1`), por lo que no requiere utilidades cliente instaladas en el sistema operativo anfitrión.

Cada copia genera un trío de archivos que deben mantenerse siempre juntos:
1. `papeletas-<base>-<fecha>-<pid>.dump`: Volcado binario comprimido de PostgreSQL (`pg_dump -Fc`).
2. `.counts`: Archivo de texto con el recuento exacto de filas de cada tabla pública en el momento del respaldo.
3. `.sha256`: Suma de comprobación SHA-256 del archivo `.dump`, escrita al finalizar el proceso (una copia sin su `.sha256` está incompleta).

### 8.1 Ejecución manual de una copia
```bash
# Copia normal sin detener servicios
sudo bash scripts/copia.sh

# Copia con pausa preventiva de la API (recomendada para consistencia exacta con .counts)
sudo bash scripts/copia.sh --pausar
```
La opción `--pausar` detiene temporalmente el backend antes de la copia y lo reanuda automáticamente al terminar mediante una rutina `trap` de Bash, garantizando que el backend vuelva a arrancar incluso si la copia fallase.

### 8.2 Automatización diaria con systemd
Para programar la copia todos los días a las 02:30 AM (hora de Perú), cree las siguientes unidades en `/etc/systemd/system/`:

#### 1. Servicio: `/etc/systemd/system/papeletas-copia.service`
Reemplace `<carpeta del paquete>` por la ruta absoluta donde reside el paquete:

```ini
[Unit]
Description=Copia de seguridad diaria del sistema de papeletas EsSalud
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=<carpeta del paquete>
ExecStart=/usr/bin/bash <carpeta del paquete>/scripts/copia.sh --pausar
StandardOutput=journal
StandardError=journal
```

#### 2. Temporizador: `/etc/systemd/system/papeletas-copia.timer`
```ini
[Unit]
Description=Temporizador de copia diaria para papeletas EsSalud

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

#### 3. Activación del temporizador
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now papeletas-copia.timer
sudo systemctl list-timers papeletas-copia.timer
```

### 8.3 Destino externo de copias (A DEFINIR por EsSalud)
Almacenar las copias únicamente en el disco local no protege la información ante averías de hardware, desastres o pérdida de la máquina virtual. 

EsSalud debe definir el destino secundario externo (`<destino externo A DEFINIR por EsSalud>`, como por ejemplo un volumen de almacenamiento en red institucional NFS/SMB o sincronización remota mediante `rsync`). Incorpore un paso en la política de respaldos para transferir los tres archivos (`.dump`, `.counts`, `.sha256`) al almacenamiento externo.

### 8.4 Verificación de una copia de respaldo (`scripts/verificar-copia.sh`)
Al menos una vez al mes, compruebe que los respaldos generados son viables y restaurables utilizando el script de verificación del paquete:

```bash
sudo bash scripts/verificar-copia.sh copias/papeletas-papeletas-AAAAMMDD-HHMMSS-PID.dump
```
El script restaura el volcado en una base de datos **temporal**, compara los recuentos con el archivo `.counts`, confirma la coincidencia exacta y elimina la base temporal sin tocar en ningún momento la base de datos de producción.

---

## 9. Restauración de una copia de seguridad (`scripts/restaurar-copia.sh`)

La restauración reemplaza el contenido de la base de datos de producción por el contenido de un respaldo previo.

> **ATENCIÓN:** Esta es una operación de contingencia y destructiva: **se perderán todos los datos registrados entre la hora de la copia y el momento actual**. Debe ser autorizada expresamente por el responsable del sistema.

### 9.1 Procedimiento de restauración
Ejecute el script indicando la ruta del archivo `.dump`:

```bash
sudo bash scripts/restaurar-copia.sh copias/papeletas-papeletas-AAAAMMDD-HHMMSS-PID.dump
```

El script efectúa los siguientes pasos protegidos:
1. Valida que el archivo `.dump` exista y que su suma coincida exactamente con el archivo `.sha256`.
2. Solicita escribir textualmente la frase de confirmación: `REEMPLAZAR papeletas`.
3. Detiene los contenedores de frontend y backend para suspender cualquier conexión activa a la base.
4. Restaura el volcado en una base de datos temporal aislada. Si el volcado estuviera dañado o fallase la restauración, el script aborta y la base de producción original queda completamente intacta.
5. Si la restauración concluye con éxito, intercambia atómicamente los nombres de las bases y renombra la base previa como respaldo de seguridad.
6. Reejecuta las migraciones y reaplica los privilegios del rol API (`migrar.js --conceder-app`).
7. Inicia los servicios y valida el estado general con `scripts/comprobar.sh`.

---

## 10. Actualización del sistema (`scripts/actualizar.sh`)

Cuando se entregue una nueva versión del sistema (por ejemplo `papeletas-essalud-<NUEVA_VERSION>.tar.gz`), el procedimiento se ejecuta desde el paquete nuevo sin modificar el directorio de la versión anterior, permitiendo una reversión total si fuera necesario.

### 10.1 Procedimiento de actualización
1. Notifique a los usuarios del inicio de la ventana de mantenimiento.
2. Descargue y descomprima el paquete nuevo en una carpeta separada (`<carpeta del paquete nuevo>`).
3. Entre en la carpeta del paquete **NUEVO**:
   ```bash
   cd <carpeta del paquete nuevo>
   ```
4. Ejecute el script de actualización indicando como argumento la ruta absoluta de la instalación actual:
   ```bash
   sudo bash scripts/actualizar.sh <carpeta del paquete anterior>
   ```

### 10.2 Acciones automáticas y reanudabilidad de `actualizar.sh`
- Verifica los requisitos y la integridad del nuevo paquete (`verificar-paquete.sh`).
- **Detiene la aplicación al empezar** (manteniendo únicamente la base de datos activa) para establecer la ventana de mantenimiento sin conexiones concurrentes.
- **Genera una copia de seguridad previa obligatoria** sin escrituras en curso y almacena su ruta exacta en `estado/actualizacion/copia`.
- Copia la configuración `compose/.env` y los secretos de `secretos/` del paquete anterior al nuevo, actualizando la variable `APP_VERSION` a la nueva versión.
- Informa si la nueva versión incorpora variables de configuración adicionales en `compose/env.example`.
- Carga las nuevas imágenes de Docker desde `imagenes/`.
- Aplica las nuevas migraciones de base de datos con `migrar.js`.
- Revalida los privilegios del rol API con `migrar.js --conceder-app`.
- Arranca los nuevos contenedores con `scripts/compose.sh up -d --wait --remove-orphans`.
- Ejecuta `scripts/comprobar.sh` para certificar la salud de la actualización.
- **Reanudable:** Si algún paso intermedio fallase (por ejemplo, interrupción temporal o ajuste pendiente), corrija la causa y vuelva a ejecutar la misma orden `actualizar.sh`; el script detectará el estado y reanudará el proceso de forma segura.

---

## 11. Reversión del sistema (`scripts/revertir.sh`)

Si después de actualizar se detecta una anomalía crítica y se requiere volver a la versión anterior:

### 11.1 Reversión de aplicación (cuando el esquema de base de datos es compatible)
Si la versión nueva no aplicó migraciones estructurales incompatibles con la versión anterior:
1. Vuelva al directorio de la instalación **ANTERIOR**:
   ```bash
   cd <carpeta del paquete anterior>
   ```
2. Ejecute:
   ```bash
   sudo bash scripts/revertir.sh
   ```
El script recarga las imágenes anteriores, verifica que la base de datos sea compatible y reanuda los servicios de la versión previa.

### 11.2 Reversión completa con restauración de base de datos
Si la actualización aplicó migraciones de base de datos que la versión previa no reconoce:
```bash
cd <carpeta del paquete anterior>
sudo bash scripts/revertir.sh --restaurar-bd <copia previa indicada en estado/actualizacion/copia>
```
El script restaurará el volcado previo a la actualización (solicitando confirmación interactiva `REEMPLAZAR papeletas`), reiniciará los contenedores en la versión anterior y ejecutará la comprobación de salud.

---

## 12. Procedimiento para cambiar secretos

Para gestionar los contenedores use siempre el envoltorio [`scripts/compose.sh`](file:///D:/Proyectos/sistema-papeletas-essalud/deploy/paquete/scripts/compose.sh).

### 12.1 Rotación de `jwt_secret` (sesiones de usuario)
Cambiar la clave JWT invalida inmediatamente todos los tokens emitidos, cerrando de forma segura todas las sesiones web activas:
```bash
# 1. Generar nuevo secreto aleatorio
od -An -N32 -tx1 /dev/urandom | tr -d ' \n' | sudo tee secretos/jwt_secret > /dev/null
sudo chown 1000:1000 secretos/jwt_secret
sudo chmod 600 secretos/jwt_secret

# 2. Reiniciar el backend para aplicar el cambio
sudo bash scripts/compose.sh restart backend
```

### 12.2 Rotación de contraseñas de base de datos
Para cambiar la contraseña del usuario de la API (`DB_USER` / `papeletas_app`):
1. Ingrese la nueva contraseña en `secretos/db_password` (permisos `0600`, propietario `1000:1000`).
2. Actualice la contraseña en PostgreSQL ejecutando:
   ```bash
   sudo bash scripts/compose.sh run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app
   ```
3. Reinicie el backend:
   ```bash
   sudo bash scripts/compose.sh restart backend
   ```

### 12.3 Renovación de certificados TLS (solo con `TLS=propio`)
1. Reemplace los archivos `secretos/tls.crt` y `secretos/tls.key` con los nuevos certificados provistos por EsSalud.
2. Ajuste permisos y propietarios:
   ```bash
   sudo chown 101:101 secretos/tls.crt secretos/tls.key
   sudo chmod 600 secretos/tls.crt secretos/tls.key
   ```
3. Reinicie el servicio de proxy:
   ```bash
   sudo bash scripts/compose.sh restart proxy
   ```

---

## 13. Desinstalación limpia sin perder datos

Si se requiere desinstalar o trasladar los contenedores del servidor conservando permanentemente la base de datos de producción:

```bash
# 1. Realizar una copia de seguridad preventiva
sudo bash scripts/copia.sh --pausar

# 2. Detener y retirar los contenedores y redes
sudo bash scripts/compose.sh down
```

> **ADVERTENCIA CRÍTICA DE SEGURIDAD:**
> El envoltorio `scripts/compose.sh` bloquea expresamente las opciones `-v` y `--volumes` para evitar la eliminación accidental de volúmenes de datos. **Nunca intente eludir este bloqueo ejecutando `docker compose down -v` directamente**, ya que eliminaría el volumen `papeletas_postgres_datos` y con él toda la base de datos de producción.
