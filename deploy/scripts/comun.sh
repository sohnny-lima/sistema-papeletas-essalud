#!/usr/bin/env bash
# Esquema reconstruido: estas herramientas no certifican la base real.
set -euo pipefail
umask 077
if [[ $(uname -s) == MSYS* || $(uname -s) == MINGW* ]]; then
  # Docker recibe rutas del contenedor sin que MSYS las convierta a rutas Windows.
  # En modo local, PG_BIN y los archivos deben usar rutas nativas (C:/...) en Git Bash.
  export MSYS2_ARG_CONV_EXCL='*'
fi
export PGHOST="${PGHOST:-${DB_HOST:-}}" PGPORT="${PGPORT:-${DB_PORT:-}}"
export PGUSER="${PGUSER:-${DB_USER:-}}" PGDATABASE="${PGDATABASE:-${DB_NAME:-}}"
: "${PGHOST:?Falta PGHOST o DB_HOST}" "${PGPORT:?Falta PGPORT o DB_PORT}" "${PGUSER:?Falta PGUSER o DB_USER}" "${PGDATABASE:?Falta PGDATABASE o DB_NAME}"
if [[ -n ${DB_PASSWORD_FILE:-} ]]; then
  [[ -r $DB_PASSWORD_FILE ]] || { echo 'No se puede leer DB_PASSWORD_FILE; revise los permisos.' >&2; exit 1; }
  PGPASSWORD=$(cat -- "$DB_PASSWORD_FILE" && printf '.')
  PGPASSWORD=${PGPASSWORD%.}
  if [[ $PGPASSWORD == *$'\n' ]]; then PGPASSWORD=${PGPASSWORD%$'\n'}; PGPASSWORD=${PGPASSWORD%$'\r'}; fi
  export PGPASSWORD
elif [[ -n ${DB_PASSWORD:-} ]]; then export PGPASSWORD=$DB_PASSWORD; fi
# c005: cliente efímero fijado; los scripts conservan su validación y limpieza.
if [[ ${PG_DOCKER:-0} == 1 && -z ${PG_CONTAINER:-} ]]; then
  : "${PG_DOCKER_NETWORK:?Falta PG_DOCKER_NETWORK (red accesible al servidor)}"
  imagen=${PG_DOCKER_IMAGE:-postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5}
  cliente=$(docker run -d --rm --network "$PG_DOCKER_NETWORK" --add-host host.docker.internal:host-gateway --read-only --tmpfs /tmp:rw,size=128m,mode=1777 --cap-drop ALL --security-opt no-new-privileges --entrypoint sleep "$imagen" infinity)
  trap 'docker rm -f -v "$cliente" >/dev/null 2>&1 || true' EXIT
  export PG_CONTAINER=$cliente
  bash "${BASH_SOURCE[1]}" "$@"
  exit $?
fi
export PGCONNECT_TIMEOUT=10
pg() {
  local tool=$1; shift
  if [[ -n ${PG_CONTAINER:-} ]]; then
    docker exec -i -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE -e PGPASSWORD -e PGPASSFILE -e PGCONNECT_TIMEOUT "$PG_CONTAINER" "$tool" "$@" 2>/dev/null
  else "${PG_BIN:+$PG_BIN/}$tool" "$@" 2>/dev/null; fi || { echo "Falló $tool; revise conexión, permisos y esquema." >&2; return 1; }
}
nombre_valido() { [[ $1 =~ ^[a-z][a-z0-9_]{0,62}$ ]] || { echo 'Nombre de base inválido.' >&2; return 1; }; }
recuentos() {
  local db=$1 table quoted n tables
  tables=$(pg psql -X -w -d "$db" -At -v ON_ERROR_STOP=1 -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  while IFS= read -r table; do
    table=${table%$'\r'}; [[ -n $table ]] || continue
    quoted=${table//\"/\"\"}
    # docker exec -i no debe consumir las siguientes tablas del while.
    n=$(pg psql -X -w -d "$db" -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.\"$quoted\"" </dev/null)
    printf '%s\t%s\n' "$table" "${n%$'\r'}"
  done <<< "$tables"
}
