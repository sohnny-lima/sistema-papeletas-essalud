#!/usr/bin/env bash
# Copia de seguridad de la base (pg_dump -Fc + .counts + .sha256) con un cliente PostgreSQL efímero.
# Uso: bash scripts/copia.sh [--pausar] [carpeta_destino] [dias_retencion]
#   --pausar  detiene la API durante la copia para que .dump y .counts coincidan exactamente,
#             y la vuelve a arrancar al terminar, también si la copia falla (recomendado en la copia programada).
# Por defecto, COPIAS_DIR y COPIAS_DIAS de compose/.env. Copie después los tres archivos al destino externo de EsSalud.
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
cargar_configuracion
pausar=false
if [[ ${1:-} == --pausar ]]; then pausar=true; shift; fi
destino=${1:-$(leer COPIAS_DIR copias)}
[[ $destino == /* ]] || destino=$RAIZ/$destino
dias=${2:-$(leer COPIAS_DIAS 14)}
entorno_copias
if $pausar; then
  trap 'dc start backend >/dev/null 2>&1 || echo "ERROR: no se pudo volver a arrancar la API; ejecute scripts/compose.sh start backend" >&2' EXIT
  dc stop backend >/dev/null
fi
bash "$RAIZ/scripts/respaldo.sh" "$destino" "$dias"
