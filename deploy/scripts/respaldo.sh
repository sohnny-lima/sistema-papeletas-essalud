#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/comun.sh"
[[ $# -ge 1 && $# -le 2 ]] || { echo 'Uso: respaldo.sh directorio [retencion_dias=14]' >&2; exit 1; }
dir=$1; dias=${2:-14}
[[ $dias =~ ^[1-9][0-9]*$ ]] || { echo 'Retención inválida.' >&2; exit 1; }
nombre_valido "$PGDATABASE"
mkdir -p -- "$dir"
file="$dir/papeletas-$PGDATABASE-$(date +%Y%m%d-%H%M%S)-$$.dump"
limpiar_incompleto() {
  local estado=$?
  rm -f -- "$file" "$file.counts" "$file.sha256" || true
  echo 'Respaldo incompleto eliminado; revise conexión, permisos y espacio disponible.' >&2
  exit "$estado"
}
trap limpiar_incompleto ERR
# Bash conserva los bytes al redirigir stdout. Evita docker cp sobre tmpfs.
if [[ -n ${PG_CONTAINER:-} ]]; then
  pg pg_dump -w -Fc > "$file"
else pg pg_dump -w -Fc -f "$file"; fi
recuentos "$PGDATABASE" > "$file.counts"
sha256sum "$file" | cut -d ' ' -f1 > "$file.sha256"
while IFS= read -r -d '' old; do rm -f -- "$old" "$old.sha256" "$old.counts"; done < <(find "$dir" -maxdepth 1 -type f -name "papeletas-$PGDATABASE-*.dump" -mmin "+$((dias * 1440))" -print0)
printf '%s\n' "$file"
