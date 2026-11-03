#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
[[ $# == 2 || $# == 5 ]] || { echo 'Uso: restaurar.sh archivo destino [--reemplazar --confirmacion "REEMPLAZAR destino"]' >&2; exit 1; }
file=$1; destino=$2
nombre_valido "$destino"
case "$destino" in postgres|template0|template1|bd_papeleta_test) echo 'Destino protegido.' >&2; exit 1;; esac
[[ -f "$file.sha256" ]] || { echo 'Falta el archivo de suma SHA-256 del respaldo.' >&2; exit 1; }
hash=$(cat -- "$file.sha256" && printf '.')
hash=${hash%.}
if [[ $hash == *$'\n' ]]; then hash=${hash%$'\n'}; hash=${hash%$'\r'}; fi
[[ $hash =~ ^[a-fA-F0-9]{64}$ && ${hash,,} == "$(sha256sum "$file" | cut -d ' ' -f1)" ]] || { echo 'Suma SHA-256 incorrecta.' >&2; exit 1; }
if [[ $# == 5 && ( $3 != --reemplazar || $4 != --confirmacion || $5 != "REEMPLAZAR $destino" ) ]]; then echo 'Confirmación incorrecta.' >&2; exit 1; fi
exists=$(pg psql -X -w -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='$destino'")
if [[ ${exists%$'\r'} == 1 && $# != 5 ]]; then echo 'La base existe; requiere --reemplazar y confirmación escrita.' >&2; exit 1; fi
# Prefijos acortados para no superar 63 bytes; sufijos aleatorios de 64 bits.
temp="${destino:0:34}_restaurando_$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
anterior="${destino:0:37}_anterior_$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
nombre_valido "$temp"
nombre_valido "$anterior"
creada=false
limpiar() {
  local estado=$?
  if [[ $creada == true ]]; then pg dropdb -w --if-exists "$temp" || true; fi
  return "$estado"
}
trap limpiar EXIT
pg createdb -w -T template0 "$temp"
creada=true
if [[ -n ${PG_CONTAINER:-} ]]; then
  pg pg_restore -w --no-owner --exit-on-error --single-transaction -d "$temp" < "$file"
else pg pg_restore -w --no-owner --exit-on-error --single-transaction -d "$temp" "$file"; fi
# La transacción protege también frente a un fallo del segundo renombrado.
# Cerrar las conexiones al destino (detener el backend) antes de reemplazar.
sql='BEGIN; '
if [[ ${exists%$'\r'} == 1 ]]; then sql+="ALTER DATABASE \"$destino\" RENAME TO \"$anterior\"; "; fi
sql+="ALTER DATABASE \"$temp\" RENAME TO \"$destino\"; COMMIT;"
pg psql -X -w -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/dev/null
creada=false
if [[ ${exists%$'\r'} == 1 ]]; then
  pg dropdb -w "$anterior" || echo "Restauración terminada; no se pudo borrar la copia anterior $anterior. Revise su eliminación." >&2
fi
echo "Restauración completada: $destino"
