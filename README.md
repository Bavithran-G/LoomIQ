# LoomIQ 🧵

### Every roll traceable. Every order visible. Every decision informed.

LoomIQ is a textile manufacturing management system built for the **Odoo x NMIT Hackathon — Textile Manufacturing System Challenge**.

It connects the complete textile manufacturing process in one platform, from yarn receipt to finished fabric dispatch.

Instead of managing stock in notebooks, checking machines manually, recording quality on paper and updating buyers through phone calls, LoomIQ brings everything together in one system.

## 🚀 Features

- **Smart Inventory Management** – Track yarn stock, material lots, receipts, reservations and low-stock alerts.
- **Order Management** – Manage buyer orders, deadlines, fabric requirements and material readiness.
- **Production Monitoring** – Track spinning, weaving, dyeing and finishing jobs, machine status and production progress.
- **Quality Inspection** – Inspect fabric rolls, record defects and classify rolls as pass, rework or reject.
- **QR Roll Passport** – Trace every roll back to its order, machine, production job, yarn lots and inspection history.
- **Dispatch Management** – Manage finished stock, partial shipments, packing lists and dispatch confirmation.
- **Cost Intelligence** – Compare estimated and recorded production costs, including the impact of rejected fabric.
- **Production Delay Radar** – Identify order risks using explainable, rule-based analysis.
- **Quality Impact Chain** – Understand how a rejected roll affects accepted quantity, order shortfall, dispatch risk and cost.
- **What-if Simulator** – Explore machine downtime and rejection scenarios without changing actual production records.
- **Buyer Portal** – Allow buyers to track their own orders, released rolls and packing lists.
- **Role-Based Access** – Separate access for administrators, production, stores, quality, dispatch, finance and buyers.

## 💡 What makes LoomIQ different?

LoomIQ connects factory operations instead of treating every department separately.

For example, when a quality inspector rejects a fabric roll:

- The rejected roll becomes unavailable for dispatch.
- The order's accepted quantity and quality shortfall are updated.
- Replacement requirements and dispatch risks are recalculated.
- Quality-related costs are reflected in the relevant insights.
- Buyers see the updated released quantity for their order.

Every operational event contributes to a connected view of the factory.

## 🛠️ Tech Stack

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| Frontend         | React 19, TypeScript, Vite          |
| UI               | Tailwind CSS 4, Lucide Icons        |
| Data Fetching    | TanStack Query                      |
| Charts           | Recharts                            |
| Backend          | Python, FastAPI, Pydantic           |
| Database         | PostgreSQL                          |
| ORM & Migrations | SQLAlchemy 2, Alembic               |
| Authentication   | JWT, bcrypt, role-based permissions |
| Image Analysis   | OpenCV                              |
| Testing          | Pytest, Vitest, Playwright          |

SQLite is supported as a local-development fallback. The project uses PostgreSQL for its main database setup.

**Note:** LoomIQ is an independent application, not an Odoo addon, because the hackathon allowed the use of other technology stacks.

## ⚙️ Installation and Setup

### Requirements

Make sure the following are installed:

- Python 3.11 or later
- Node.js 20 or later
- PostgreSQL 14 or later (or use the documented SQLite fallback)
- Git

### 1. Clone the repository

```bash
git clone <your-github-repository-url>
cd loomiq
```

Replace the URL with your actual GitHub repository URL.

### 2. Set up the project

```bash
scripts/setup.sh
```

This script is intended to install dependencies, configure the database, run migrations, generate demo data and build the frontend.

Follow any prompts or environment configuration instructions shown by the script.

### 3. Start LoomIQ

```bash
scripts/run.sh
```

Open the application at:

**http://localhost:8000**

To run the backend and frontend in development mode:

```bash
scripts/run.sh dev
```

The API runs on port `8000`, and the frontend development server runs on port `5173`.

### Manual Setup

If you prefer to configure the application manually:

**Backend**

```bash
cd backend
pip install -r requirements.txt
```

Local development uses `backend/loomiq.db` by default, so PostgreSQL is not
required. To use PostgreSQL instead, set `LOOMIQ_DATABASE_URL` before running
the seed command and backend:

```dotenv
LOOMIQ_DATABASE_URL=postgresql+psycopg://loomiq:loomiq@localhost:5432/loomiq
```

Make sure the PostgreSQL server, database and user exist before selecting this
option. In PowerShell, set the variable for the current terminal with:

```powershell
$env:LOOMIQ_DATABASE_URL = "postgresql+psycopg://loomiq:loomiq@localhost:5432/loomiq"
```

Generate demo data and apply migrations:

```bash
python -m app.seed --reset
```

Start the backend:

```bash
uvicorn app.main:app --port 8000
```

**Frontend**

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

API documentation is available at:

http://localhost:8000/docs

## 🔐 Demo Login Credentials

All demo accounts use the password:

```text
loomiq@2026
```

| Username           | Role                               |
| ------------------ | ---------------------------------- |
| `admin`            | Administrator                      |
| `pm.ravi`          | Production Manager                 |
| `store.meena`      | Storekeeper                        |
| `qc.anitha`        | Quality Inspector                  |
| `dispatch.karthik` | Dispatch Operator                  |
| `finance.priya`    | Finance & Management               |
| `buyer.cae`        | Buyer — Coimbatore Apparel Exports |
| `buyer.nhl`        | Buyer — Nordic Home Linens         |

These credentials are for demonstration only. Change default passwords and the secret key before any shared or production deployment.

## 🏗️ Project Structure

```text
loomiq/
├── backend/
│   ├── app/
│   │   ├── models.py
│   │   ├── security.py
│   │   ├── seed.py
│   │   ├── routers/
│   │   └── services/
│   ├── migrations/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── lib/
│       └── __tests__/
├── e2e/
│   └── journeys.py
├── docs/
│   └── IMPLEMENTATION_STATUS.md
├── scripts/
│   ├── setup.sh
│   └── run.sh
└── README.md
```

### Main Backend Services

- `inventory.py` – Stock, receipts, reservations and material consumption.
- `orders.py` – Order lifecycle and material readiness.
- `production.py` – Production jobs, machine capacity and job transitions.
- `quality.py` – Roll inspection, rework and quality decisions.
- `dispatch.py` – Shipment eligibility and dispatch confirmation.
- `costing.py` – Estimated and recorded production costs.
- `risk.py` – Rule-based production delay assessment.
- `impact.py` – Quality impact analysis.
- `simulator.py` – What-if production scenarios.
- `dashboard.py` – Operational insights and reporting.
- `cv_inspect.py` – Classical computer-vision image analysis.

## 📏 Important Business Rules

- **Stock is tracked by material lot.** Receipts, reservations, consumption and stock movements maintain inventory history.
- **Material is consumed through production events.** Insufficient stock must prevent an invalid completion.
- **Production follows explicit state transitions.** Orders progress through business events rather than arbitrary status changes.
- **Machine capacity is enforced.** Jobs must respect machine availability, shift capacity and breakdown or maintenance states.
- **Quality decisions control dispatch.** Rejected rolls cannot be shipped, and rework requires the appropriate subsequent inspection.
- **Partial dispatch is supported.** Only eligible rolls belonging to the correct order may be shipped.
- **Costs are linked to source events.** Reprocessing an existing event should not duplicate its cost.
- **Access is role-based.** Buyers are restricted to their own permitted information, and public QR verification does not expose internal factory records.

## 🧪 Testing

### Backend Tests

```bash
cd backend
pytest -q
```

The test suite is intended to cover API behaviour, authentication and core business rules using PostgreSQL and the configured test database.

### Frontend Tests

```bash
cd frontend
npm test
```

### End-to-End Tests

Start the backend and frontend, then run the browser journeys using the repository's documented environment and seed instructions:

```bash
python -m app.seed --reset
python ../e2e/journeys.py
```

Run the end-to-end command from the directory expected by the repository configuration. These journeys require the application servers and browser dependencies to be available.

## ⚠️ Limitations

- **Quality inspection:** The current OpenCV implementation is an experimental anomaly-detection baseline, not a trained or validated fabric-defect model. It reports heuristic scores rather than probabilities and requires a human inspector's decision.
- **Machine monitoring:** Machine status is derived from job records and manual state changes. Live IoT sensor integration is not available.
- **Production risk:** The delay-risk engine uses deterministic rules, not a trained predictive model.
- **What-if simulation:** The simulator uses simplified shift-based assumptions. Its results are estimates, not guaranteed production outcomes.
- **Cost calculations:** Demo costs use configured standard rates and synthetic demo data; they are not actual mill financial figures.
- **Security:** The development secret key and demo credentials must be replaced before shared deployment.

## 🔧 Environment Variables

| Variable               | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `LOOMIQ_DATABASE_URL`  | Database connection URL                                       |
| `LOOMIQ_SECRET_KEY`    | Secret used for authentication; replace the development value |
| `LOOMIQ_STORAGE_DIR`   | Storage directory for inspection images                       |
| `LOOMIQ_MAX_UPLOAD_MB` | Maximum image upload size                                     |
| `LOOMIQ_FRONTEND_URL`  | Optional frontend URL for generated QR links                  |

Do not commit `.env` files, passwords, database credentials or production secrets to GitHub.

## 🎯 Project Goal

LoomIQ aims to make textile manufacturing more connected, transparent and easier to manage.

By linking inventory, production, quality, dispatch and cost intelligence, the platform helps factory teams identify problems earlier, trace defects, track buyer orders and make better operational decisions.

**LoomIQ — Every roll traceable. Every order visible. Every decision informed.** 🧵
