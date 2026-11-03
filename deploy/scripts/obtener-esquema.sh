#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
[[ $# == 1 ]] || { echo 'Uso: obtener-esquema.sh archivo' >&2; exit 1; }
if [[ -n ${PG_CONTAINER:-} ]]; then
  pg pg_dump -w --schema-only --no-owner --no-privileges > "$1"
else pg pg_dump -w --schema-only --no-owner --no-privileges -f "$1"; fi
echo 'Esquema exportado. Comparar con el reconstruido; no equivale a validar la base real.'
