import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, Pause, Play, Plus, TimerOff, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, ErrorBox, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Select, StatusBadge, Textarea, useToast } from '../components/ui'
import { addDays, date, human, isoDay, metres, num } from '../lib/format'
import type { Job, Order } from '../lib/types'

const COLS = ['planned', 'running', 'paused', 'completed'] as const

export default function Production() {
  const { can } = useAuth()
  const [from, setFrom] = useState(addDays(isoDay(), -2))
  const [to, setTo] = useState(addDays(isoDay(), 3))
  const [stage, setStage] = useState('')
  const [shift, setShift] = useState('')
  const [plan, setPlan] = useState(false)
  const [complete, setComplete] = useState<Job | null>(null)
  const [down, setDown] = useState<Job | null>(null)
  const params = new URLSearchParams({ date_from: from, date_to: to, ...(stage ? { stage } : {}), ...(shift ? { shift } : {}) })
  const jobs = useQuery({ queryKey: ['jobs', from, to, stage, shift], queryFn: () => api<Job[]>(`/api/production/jobs?${params}`) })
  const manage = can('production.manage')
  const qc = useQueryClient()
  const toast = useToast()
  const act = useMutation({
    mutationFn: (v: { id: number; action: string; reason?: string }) => api(`/api/production/jobs/${v.id}/action`, { body: { action: v.action, reason: v.reason ?? '' } }),
    onSuccess: (_, v) => { qc.invalidateQueries(); toast('ok', `Job ${v.action === 'start' ? 'started' : v.action === 'pause' ? 'paused' : v.action === 'resume' ? 'resumed' : 'cancelled'}`) },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const by = useMemo(() => Object.fromEntries(COLS.map((c) => [c, (jobs.data ?? []).filter((j) => j.status === c)])), [jobs.data])
  const totals = useMemo(() => {
    const w = (jobs.data ?? []).filter((j) => j.stage_code === 'weaving' && j.status !== 'cancelled')
    return { planned: w.reduce((s, j) => s + j.planned_qty, 0), actual: w.filter((j) => j.status === 'completed').reduce((s, j) => s + j.actual_qty, 0) }
  }, [jobs.data])

  const colConfig: Record<typeof COLS[number], { label: string; accent: string; countClass: string }> = {
    planned: { label: 'Planned', accent: 'bg-indigo-mist/30', countClass: 'bg-primary-navy/10 text-primary-navy' },
    running: { label: 'Running', accent: 'bg-ok-soft', countClass: 'bg-ok/15 text-ok' },
    paused: { label: 'Paused', accent: 'bg-warn-soft/50', countClass: 'bg-warn/15 text-warn' },
    completed: { label: 'Completed', accent: 'bg-sunk', countClass: 'bg-line text-ink-3' },
  }
  return (
    <div>
      <PageHeader title="Production planning" subtitle="Jobs on looms, dyeing and finishing by shift. Capacity is checked when a job is planned."
        actions={manage && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPlan(true)}>Plan job</Button>} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />}</Field>
        <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />}</Field>
        <Field label="Stage">{(id) => <Select id={id} value={stage} onChange={(e) => setStage(e.target.value)} className="w-36"><option value="">All stages</option><option value="weaving">Weaving</option><option value="dyeing">Dyeing</option><option value="finishing">Finishing</option></Select>}</Field>
        <Field label="Shift">{(id) => <Select id={id} value={shift} onChange={(e) => setShift(e.target.value)} className="w-28"><option value="">All</option><option>A</option><option>B</option><option>C</option></Select>}</Field>
        <div className="ml-auto rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] shadow-xs">
          Weaving in range: <b className="text-primary-navy">{metres(totals.actual)}</b> done of <b className="text-ink">{metres(totals.planned)}</b> planned
        </div>
      </div>
      {jobs.isLoading && <LoadingBlock />}
      {jobs.error && <ErrorBox error={jobs.error} />}
      {jobs.data && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLS.map((c) => {
            const cfg = colConfig[c]
            return (
            <section key={c} className="flex min-h-40 flex-col rounded-xl border border-line bg-sunk/40">
              <header className={clsx('flex items-center justify-between rounded-t-xl px-3.5 py-2.5 border-b border-line', cfg.accent)}>
                <h2 className="text-[13.5px] font-bold uppercase tracking-wide text-ink-2">{cfg.label}</h2>
                <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', cfg.countClass)}>{by[c].length}</span>
              </header>
              <div className="flex flex-col gap-2 p-2">
                {by[c].length === 0 && <p className="px-1 py-6 text-center text-[13px] text-ink-3">No {c} jobs</p>}
                {by[c].map((j) => (
                  <article key={j.id} className={clsx(
                    'rounded-lg border bg-surface p-3 text-[13px] shadow-xs transition-shadow hover:shadow-sm',
                    j.priority === 'urgent' ? 'border-l-[3px] border-line border-l-bad' :
                    j.priority === 'high' ? 'border-l-[3px] border-line border-l-warn' : 'border-line'
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-primary-navy text-[13.5px]">{j.job_no}</div>
                        <Link to={`/orders/${j.order_id}`} className="text-brand-teal hover:underline font-medium">{j.order_no}</Link> <span className="text-ink-3">· {j.buyer}</span>
                      </div>
                      <span className="rounded-md bg-sunk border border-line px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 whitespace-nowrap">{human(j.stage_code)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12.5px] text-ink-2">
                      <span>{j.machine ?? 'No machine'} · shift {j.shift}</span><span className="text-right">{date(j.planned_date)}</span>
                      <span className="font-medium">{j.status === 'completed' ? `${num(j.actual_qty)} of ${num(j.planned_qty)} m` : `${num(j.planned_qty)} m planned`}</span>
                      <span className="text-right">due {date(j.promised_date)}</span>
                    </div>
                    {j.status === 'completed' && j.planned_qty > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunk"><div className={clsx('h-full rounded-full', j.actual_qty < j.planned_qty ? 'twill twill-warn' : 'twill twill-teal')} style={{ width: `${Math.min(100, (j.actual_qty / j.planned_qty) * 100)}%` }} /></div>
                    )}
                    {j.delay_reason && <p className="mt-1.5 text-[12px] text-warn font-medium">{j.delay_reason}</p>}
                    {manage && j.status !== 'completed' && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {j.status === 'planned' && <Button size="sm" variant="ok" icon={<Play className="size-3.5" />} onClick={() => act.mutate({ id: j.id, action: 'start' })}>Start</Button>}
                        {j.status === 'running' && <Button size="sm" icon={<Pause className="size-3.5" />} onClick={() => act.mutate({ id: j.id, action: 'pause', reason: 'Paused by supervisor' })}>Pause</Button>}
                        {j.status === 'paused' && <Button size="sm" variant="ok" icon={<Play className="size-3.5" />} onClick={() => act.mutate({ id: j.id, action: 'resume' })}>Resume</Button>}
                        {(j.status === 'running' || j.status === 'paused') && <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => setComplete(j)}>Complete</Button>}
                        {j.machine_id && (j.status === 'running' || j.status === 'paused') && <Button size="sm" variant="ghost" icon={<TimerOff className="size-3.5" />} onClick={() => setDown(j)}>Downtime</Button>}
                        {(j.status === 'planned' || j.status === 'paused') && <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => act.mutate({ id: j.id, action: 'cancel', reason: 'Cancelled by planner' })}>Cancel</Button>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )})
        }
        </div>
      )}
      {plan && <PlanModal onClose={() => setPlan(false)} />}
      {complete && <CompleteModal job={complete} onClose={() => setComplete(null)} />}
      {down && <DowntimeModal job={down} onClose={() => setDown(null)} />}
    </div>
  )
}

function PlanModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const orders = useQuery({ queryKey: ['orders-active'], queryFn: () => api<Order[]>('/api/orders?include_closed=false') })
  const [f, setF] = useState({ order_id: 0, stage_code: 'weaving', machine_id: 0, shift: 'A', planned_date: isoDay(), planned_qty: 180, operator: '' })
  const cap = useQuery({ queryKey: ['cap', f.planned_date, f.shift, f.stage_code], queryFn: () => api<{ machine_id: number; code: string; capacity: number; planned: number; free: number; state: string }[]>(`/api/production/capacity?on=${f.planned_date}&shift=${f.shift}&stage=${f.stage_code}`) })
  const eligible = (orders.data ?? []).filter((o) => o.status === 'confirmed' || o.status === 'in_production')
  const sel = eligible.find((o) => o.id === f.order_id)
  const machineCap = cap.data?.find((c) => c.machine_id === f.machine_id)
  const m = useMutation({
    mutationFn: () => api<Job>('/api/production/jobs', { body: f }),
    onSuccess: (j) => { qc.invalidateQueries(); toast('ok', `${j.job_no} planned`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  return (
    <Modal open onClose={onClose} title="Plan production job" wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.order_id || !f.machine_id || f.planned_qty <= 0 || f.planned_date < isoDay()} loading={m.isPending} onClick={() => m.mutate()}>Plan job</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Order" className="sm:col-span-2">{(id) => <Select id={id} value={f.order_id} onChange={(e) => setF({ ...f, order_id: Number(e.target.value) })}><option value={0}>Select a confirmed order</option>
          {eligible.map((o) => <option key={o.id} value={o.id}>{o.order_no} · {o.buyer} · {o.fabric} · {num(o.metrics.remaining_to_weave_m)} m left to weave · due {date(o.promised_date)}</option>)}</Select>}</Field>
        <Field label="Stage">{(id) => <Select id={id} value={f.stage_code} onChange={(e) => setF({ ...f, stage_code: e.target.value, machine_id: 0 })}><option value="weaving">Weaving</option><option value="dyeing">Dyeing</option><option value="finishing">Finishing & packing</option></Select>}</Field>
        <Field label="Quantity (m)" hint={sel ? `Order ${num(sel.quantity)} m; ${num(sel.metrics.remaining_to_weave_m)} m still to weave` : undefined}>{(id) => <Input id={id} type="number" min={1} value={f.planned_qty} onChange={(e) => setF({ ...f, planned_qty: Number(e.target.value) })} />}</Field>
        <Field label="Date" error={f.planned_date < isoDay() ? 'Planned date cannot be in the past' : null}>{(id) => <Input id={id} type="date" min={isoDay()} value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} />}</Field>
        <Field label="Shift">{(id) => <Select id={id} value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}><option value="A">A (06:00–14:00)</option><option value="B">B (14:00–22:00)</option><option value="C">C (22:00–06:00)</option></Select>}</Field>
        <Field label="Operator / team" className="sm:col-span-2">{(id) => <Input id={id} value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} placeholder="Optional" />}</Field>
      </div>
      <p className="mt-4 mb-1.5 text-[13px] font-medium text-ink-2">Machine capacity for {date(f.planned_date)}, shift {f.shift}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(cap.data ?? []).map((c) => {
          const unavailable = c.state !== 'available' || c.free <= 0
          return (
            <button key={c.machine_id} type="button" disabled={unavailable} onClick={() => setF({ ...f, machine_id: c.machine_id })}
              className={clsx('rounded-md border p-2 text-left text-[13px] disabled:opacity-50', f.machine_id === c.machine_id ? 'border-indigo-thread ring-2 ring-indigo-thread/20' : 'border-line hover:bg-sunk')}>
              <div className="flex justify-between font-medium"><span>{c.code}</span>{c.state !== 'available' ? <StatusBadge value={c.state} /> : <span className="text-ink-3">{num(c.free)} m free</span>}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-sunk"><div className="h-full bg-indigo-thread" style={{ width: `${(c.planned / c.capacity) * 100}%` }} /></div>
              <div className="mt-0.5 text-[12px] text-ink-3">{num(c.planned)} of {num(c.capacity)} m booked</div>
            </button>)
        })}
      </div>
      {machineCap && f.planned_qty > machineCap.free && <Notice tone="warn" className="mt-3">{machineCap.code} has only {num(machineCap.free)} m free in this shift. Split the job or pick another machine.</Notice>}
    </Modal>
  )
}

function CompleteModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [qty, setQty] = useState(job.planned_qty)
  const [rollLen, setRollLen] = useState(90)
  const [reason, setReason] = useState('')
  const short = qty < job.planned_qty
  const m = useMutation({
    mutationFn: () => api<{ result: { rolls_created: string[]; rolls_moved: string[]; credited_qty: number } }>(`/api/production/jobs/${job.id}/action`, { body: { action: 'complete', actual_qty: qty, roll_length: rollLen, reason } }),
    onSuccess: (r) => {
      qc.invalidateQueries()
      const res = r.result
      toast('ok', res.rolls_created.length ? `${job.job_no} completed: ${res.rolls_created.length} rolls created (${res.rolls_created[0]}…)` : `${job.job_no} completed: ${res.rolls_moved.length} rolls moved on (${num(res.credited_qty)} m)`)
      onClose()
    },
    onError: (e) => toast('bad', (e as Error).message),
  })
  return (
    <Modal open onClose={onClose} title={`Complete ${job.job_no}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={qty < 0 || (short && reason.trim().length < 3)} loading={m.isPending} onClick={() => m.mutate()}>Complete job</Button></>}>
      <Notice className="mb-3">{job.stage_code === 'weaving'
        ? 'Completing a weaving job consumes yarn for the actual output (reserved stock first) and creates fabric rolls with QR passports. If stock is short, nothing is changed.'
        : `Completing moves whole rolls of ${job.order_no} waiting at ${job.stage_code} to the next stage.`}</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Actual output (m)" hint={`Planned ${num(job.planned_qty)} m`}>{(id) => <Input id={id} type="number" min={0} value={qty} onChange={(e) => setQty(Number(e.target.value))} />}</Field>
        {job.stage_code === 'weaving' && <Field label="Roll length (m)">{(id) => <Input id={id} type="number" min={10} max={500} value={rollLen} onChange={(e) => setRollLen(Number(e.target.value))} />}</Field>}
        {short && <Field label="Reason for shortfall (required)" className="sm:col-span-2">{(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Warp breakage on beam 2" />}</Field>}
      </div>
    </Modal>
  )
}

function DowntimeModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const todayDate = isoDay()
  const [f, setF] = useState({ minutes: 30, reason: '', occurred_on: todayDate })
  const m = useMutation({
    mutationFn: () => api('/api/production/downtime', { body: { machine_id: job.machine_id, job_id: job.id, ...f } }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `Downtime recorded on ${job.machine}`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const isDateValid = f.occurred_on === todayDate
  return (
    <Modal open onClose={onClose} title={`Record downtime on ${job.machine}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={f.minutes <= 0 || f.reason.trim().length < 3 || !isDateValid} loading={m.isPending} onClick={() => m.mutate()}>Record downtime</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Minutes">{(id) => <Input id={id} type="number" min={1} max={1440} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} />}</Field>
        <Field label="Event date" error={!isDateValid ? "Downtime must be recorded for today's operational date." : null} hint="Actual operational events cannot be past or future">
          {(id) => <Input id={id} type="date" min={todayDate} max={todayDate} value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} />}
        </Field>
        <Field label="Reason" className="sm:col-span-2">{(id) => <Select id={id} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
          <option value="">Select reason</option>{['Warp breakage', 'Weft insertion fault', 'Beam change', 'Power cut', 'Mechanical fault', 'Waiting for yarn', 'Operator unavailable'].map((r) => <option key={r}>{r}</option>)}</Select>}</Field>
      </div>
    </Modal>
  )
}
