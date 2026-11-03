#!/usr/bin/env bash
# Docker Compose con la configuración de esta instalación (proyecto, .env, escenario y HTTPS).
# Úselo para cualquier orden manual en lugar de «docker compose» directamente. Ejemplos:
#   bash scripts/compose.sh ps
#   bash scripts/compose.sh logs --since 10m backend
#   bash scripts/compose.sh restart backend
# No use «down -v»: borraría el volumen de la base de datos (escenario A).
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
cargar_configuracion
for a in "$@"; do
  [[ $a == -v || $a == --volumes ]] && fallo "Opción prohibida en este envoltorio: $a (borra datos)."
done
dc "$@"
