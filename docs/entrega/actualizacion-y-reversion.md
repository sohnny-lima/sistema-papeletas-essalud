# Actualización y reversión

Procedimiento Linux, desde deploy/. Requiere ventana autorizada, copia verificada,
espacio suficiente y versión probada en una restauración. No actualizar por primera
vez contra la base real sin completar [adopción](base-de-datos.md).

## 1. Guardar el estado anterior

Elegir la función A; para B omitir compose.db.yaml:

```bash
dc() { docker compose -p essalud -f compose.yaml -f compose.db.yaml "$@"; }
dc ps
dc images
dc run --rm -T operaciones scripts/migrar.js --estado
```

Anotar etiquetas e Id de las imágenes, revisión de archivos entregados, migraciones
y valores de configuración. Guardar deploy/.env y secretos en almacenamiento privado,
con acceso restringido. **No sustituir los secretos por los de otra versión**.
Conservar las imágenes previas antes de cambiar APP_VERSION; sustituir VERSION_ANTERIOR:

```bash
mkdir -p /srv/papeletas/imagenes
docker save -o /srv/papeletas/imagenes/anterior.tar \
  essalud/frontend:VERSION_ANTERIOR essalud/backend:VERSION_ANTERIOR
sha256sum /srv/papeletas/imagenes/anterior.tar > /srv/papeletas/imagenes/anterior.tar.sha256
```

No podar estas imágenes hasta que termine la ventana de reversión. Conservar también
PostgreSQL si se cambia su imagen. Cambios de versión mayor PostgreSQL necesitan un
procedimiento específico; cambiar la etiqueta no migra el formato del volumen.

## 2. Copiar y preparar imágenes nuevas

Detener backend y mantener cerradas las escrituras hasta terminar. Ejecutar
[la copia y verificación](copias-y-restauracion.md) con la cuenta propietaria; una
copia falla → no continuar con migraciones. Registrar el archivo exacto verificado.
Construir con dc build tras seleccionar APP_VERSION/VCS_REF nuevos o cargar el tar
comprobado con docker load, según docker.md. No reutilizar una etiqueta para una
imagen distinta. Mantener frontend/backend de la misma entrega.

```bash
dc stop backend
# Realizar y verificar la copia según copias-y-restauracion.md.
# Ajustar APP_VERSION/VCS_REF en deploy/.env a la entrega nueva, sin cambiar claves.
dc build
# Sin Internet, sustituir build por la carga verificada de imágenes.
dc run --rm -T operaciones scripts/migrar.js --estado
dc run --rm -T operaciones scripts/migrar.js
dc run --rm -T operaciones scripts/migrar.js --conceder-app papeletas_app
dc up -d --no-build --pull never --wait --wait-timeout 120
curl --fail http://127.0.0.1:8080/api/salud/lista
```

Sustituir rol/URL por los configurados. Revisar estado de migraciones, login, una
papeleta, PDF, roles y recuentos antes de reabrir el tráfico. Si falla, mantener
mantenimiento y decidir la reversión. Cada migración es transaccional por separado:
un fallo no deshace las anteriores confirmadas.

## 3. Revertir imágenes

Si no cambió el esquema ni datos de manera incompatible y la versión anterior es
compatible con el estado actual, basta restaurar APP_VERSION/FRONTEND_IMAGE/
BACKEND_IMAGE y configuración anterior. Si hace falta, comprobar SHA y cargar
anterior.tar con docker load. Recrear ambos servicios:

```bash
dc stop backend
# Editar deploy/.env para las etiquetas y configuración anteriores.
dc up -d --no-build --pull never --wait --wait-timeout 120
curl --fail http://127.0.0.1:8080/api/salud/lista
```

No restaurar la copia automáticamente por un error solo visual: hacerlo perdería
las escrituras posteriores. La compatibilidad debe estar documentada por la entrega.

## 4. Revertir esquema o datos

Cuando la migración/datos no sean compatibles o el estado sea incierto, mantener
backend detenido y restaurar la copia **anterior** verificada, con destino explícito,
siguiendo [copias-y-restauracion.md](copias-y-restauracion.md). Se necesita autorización
para perder las escrituras posteriores al respaldo. Cerrar conexiones antes del
intercambio; no forzarlas. Restaurar las etiquetas anteriores y repetir
--conceder-app antes de arrancar. El registro esquema_migraciones vuelve con la copia.
No borrar filas del registro ni editar SQL ya aplicado para simular una reversión.

Si la restauración o comprobación falla, conservar mantenimiento, archivos de copia
y evidencia y escalar al responsable; no improvisar cambios sobre la base. Nunca
usar down -v como mecanismo de actualización o reversión.
