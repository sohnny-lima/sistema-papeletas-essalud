#!/usr/bin/env bash
# Funciones comunes de los scripts del paquete. Ejecutar como root o con sudo.
# No contiene secretos: las contraseñas viven en secretos/ como archivos 0600.
set -Eeuo pipefail
umask 077
RAIZ=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=$RAIZ/compose/.env

paso() { printf '\n== %s\n' "$*"; }
aviso() { printf 'AVISO: %s\n' "$*" >&2; }
fallo() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Valor de una variable del .env sin ejecutar el archivo (última aparición; sin comillas ni CR).
leer() {
  local v
  v=$(grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r') || true
  v=${v#\"}; v=${v%\"}
  printf '%s' "${v:-${2:-}}"
}

cargar_configuracion() {
  [[ -f $ENV_FILE ]] || fallo "Falta compose/.env. Copie compose/env.example a compose/.env y ajústelo."
  PROYECTO=$(leer PROYECTO papeletas)
  ESCENARIO=$(leer ESCENARIO A)
  TLS=$(leer TLS institucional)
  APP_VERSION=$(leer APP_VERSION)
  DB_NAME=$(leer DB_NAME papeletas)
  DB_USER=$(leer DB_USER papeletas_app)
  DB_OWNER_USER=$(leer DB_OWNER_USER papeletas_admin)
  HTTP_BIND=$(leer HTTP_BIND 127.0.0.1)
  HTTP_PORT=$(leer HTTP_PORT 8080)
  HTTPS_PORT=$(leer HTTPS_PORT 443)
  HTTPS_BIND=$(leer HTTPS_BIND 0.0.0.0)
  TRUST_PROXY=$(leer TRUST_PROXY 2)
  POSTGRES_IMAGE=$(leer POSTGRES_IMAGE postgres:17.11-bookworm)
  FRONTEND_IMAGE=$(leer FRONTEND_IMAGE essalud/frontend)
  BACKEND_IMAGE=$(leer BACKEND_IMAGE essalud/backend)
  [[ $PROYECTO =~ ^[a-z][a-z0-9_-]{0,40}$ ]] || fallo "PROYECTO inválido: minúsculas, dígitos, - y _."
  [[ $ESCENARIO == A || $ESCENARIO == B ]] || fallo "ESCENARIO debe ser A o B."
  [[ $TLS == institucional || $TLS == propio ]] || fallo "TLS debe ser institucional o propio."
  [[ -n $APP_VERSION ]] || fallo "Falta APP_VERSION en compose/.env."
  for n in DB_NAME DB_USER DB_OWNER_USER; do
    [[ ${!n} =~ ^[a-z][a-z0-9_]{0,62}$ ]] || fallo "$n inválido: minúsculas, dígitos y guion bajo."
  done
  # Mismos valores que admite la API: false, número de saltos o IP/subredes de confianza (nunca true).
  [[ $TRUST_PROXY =~ ^(false|[0-9]+|[0-9a-fA-F.:/]+( *, *[0-9a-fA-F.:/]+)*)$ ]] || fallo "TRUST_PROXY debe ser false, un número de saltos o las IP/subredes del proxy."
  if [[ $ESCENARIO == B ]]; then
    [[ -n $(leer DB_HOST) ]] || fallo "Escenario B: falta DB_HOST (dato del DBA)."
  fi
  # Con el frontend abierto a la red, más saltos de confianza que proxies reales permitirían falsear la IP.
  if [[ $HTTP_BIND != 127.0.0.1 && $TLS == propio ]]; then
    aviso "Con TLS=propio deje HTTP_BIND=127.0.0.1: el frontend solo debe recibir tráfico del proxy."
  fi
  ARCHIVOS=(-f "$RAIZ/compose/compose.prod.yml")
  [[ $ESCENARIO == A ]] && ARCHIVOS+=(-f "$RAIZ/compose/compose.prod.db.yml")
  [[ $TLS == propio ]] && ARCHIVOS+=(-f "$RAIZ/compose/compose.prod.tls.yml")
  return 0
}

dc() { docker compose -p "$PROYECTO" --env-file "$ENV_FILE" --project-directory "$RAIZ/compose" "${ARCHIVOS[@]}" "$@"; }
# Herramientas de base de datos (migraciones, catálogos, rol de la API) en un contenedor puntual.
op() { dc run --rm -T operaciones "$@"; }

requisitos() {
  command -v docker >/dev/null || fallo "Docker no está instalado."
  docker info >/dev/null 2>&1 || fallo "No se puede usar Docker: ¿se ejecuta como root o con sudo?"
  local v
  v=$(docker compose version --short 2>/dev/null) || fallo "Falta el complemento Docker Compose v2."
  v=${v#v}
  [[ $(printf '%s\n%s\n' 2.20.0 "$v" | sort -V | head -n1) == 2.20.0 ]] || fallo "Docker Compose $v es antiguo: se necesita 2.20 o posterior."
  command -v sha256sum >/dev/null || fallo "Falta sha256sum (coreutils)."
}

# Imágenes de esta versión: deben existir y su contenido (capas) coincidir con VERSION.
# Se comparan las capas y no el Id, porque el Id depende del almacén de imágenes de Docker
# (containerd o clásico) y cambiaría entre el equipo que construye y el servidor.
huella_capas() { docker image inspect --format '{{json .RootFS.Layers}}' "$1" 2>/dev/null | tr -d '\r\n ' | sha256sum | cut -d' ' -f1; }
imagenes_correctas() {
  local nombre esperado imagen
  while IFS='=' read -r nombre esperado; do
    esperado=${esperado%$'\r'}
    [[ $nombre == capas:* ]] || continue
    imagen=${nombre#capas:}
    docker image inspect "$imagen" >/dev/null 2>&1 || return 1
    [[ $(huella_capas "$imagen") == "$esperado" ]] || return 1
  done < "$RAIZ/VERSION"
  grep -q '^capas:' "$RAIZ/VERSION"
}

cargar_imagenes() {
  if imagenes_correctas; then echo "Imágenes de la versión $APP_VERSION ya cargadas."; return; fi
  local tar
  tar=$(find "$RAIZ/imagenes" -maxdepth 1 -name '*-imagenes.tar.gz' | head -n1)
  [[ -n $tar ]] || fallo "No se encuentra imagenes/*-imagenes.tar.gz."
  docker load -i "$tar"
  imagenes_correctas || fallo "Las imágenes cargadas no coinciden con VERSION: el paquete puede estar dañado."
}

# Valor aleatorio de 64 caracteres hexadecimales.
aleatorio() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

# Propietarios: la API y las operaciones corren como uid 1000 (node); el proxy TLS como uid 101 (nginx).
ajustar_secreto() {
  local archivo=$1 uid=$2
  chown "$uid:$uid" "$archivo"
  chmod 600 "$archivo"
}

preparar_secretos() {
  local s=$RAIZ/secretos
  mkdir -p "$s"; chmod 700 "$s"
  for n in jwt_secret db_password db_owner_password; do
    if [[ ! -s $s/$n ]]; then
      if [[ $ESCENARIO == B && $n != jwt_secret ]]; then
        fallo "Escenario B: falta secretos/$n con la contraseña asignada por el DBA (ver secretos/LEEME.md)."
      fi
      aleatorio > "$s/$n"
      echo "Creado secretos/$n (aleatorio, 0600)."
    fi
    ajustar_secreto "$s/$n" 1000
  done
  if [[ $TLS == propio ]]; then
    local crt key
    crt=$(leer TLS_CERTIFICADO "$s/tls.crt"); key=$(leer TLS_CLAVE "$s/tls.key")
    [[ $crt == /* ]] || crt=$RAIZ/compose/$crt
    [[ $key == /* ]] || key=$RAIZ/compose/$key
    [[ -s $crt && -s $key ]] || fallo "TLS=propio: faltan el certificado y la clave de EsSalud (secretos/tls.crt y secretos/tls.key)."
    ajustar_secreto "$crt" 101; ajustar_secreto "$key" 101
  fi
}

# Dirección local para comprobar el frontend.
url_local() {
  local h=$HTTP_BIND
  [[ $h == 0.0.0.0 || -z $h ]] && h=127.0.0.1
  printf 'http://%s:%s' "$h" "$HTTP_PORT"
}

obtener() { # obtener URL [opciones de curl] → código HTTP
  if command -v curl >/dev/null; then curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"
  else wget -q -O /dev/null --timeout=10 --no-check-certificate "$1" && echo 200 || echo 000; fi
}

# Variables para los scripts de copias (copia.sh → respaldo.sh, restaurar-copia.sh → restaurar.sh, verificar-copia.sh): cliente PostgreSQL efímero en la red del proyecto.
entorno_copias() {
  export PG_DOCKER=1 PG_DOCKER_NETWORK="${PROYECTO}_datos" PG_DOCKER_IMAGE="$POSTGRES_IMAGE"
  export PGDATABASE=$DB_NAME PGUSER=$DB_OWNER_USER DB_PASSWORD_FILE=$RAIZ/secretos/db_owner_password
  if [[ $ESCENARIO == A ]]; then export PGHOST=db PGPORT=5432
  else export PGHOST=$(leer DB_HOST) PGPORT=$(leer DB_PORT 5432); fi
}
