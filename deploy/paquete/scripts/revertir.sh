#!/usr/bin/env bash
# Vuelve a la versión de ESTE paquete (el anterior) tras una actualización.
# Uso (desde la carpeta del paquete ANTERIOR, como root o con sudo):
#   bash scripts/revertir.sh                       solo imágenes y configuración (los datos siguen)
#   bash scripts/revertir.sh --restaurar-bd copia.dump
#       además restaura la copia previa: necesario si la versión nueva aplicó migraciones que la
#       anterior no conoce. DESTRUCTIVO: se pierde lo registrado después de la copia (pide confirmación).
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
copia=""
if [[ $# == 2 && $1 == --restaurar-bd ]]; then copia=$2
elif [[ $# != 0 ]]; then fallo "Uso: revertir.sh [--restaurar-bd archivo.dump]"; fi
cargar_configuracion

paso "1/3 Imágenes de $APP_VERSION"
requisitos
cargar_imagenes

if [[ -n $copia ]]; then
  paso "2/2 Restaurar la copia previa (incluye el arranque y la comprobación)"
  bash "$RAIZ/scripts/restaurar-copia.sh" "$copia"
  exit 0
else
  paso "2/3 Base de datos sin cambios"
  if salida=$(op scripts/migrar.js --estado 2>&1); then
    echo "$salida" | sed 's/^/  /'
  else
    echo "$salida" | sed 's/^/  /'
    fallo "La base tiene migraciones que esta versión no conoce. Revierta con --restaurar-bd y la copia previa a la actualización."
  fi
fi

paso "3/3 Arranque con $APP_VERSION"
dc up -d --no-build --pull never --wait --wait-timeout 180 --remove-orphans
bash "$RAIZ/scripts/comprobar.sh"
