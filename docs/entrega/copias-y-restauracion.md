# Copias de seguridad y restauración

Resumen operativo. Las órdenes completas y sus opciones están en [docker.md § Copias](docker.md#copias-y-restauración-usando-docker) y en [base-de-datos.md § Copias](base-de-datos.md#copias-restauración-y-verificación).

## Qué produce una copia
`deploy/scripts/respaldo.sh <directorio> [días]` genera tres archivos que **se conservan juntos**:

| Archivo | Contenido |
|---|---|
| `papeletas-<base>-<fecha>-<pid>.dump` | `pg_dump -Fc` (formato personalizado, comprimido) |
| `.counts` | Recuento de filas por tabla en el momento de la copia |
| `.sha256` | Suma del volcado. Se escribe **al final**, así que una copia sin `.sha256` está incompleta y no se restaura |

La retención borra solo copias de esa base con ese patrón de nombre y más antiguas que los días indicados (14 por defecto). La contraseña se lee de un archivo (`DB_PASSWORD_FILE`); nunca va en la línea de órdenes.

## 1. Programar la copia diaria
Ejemplo con un `systemd timer` en el servidor Linux (escenario A, desde la carpeta de la instalación, por ejemplo `/srv/papeletas`). Ajuste la ruta, la hora y el usuario a la política de la institución.

`/etc/systemd/system/papeletas-copia.service`:
```ini
[Unit]
Description=Copia de seguridad de papeletas EsSalud
[Service]
Type=oneshot
User=papeletas
WorkingDirectory=/srv/papeletas
Environment=PG_DOCKER=1 PG_DOCKER_NETWORK=essalud_datos PGHOST=db PGPORT=5432 PGDATABASE=papeletas PGUSER=papeletas_admin
Environment=DB_PASSWORD_FILE=/srv/papeletas/deploy/secretos/db_owner_password
ExecStartPre=/usr/bin/docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml stop backend
ExecStart=/usr/bin/bash deploy/scripts/respaldo.sh deploy/respaldos 14
ExecStopPost=/usr/bin/docker compose -p essalud -f deploy/compose.yaml -f deploy/compose.db.yaml start backend
```

`/etc/systemd/system/papeletas-copia.timer`:
```ini
[Unit]
Description=Copia diaria de papeletas EsSalud
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now papeletas-copia.timer
systemctl list-timers papeletas-copia.timer
journalctl -u papeletas-copia.service --since today
```

- `ExecStopPost` arranca el backend **también si la copia falla**. El backend se detiene unos segundos para que el volcado y los recuentos correspondan al mismo momento.
- `pg_dump` ya es coherente por sí mismo; si la institución no admite esa pausa, quite `ExecStartPre` y `ExecStopPost` y acepte que `.counts` pueda diferir ligeramente del volcado.
- La cuenta de `User=` debe poder usar Docker y **leer el secreto del propietario**, que pertenece al uid 1000 con modo `600`. Cree la cuenta de operación con uid 1000 o use `root`. El grupo `docker` equivale en la práctica a `root` en ese equipo.
- Con `cron`, la orden equivalente va en un guion que haga lo mismo: detener, copiar y arrancar siempre (`trap … EXIT`).

## 2. Copia fuera del servidor
Las copias en el mismo disco **no protegen** si se pierde el servidor. Tras la copia diaria, envíe los tres archivos a un destino externo según la política de EsSalud: almacenamiento de red, otro servidor con `rsync` o una cinta. **El destino está pendiente de definir** (`datos-servidor.md`). Compruebe la suma en el destino con `sha256sum -c`, adaptando el formato del archivo `.sha256`, que contiene solo la suma.

## 3. Comprobar que las copias sirven (al menos una vez al mes)

Antes, en la misma sesión, exporte las variables de la sección 1: `PG_DOCKER`, `PG_DOCKER_NETWORK`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER=papeletas_admin`, `DB_PASSWORD_FILE` y, sin Internet, `PG_DOCKER_IMAGE`. Los scripts **no leen** `deploy/.env`. Ejecútelos desde la raíz de la instalación.
```bash
bash deploy/scripts/verificar-respaldo.sh deploy/respaldos/papeletas-papeletas-AAAAMMDD-HHMMSS-PID.dump
```
- La comprobación restaura en una base temporal, compara los recuentos con `.counts` y borra la temporal, incluso si algo falla.
- Una copia que no se ha restaurado nunca **no está comprobada**.
- Anote la fecha y el resultado.

## 4. Restaurar

Antes, en la misma sesión, exporte las variables de la sección 1: `PG_DOCKER`, `PG_DOCKER_NETWORK`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER=papeletas_admin`, `DB_PASSWORD_FILE` y, sin Internet, `PG_DOCKER_IMAGE`. Los scripts **no leen** `deploy/.env`. Ejecútelos desde la raíz de la instalación.
1. Decida con el responsable: restaurar **pierde todo lo registrado después de la copia**.
2. Detenga el backend.
3. Ejecute `restaurar.sh <copia> <base> --reemplazar --confirmacion "REEMPLAZAR <base>"`. La copia se restaura primero en una base temporal y solo si termina bien sustituye a la original; si falla, la original queda intacta.
4. Vuelva a conceder los permisos del rol de la API: `migrar.js --conceder-app papeletas_app`.
5. Arranque y compruebe `/api/salud/lista`, el login y una papeleta conocida.

Para restaurar en otra base sin tocar la de producción (consulta o auditoría), use un nombre de destino nuevo sin `--reemplazar`.

## 5. Revertir una migración
Las migraciones no tienen «deshacer» automático. Antes de migrar se hace una copia verificada (`actualizacion-y-reversion.md`). Si la migración o la versión nueva fallan, se restaura **esa** copia (paso 4) con las imágenes anteriores. No se borran filas de `esquema_migraciones` ni se edita una migración ya aplicada.

## Probado y pendiente
- **Probado (28/10/2026), con el esquema reconstruido y datos ficticios:**
  - copia, verificación y restauración reales en local (PowerShell y Git Bash) y en Docker (modo `PG_DOCKER`);
  - restauración con un volcado corrupto: el destino queda intacto;
  - ninguna copia deja contenedores ni volúmenes sobrantes.
- **Pendiente:**
  - la programación con `systemd` no se probó en un servidor real;
  - falta el destino externo;
  - falta probar con la base real.
