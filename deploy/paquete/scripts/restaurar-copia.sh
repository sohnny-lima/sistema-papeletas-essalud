#!/usr/bin/env bash
# Restaura una copia sobre la base de la instalación. DESTRUCTIVO: se pierde lo registrado después de la copia.
# La base anterior no se borra: queda renombrada (<base>_anterior_...) para poder volver atrás.
# Uso: bash scripts/restaurar-copia.sh copias/papeletas-<base>-AAAAMMDD-HHMMSS-PID.dump
# Pide escribir «REEMPLAZAR <base>». Solo para pruebas desatendidas: CONFIRMACION="REEMPLAZAR <base>".
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
cargar_configuracion
[[ $# == 1 ]] || fallo "Uso: restaurar-copia.sh archivo.dump"
archivo=$1
[[ -f $archivo && -f $archivo.sha256 ]] || fallo "Falta la copia o su archivo .sha256."
esperado="REEMPLAZAR $DB_NAME"
confirmacion=${CONFIRMACION:-}
if [[ -z $confirmacion ]]; then
  echo "Se reemplazará la base $DB_NAME por la copia $(basename "$archivo")."
  read -r -p "Escriba «$esperado» para continuar: " confirmacion
fi
[[ $confirmacion == "$esperado" ]] || fallo "Confirmación incorrecta; no se ha cambiado nada."

paso "Detener la aplicación (sin tocar la base)"
dc stop frontend backend
[[ $TLS == propio ]] && dc stop proxy
paso "Restaurar"
entorno_copias
bash "$RAIZ/scripts/restaurar.sh" "$archivo" "$DB_NAME" --reemplazar --confirmacion "$esperado"
paso "Permisos de la API y arranque"
op scripts/migrar.js
op scripts/migrar.js --conceder-app "$DB_USER"
dc up -d --no-build --pull never --wait --wait-timeout 180
bash "$RAIZ/scripts/comprobar.sh"
