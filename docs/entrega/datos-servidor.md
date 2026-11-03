# Datos del servidor que faltan

La versión candidata está **parametrizada** para no depender de ellos. Las pruebas locales usaron Linux x86_64 (Ubuntu 26.04 en WSL) con Docker Engine 29.1.3 y Compose 2.40.3. Con estos datos se cierra la configuración y la guía de instalación del servidor real.

| Dato | Por qué importa | Supuesto actual y dónde se ajusta |
|---|---|---|
| **Sistema operativo** y versión | Instalación de Docker, rutas de datos y copias, tareas programadas, cortafuegos | Linux con systemd. Los scripts de copia existen en Bash y en PowerShell |
| **Arquitectura** (x86_64 / arm64) | Las imágenes base fijadas por digest son de `linux/amd64` | x86_64. Para arm64 hay que reconstruir las imágenes con `--platform linux/arm64` y verificarlas |
| **Recursos** (CPU, RAM y disco libre para datos y copias) | Límites de memoria de los contenedores, retención de copias y de registros | Mínimo orientativo: 2 vCPU, 2 GB de RAM y 10 GB de disco, más el tamaño de las copias × los días de retención. Límites en `deploy/.env` |
| **Docker y Compose** disponibles (versiones), o permiso para instalarlos | Sin Docker no se puede usar esta forma de despliegue | Docker Engine ≥ 24 y Compose v2. Si no se permite Docker, hace falta otra guía (Node + Nginx del sistema) |
| **Dominio o IP** y **puerto** por los que se accederá | Dirección de acceso, cabeceras y, si se usa, el certificado | Puerto `8080` en todas las interfaces (`HTTP_BIND` y `HTTP_PORT` en `deploy/.env`) |
| **HTTPS:** ¿hay un proxy o balanceador institucional, o certificado propio? | El sistema transmite contraseñas: en producción debe ir por HTTPS | Se supone un proxy institucional con TLS delante (`TRUST_PROXY`). Sin él, hay que añadir el certificado a Nginx (documentado como pendiente) |
| **PostgreSQL:** ¿existe en el servidor (versión, puerto, base, usuario) o se usa el del contenedor? | Elige el escenario A (contenedor) o B (existente) | Escenario A para pruebas. Para el B: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y el secreto de la contraseña |
| **Esquema real** de la base actual | Las migraciones solo se probaron con un esquema reconstruido | Procedimiento en `base-de-datos.md`: obtener el esquema, compararlo y probar en una copia |
| **Red:** ¿salida a Internet desde el servidor? ¿Registro de imágenes interno? | Descarga de imágenes y paquetes al construir | Si no hay salida, se construyen las imágenes fuera, se exportan (`docker save`) y se cargan (`docker load`) en el servidor |
| **Zona horaria** del servidor | Fechas de registros y nombres de las copias | Las fechas de negocio no dependen de ella (`YYYY-MM-DD`). Contenedores en `America/Lima` (configurable con `TZ`) |
| **Política de copias de la institución** (frecuencia, retención, destino externo) | Las copias en el mismo disco no protegen ante su pérdida | Copia diaria con 14 días de retención en `deploy/respaldos/`; falta el destino externo |
| **Responsable de operación** y usuario del sistema operativo que ejecutará Docker | Permisos de archivos de secretos y de copias | Usuario sin privilegios del grupo `docker`, con archivos de secretos en modo 600 |
