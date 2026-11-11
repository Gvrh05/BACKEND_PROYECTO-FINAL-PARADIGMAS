#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  printf '%s\n' 'Copia .env.example a .env y configura los secretos antes de continuar.' >&2
  exit 1
fi

compose() {
  docker compose -f docker-compose.yml -f compose.images.yml "$@"
}

compose config --quiet
compose pull
compose up --no-build -d --wait --wait-timeout 300
compose ps --all
