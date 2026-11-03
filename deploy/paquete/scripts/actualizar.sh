#!/usr/bin/env bash
# Actualiza una instalación existente a la versión de ESTE paquete (el nuevo). Reanudable: si un paso
# falla, corrija la causa y vuelva a ejecutar la misma orden.
# Uso (desde la carpeta del paquete NUEVO, como root o con sudo):
#   bash scripts/actualizar.sh /ruta/del/paquete/instalado
# Pasos: verifica → detiene la aplicación (ventana de mantenimiento) → copia de seguridad → toma .env y
# secretos del instalado → carga imágenes → migraciones → permisos de la API → arranque → comprobación.
# El paquete anterior no se modifica: con él se revierte (scripts/revertir.sh). Los datos se conservan.
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
[[ $# == 1 ]] || fallo "Uso: actualizar.sh /ruta/del/paquete/instalado"
ANTERIOR=$(cd "$1" && pwd) || fallo "No existe $1."
[[ $ANTERIOR != "$RAIZ" ]] || fallo "Indique la carpeta del paquete instalado, no la de este."
[[ -f $ANTERIOR/compose/.env && -d $ANTERIOR/secretos ]] || fallo "$ANTERIOR no parece una instalación (falta compose/.env o secretos/)."
MARCAS=$RAIZ/estado/actualizacion
hecho() { [[ -f $MARCAS/$1 ]]; }
marcar() { mkdir -p "$MARCAS"; printf '%s\n' "${2:-$(date '+%Y-%m-%d %H:%M:%S')}" > "$MARCAS/$1"; }
if [[ -f $ENV_FILE ]]; then
  [[ $(cat "$MARCAS/desde" 2>/dev/null) == "$ANTERIOR" ]] || fallo "Este paquete ya tiene compose/.env de otra instalación: use una copia limpia del paquete nuevo."
  echo "Reanudando la actualización desde $ANTERIOR."
fi
NUEVA=$(sed -n 's/^version=//p' "$RAIZ/VERSION" | tr -d '\r')
[[ -n $NUEVA ]] || fallo "VERSION no indica la versión."

paso "1/8 Requisitos e integridad del paquete nuevo ($NUEVA)"
requisitos
bash "$RAIZ/scripts/verificar-paquete.sh"
marcar desde "$ANTERIOR"

paso "2/8 Detener la aplicación (la base sigue en marcha)"
servicios=$(bash "$ANTERIOR/scripts/compose.sh" config --services | grep -vx db || true)
# shellcheck disable=SC2086
[[ -z $servicios ]] || bash "$ANTERIOR/scripts/compose.sh" stop $servicios

paso "3/8 Copia de seguridad previa (obligatoria; sin escrituras en curso)"
if ! hecho copia; then
  copia=$(bash "$ANTERIOR/scripts/copia.sh" | tail -n1)
  [[ -f $copia ]] || fallo "No se pudo hacer la copia previa."
  marcar copia "$copia"
fi
echo "Copia previa: $(cat "$MARCAS/copia"). Consérvela: la necesita revertir.sh --restaurar-bd."

paso "4/8 Configuración y secretos de la instalación actual"
if [[ ! -f $ENV_FILE ]]; then
  mkdir -p "$RAIZ/secretos"; chmod 700 "$RAIZ/secretos"
  for n in jwt_secret db_password db_owner_password tls.crt tls.key; do
    [[ -f $ANTERIOR/secretos/$n ]] && cp -p "$ANTERIOR/secretos/$n" "$RAIZ/secretos/$n"
  done
  for n in esquema catalogos administrador instalacion; do
    [[ -f $ANTERIOR/estado/$n ]] && { mkdir -p "$RAIZ/estado"; cp -p "$ANTERIOR/estado/$n" "$RAIZ/estado/$n"; }
  done
  [[ -d $ANTERIOR/copias ]] && ln -sfn "$ANTERIOR/copias" "$RAIZ/copias-anteriores"
  cp -p "$ANTERIOR/compose/.env" "$ENV_FILE.nuevo"
  ANTES=$(sed -n 's/^APP_VERSION=//p' "$ENV_FILE.nuevo" | tail -n1 | tr -d '\r')
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$NUEVA/" "$ENV_FILE.nuevo"
  mv "$ENV_FILE.nuevo" "$ENV_FILE"
  echo "Versión: $ANTES → $NUEVA."
fi
echo "Variables de compose/env.example que no están en .env (revíselas):"
comm -23 <(grep -oE '^[A-Z_]+=' "$RAIZ/compose/env.example" | sort -u) <(grep -oE '^[A-Z_]+=' "$ENV_FILE" | sort -u) | sed 's/^/  /' || true
cargar_configuracion

paso "5/8 Imágenes de $NUEVA"
cargar_imagenes
preparar_secretos
dc config --quiet

paso "6/8 Migraciones y permisos de la API"
[[ $ESCENARIO == A ]] && dc up -d --wait --wait-timeout 120 db
op scripts/migrar.js
op scripts/migrar.js --conceder-app "$DB_USER"

paso "7/8 Arranque con $NUEVA"
dc up -d --no-build --pull never --wait --wait-timeout 180 --remove-orphans

paso "8/8 Comprobación"
bash "$RAIZ/scripts/comprobar.sh"
marcar terminada
echo
echo "Actualizado a $NUEVA. Si algo falla: bash $ANTERIOR/scripts/revertir.sh"
echo "(y, si $NUEVA aplicó migraciones: --restaurar-bd $(cat "$MARCAS/copia"))."
