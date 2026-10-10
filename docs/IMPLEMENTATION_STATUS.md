# Implementation status

"Verified" means it was exercised by an automated test (pytest = API, e2e = Playwright browser journey) or checked manually in the browser (UI). Last full verification: 10 Oct 2026.

## Core workflow

| Requirement | Status | Evidence |
|---|---|---|
| One shared PostgreSQL database, Alembic migration | Done | `migrations/`, seed runs `alembic upgrade head` |
| Auth with bcrypt + JWT, 7 roles, server-side permissions | Done | pytest `test_auth`, `test_role_enforcement` |
| Orders: create, edit (fields locked after confirm), search/filter, hold/resume/cancel, event history | Done | pytest `test_status_transitions`; e2e order journey |
| Duplicate-order prevention (buyer + buyer PO unique) | Done | pytest + e2e |
| Quantity and date validation | Done | pytest `test_order_validation_and_duplicates` |
| Material requirement and availability check (before saving and per order) | Done | UI, pytest |
| Stock: receipt (incl. against PO), FIFO reservation, consumption on weaving completion, adjustments with reason, movement log, low-stock alerts, on-order quantities | Done | pytest `test_stock_rules`, `test_full_manufacturing_flow` |
| No negative stock; consumption is transactional | Done | pytest `test_consumption_is_transactional` |
| Configurable stages (spinning off by default; dyeing can be turned off) | Done | Admin → Production stages |
| Jobs: plan with capacity and machine checks, start, pause, resume, complete, cancel, downtime, delay reasons | Done | pytest `test_capacity_and_machine_rules`; UI |
| Rolls created at weaving completion, moved by stage jobs | Done | pytest |
| Inspection: upload validation (type, size), CV baseline, manual fallback, analysis-failure fallback, suggestion and decision stored separately, authorised review | Done | pytest `test_upload_validation`; e2e inspect journey |
| Rework completion (cost booked once), scrap disposition | Done | pytest `test_rework_cost_charged_once` |
| Dispatch: eligibility rules, duplicate protection, vehicle required, transactional confirmation, partial shipments, packing list | Done | pytest; e2e dispatch journey |
| Cost ledger: estimates vs actuals, cost per accepted metre, no double counting | Done | pytest |
| Buyer portal scoped on the server, no internal fields | Done | pytest `test_buyer_isolation`; e2e |
| Command centre: KPIs, date/shift/search filters, alerts, charts, event feed, click-through | Done | pytest `test_dashboard_filters`; UI |

## Innovation modules

| Module | Status | Notes |
|---|---|---|
| AI inspection | Done, as a baseline | Classical CV; no trained model available. Labelled as unvalidated everywhere; no fabricated confidence |
| Digital roll passport + QR | Done | Token-protected public verification page; camera scanning where the browser supports BarcodeDetector, typed lookup otherwise |
| Explainable risk engine | Done | Deterministic; unknown and low-confidence states |
| Quality Impact Chain | Done | Built from real records; basis and rule shown per node |
| What-if simulator | Done | In-memory, read-only (pytest `test_simulator_is_isolated`) |
| Waste recovery recommendations | Done | Suggestions only; dispositions need authorised actions |

## Not done / limitations

- No trained fabric-defect model; the baseline was validated on synthetic images only.
- No IoT or sensor integration; machine status is simulated from records.
- No email or notification delivery outside the app (in-app notification bell only).
- No password-reset flow (admins set temporary passwords).
- Packing list is a printable page, not a generated PDF.
- The supplied brief stopped mid-section 9; items after that were completed with defaults (tests, README, demo accounts, setup scripts).
