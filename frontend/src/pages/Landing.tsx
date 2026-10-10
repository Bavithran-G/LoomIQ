import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KineticGrid from '../components/ui/kinetic-grid'
import { Wordmark } from '../components/brand'
import {
  Factory,
  ShieldCheck,
  TrendingUp,
  Truck,
  Package,
  Layers,
  ArrowRight,
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Cpu,
  BarChart3,
  Flame,
  Check
} from 'lucide-react'

export default function Landing() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState<'problem' | 'solution'>('solution')

  const workflowSteps = [
    {
      step: '01',
      title: 'Yarn Arrival & GRN',
      tag: 'Raw Materials',
      desc: 'Gate verification of supplier lots, automated FIFO yarn reservation, and low-stock warning thresholds before stockouts occur.',
      icon: Package,
    },
    {
      step: '02',
      title: 'Intelligent Job Planning',
      tag: 'Production Shed',
      desc: 'Capacity-constrained scheduling across air-jet looms, dyeing jiggers, and finishing stenters with shift-level downtime tracking.',
      icon: Factory,
    },
    {
      step: '03',
      title: 'Roll Passport & Quality',
      tag: 'AI Inspection',
      desc: 'Individual QR digital passports tracking yarn lots, loom ID, and computer-vision assisted defect scanning with human reviewer sign-off.',
      icon: ShieldCheck,
    },
    {
      step: '04',
      title: 'Dispatch & Cost Intelligence',
      tag: 'Buyer Delivery',
      desc: 'Partial shipment reconciliation, anti-double dispatch safeguards, and instant actual vs. standard cost-per-metre profitability analysis.',
      icon: Truck,
    },
  ]

  const metrics = [
    { label: 'Yarn Traceability', val: '100%', sub: 'Lot-to-roll provenance' },
    { label: 'Dispatch Errors', val: '0%', sub: 'Protected by QR validation' },
    { label: 'Order Visibility', val: 'Instant', sub: 'No floor walking needed' },
    { label: 'Cost Calculation', val: 'Real-Time', sub: 'Embedded defect loss tracking' },
  ]

  const comparisons = [
    {
      before: 'Notebook records for yarn lots with frequent unrecorded stockouts',
      after: 'Live lot-level inventory with automatic FIFO reservations & low stock alerts',
    },
    {
      before: 'Walking the noisy mill floor to see which looms are stopped or running',
      after: 'Central Command Centre showing machine state, shift targets, and downtime',
    },
    {
      before: 'Paper slips for fabric inspections that get lost or misplaced',
      after: 'QR Digital Roll Passports with CV anomaly scanning and quality audit trails',
    },
    {
      before: 'Buyers calling repeatedly asking when their fabric will be delivered',
      after: 'Self-service Buyer Portal with live order progress, released rolls, and packing lists',
    },
    {
      before: 'Month-end panic trying to calculate real costs per metre across jobs',
      after: 'Granular Cost Ledger tracking material lot cost, labour, and rework costs automatically',
    },
  ]

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1a2333] selection:bg-indigo-loom selection:text-white">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Wordmark />
            <span className="hidden rounded-full border border-line bg-sunk/60 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-2 md:inline-block">
              Everest Textile Mills OS
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => nav('/login')}
              className="text-[14px] font-semibold text-ink-2 hover:text-indigo-loom transition-colors px-3 py-2"
            >
              Sign In
            </button>
            <button
              onClick={() => nav('/login')}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-loom px-4 py-2 text-[14px] font-medium text-white shadow-sm hover:bg-indigo-deep transition-all"
            >
              <span>Launch App</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative border-b border-line" style={{ minHeight: '92vh' }}>
        <KineticGrid
          className="min-h-[92vh]"
          globalColor="default"
        >
          {/* Gradient overlay at bottom to blend into next section */}
          <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none bg-gradient-to-t from-black/40 to-transparent z-[5]" />

          <div className="relative flex flex-col items-center justify-center min-h-[92vh] px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[13px] font-medium text-white/80 mb-6 backdrop-blur-sm">
              <Sparkles className="size-3.5 text-[#2BB3A3]" />
              <span>Built for Odoo Hackathon · Replacing Notebooks &amp; Phone Calls</span>
            </div>

            <h1 className="mx-auto max-w-4xl font-display text-[42px] leading-[1.08] font-bold text-white sm:text-[56px] lg:text-[64px] drop-shadow-lg">
              The Digital Backbone of a Busy Fabric Factory
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-white/70 sm:text-[19px]">
              LoomIQ unifies yarn procurement, loom floor scheduling, AI-assisted quality inspection,{' '}
              and roll dispatch on <strong className="text-white">one synchronized database</strong> for Everest Textile Mills.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-4" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={() => nav('/login')}
                className="flex items-center gap-2 rounded-xl bg-[#4a9eff] px-6 py-3.5 text-[15.5px] font-semibold text-white shadow-lg shadow-[#4a9eff]/30 hover:bg-[#3a8aee] transition-all transform active:scale-[0.98]"
              >
                <span>Explore With Demo Accounts</span>
                <ArrowRight className="size-4 text-[#2BB3A3]" />
              </button>
              <a
                href="#workflow"
                className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 backdrop-blur-sm px-6 py-3.5 text-[15.5px] font-semibold text-white shadow-sm hover:bg-white/20 transition-all"
              >
                <span>See Day-at-the-Mill Workflow</span>
                <ChevronRight className="size-4" />
              </a>
            </div>

            {/* Quick Stats banner */}
            <div className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-4xl mx-auto" style={{ pointerEvents: 'auto' }}>
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-md p-4 text-center shadow-xs">
                  <div className="font-display text-[26px] font-bold text-[#4a9eff]">{m.val}</div>
                  <div className="text-[13px] font-semibold text-white">{m.label}</div>
                  <div className="text-[11.5px] text-white/50 mt-0.5">{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </KineticGrid>
      </section>

      {/* ── Problem vs Solution (Everest Textile Mills Reality) ── */}
      <section className="py-20 lg:py-28 bg-white border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-[32px] sm:text-[40px] font-bold text-indigo-loom">
              How Everest Textile Mills Runs: Today vs. LoomIQ
            </h2>
            <p className="mt-3 text-[16px] text-ink-2">
              Replacing notebooks, paper slips, and shouted phone calls with continuous digital traceability.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {comparisons.map((item, idx) => (
              <div key={idx} className="flex flex-col justify-between rounded-xl border border-line bg-page p-5 shadow-xs">
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-bad">
                    <span className="size-2 rounded-full bg-bad"></span>
                    <span>Old Way (Paper & Notebooks)</span>
                  </div>
                  <p className="mt-2 text-[14px] text-ink-2 leading-snug">
                    {item.before}
                  </p>
                </div>

                <div className="pt-4 border-t border-line-strong/60">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ok">
                    <CheckCircle2 className="size-3.5 text-ok" />
                    <span>With LoomIQ</span>
                  </div>
                  <p className="mt-2 text-[14px] font-medium text-ink leading-snug">
                    {item.after}
                  </p>
                </div>
              </div>
            ))}

            {/* Callout box */}
            <div className="rounded-xl border border-indigo-loom/20 bg-indigo-loom p-6 text-white flex flex-col justify-between">
              <div>
                <span className="inline-block rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#2BB3A3]">
                  Unified Database
                </span>
                <h3 className="text-[20px] font-bold text-white mt-3">Zero Data Duplication</h3>
                <p className="mt-2 text-[13.5px] text-[#c4d0e4] leading-relaxed">
                  When a quality inspector marks a roll as rejected, the order's accepted metres drops, yarn consumption is locked, risk score recalculates, and dispatch is instantly blocked.
                </p>
              </div>
              <button
                onClick={() => nav('/login')}
                className="mt-6 flex items-center justify-between rounded-lg bg-white/10 px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-white/20 transition-all"
              >
                <span>Try Live System</span>
                <ArrowRight className="size-4 text-[#2BB3A3]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow Journey ── */}
      <section id="workflow" className="py-20 lg:py-28 bg-[#f5f7fa] border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="rounded-full bg-indigo-mist/20 px-3 py-1 text-[12px] font-semibold text-indigo-loom">
              End-to-End Mill Journey
            </span>
            <h2 className="mt-3 text-[32px] sm:text-[40px] font-bold text-indigo-loom">
              A Day at the Mill, Fully Digitized
            </h2>
            <p className="mt-3 text-[16px] text-ink-2">
              Every stage of fabric production connects directly into downstream records.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((st) => (
              <div key={st.step} className="relative rounded-2xl border border-line bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-display text-[26px] font-bold text-indigo-loom/25">{st.step}</span>
                    <div className="grid size-10 place-items-center rounded-xl bg-indigo-mist/15 text-indigo-loom">
                      <st.icon className="size-5" />
                    </div>
                  </div>
                  <span className="inline-block rounded-full bg-sunk px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
                    {st.tag}
                  </span>
                  <h3 className="mt-2 text-[18px] font-bold text-indigo-loom">{st.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Role Based Operations ── */}
      <section className="py-20 lg:py-28 bg-white border-b border-line">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-[32px] sm:text-[40px] font-bold text-indigo-loom">
              Tailored for Every Mill Department
            </h2>
            <p className="mt-3 text-[16px] text-ink-2">
              Each user sees exactly what their shift and duty requires with server-enforced role permissions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {[
              {
                role: 'Production Manager',
                user: 'pm.ravi',
                duty: 'Plans loom shifts, checks machine utilization, handles breakdowns, monitors risk engine.',
                color: 'border-l-blue-600',
              },
              {
                role: 'Storekeeper',
                user: 'store.meena',
                duty: 'Receives yarn trucks, manages lot numbers, logs FIFO stock reservations, tracks reorder alerts.',
                color: 'border-l-amber-500',
              },
              {
                role: 'Quality Inspector',
                user: 'qc.anitha',
                duty: 'Runs CV fabric defect scanning, records pass/fail/rework decisions, generates QR roll passports.',
                color: 'border-l-teal-600',
              },
              {
                role: 'Dispatch Operator',
                user: 'dispatch.karthik',
                duty: 'Prepares vehicle manifests, enforces packing list validation, prevents duplicate shipments.',
                color: 'border-l-orange-500',
              },
              {
                role: 'Finance & Accounts',
                user: 'finance.priya',
                duty: 'Audits actual vs standard cost per metre, calculates sunk cost in rejected rolls, runs what-if simulator.',
                color: 'border-l-green-600',
              },
              {
                role: 'External Buyers',
                user: 'buyer.cae',
                duty: 'Self-service portal to track order progress (weaving/inspection/dispatch) without seeing costs or mill notes.',
                color: 'border-l-indigo-600',
              },
            ].map((r) => (
              <div key={r.role} className={`rounded-xl border border-line bg-page p-5 border-l-4 ${r.color} shadow-xs`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-[17px] font-bold text-indigo-loom">{r.role}</h3>
                  <code className="text-[12px] bg-white border border-line px-1.5 py-0.5 rounded text-ink-3">
                    {r.user}
                  </code>
                </div>
                <p className="mt-2 text-[13.5px] text-ink-2 leading-relaxed">{r.duty}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={() => nav('/login')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-loom px-7 py-3.5 text-[15px] font-semibold text-white shadow-md hover:bg-indigo-deep transition-all"
            >
              <span>Test All Roles on Sign In Page</span>
              <ArrowRight className="size-4 text-[#2BB3A3]" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-indigo-loom text-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <Wordmark light />
            <p className="text-[13px] text-[#8fa6cc] mt-1">
              Everest Textile Mills Operating System · Built for Odoo Hackathon 2026
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => nav('/login')}
              className="rounded-lg bg-white/10 px-4 py-2 text-[13.5px] font-medium text-white hover:bg-white/20 transition-all"
            >
              Sign In to System
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
