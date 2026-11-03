#!/usr/bin/env bash
# Comprueba la integridad del paquete (SHA-256 de cada archivo) y los requisitos del servidor.
# Uso: bash scripts/verificar-paquete.sh
set -Eeuo pipefail
RAIZ=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$RAIZ"
[[ -f SHA256SUMS ]] || { echo 'ERROR: falta SHA256SUMS.' >&2; exit 1; }
if ! sha256sum --quiet -c SHA256SUMS; then
  echo 'ERROR: algún archivo no coincide con SHA256SUMS. No instale este paquete; pida una copia nueva.' >&2
  exit 1
fi
echo "Integridad correcta: $(wc -l < SHA256SUMS) archivos verificados."
sed -n '1,4p' VERSION
if command -v docker >/dev/null && docker compose version --short >/dev/null 2>&1; then
  echo "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') · Compose $(docker compose version --short)"
else
  echo 'AVISO: Docker o Docker Compose v2 no están disponibles (o requieren sudo).' >&2
fi
