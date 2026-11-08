#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose rm -sfv postgres-test > /dev/null 2>&1 || true
docker compose up -d postgres-test > /dev/null

until [ "$(docker inspect -f '{{.State.Health.Status}}' shizuoka_hamamatsu_postgres_test 2>/dev/null)" = "healthy" ]; do
  sleep 1
done

DOTENV_CONFIG_PATH=.env.test npx prisma migrate deploy --config prisma.config.ts > /dev/null
echo "test database ready on port ${POSTGRES_TEST_PORT:-5433}"
