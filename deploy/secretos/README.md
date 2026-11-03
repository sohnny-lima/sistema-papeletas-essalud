# Secretos locales

Nunca versionar estos archivos ni escribir claves en `.env`, argumentos o imágenes.
Crear en Linux con `umask 077`, directorio privado (0700) y archivos 0600.

```bash
mkdir -p deploy/secretos
chmod 700 deploy/secretos
umask 077
openssl rand -hex 32 > deploy/secretos/jwt_secret
openssl rand -hex 32 > deploy/secretos/db_password
openssl rand -hex 32 > deploy/secretos/db_owner_password
chmod 600 deploy/secretos/{jwt_secret,db_password,db_owner_password}
```

`db_password` pertenece exclusivamente al usuario API (`papeletas_app`).
`db_owner_password` es distinto y pertenece al propietario (`papeletas_admin`),
que usa PostgreSQL al inicializar y el servicio puntual `operaciones`. Nunca se
monta en el contenedor API. En B contienen las contraseñas asignadas por el DBA.
`migrar.js --conceder-app rol` lee la contraseña nueva de `APP_DB_PASSWORD_FILE`;
no acepta claves en argumentos. Ejecutar expresamente tras migraciones iniciales.
Los secretos de Compose son montajes de archivos, sin cifrado automático. Con
fuente `file`, Compose conserva propietario y permisos del host: no remapea uid/gid.
El backend usa uid 1000 (`node`). En Linux convencional los archivos que recibe
deben pertenecer a uid 1000 (`sudo chown 1000:1000 ...`), manteniendo 0600.
PostgreSQL inicia su entrypoint como root y lee su archivo antes de bajar privilegios.
No aplicar chmod 644 para resolver una lectura fallida. En hosts rootless/userns,
ajustar el propietario al mapeo real y probar la lectura sin imprimir el contenido.
En WSL sobre NTFS los modos pueden no aplicarse: para pruebas guardar los archivos
en el sistema Linux privado y usar rutas absolutas DB_PASSWORD_PATH/DB_OWNER_PASSWORD_PATH/JWT_SECRET_PATH.
Para el administrador inicial usar un archivo adicional temporal privado y montarlo
solo durante `compose run`; borrarlo después. No reutilizar el secreto JWT.
