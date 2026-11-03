#!/usr/bin/env bash
# Estado de la instalación: servicios, salud, base, migraciones y puertos. No cambia nada.
# Uso: bash scripts/comprobar.sh
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
cargar_configuracion
errores=0
mal() { echo "  FALLO: $*"; errores=$((errores + 1)); }
bien() { echo "  ok: $*"; }

paso "Servicios"
dc ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}'
for s in frontend backend; do
  estado=$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q "$s")" 2>/dev/null || echo ausente)
  [[ $estado == healthy ]] && bien "$s healthy" || mal "$s: $estado"
done
if [[ $ESCENARIO == A ]]; then
  estado=$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q db)" 2>/dev/null || echo ausente)
  [[ $estado == healthy ]] && bien "db healthy" || mal "db: $estado"
fi

paso "Salud por HTTP"
base=$(url_local)
[[ $(obtener "$base/salud") == 200 ]] && bien "frontend $base/salud" || mal "frontend $base/salud"
[[ $(obtener "$base/api/salud/lista") == 200 ]] && bien "API y base ($base/api/salud/lista)" || mal "API o base no disponibles ($base/api/salud/lista)"
if [[ $TLS == propio ]]; then
  estado=$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q proxy)" 2>/dev/null || echo ausente)
  [[ $estado == healthy ]] && bien "proxy HTTPS healthy" || mal "proxy HTTPS: $estado"
  h=$HTTPS_BIND; [[ $h == 0.0.0.0 || -z $h ]] && h=127.0.0.1
  # -k: la comprobación local no valida el nombre del certificado (eso se comprueba con el dominio real).
  [[ $(obtener "https://$h:$HTTPS_PORT/salud" -k) == 200 ]] && bien "HTTPS en $h:$HTTPS_PORT" || mal "HTTPS en $h:$HTTPS_PORT"
fi

paso "Exposición"
publicado=$(dc port backend 3000 2>/dev/null || true)
[[ -z $publicado || $publicado == ":0" ]] && bien "API sin puerto publicado" || mal "la API publica $publicado"
if [[ $ESCENARIO == A ]]; then
  publicado=$(dc port db 5432 2>/dev/null || true)
  [[ -z $publicado || $publicado == ":0" ]] && bien "PostgreSQL sin puerto publicado" || mal "PostgreSQL publica $publicado"
fi

paso "Migraciones"
if salida=$(op scripts/migrar.js --estado 2>&1); then
  echo "$salida" | sed 's/^/  /'
  grep -q '^Pendiente' <<< "$salida" && mal "hay migraciones pendientes" || bien "todas aplicadas"
else
  mal "no se pudo consultar el estado de las migraciones"
fi

echo
if (( errores )); then echo "RESULTADO: $errores comprobaciones fallidas (ver documentacion/solucion-de-problemas.md)."; exit 1; fi
echo "RESULTADO: todo correcto."
