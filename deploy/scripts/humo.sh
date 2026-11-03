#!/usr/bin/env bash
# c006: solo recursos desechables; nunca carga deploy/.env ni usa una base del host.
set -euo pipefail
umask 077
raiz=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
ejecutor=()
case ${1:-} in
  '') ;;
  --e2e) shift; ejecutor=(node); [[ $# == 0 ]] || exit 2 ;;
  --ejecutor-e2e) shift; [[ $# -gt 0 ]] || exit 2; ejecutor=("$@") ;;
  *) echo 'Uso: bash deploy/scripts/humo.sh [--e2e | --ejecutor-e2e comando argumentos...]' >&2; exit 2 ;;
esac
for herramienta in docker python3; do command -v "$herramienta" >/dev/null; done
docker buildx version
privado=$(mktemp -d /tmp/essalud-humo.XXXXXXXX)
# Hasta que exista el proyecto, solo hay que borrar los secretos temporales (g013 #5).
trap 'rm -rf -- "$privado"' EXIT
proyecto="essalud-humo-$(date +%s)-$$"
# Entorno cerrado: no heredar nombres de base, imágenes o secretos de una instalación.
dc() { env -i PATH="$PATH" HOME="$HOME" DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}" COMPOSE_BAKE=true BUILDX_BAKE_ENTITLEMENTS_FS=0 \
  docker compose --env-file "$privado/compose.env" -p "$proyecto" \
  -f "$raiz/deploy/compose.yaml" -f "$raiz/deploy/compose.db.yaml" "$@"; }
limpiar() {
  local codigo=$? fallo=0
  trap - EXIT INT TERM
  dc down -v --remove-orphans || fallo=1
  docker volume ls
  docker volume ls -q | sort > "$privado/volumenes-despues"
  diff -u "$privado/volumenes-antes" "$privado/volumenes-despues" || fallo=1
  [[ -z $(docker ps -aq --filter "label=com.docker.compose.project=$proyecto") ]] || fallo=1
  [[ -z $(docker network ls -q --filter "label=com.docker.compose.project=$proyecto") ]] || fallo=1
  [[ -z $(docker volume ls -q --filter "label=com.docker.compose.project=$proyecto") ]] || fallo=1
  # Ruta literal obtenida por mktemp, acotada a /tmp/essalud-humo.*.
  rm -rf -- "$privado"
  if (( fallo )); then echo 'c006: limpieza incompleta o cambiaron los volúmenes.' >&2; exit 1; fi
  echo 'c006: sin contenedores, redes ni volúmenes del ensayo; inventario de volúmenes idéntico.'
  exit "$codigo"
}
docker volume ls
docker volume ls -q | sort > "$privado/volumenes-antes"
for secreto in db_password db_owner_password jwt_secret admin_password; do
  python3 -c "import secrets; print(secrets.token_hex(32))" > "$privado/$secreto"
done
# Compose file conserva uid: la imagen Node se ejecuta como 1000.
if [[ $(id -u) != 1000 ]]; then
  if [[ $(id -u) == 0 ]]; then chown 1000:1000 "$privado/db_password" "$privado/db_owner_password" "$privado/jwt_secret"
  else sudo chown 1000:1000 "$privado/db_password" "$privado/db_owner_password" "$privado/jwt_secret"; fi
fi
cat > "$privado/compose.env" <<EOF
APP_VERSION=c006-humo
FRONTEND_IMAGE=essalud/humo-frontend
BACKEND_IMAGE=essalud/humo-backend
BACKEND_TARGET=pruebas
VCS_REF=ensayo-c006
HTTP_BIND=127.0.0.1
HTTP_PORT=0
DB_NAME=bd_papeleta_tmp_c006_humo
DB_USER=papeletas_app
DB_OWNER_USER=papeletas_admin
DB_PASSWORD_PATH=$privado/db_password
DB_OWNER_PASSWORD_PATH=$privado/db_owner_password
JWT_SECRET_PATH=$privado/jwt_secret
LOGIN_RATE_LIMIT_MAX=1000
EOF
trap limpiar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
dc config --quiet
# Compose usa Buildx/Bake; carga las imágenes en el motor, sin publicación.
dc build --builder "${BUILDX_BUILDER:-default}" --progress plain
dc up -d db --wait --wait-timeout 120
operar() { dc run --rm -T operaciones "$@"; }
operar scripts/migrar.js --inicializar
operar scripts/migrar.js --estado
operar scripts/migrar.js
operar scripts/migrar.js --catalogos-iniciales
operar scripts/migrar.js --conceder-app papeletas_app
dc run --rm -T operaciones scripts/crear-admin.js administrador_humo < "$privado/admin_password"
dc up -d --wait --wait-timeout 120
url_web() { export UI_URL="http://$(dc port frontend 8080)" API_URL; API_URL=$UI_URL; }
url_web
python3 "$raiz/deploy/scripts/humo-http.py" admin "$UI_URL" "$privado/admin_password"
reiniciar_demo() {
  dc stop backend
  dc exec -T db psql -X -v ON_ERROR_STOP=1 -U papeletas_admin -d bd_papeleta_tmp_c006_humo \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
  operar scripts/migrar.js --inicializar
  operar scripts/migrar.js
  operar scripts/cargar-demo.js --confirmar-demo
  operar scripts/migrar.js --conceder-app papeletas_app
  dc up -d --wait --wait-timeout 120
  url_web
}
reiniciar_demo
dc run --rm -T -v "$raiz/docs/revision/pruebas/e2e/roles-docker-g012.cjs:/tmp/roles.cjs:ro" operaciones /tmp/roles.cjs
python3 "$raiz/deploy/scripts/humo-http.py" crear "$UI_URL" "$privado/papeleta.json"
for servicio in db backend; do
  # Compose 2.40 imprime ":0" (o nada) para un puerto no publicado.
  publicado=$(dc port "$servicio" "$([[ $servicio == db ]] && echo 5432 || echo 3000)" 2>/dev/null || true)
  [[ -z $publicado || $publicado == ":0" ]]
  docker inspect "$(dc ps -q "$servicio")" --format '{{json .NetworkSettings.Ports}}' \
    | python3 -c 'import json,sys; assert all(not v for v in json.load(sys.stdin).values()), "Puerto publicado"'
done
echo 'c006: API y base sin puertos publicados.'
dc down
dc up -d --wait --wait-timeout 120
url_web
python3 "$raiz/deploy/scripts/humo-http.py" persistencia "$UI_URL" "$privado/papeleta.json"
if (( ${#ejecutor[@]} )); then
  export E2E_ENCARGO=c006-docker
  for flujo in flujos-ui flujos-centros flujos-entrega flujos-usuarios flujos-docker flujos-pestanas flujos-responsive; do
    reiniciar_demo
    echo "c006: E2E $flujo"
    if [[ ${ejecutor[0]} == node && ${#ejecutor[@]} == 1 ]]; then
      node "$raiz/docs/revision/pruebas/e2e/$flujo.mjs"
    else "${ejecutor[@]}" "$flujo"; fi
  done
fi
echo 'c006: humo y persistencia correctos (esquema reconstruido, datos ficticios).'
