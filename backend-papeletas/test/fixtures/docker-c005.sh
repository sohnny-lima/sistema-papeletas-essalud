#!/usr/bin/env bash
# c005: docker exec -i consume stdin aunque psql use -c. No debe truncar el manifiesto.
set -euo pipefail
export PG_CONTAINER=c005_simulado PG_DOCKER=0 DB_HOST=ficticio DB_PORT=55432 DB_NAME=bd_papeleta_tmp_ficticia DB_USER=ficticio DB_PASSWORD_FILE=''
docker() {
  cat >/dev/null
  local consulta=${!#}
  if [[ $consulta == 'SELECT tablename'* ]]; then printf 'tabla_a\ntabla_b\ntabla_c\n'
  else printf '2\n'; fi
}
source "$(dirname "${BASH_SOURCE[0]}")/../../../deploy/scripts/comun.sh"
resultado=$(recuentos bd_papeleta_tmp_ficticia)
[[ $(printf '%s\n' "$resultado" | wc -l) == 3 ]]
printf '%s\n' "$resultado"
