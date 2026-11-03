#!/usr/bin/env bash
# Instalación NUEVA, guiada y reanudable: si un paso falla, corrija la causa y vuelva a ejecutarlo.
# Uso (como root o con sudo, desde cualquier carpeta):
#   bash scripts/instalar.sh
# Variables opcionales:
#   ADMIN_NOMBRE=nombre               nombre del primer administrador (si no, se pregunta)
#   ADMIN_CLAVE_ARCHIVO=/ruta/privada contraseña en un archivo 0600, para instalaciones desatendidas
#                                     (bórrelo al terminar); si no, se pide en el terminal sin eco.
source "$(dirname "${BASH_SOURCE[0]}")/comun-paquete.sh"
ESTADO=$RAIZ/estado
hecho() { [[ -f $ESTADO/$1 ]]; }
marcar() { mkdir -p "$ESTADO"; date '+%Y-%m-%d %H:%M:%S' > "$ESTADO/$1"; }

paso "1/9 Requisitos e integridad del paquete"
requisitos
bash "$RAIZ/scripts/verificar-paquete.sh"
cargar_configuracion
echo "Proyecto $PROYECTO · versión $APP_VERSION · escenario $ESCENARIO · HTTPS $TLS"

paso "2/9 Imágenes"
cargar_imagenes

paso "3/9 Secretos"
preparar_secretos

paso "4/9 Configuración de Docker Compose"
dc config --quiet

if [[ $ESCENARIO == A ]]; then
  paso "5/9 PostgreSQL en contenedor (sin puertos publicados)"
  dc up -d --wait --wait-timeout 120 db
else
  paso "5/9 PostgreSQL existente: se usará $(leer DB_HOST):$(leer DB_PORT 5432)"
fi

paso "6/9 Esquema y migraciones"
if ! hecho esquema; then
  if ! op scripts/migrar.js --inicializar; then
    fallo "No se pudo inicializar. Si la base ya tiene tablas, no es una instalación nueva: siga documentacion/base-de-datos.md (adopción)."
  fi
  marcar esquema
fi
op scripts/migrar.js
op scripts/migrar.js --conceder-app "$DB_USER"

paso "7/9 Catálogos iniciales (roles, tipos de formulario y estados; sin datos de demostración)"
if ! hecho catalogos; then
  op scripts/migrar.js --catalogos-iniciales
  marcar catalogos
else
  echo "Ya cargados."
fi

paso "8/9 Primer administrador"
if ! hecho administrador; then
  nombre=${ADMIN_NOMBRE:-}
  if [[ -z $nombre ]]; then read -r -p "Nombre de usuario del primer administrador: " nombre; fi
  [[ -n $nombre ]] || fallo "Falta el nombre del administrador."
  if [[ -n ${ADMIN_CLAVE_ARCHIVO:-} ]]; then
    [[ -r $ADMIN_CLAVE_ARCHIVO ]] || fallo "No se puede leer ADMIN_CLAVE_ARCHIVO."
    op scripts/crear-admin.js "$nombre" < "$ADMIN_CLAVE_ARCHIVO"
  else
    echo "Escriba la contraseña (no se muestra). Debe ser distinta de los secretos de la base y del JWT."
    dc run --rm operaciones scripts/crear-admin.js "$nombre"
  fi
  marcar administrador
  echo "Entregue esta contraseña TEMPORAL al responsable por un canal separado; debe cambiarla en su primer acceso."
else
  echo "Ya creado."
fi

paso "9/9 Arranque y comprobación"
dc up -d --no-build --pull never --wait --wait-timeout 180
bash "$RAIZ/scripts/comprobar.sh"
marcar instalacion
echo
echo "Instalación terminada. Siguiente: HTTPS (si TLS=institucional, configure el proxy hacia $(url_local)),"
echo "copias programadas (scripts/copia.sh) y la lista documentacion/lista-verificacion-instalacion.md."
