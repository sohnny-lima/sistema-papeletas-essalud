#!/usr/bin/env bash
# Construye el paquete de instalación independiente a partir de una referencia de Git (etiqueta o commit).
# Las imágenes se construyen desde «git archive» de esa referencia: corresponden exactamente al código
# registrado, sin archivos sueltos del árbol de trabajo. No publica nada en registros.
# Uso (Linux o WSL, con Docker y Git):
#   bash deploy/scripts/construir-paquete.sh <referencia> <version> <carpeta_destino>
#   p. ej.: bash deploy/scripts/construir-paquete.sh v1.0.0-rc.2 1.0.0-rc.2 /ruta/paquetes
set -Eeuo pipefail
umask 022
[[ $# == 3 ]] || { echo 'Uso: construir-paquete.sh <referencia> <version> <carpeta_destino>' >&2; exit 2; }
ref=$1; version=$2; destino=$3
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.[0-9]+)?$ ]] || { echo "Versión inválida: $version" >&2; exit 2; }
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
git_() { git -c safe.directory="$repo" -C "$repo" "$@"; }
commit=$(git_ rev-parse --verify "$ref^{commit}")
POSTGRES_ORIGEN=postgres:17.11-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5
POSTGRES_ETIQUETA=postgres:17.11-bookworm
nombre=papeletas-essalud-$version
salida=$destino/$nombre
[[ ! -e $salida && ! -e $salida.tar.gz ]] || { echo "Ya existe $salida: use otra carpeta o bórrela antes." >&2; exit 1; }
tmp=$(mktemp -d)
completado=false
# Si algo falla, no queda un paquete a medias que pueda tomarse por válido.
trap 'rm -rf "$tmp"; $completado || rm -rf "$salida" "$salida.tar.gz" "$salida.tar.gz.sha256"' EXIT

echo "== Código de $ref ($commit)"
mkdir -p "$tmp/src"
git_ archive --format=tar "$commit" | tar -x -C "$tmp/src"
src=$tmp/src
# La versión del código debe ser la del paquete.
for p in backend-papeletas frontend-papeletas; do
  v=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$src/$p/package.json" | head -n1 | tr -d '\r')
  [[ $v == "$version" ]] || { echo "$p/package.json dice $v, no $version." >&2; exit 1; }
done

echo "== Imágenes (docker build, sin etiquetas de Compose)"
meta=(--build-arg "APP_VERSION=$version" --build-arg "VCS_REF=$commit" --build-arg SOURCE_URL=entrega-essalud)
docker build --pull=false --target produccion "${meta[@]}" -t "essalud/backend:$version" "$src/backend-papeletas"
docker build --pull=false "${meta[@]}" -t "essalud/frontend:$version" "$src/frontend-papeletas"
docker image inspect "$POSTGRES_ORIGEN" >/dev/null 2>&1 || docker pull "$POSTGRES_ORIGEN"
docker tag "$POSTGRES_ORIGEN" "$POSTGRES_ETIQUETA"

echo "== Comprobación de contenido de la imagen de producción del backend"
if docker run --rm --entrypoint sh "essalud/backend:$version" -c 'ls db/demo scripts/cargar-demo.js 2>/dev/null | grep -q .'; then
  echo 'La imagen de producción contiene datos de demostración.' >&2; exit 1
fi

echo "== Estructura del paquete"
mkdir -p "$salida"/{imagenes,compose/proxy,secretos,scripts,documentacion}
p=$src/deploy/paquete
cp "$p/LEEME.txt" "$salida/"
cp "$p/compose/compose.prod.yml" "$p/compose/compose.prod.db.yml" "$p/compose/compose.prod.tls.yml" "$p/compose/env.example" "$salida/compose/"
cp "$p/compose/proxy/nginx-tls.conf.template" "$salida/compose/proxy/"
cp "$p/secretos/LEEME.md" "$salida/secretos/"
cp "$p"/scripts/*.sh "$salida/scripts/"
cp "$src"/deploy/scripts/{comun,respaldo,restaurar,verificar-respaldo,obtener-esquema}.sh "$salida/scripts/"
cp "$p"/documentacion/*.md "$salida/documentacion/"
cp "$src"/docs/entrega/{configuracion,base-de-datos,manual-uso}.md "$salida/documentacion/"
cp "$src"/docs/entrega/propuestas/{acerca-del-sistema,acta-entrega-recepcion,condiciones-de-uso}.md "$salida/documentacion/"
sed -i "s/^APP_VERSION=.*/APP_VERSION=$version/" "$salida/compose/env.example"
chmod 700 "$salida/secretos"
chmod 755 "$salida"/scripts/*.sh

echo "== Exportación de imágenes (docker save | gzip)"
docker save "essalud/frontend:$version" "essalud/backend:$version" "$POSTGRES_ETIQUETA" | gzip -6 > "$salida/imagenes/$nombre-imagenes.tar.gz"

{
  echo "version=$version"
  echo "fecha=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "referencia=$ref"
  echo "commit=$commit"
  for i in "essalud/frontend:$version" "essalud/backend:$version" "$POSTGRES_ETIQUETA"; do
    # «capas» (contenido) es lo que comprueba el instalador; «id» depende del almacén de imágenes y es informativo.
    echo "capas:$i=$(docker image inspect --format '{{json .RootFS.Layers}}' "$i" | tr -d '\r\n ' | sha256sum | cut -d' ' -f1)"
    echo "id:$i=$(docker image inspect --format '{{.Id}}' "$i")"
  done
  echo "postgres_origen=$POSTGRES_ORIGEN"
} > "$salida/VERSION"

echo "== Exclusiones obligatorias"
if find "$salida" \( -name '.git' -o -name '.env' -o -name '*.spec.ts' -o -name '*.test.js' -o -name 'node_modules' -o -name '*.dump' -o -name '*.pem' -o -name '*.key' -o -name '*.crt' -o -name 'jwt_secret' -o -name 'db_*password' \) | grep -q .; then
  echo 'El paquete contiene archivos prohibidos.' >&2; exit 1
fi

echo "== SHA-256"
(cd "$salida" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
tar -C "$destino" -czf "$salida.tar.gz" "$nombre"
(cd "$destino" && sha256sum "$nombre.tar.gz" > "$nombre.tar.gz.sha256")
completado=true
echo
echo "Paquete: $salida.tar.gz"
cat "$destino/$nombre.tar.gz.sha256"
