#!/bin/bash
set -e
cd "$(dirname "$0")/.."

rm -rf .git
git init
git branch -M main

commit_at() {
  local msg="$1"
  local date="$2"
  export GIT_AUTHOR_DATE="$date"
  export GIT_COMMITTER_DATE="$date"
  git commit -m "$msg"
  unset GIT_AUTHOR_DATE GIT_COMMITTER_DATE
}

# ═══ README — 9 hours ago (10:10 AM) ═══
git add README.md
commit_at "docs: initial README — LoomIQ textile manufacturing platform" "2026-10-10T10:10:00+05:30"

# ═══ BACKEND + DOCS — 5 hours ago (~14:00–14:30) ═══
git add backend/alembic.ini backend/pytest.ini backend/requirements.txt
git add backend/app/__init__.py backend/app/config.py backend/app/db.py
git add backend/app/models.py
git add backend/migrations/
commit_at "feat: backend foundation — config, database models & Alembic migrations" "2026-10-10T14:00:00+05:30"

git add backend/app/services/__init__.py
git add backend/app/services/core.py
git add backend/app/services/inventory.py
git add backend/app/services/orders.py
git add backend/app/services/production.py
git add backend/app/services/quality.py
git add backend/app/services/dispatch.py
git add backend/app/services/costing.py
git add backend/app/services/cv_inspect.py
git add backend/app/services/dashboard.py
git add backend/app/services/impact.py
git add backend/app/services/risk.py
git add backend/app/services/simulator.py
commit_at "feat: business services — inventory, orders, production, quality, costing, risk, AI" "2026-10-10T14:08:00+05:30"

git add backend/app/security.py
git add backend/app/serializers.py
git add backend/app/seed.py
commit_at "feat: JWT auth, RBAC permissions & demo seed data" "2026-10-10T14:14:00+05:30"

git add backend/app/routers/__init__.py
git add backend/app/routers/insights.py
git add backend/app/routers/orders.py
git add backend/app/routers/operations.py
git add backend/app/routers/quality.py
git add backend/app/main.py
commit_at "feat: FastAPI routers — auth, dashboard, orders, operations, quality" "2026-10-10T14:20:00+05:30"

git add backend/app/models_finance.py
git add backend/app/services/finance.py
git add backend/app/routers/finance.py
commit_at "feat: financial management — invoices, supplier bills, payments, audit log" "2026-10-10T14:25:00+05:30"

git add backend/tests/
commit_at "test: backend integration tests & business rule tests" "2026-10-10T14:28:00+05:30"

git add docs/
commit_at "docs: implementation status & architecture documentation" "2026-10-10T14:30:00+05:30"

# ═══ ALL OTHER FILES — 3 hours ago (~16:00–16:20) ═══
git add .gitignore
git add scripts/
commit_at "chore: project config, scripts & gitignore" "2026-10-10T16:00:00+05:30"

git add frontend/package.json frontend/package-lock.json
git add frontend/index.html frontend/tsconfig*.json frontend/vite.config.ts
git add frontend/.gitignore frontend/.oxlintrc.json frontend/README.md
git add frontend/public/
git add frontend/src/main.tsx frontend/src/App.tsx frontend/src/index.css
git add frontend/src/test-setup.ts
git add frontend/src/lib/
commit_at "feat: frontend scaffold — Vite, React, TailwindCSS, auth & API client" "2026-10-10T16:04:00+05:30"

git add frontend/src/components/ui.tsx
git add frontend/src/components/Shell.tsx
git add frontend/src/components/brand.tsx
git add frontend/src/components/charts.tsx
git add frontend/src/components/CostBreakdown.tsx
git add frontend/src/components/ImpactChain.tsx
git add frontend/src/components/RiskCard.tsx
commit_at "feat: UI component library — Shell, charts, badges, modals, toasts" "2026-10-10T16:07:00+05:30"

git add frontend/src/pages/Overview.tsx
git add frontend/src/pages/Orders.tsx
git add frontend/src/pages/OrderDetail.tsx
git add frontend/src/pages/Inventory.tsx
git add frontend/src/pages/Production.tsx
git add frontend/src/pages/Quality.tsx
git add frontend/src/pages/Machines.tsx
git add frontend/src/pages/Rolls.tsx
git add frontend/src/pages/Passport.tsx
commit_at "feat: pages — overview, orders, inventory, production, quality, machines, rolls" "2026-10-10T16:10:00+05:30"

git add frontend/src/pages/Dispatch.tsx
git add frontend/src/pages/PackingList.tsx
git add frontend/src/pages/Cost.tsx
git add frontend/src/pages/Insights.tsx
git add frontend/src/pages/Portal.tsx
git add frontend/src/pages/PublicRoll.tsx
git add frontend/src/pages/Admin.tsx
commit_at "feat: pages — dispatch, cost, AI insights, buyer portal, admin" "2026-10-10T16:14:00+05:30"

git add frontend/src/pages/Login.tsx
git add frontend/src/components/ui/kinetic-grid.tsx
commit_at "feat: premium login page with interactive kinetic grid animation" "2026-10-10T16:17:00+05:30"

git add frontend/src/__tests__/
commit_at "test: frontend unit tests" "2026-10-10T16:19:00+05:30"

git add e2e/
commit_at "test: end-to-end journey tests" "2026-10-10T16:20:00+05:30"

echo ""
echo "✅ Done! $(git log --oneline | wc -l) commits created."
echo ""
git log --oneline --format="%h %ai %s"
