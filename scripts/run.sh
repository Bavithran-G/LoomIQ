#!/usr/bin/env bash
# Run LoomIQ.
#   scripts/run.sh        single port: API + built UI on http://localhost:8000 (demo mode)
#   scripts/run.sh dev    API on :8000 with reload + Vite dev server on http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "dev" ]; then
  echo "▶  Starting backend (uvicorn) on :8000..."
  (cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &
  BACKEND_PID=$!
  trap 'kill $BACKEND_PID 2>/dev/null' EXIT

  # Wait until backend is ready (up to 30s)
  echo "⏳ Waiting for backend to be ready..."
  for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
      echo "✅ Backend is up!"
      break
    fi
    sleep 1
  done

  echo "▶  Starting frontend (Vite) on :5173..."
  (cd frontend && npm run dev -- --host 0.0.0.0)
else
  [ -d frontend/dist ] || (cd frontend && npm run build)
  cd backend && exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
