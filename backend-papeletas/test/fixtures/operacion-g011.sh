#!/usr/bin/env bash
# g011 #5/#6/#7: fallos simulados, sin base ni contenedor reales.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
work=$1
export PG_CONTAINER=g011_simulado DB_PASSWORD_FILE='' MODO_G011=recuento
docker() {
  if [[ $(uname -s) == MSYS* || $(uname -s) == MINGW* ]]; then
    [[ ${MSYS2_ARG_CONV_EXCL:-} == '*' ]] || return 41
  fi
  local arg tool=''
  if [[ $1 == cp && $2 == g011_simulado:* ]]; then printf 'volcado_ficticio' > "$3"; return; fi
  for arg in "$@"; do
    case "$arg" in psql|pg_restore|dropdb|createdb|pg_dump) tool=$arg;; esac
  done
  if [[ $tool == psql && $MODO_G011 == recuento ]]; then return 42; fi
  if [[ $tool == pg_restore || $tool == dropdb ]]; then return 43; fi
  return 0
}
export -f docker
mkdir -p "$work/salida" "$work/temporales"
if bash "$repo/deploy/scripts/respaldo.sh" "$work/salida"; then echo 'Faltó el fallo de recuento' >&2; exit 1; fi
[[ -z $(find "$work/salida" -type f -print) ]] || { echo 'Quedó un respaldo incompleto' >&2; exit 1; }
echo 'g011 #5 OK: fallo de recuento elimina dump, counts y sha256.'
export MODO_G011=restauracion
printf 'volcado_ficticio' > "$work/fixture.dump"
sha256sum "$work/fixture.dump" | cut -d ' ' -f1 > "$work/fixture.dump.sha256"
export TMPDIR="$work/temporales"
if bash "$repo/deploy/scripts/verificar-respaldo.sh" "$work/fixture.dump" > "$work/error.log" 2>&1; then echo 'Faltó el fallo de restauración' >&2; exit 1; fi
grep -q 'Falló pg_restore' "$work/error.log"
[[ -z $(find "$work/temporales" -mindepth 1 -print) ]] || { echo 'Quedó work sin limpiar' >&2; exit 1; }
echo 'g011 #6 OK: work eliminado aunque dropdb falla; error de pg_restore conservado.'
echo 'g011 #7 OK: Docker simulado recibió exclusión de conversión de argumentos en MSYS.'
