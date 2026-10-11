# LoomIQ 🧵

### Every roll traceable. Every order visible. Every decision informed.

LoomIQ is a textile manufacturing operations and intelligence platform built for the **Odoo x NMIT Hackathon — Textile Manufacturing System Challenge**. It connects inventory, orders, production, quality, dispatch and cost insights in one application, from yarn receipt to finished-fabric shipment.

## ✨ What LoomIQ does

- **Inventory & materials** — Track material lots, receipts, reservations, consumption and low-stock alerts.
- **Orders & buyers** — Manage buyer orders, requirements, deadlines and material readiness, with a buyer portal scoped to each account.
- **Production** — Plan and track manufacturing jobs, machine capacity, availability and downtime.
- **Quality & traceability** — Inspect rolls, record quality decisions and follow each roll through its production and inspection history with a QR-enabled passport.
- **Dispatch** — Ship eligible rolls, including partial orders, with packing lists and dispatch records.
- **Cost intelligence** — Compare estimated and recorded costs and explore quality-related impacts.
- **Operational insights** — Review production risks, quality impacts and read-only what-if scenarios.
- **Role-based access** — Provide workflows for administration, production, stores, quality, dispatch, finance and buyers.

LoomIQ links these workflows together. For example, a rejected roll is excluded from dispatch, affects accepted order quantity and related risk insights, and updates the released quantity visible to the buyer.

## 🧰 Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| UI & data | Tailwind CSS 4, TanStack Query, Lucide |
| Visualizations | Recharts |
| Backend | Python, FastAPI, Pydantic |
| Database | PostgreSQL; SQLite for local development |
| ORM & migrations | SQLAlchemy 2, Alembic |
| Authentication | JWT, bcrypt, role-based permissions |
| Image analysis | OpenCV |
| Tests | Vitest, Playwright browser journeys |

LoomIQ is a standalone application, not an Odoo addon.

## 🚀 Get started

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- Git
- PostgreSQL 14 or newer, if you do not want to use the local SQLite database

### Windows setup (PowerShell)

Clone the repository and enter the project directory:

```powershell
git clone https://github.com/Bavithran-G/LoomIQ.git
Set-Location LoomIQ
```

Create and activate a Python virtual environment, then install the backend dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Install frontend dependencies and build the production UI:

```powershell
Set-Location frontend
npm install
npm run build
Set-Location ..
```

The backend uses `backend\loomiq.db` (SQLite) by default for local development. Seed the demo database and start the API:

```powershell
Set-Location backend
python -m app.seed --reset
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

> ⚠️ `--reset` drops and recreates the configured database before inserting demo data. Do not use it against a database containing data you need to keep.


### Development mode

Keep the backend running as above. In a second PowerShell terminal, start the Vite development server:

```powershell
Set-Location LoomIQ\frontend
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` requests to the backend on port `8000`.

### Optional: PostgreSQL

Create a PostgreSQL database and user, then set the connection string in the PowerShell terminal used to run the seed command and backend:

```powershell
$env:LOOMIQ_DATABASE_URL = "postgresql+psycopg://<user>:<password>@localhost:5432/loomiq"
```

Replace `<user>` and `<password>` with your PostgreSQL credentials. Run `python -m app.seed --reset` from `backend` to apply migrations and load demo data.

### Linux and macOS

The repository includes Bash helper scripts. From the project root, run `scripts/setup.sh` for setup and `scripts/run.sh` to start the built application. To run the API and Vite separately for development, use `scripts/run.sh dev`. On Windows, use the PowerShell instructions above, or run the Bash scripts from WSL or Git Bash.

## 🔐 Demo accounts

All seeded demo accounts use the password `loomiq@2026`.

| Username | Role |
| --- | --- |
| `admin` | Administrator |
| `pm.ravi` | Production Manager |
| `store.meena` | Storekeeper |
| `qc.anitha` | Quality Inspector |
| `dispatch.karthik` | Dispatch Operator |
| `finance.priya` | Finance & Management |
| `buyer.cae` | Buyer — Coimbatore Apparel Exports |
| `buyer.nhl` | Buyer — Nordic Home Linens |

> 🔒 These credentials and the default development secret are for local demonstrations only. Set a strong `LOOMIQ_SECRET_KEY`, replace demo passwords and review deployment settings before exposing the application to other users.

## 🧪 Tests

Run the frontend unit tests:

```powershell
Set-Location frontend
npm test
```

For the browser journeys, install Playwright and its Chromium browser if needed. Keep both the backend and frontend development servers running, then use a separate terminal with the project virtual environment activated:

```powershell
python -m pip install playwright
playwright install chromium
Set-Location backend
python -m app.seed --reset
python ..\e2e\journeys.py
```

The browser journeys exercise the running application and use freshly seeded demo data. The seed reset warning above applies.

## 📂 Project layout

```text
LoomIQ/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   └── services/
│   ├── migrations/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/
│       ├── lib/
│       ├── pages/
│       └── __tests__/
├── e2e/
├── docs/
└── scripts/
```

## 📌 Current limitations

- Fabric image inspection uses a classical computer-vision baseline, not a trained defect-detection model; it has been validated on synthetic images only.
- Machine status is based on application records; there is no IoT or sensor integration.
- The application does not send email or external notifications.
- There is no self-service password reset; administrators manage temporary passwords.
- Packing lists are printable pages rather than generated PDF files.

---

**LoomIQ** — connecting textile operations with clear, traceable insight. 🧵
