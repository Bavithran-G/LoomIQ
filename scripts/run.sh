#!/usr/bin/env bash
# Run LoomIQ.
#   scripts/run.sh        single port: API + built UI on http://localhost:8000 (demo mode)
#   scripts/run.sh dev    API on :8000 with reload + Vite dev server on http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "dev" ]; then
  (cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &
  trap 'kill %1' EXIT
  (cd frontend && npm run dev -- --host 0.0.0.0)
else
  [ -d frontend/dist ] || (cd frontend && npm run build)
  cd backend && exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
