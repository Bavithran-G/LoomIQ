import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, ArrowUpRight, Info, OctagonAlert, X, Layers } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, ErrorBox, Input, LoadingBlock, Panel, Select, StatusBadge } from '../components/ui'
import { ProductionChart, QualityChart, UtilizationBars } from '../components/charts'
import { addDays, ago, int, isoDay, metres, money, pct, ROLES, STAGE_NAMES } from '../lib/format'
import { NAV, ROLE_MODULES } from '../components/Shell'
import type { Risk } from '../lib/types'

type Dash = {
  kpis: Record<string, number | null> & { machines: Record<string, number> }
  production_vs_target: { date: string; output_m: number; target_m: number }[]
  quality_trend: { date: string; accepted: number; rejected: number; rejection_rate: number | null }[]
  machine_utilization: { machine_id: number; code: string; stage: string; status: string; output_m: number; capacity_m: number; utilization: number; downtime_min: number }[]
  stage_overview: { stage: string; metres: number }[]
  order_risk: Risk[]
  alerts: { severity: string; title: string; detail: string; action: string; link: { type: string; id: number | null } }[]
  events: { id: number; message: string; severity: string; at: string; order_id: number | null }[]
  notes: string[]
}

const RANGES = [{ v: 7, l: 'Last 7 days' }, { v: 14, l: 'Last 14 days' }, { v: 30, l: 'Last 30 days' }]
const STAGE_ORDER = ['weaving', 'dyeing', 'inspection', 'finishing', 'packed']

export default function Overview() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [days, setDays] = useState(14)
  const [shift, setShift] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const to = isoDay()
  const from = addDays(to, -(days - 1))
  const params = new URLSearchParams({ date_from: from, date_to: to, ...(shift ? { shift } : {}), ...(search ? { q: search } : {}) })
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', from, to, shift, search], queryFn: () => api<Dash>(`/api/dashboard?${params}`), refetchInterval: 60000,
  })

  const linkFor = (l: { type: string; id: number | null }) =>
    l.type === 'order' ? `/orders/${l.id}` : l.type === 'material' ? '/inventory' : l.type === 'machine' ? '/machines' : '/quality'

  return (
    <div className="space-y-4">
      <RoleWelcome user={user} nav={nav} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold">Manufacturing command centre</h1>
          <p className="text-sm text-ink-2">Weaving, inspection and dispatch across every open order.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}>
          <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
            {RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </Select>
          <Select aria-label="Shift" value={shift} onChange={(e) => setShift(e.target.value)} className="w-32">
            <option value="">All shifts</option><option value="A">Shift A</option><option value="B">Shift B</option><option value="C">Shift C</option>
          </Select>
          <Input aria-label="Filter by order, buyer or fabric" placeholder="Order, buyer, fabric" value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
          <Button type="submit" variant="secondary" loading={isFetching && !isLoading}>Apply</Button>
          {(search || shift) && <Button type="button" variant="ghost" onClick={() => { setQ(''); setSearch(''); setShift('') }}>Clear</Button>}
        </form>
      </div>

      {isLoading && <LoadingBlock rows={10} />}
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {data && (<>
        <KpiStrip d={data} nav={nav} />

        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <Panel title="Orders needing attention" subtitle="Rule-based risk score. Open an order for the factors behind it."
            actions={<Link to="/insights" className="text-sm font-medium text-indigo-thread hover:underline">All assessments</Link>} bodyClass="p-0">
            {data.order_risk.length === 0
              ? <p className="p-4 text-sm text-ink-2">No order is at medium or high risk for the current filters.</p>
              : <ul className="divide-y divide-line">
                {data.order_risk.map((r) => (
                  <li key={r.order_id}>
                    <Link to={`/orders/${r.order_id}`} className="grid gap-1 px-4 py-3 hover:bg-sunk sm:grid-cols-[150px_1fr_auto] sm:gap-4">
                      <div>
                        <div className="font-display text-[16px] font-semibold text-indigo-loom">{r.order_no}</div>
                        <div className="text-[12.5px] text-ink-3">{r.buyer}</div>
                      </div>
                      <div className="text-[13.5px] text-ink-2">
                        <p>{r.summary}</p>
                        <p className="mt-0.5 text-ink">{r.recommendation}</p>
                      </div>
                      <div className="flex items-start gap-2 sm:flex-col sm:items-end">
                        <StatusBadge value={r.band} />
                        {r.score != null && <span className="text-[12.5px] text-ink-3">{r.score} / 100</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>}
          </Panel>

          <Panel title="Stock, quality and machine alerts" bodyClass="p-0">
            {data.alerts.filter((a) => a.link.type !== 'order').length === 0 && <p className="p-4 text-sm text-ink-2">No stock, quality or machine alerts.</p>}
            <ul className="divide-y divide-line">
              {data.alerts.filter((a) => a.link.type !== 'order').map((a, i) => (
                <li key={i}>
                  <Link to={linkFor(a.link)} className="flex gap-3 px-4 py-3 hover:bg-sunk">
                    {a.severity === 'critical' ? <OctagonAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-label="Critical" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Warning" />}
                    <div className="min-w-0 text-[13.5px]">
                      <div className="font-medium text-ink">{a.title}</div>
                      <div className="text-ink-2">{a.detail}</div>
                      <div className="mt-0.5 text-indigo-thread">{a.action}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Fabric on the floor" subtitle="Metres currently waiting at each stage, open orders only">
          <StagePipe stages={data.stage_overview} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Weaving output against plan" subtitle="Completed weaving jobs vs planned metres, by planned date">
            <ProductionChart data={data.production_vs_target} />
          </Panel>
          <Panel title="Inspection outcomes" subtitle={`Metres by inspector decision · rejection rate ${pct(data.kpis.rejection_rate)}`}>
            <QualityChart data={data.quality_trend} />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Panel title="Machine utilisation" subtitle="Output ÷ rated capacity for the period"
            actions={<Badge tone="neutral">Simulated status, no sensors</Badge>}>
            <UtilizationBars data={[...data.machine_utilization].sort((a, b) => (a.stage === 'weaving' ? 0 : 1) - (b.stage === 'weaving' ? 0 : 1) || a.code.localeCompare(b.code))} onSelect={() => nav('/machines')} />
          </Panel>
          <Panel title="Recent activity" bodyClass="p-0">
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {data.events.map((e) => (
                <li key={e.id} className="flex gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full',
                    e.severity === 'critical' ? 'bg-bad' : e.severity === 'warning' ? 'bg-warn' : e.severity === 'success' ? 'bg-ok' : 'bg-indigo-mist')} />
                  <div className="min-w-0 flex-1">
                    {e.order_id ? <Link to={`/orders/${e.order_id}`} className="hover:underline">{e.message}</Link> : e.message}
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-3">{ago(e.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Info className="size-3.5" /> {data.notes.join(' ')} Demo data generated by the seed script.</p>
      </>)}
    </div>
  )
}

function KpiStrip({ d, nav }: { d: Dash; nav: (to: string) => void }) {
  const k = d.kpis
  const m = k.machines ?? {}
  const items: { label: string; value: string; sub: string; to: string; tone?: 'bad' | 'warn' }[] = [
    { label: 'Active orders', value: int(k.active_orders), sub: `${int(k.draft_orders)} draft`, to: '/orders' },
    { label: 'At risk', value: int(k.orders_at_risk), sub: `${int(k.orders_medium_risk)} medium risk`, to: '/insights', tone: (k.orders_at_risk ?? 0) > 0 ? 'bad' : undefined },
    { label: 'Yarn free', value: `${int(k.yarn_free_kg)} kg`, sub: `${int(k.yarn_reserved_kg)} kg reserved · ${int(k.low_stock_items)} low`, to: '/inventory', tone: (k.low_stock_items ?? 0) > 0 ? 'warn' : undefined },
    { label: 'Machines', value: `${m.running ?? 0} running`, sub: `${m.idle ?? 0} idle · ${(m.maintenance ?? 0) + (m.breakdown ?? 0)} down`, to: '/machines' },
    { label: 'Woven', value: metres(k.woven_m), sub: `plan ${metres(k.target_m)}`, to: '/production' },
    { label: 'Accepted / rejected', value: `${int(k.accepted_m)} / ${int(k.rejected_m)} m`, sub: `rejection ${pct(k.rejection_rate)}`, to: '/quality', tone: (k.rejection_rate ?? 0) > 0.05 ? 'warn' : undefined },
    { label: 'Awaiting inspection', value: `${int(k.at_inspection_rolls)} rolls`, sub: `${metres(k.uninspected_m)} not yet inspected`, to: '/quality' },
    { label: 'Ready to dispatch', value: `${int(k.ready_rolls)} rolls`, sub: metres(k.ready_m), to: '/dispatch' },
    { label: 'Est. cost, open orders', value: money(k.estimated_cost_open_orders), sub: 'standard-cost estimate', to: '/cost' },
  ]
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 2xl:grid-cols-9" style={{ gap: 1 }}>
      {items.map((it) => (
        <button key={it.label} onClick={() => nav(it.to)} className="group relative flex flex-col items-start bg-surface px-3.5 py-3.5 text-left hover:bg-sunk transition-colors">
          <span className={clsx('absolute inset-x-0 top-0 h-[2.5px] rounded-t-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150', it.tone === 'bad' ? 'bg-bad' : it.tone === 'warn' ? 'bg-warn' : 'bg-brand-teal')} />
          <span className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink-3">{it.label}<ArrowUpRight className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" /></span>
          <span className={clsx('font-display text-[21px] leading-tight font-bold mt-0.5', it.tone === 'bad' ? 'text-bad' : it.tone === 'warn' ? 'text-warn' : 'text-primary-navy')}>{it.value}</span>
          <span className="text-[11.5px] text-ink-3 mt-0.5 leading-tight">{it.sub}</span>
        </button>
      ))}
    </div>
  )
}

function StagePipe({ stages }: { stages: { stage: string; metres: number }[] }) {
  const map = Object.fromEntries(stages.map((s) => [s.stage, s.metres]))
  const max = Math.max(1, ...stages.map((s) => s.metres))
  const colors = ['#138A78', '#116B5C', '#142B46', '#1D3A5E', '#0D1B2A']
  return (
    <ol className="grid gap-4 sm:grid-cols-5">
      {STAGE_ORDER.map((s, i) => (
        <li key={s} className="relative">
          <div className="flex items-baseline justify-between text-[13px] mb-1.5">
            <span className="font-medium text-ink-2">{i + 1}. {STAGE_NAMES[s]}</span>
            <span className="font-display text-[18px] font-bold" style={{ color: colors[i] }}>{int(map[s] ?? 0)} m</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sunk">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((map[s] ?? 0) / max) * 100}%`, backgroundColor: colors[i] }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Role-specific welcome banner — shows on first page load, dismissable. */
type WelcomeProps = { user: { full_name: string; role: string } | null; nav: (to: string) => void }
function RoleWelcome({ user, nav }: WelcomeProps) {
  const key = `loomiq.welcome.${user?.role ?? ''}`
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })
  if (!user || dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try { localStorage.setItem(key, '1') } catch { /* ignore */ }
  }

  const firstName = user.full_name.split(' ')[0]
  const roleName = ROLES[user.role] ?? user.role
  const myModules = ROLE_MODULES[user.role] ?? []
  const navMap = Object.fromEntries(NAV.map((n) => [n.label, n]))

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-teal/20 bg-gradient-to-r from-primary-navy/[0.04] via-brand-teal/[0.03] to-transparent p-4">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-teal to-primary-navy rounded-l-xl" />
      <button onClick={dismiss} className="absolute top-3 right-3 rounded p-1 text-ink-3 hover:bg-sunk" aria-label="Dismiss">
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-2.5 mb-3 pl-3">
        <Layers className="size-5 text-brand-teal shrink-0" />
        <div>
          <p className="text-[15.5px] font-bold text-primary-navy">Welcome back, {firstName}</p>
          <p className="text-[12.5px] text-ink-3">Signed in as <span className="font-semibold text-ink">{roleName}</span> · Your modules are highlighted below</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-3">
        {myModules.map((label) => {
          const n = navMap[label]
          if (!n) return null
          const Icon = n.icon
          return (
            <button key={label} onClick={() => { nav(n.to); dismiss() }}
              className="flex items-center gap-1.5 rounded-lg border border-brand-teal/25 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-brand-teal shadow-xs hover:bg-brand-teal hover:border-brand-teal hover:text-white transition-all duration-150">
              <Icon className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
