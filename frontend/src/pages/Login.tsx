import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, Field, Input, Notice } from '../components/ui'
import KineticGrid from '../components/ui/kinetic-grid'
import { Wordmark } from '../components/brand'
import { ROLES } from '../lib/format'
import { api } from '../lib/api'
import {
  CheckCircle,
  Factory,
  ShieldCheck,
  TrendingUp,
  Truck,
  Package,
  ArrowLeft,
  Sparkles,
  Info,
  UserCheck,
  Layers,
  ChevronRight
} from 'lucide-react'

// Demo accounts organized by Mill Department with quick role context
const DEMO_PERSONAS = [
  {
    category: 'Factory Floor & Operations',
    accounts: [
      {
        label: 'Ravi Shankar',
        username: 'pm.ravi',
        role: 'production_manager',
        title: 'Production Manager',
        badge: 'Floor & Looms',
        desc: 'Monitors machine states, schedules weaving jobs, reviews downtime, tracks order risks.',
      },
      {
        label: 'Meena Kumari',
        username: 'store.meena',
        role: 'storekeeper',
        title: 'Storekeeper',
        badge: 'Yarn Store',
        desc: 'Receives yarn from trucks, tracks lots, FIFO reservations, low-stock warnings.',
      },
      {
        label: 'Anitha Selvam',
        username: 'qc.anitha',
        role: 'quality_inspector',
        title: 'Quality Inspector',
        badge: 'Fabric QC',
        desc: 'Assisted defect scanning, roll grading (pass/fail/rework), QR passport printing.',
      },
      {
        label: 'Karthik Raja',
        username: 'dispatch.karthik',
        role: 'dispatch_operator',
        title: 'Dispatch Operator',
        badge: 'Logistics',
        desc: 'Verifies rolls onto delivery trucks, packing lists, vehicle manifests.',
      },
    ],
  },
  {
    category: 'Management & External Stakeholders',
    accounts: [
      {
        label: 'Asha Raman',
        username: 'admin',
        role: 'admin',
        title: 'System Administrator',
        badge: 'Full Access',
        desc: 'User management, configuration, security and master mill settings.',
      },
      {
        label: 'Priya Natarajan',
        username: 'finance.priya',
        role: 'finance',
        title: 'Finance & Management',
        badge: 'Costing & P&L',
        desc: 'Month-end costing, actual vs estimated cost per metre, what-if simulator.',
      },
      {
        label: 'Coimbatore Apparel',
        username: 'buyer.cae',
        role: 'buyer',
        title: 'Garment Buyer',
        badge: 'Buyer Portal',
        desc: 'Real-time order progress (weaving/inspection/dispatch) without internal cost data.',
      },
      {
        label: 'Nordic Home Linens',
        username: 'buyer.nhl',
        role: 'buyer',
        title: 'Home Textile Buyer',
        badge: 'Buyer Portal',
        desc: 'Accesses packing lists, released roll certificates, and delivery milestones.',
      },
    ],
  },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700 border-purple-200',
  production_manager: 'bg-blue-50 text-blue-700 border-blue-200',
  storekeeper: 'bg-amber-50 text-amber-700 border-amber-200',
  quality_inspector: 'bg-teal-50 text-teal-700 border-teal-200',
  dispatch_operator: 'bg-orange-50 text-orange-700 border-orange-200',
  finance: 'bg-green-50 text-green-700 border-green-200',
  buyer: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

type Tab = 'signin' | 'register'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('signin')

  // sign-in state
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // register state
  const [rName, setRName] = useState('')
  const [rUser, setRUser] = useState('')
  const [rPass, setRPass] = useState('')
  const [rPass2, setRPass2] = useState('')
  const [rRole, setRRole] = useState('storekeeper')
  const [rErr, setRErr] = useState<string | null>(null)
  const [rOk, setROk] = useState(false)
  const [rBusy, setRBusy] = useState(false)

  const roleHome: Record<string, string> = {
    buyer: '/portal',
    finance: '/cost',
    storekeeper: '/inventory',
    quality_inspector: '/quality',
    dispatch_operator: '/dispatch',
    production_manager: '/app',
    admin: '/app',
  }

  const submit = async (username = u, password = p) => {
    setErr(null)
    if (!username || !password) { setErr('Please enter your username and password.'); return }
    setBusy(true)
    try {
      const user = await login(username.trim().toLowerCase(), password)
      nav(roleHome[user.role] ?? '/app', { replace: true })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRErr(null)
    if (!rName.trim()) { setRErr('Full name is required.'); return }
    if (!rUser.trim()) { setRErr('Username is required.'); return }
    if (rPass.length < 8) { setRErr('Password must be at least 8 characters.'); return }
    if (rPass !== rPass2) { setRErr('Passwords do not match.'); return }
    setRBusy(true)
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: {
          full_name: rName.trim(),
          username: rUser.trim().toLowerCase(),
          password: rPass,
          role: rRole,
        },
        auth: false,
      })
      // Immediately log the user in with their new credentials
      const user = await login(rUser.trim().toLowerCase(), rPass)
      nav(roleHome[user.role] ?? '/app', { replace: true })
    } catch (e) {
      setRErr((e as Error).message)
    } finally {
      setRBusy(false)
    }
  }

  return (
    <KineticGrid globalColor="light" className="min-h-screen flex flex-col justify-between">
      {/* ── Top Bar ── */}
      <header className="border-b border-line/50 bg-white/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-ink-3 hover:text-indigo-loom text-[13.5px] font-medium transition-colors">
            <ArrowLeft className="size-4" />
            <span>Back to Overview</span>
          </Link>
          <span className="h-4 w-px bg-line" />
          <Wordmark />
        </div>
        <span className="text-[12.5px] text-ink-3 hidden sm:inline">Everest Textile Mills · Secure Login</span>
      </header>

      {/* ── Main Login Layout ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 grid gap-8 lg:grid-cols-[420px_1fr] items-start relative z-10" style={{ pointerEvents: 'auto' }}>
        {/* Form Card (Sign In / Register) */}
        <div className="rounded-2xl border border-line/50 bg-white/80 backdrop-blur-md shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-line/50 bg-white/40">
            {(['signin', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setErr(null); setRErr(null); setROk(false) }}
                className={`flex-1 py-3.5 text-[14px] font-semibold transition-colors ${
                  tab === t
                    ? 'text-indigo-loom border-b-2 border-indigo-loom bg-white/60'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Register Account'}
              </button>
            ))}
          </div>

          <div className="p-6 sm:p-7">
            {tab === 'signin' ? (
              <>
                <div className="mb-6">
                  <h1 className="text-[22px] font-bold text-indigo-loom">Access Portal</h1>
                  <p className="mt-1 text-[13.5px] text-ink-3">
                    Sign in with your staff account or click any role profile on the right to test instantly.
                  </p>
                </div>

                <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
                  <Field label="Username">
                    {(id) => (
                      <Input
                        id={id}
                        autoComplete="username"
                        value={u}
                        onChange={(e) => setU(e.target.value)}
                        autoFocus
                        placeholder="e.g. pm.ravi or admin"
                      />
                    )}
                  </Field>
                  <Field label="Password">
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        autoComplete="current-password"
                        value={p}
                        onChange={(e) => setP(e.target.value)}
                        placeholder="••••••••"
                      />
                    )}
                  </Field>
                  {err && <Notice tone="bad">{err}</Notice>}
                  <Button variant="primary" type="submit" loading={busy} className="w-full mt-2">
                    Sign In
                  </Button>
                </form>

                <div className="mt-5 rounded-lg border border-line bg-page p-3 text-[12.5px] text-ink-2 flex items-start gap-2">
                  <Info className="size-4 text-indigo-loom shrink-0 mt-0.5" />
                  <span>
                    Judges / Evaluators: All demo accounts use default password <code className="bg-white border border-line px-1 rounded text-indigo-loom font-semibold">loomiq@2026</code>.
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <h1 className="text-[22px] font-bold text-indigo-loom">Staff Registration</h1>
                  <p className="mt-1 text-[13.5px] text-ink-3">
                    Register a new worker or manager account for mill authorization.
                  </p>
                </div>

                {rOk ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <CheckCircle className="size-12 text-ok" />
                    <p className="text-[15px] font-bold text-ink">Account Registered Successfully!</p>
                    <p className="text-[13px] text-ink-3 max-w-xs">
                      For security, new registrations are set as inactive. Log in as <code className="font-semibold text-indigo-loom">admin</code> to activate it in Administration.
                    </p>
                    <Button variant="secondary" onClick={() => { setTab('signin'); setROk(false) }} className="mt-2">
                      Go to Sign In
                    </Button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={handleRegister}>
                    <Field label="Full Name">
                      {(id) => <Input id={id} value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Ramesh Kumar" autoFocus />}
                    </Field>
                    <Field label="Username">
                      {(id) => <Input id={id} value={rUser} onChange={(e) => setRUser(e.target.value)} placeholder="e.g. ramesh.kumar" autoComplete="username" />}
                    </Field>
                    <Field label="Mill Role / Department">
                      {(id) => (
                        <select
                          id={id}
                          value={rRole}
                          onChange={(e) => setRRole(e.target.value)}
                          className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[14px] focus:border-indigo-thread focus:outline-none"
                        >
                          <option value="storekeeper">Storekeeper (Yarn &amp; Stock)</option>
                          <option value="production_manager">Production Manager (Looms &amp; Jobs)</option>
                          <option value="quality_inspector">Quality Inspector (Fabric QC)</option>
                          <option value="dispatch_operator">Dispatch Operator (Logistics)</option>
                          <option value="finance">Finance &amp; Management</option>
                          <option value="buyer">External Buyer</option>
                        </select>
                      )}
                    </Field>
                    <Field label="Password">
                      {(id) => <Input id={id} type="password" value={rPass} onChange={(e) => setRPass(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />}
                    </Field>
                    <Field label="Confirm Password">
                      {(id) => <Input id={id} type="password" value={rPass2} onChange={(e) => setRPass2(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" />}
                    </Field>
                    {rErr && <Notice tone="bad">{rErr}</Notice>}
                    <Button variant="primary" type="submit" loading={rBusy} className="w-full mt-2">
                      Submit Registration
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Demo Accounts Explorer (Persona Guide) ── */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-line/50 bg-white/80 backdrop-blur-md p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 pb-4 mb-5">
              <div>
                <h2 className="text-[18px] font-bold text-indigo-loom flex items-center gap-2">
                  <UserCheck className="size-5 text-[#2BB3A3]" />
                  <span>1-Click Role Exploration (Demo Accounts)</span>
                </h2>
                <p className="text-[13px] text-ink-3 mt-0.5">
                  Click any card below to automatically sign in and see how the mill adapts to each specific role.
                </p>
              </div>
              <span className="rounded-full bg-sunk px-2.5 py-1 text-[11.5px] font-medium text-ink-2">
                8 Pre-configured Roles
              </span>
            </div>

            <div className="space-y-6">
              {DEMO_PERSONAS.map((group) => (
                <div key={group.category}>
                  <h3 className="text-[12px] font-bold uppercase tracking-wider text-ink-3 mb-2.5">
                    {group.category}
                  </h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {group.accounts.map((acc) => (
                      <button
                        key={acc.username}
                        type="button"
                        onClick={() => {
                          setU(acc.username)
                          setP('loomiq@2026')
                          submit(acc.username, 'loomiq@2026')
                        }}
                        className="group flex flex-col justify-between text-left rounded-xl border border-line/60 bg-white/50 hover:bg-white/90 hover:border-indigo-loom/40 hover:shadow-md transition-all p-3.5"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-semibold text-[14px] text-ink group-hover:text-indigo-loom">
                              {acc.label}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium border ${ROLE_COLORS[acc.role]}`}>
                              {acc.badge}
                            </span>
                          </div>
                          <div className="text-[12px] font-medium text-indigo-loom mb-1">
                            {acc.title} · <code className="text-[11.5px] text-ink-3 font-normal">{acc.username}</code>
                          </div>
                          <p className="text-[12px] text-ink-2 leading-relaxed">
                            {acc.desc}
                          </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between pt-2 border-t border-line/60 text-[11.5px] text-indigo-thread font-medium">
                          <span>Sign in as {acc.label.split(' ')[0]}</span>
                          <ChevronRight className="size-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-line/50 bg-white/80 backdrop-blur-md py-4 px-6 text-center text-[12.5px] text-ink-3 relative z-10">
        LoomIQ · Everest Textile Mills Operating System · Odoo NMIT Hackathon 2026
      </footer>
    </KineticGrid>
  )
}
