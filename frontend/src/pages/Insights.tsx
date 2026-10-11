import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { FlaskConical } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { Badge, Button, ErrorBox, Field, Input, LoadingBlock, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap, Tabs, useToast } from '../components/ui'
import { S1 } from '../components/charts'
import { date, metres, money, num, pct } from '../lib/format'
import type { Machine, Order, Risk } from '../lib/types'

export default function Insights() {
  const [tab, setTab] = useState<'risk' | 'sim' | 'reports'>('risk')
  return (
    <div>
      <PageHeader title="Insights and reports" subtitle="Explainable order risk, what-if planning and quality reporting from live records." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'risk', label: 'Order risk' }, { value: 'sim', label: 'What-if simulator' }, { value: 'reports', label: 'Reports' }]} />
      <div className="mt-4">{tab === 'risk' ? <RiskTable /> : tab === 'sim' ? <Simulator /> : <Reports />}</div>
    </div>
  )
}

function RiskTable() {
  const { data, isLoading, error } = useQuery({ queryKey: ['risk-all'], queryFn: () => api<{ assessments: Risk[] }>('/api/insights/risk') })
  if (isLoading) return <LoadingBlock />
  if (error) return <ErrorBox error={error} />
  return (
    <Panel bodyClass="p-0" title="Risk assessment of active orders" subtitle="Deterministic rule-based scoring. Each factor shows the rule and the data it used.">
      <TableWrap><table className="data-table min-w-[960px]">
        <thead><tr><th>Order</th><th>Risk</th><th className="num">Score</th><th>Promised</th><th>Projected finish</th><th>Why</th><th>Recommended action</th></tr></thead>
        <tbody>{data!.assessments.map((a) => (
          <tr key={a.order_id}>
            <td><Link to={`/orders/${a.order_id}`} className="font-medium text-indigo-thread hover:underline">{a.order_no}</Link><div className="text-[12px] text-ink-3">{a.buyer}</div></td>
            <td><StatusBadge value={a.band} />{a.confidence === 'low' && <div className="text-[11.5px] text-ink-3">low confidence</div>}</td>
            <td className="num">{a.score ?? '–'}</td><td>{date(a.promised_date)}</td><td>{date(a.projected_finish)}</td>
            <td className="max-w-[340px] text-[13px]">{a.factors.length ? a.factors.map((f) => <div key={f.kind}>+{f.points} {f.detail}</div>) : <span className="text-ink-3">No factors triggered</span>}</td>
            <td className="max-w-[260px] text-[13px]">{a.recommendation}</td>
          </tr>))}</tbody></table></TableWrap>
      <details className="px-4 py-3 text-[13px]"><summary className="cursor-pointer font-medium text-indigo-thread">Scoring rules</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-2">
          <li>Projected finish after the promised date: +40 (slack of 1 day or less: +20). Projection = weaving queue by priority and deadline ÷ available loom capacity, plus 2 days downstream.</li>
          <li>Material shortage not covered by purchase orders arriving in time: +25 (covered: +10).</li>
          <li>Rejected, held or rework fabric: +15. Order on hold: +20. Over 120 min downtime on the order's machines in 7 days: +10.</li>
          <li>Unplanned weaving with 5 days or less to the deadline: +10. Bands: 50+ high, 25–49 medium, under 25 low. No loom capacity available: unknown.</li>
        </ul></details>
    </Panel>
  )
}

type SimRow = { order_id: number; order_no: string; buyer: string; priority: string; promised: string; remaining_good_m: number; gross_to_weave_m: number; estimated_finish: string | null; late_days: number | null; status: string; material_constrained_by: string[]; est_cost_to_complete: number; baseline_finish: string | null; baseline_status: string; finish_shift_days: number | null; newly_late: boolean }
type SimResp = { label: string; assumptions: string[]; baseline_rejection_rate: number; scenario_rejection_rate: number; baseline: { late_count: number; est_cost_to_complete: number }; modified: { late_count: number; est_cost_to_complete: number }; cost_delta: number; orders: SimRow[]; conflicts: string[]; inbound: { id: number; po: string; sku: string; qty: number; expected: string }[] }

function Simulator() {
  const toast = useToast()
  const machines = useQuery({ queryKey: ['machines'], queryFn: () => api<Machine[]>('/api/machines') })
  const orders = useQuery({ queryKey: ['orders-active'], queryFn: () => api<Order[]>('/api/orders?include_closed=false') })
  const pls = useQuery({ queryKey: ['pls'], queryFn: () => api<{ id: number; po_number: string; sku: string; expected_date: string; status: string }[]>('/api/inventory/purchase-lines') })
  const [s, setS] = useState({ machine_id: 0, shifts: 3, pl_id: 0, delay: 7, rate: '', prio: 0 })
  const run = useMutation({
    mutationFn: () => api<SimResp>('/api/insights/simulate', { body: {
      machine_outage: s.machine_id ? { machine_id: s.machine_id, shifts: s.shifts } : null,
      po_delay: s.pl_id ? { purchase_line_id: s.pl_id, days: s.delay } : null,
      rejection_rate: s.rate === '' ? null : Number(s.rate) / 100,
      prioritize_order_id: s.prio || null } }),
    onError: (e) => toast('bad', (e as Error).message),
  })
  const r = run.data
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Panel title="Scenario Parameters" subtitle="Sandbox calculation engine. Does not alter production jobs or records.">
        <div className="space-y-3.5">
          <Field label="Simulate loom outage">{(id) => <Select id={id} value={s.machine_id} onChange={(e) => setS({ ...s, machine_id: Number(e.target.value) })}><option value={0}>No machine outage</option>{machines.data?.filter((m) => m.stage_code === 'weaving').map((m) => <option key={m.id} value={m.id}>{m.code} ({m.status})</option>)}</Select>}</Field>
          {s.machine_id > 0 && <Field label="Outage duration (shifts)">{(id) => <Input id={id} type="number" min={1} max={90} value={s.shifts} onChange={(e) => setS({ ...s, shifts: Number(e.target.value) })} />}</Field>}
          <Field label="Delay incoming yarn delivery">{(id) => <Select id={id} value={s.pl_id} onChange={(e) => setS({ ...s, pl_id: Number(e.target.value) })}><option value={0}>No PO delivery delay</option>{pls.data?.filter((p) => p.status === 'open').map((p) => <option key={p.id} value={p.id}>{p.po_number} · {p.sku} · due {date(p.expected_date)}</option>)}</Select>}</Field>
          {s.pl_id > 0 && <Field label="Delay duration (days)">{(id) => <Input id={id} type="number" min={0} max={90} value={s.delay} onChange={(e) => setS({ ...s, delay: Number(e.target.value) })} />}</Field>}
          <Field label="Hypothetical rejection rate (%)" hint={r ? `Observed baseline: ${pct(r.baseline_rejection_rate)}` : 'Leave empty to use historical observed rate'}>{(id) => <Input id={id} type="number" min={0} max={80} step={0.5} value={s.rate} onChange={(e) => setS({ ...s, rate: e.target.value })} placeholder="e.g. 8.5" />}</Field>
          <Field label="Prioritise sales order">{(id) => <Select id={id} value={s.prio} onChange={(e) => setS({ ...s, prio: Number(e.target.value) })}><option value={0}>Maintain current schedule priority</option>{orders.data?.filter((o) => ['confirmed', 'in_production', 'on_hold'].includes(o.status)).map((o) => <option key={o.id} value={o.id}>{o.order_no} · {o.buyer}</option>)}</Select>}</Field>
          <Button variant="teal" className="w-full mt-2" icon={<FlaskConical className="size-4" />} loading={run.isPending} onClick={() => run.mutate()}>Run Planning Simulation</Button>
        </div>
      </Panel>
      <div className="min-w-0 space-y-4">
        {!r && (
          <Panel>
            <div className="flex flex-col items-center py-10 px-6 text-center">
              <div className="rounded-full bg-sunk p-3 mb-3 text-brand-teal">
                <FlaskConical className="size-7" />
              </div>
              <h3 className="font-display text-[17px] font-bold text-primary-navy">What-if Planning Simulator</h3>
              <p className="mt-1.5 max-w-lg text-[13.5px] text-ink-2 leading-relaxed">
                Test the ripple effects of equipment breakdowns, supply chain disruptions, or fabric rejection spikes on order deadlines and completion costs before making operational commitments.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left">
                <div className="rounded-lg border border-line bg-[#FAFBFD] p-3 text-[12.5px]">
                  <div className="font-semibold text-primary-navy">1. Inject Disruption</div>
                  <div className="text-ink-3 mt-0.5">Select machine downtime or delayed yarn shipments.</div>
                </div>
                <div className="rounded-lg border border-line bg-[#FAFBFD] p-3 text-[12.5px]">
                  <div className="font-semibold text-primary-navy">2. Stress Parameters</div>
                  <div className="text-ink-3 mt-0.5">Vary quality rejection percentages or reschedule priority.</div>
                </div>
                <div className="rounded-lg border border-line bg-[#FAFBFD] p-3 text-[12.5px]">
                  <div className="font-semibold text-primary-navy">3. Comparative Audit</div>
                  <div className="text-ink-3 mt-0.5">Inspect cost delta, newly late orders and slack days.</div>
                </div>
              </div>
            </div>
          </Panel>
        )}
        {r && (<>
          <Notice tone="warn"><b>Simulation Result: {r.label}.</b></Notice>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4 shadow-xs">
            <Cmp label="Orders late or beyond horizon" a={String(r.baseline.late_count)} b={String(r.modified.late_count)} worse={r.modified.late_count > r.baseline.late_count} />
            <Cmp label="Est. cost to complete" a={money(r.baseline.est_cost_to_complete)} b={money(r.modified.est_cost_to_complete)} worse={r.cost_delta > 0} />
            <Cmp label="Rejection rate modeled" a={pct(r.baseline_rejection_rate)} b={pct(r.scenario_rejection_rate)} worse={r.scenario_rejection_rate > r.baseline_rejection_rate} />
            <div className="bg-surface px-4 py-3.5">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">Newly late orders</div>
              <div className="font-display text-[18px] font-bold text-primary-navy mt-1 truncate">
                {r.orders.filter((o) => o.newly_late).map((o) => o.order_no).join(', ') || 'None'}
              </div>
            </div>
          </div>
          <Panel title="Order Impact Analysis" subtitle="Baseline projected completion vs simulated outcome" bodyClass="p-0">
            <TableWrap>
              <table className="data-table min-w-[920px]">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>Promised Date</th>
                    <th>Baseline Finish</th>
                    <th>Scenario Finish</th>
                    <th className="num">Shift Delta</th>
                    <th className="num">To Weave</th>
                    <th>Yarn Constraint</th>
                    <th className="num">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {r.orders.map((o) => (
                    <tr key={o.order_id} className={clsx(o.newly_late && 'bg-[#FCEAEA]/40')}>
                      <td>
                        <span className="font-semibold text-primary-navy">{o.order_no}</span>
                        <div className="text-[12px] text-ink-3">{o.buyer} · {o.priority}</div>
                      </td>
                      <td className="text-ink-2">{date(o.promised)}</td>
                      <td>
                        <span className="text-ink-2">{o.baseline_finish ? date(o.baseline_finish) : 'Beyond 120 d'}</span>
                        <Badge tone={o.baseline_status === 'on_time' ? 'ok' : 'bad'} className="ml-1.5">{o.baseline_status === 'on_time' ? 'On time' : 'Late'}</Badge>
                      </td>
                      <td>
                        <span className="font-medium text-primary-navy">{o.estimated_finish ? date(o.estimated_finish) : 'Beyond 120 d'}</span>
                        <Badge tone={o.status === 'on_time' ? 'ok' : 'bad'} className="ml-1.5">{o.status === 'on_time' ? 'On time' : o.late_days != null ? `${o.late_days} d late` : 'Not finished'}</Badge>
                      </td>
                      <td className={clsx('num font-semibold tabular-nums', (o.finish_shift_days ?? 0) > 0 ? 'text-bad' : (o.finish_shift_days ?? 0) < 0 ? 'text-ok' : 'text-ink-3')}>
                        {o.finish_shift_days == null ? '–' : `${o.finish_shift_days > 0 ? '+' : ''}${o.finish_shift_days} d`}
                      </td>
                      <td className="num tabular-nums">{metres(o.gross_to_weave_m)}</td>
                      <td className="text-[12px] text-ink-2">{o.material_constrained_by.join(', ') || '–'}</td>
                      <td className="num tabular-nums font-semibold text-primary-navy">{money(o.est_cost_to_complete)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
          <Panel title="Engine Model Assumptions">
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
              {r.assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </Panel>
        </>)}
      </div>
    </div>
  )
}

function Cmp({ label, a, b, worse }: { label: string; a: string; b: string; worse: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[13.5px] text-ink-3 tabular-nums">{a}</span>
        <span className="text-[12px] text-ink-3 font-medium">→</span>
        <span className={clsx('font-display text-[20px] font-bold tabular-nums', worse ? 'text-bad' : 'text-primary-navy')}>{b}</span>
      </div>
    </div>
  )
}

type Rep = { fabric_summary: Record<string, number | string>[]; machine_quality: { machine: string; accepted_m: number; rejected_m: number; rejection_rate: number | null }[]; defect_pareto: { defect: string; count: number }[]; baseline_vs_inspector: { agreed: number; disagreed: number; note: string }; delivery: { completed_on_time: number; completed_late: number } }

function Reports() {
  const { data, isLoading, error } = useQuery({ queryKey: ['reports'], queryFn: () => api<Rep>('/api/insights/reports') })
  if (isLoading) return <LoadingBlock />
  if (error || !data) return <ErrorBox error={error} />
  const b = data.baseline_vs_inspector
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Fabric Production & Quality Summary" subtitle="Total metres tracked across open orders" bodyClass="p-0" className="lg:col-span-2">
        <TableWrap>
          <table className="data-table min-w-[700px]">
            <thead>
              <tr>
                <th>Fabric SKU / Spec</th>
                <th className="num">Ordered</th>
                <th className="num">Woven</th>
                <th className="num">Accepted</th>
                <th className="num">Rejected</th>
                <th className="num">Dispatched</th>
              </tr>
            </thead>
            <tbody>
              {data.fabric_summary.map((f) => (
                <tr key={String(f.fabric)} className="hover:bg-[#F8FAFB]">
                  <td className="font-semibold text-primary-navy">{f.fabric}</td>
                  <td className="num tabular-nums">{metres(f.ordered_m as number)}</td>
                  <td className="num tabular-nums">{metres(f.produced_m as number)}</td>
                  <td className="num tabular-nums font-semibold text-ok">{metres(f.accepted_m as number)}</td>
                  <td className="num tabular-nums text-bad font-medium">{metres(f.rejected_m as number)}</td>
                  <td className="num tabular-nums text-ink-2">{metres(f.dispatched_m as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
      <Panel title="Confirmed Defects (Pareto)" subtitle="Count of inspector decisions by defect classification">
        {data.defect_pareto.length === 0 ? <p className="text-sm text-ink-2">No defects confirmed yet.</p> : (
          <ResponsiveContainer width="100%" height={Math.max(180, data.defect_pareto.length * 36)}>
            <BarChart data={data.defect_pareto} layout="vertical" margin={{ left: 40, right: 16 }}>
              <CartesianGrid stroke="#EDF1F4" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11.5, fill: '#657286' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="defect" tick={{ fontSize: 12, fill: '#182536' }} axisLine={false} tickLine={false} width={120} />
              <Tooltip cursor={{ fill: 'rgba(20,43,70,0.04)' }} formatter={(v) => [v, 'Decisions']} />
              <Bar dataKey="count" fill={S1} radius={[0, 3, 3, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
      <Panel title="Rejection Rate by Loom" subtitle="Fabric inspection quality segmented by weaving machine">
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>Loom Code</th>
                <th className="num">Accepted (m)</th>
                <th className="num">Rejected (m)</th>
                <th className="num">Rejection Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.machine_quality.map((m) => (
                <tr key={m.machine} className="hover:bg-[#F8FAFB]">
                  <td className="font-semibold text-primary-navy">{m.machine}</td>
                  <td className="num tabular-nums text-ok">{num(m.accepted_m)}</td>
                  <td className="num tabular-nums text-bad">{num(m.rejected_m)}</td>
                  <td className={clsx('num tabular-nums font-bold', (m.rejection_rate ?? 0) > 0.05 ? 'text-bad' : 'text-primary-navy')}>
                    {pct(m.rejection_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
      <Panel title="CV Baseline vs Human Inspector">
        <div className="font-display text-[22px] font-bold text-primary-navy tabular-nums">
          <span className="text-ok">{b.agreed}</span> agreed · <span className="text-warn">{b.disagreed}</span> disagreed
        </div>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">{b.note}</p>
      </Panel>
      <Panel title="Delivery Schedule Performance">
        <div className="font-display text-[22px] font-bold text-primary-navy tabular-nums">
          <span className="text-ok">{data.delivery.completed_on_time}</span> on time · <span className="text-bad">{data.delivery.completed_late}</span> late
        </div>
        <p className="mt-2 text-[13px] text-ink-2 leading-relaxed">Completed sales orders, evaluated by final dispatch date against promised customer delivery deadline.</p>
      </Panel>
    </div>
  )
}
