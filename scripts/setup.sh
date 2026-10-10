#!/usr/bin/env bash
# One-time setup: Python deps, PostgreSQL database, migrations + demo data, frontend build.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Python dependencies"
python3 -m pip install -q -r backend/requirements.txt
if [ -z "${LOOMIQ_DATABASE_URL:-}" ]; then
  echo "==> PostgreSQL database 'loomiq' (user loomiq / password loomiq)"
  if command -v psql >/dev/null; then
    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='loomiq'" | grep -q 1 \
      || sudo -u postgres psql -c "CREATE USER loomiq WITH PASSWORD 'loomiq' CREATEDB;"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='loomiq'" | grep -q 1 \
      || sudo -u postgres psql -c "CREATE DATABASE loomiq OWNER loomiq;"
    sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='loomiq_test'" | grep -q 1 \
      || sudo -u postgres psql -c "CREATE DATABASE loomiq_test OWNER loomiq;"
  else
    echo "    psql not found. Falling back to SQLite (local development only)."
    export LOOMIQ_DATABASE_URL="sqlite:///$(pwd)/backend/loomiq.db"
    echo "    export LOOMIQ_DATABASE_URL=$LOOMIQ_DATABASE_URL  # add this to your shell"
  fi
fi

echo "==> Migrations + demo data"
(cd backend && python3 -m app.seed --reset)

echo "==> Frontend"
(cd frontend && npm install --silent && npm run build)
echo "Done. Start with: scripts/run.sh   (then open http://localhost:8000)"
