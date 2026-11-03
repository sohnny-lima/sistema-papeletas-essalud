#!/usr/bin/env bash
# Prueba una copia: la restaura en una base TEMPORAL, compara los recuentos con su .counts y la borra.
# No toca la base de la instalación.
# Uso: bash scripts/verificar-copia.sh copias/papeletas-<base>-AAAAMMDD-HHMMSS-PID.dump
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
cargar_configuracion
[[ $# == 1 && -f $1 ]] || fallo "Uso: verificar-copia.sh archivo.dump"
entorno_copias
bash "$RAIZ/scripts/verificar-respaldo.sh" "$1"
