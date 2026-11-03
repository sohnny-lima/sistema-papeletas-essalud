#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
[[ $# == 1 ]] || { echo 'Uso: verificar-respaldo.sh archivo' >&2; exit 1; }
temp="bd_papeleta_tmp_verificar_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
exists=$(pg psql -X -w -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='$temp'")
[[ -z $exists ]] || { echo 'El nombre temporal ya existe; no se modificó.' >&2; exit 1; }
work=$(mktemp -d)
trap 'pg dropdb -w --if-exists "$temp" || true; rm -f -- "$work/esperado" "$work/actual"; rmdir "$work"' EXIT
bash "$(dirname "${BASH_SOURCE[0]}")/restaurar.sh" "$1" "$temp"
tr -d '\r' < "$1.counts" | sed '1s/^\xef\xbb\xbf//' > "$work/esperado"
recuentos "$temp" > "$work/actual"
diff -u "$work/esperado" "$work/actual"
cat "$work/actual"
echo 'Respaldo verificado: recuentos por tabla coincidentes.'
