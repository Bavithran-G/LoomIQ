import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCheck, Pause, Pencil, Play, RefreshCcw } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, ErrorBox, Field, KV, LoadingBlock, Modal, Notice, Panel, StatusBadge, TableWrap, Tabs, Textarea, useConfirm, useToast } from '../components/ui'
import { ThreadStrip } from '../components/brand'
import { RiskCard } from '../components/RiskCard'
import { CostBreakdown } from '../components/CostBreakdown'
import { OrderForm } from './Orders'
import { date, dateTime, human, metres, num } from '../lib/format'
import type { CostBlock, Ev, Job, Order, Requirement, Risk, Roll } from '../lib/types'

type Detail = Order & { requirements: Requirement[]; jobs: Job[]; rolls: Roll[]; risk: Risk; allowed_actions: string[]; events: Ev[]; cost?: CostBlock & { entries: NonNullable<CostBlock['entries']> } }

export default function OrderDetail() {
  const { id } = useParams()
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'rolls' | 'materials' | 'jobs' | 'cost' | 'history'>('rolls')
  const [edit, setEdit] = useState(false)
  const [reasonFor, setReasonFor] = useState<null | 'hold' | 'cancel'>(null)
  const { data: o, isLoading, error, refetch } = useQuery({ queryKey: ['order', id], queryFn: () => api<Detail>(`/api/orders/${id}`) })
  const act = useMutation({
    mutationFn: (v: { action: string; reason?: string }) => api<{ info: { reservation?: { sku: string; reserved_now: number; shortage: number }[] } }>(`/api/orders/${id}/transition`, { body: v }),
    onSuccess: (r, v) => {
      qc.invalidateQueries()
      const short = r.info.reservation?.filter((x) => x.shortage > 0) ?? []
      toast(short.length ? 'info' : 'ok', v.action === 'confirm' || v.action === 'reserve'
        ? short.length ? `Reserved what was available; still short: ${short.map((s) => `${s.sku} ${s.shortage}`).join(', ')}` : 'Materials reserved in full'
        : `Order ${v.action === 'hold' ? 'put on hold' : v.action === 'resume' ? 'resumed' : 'cancelled'}`)
      setReasonFor(null)
    },
    onError: (e) => toast('bad', (e as Error).message),
  })
  if (isLoading) return <LoadingBlock rows={10} />
  if (error || !o) return <ErrorBox error={error ?? 'Not found'} onRetry={refetch} />
  const m = o.metrics
  const manage = can('orders.manage')
  const A = new Set(o.allowed_actions)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-ink-3"><Link to="/orders" className="hover:underline">Sales orders</Link> / {o.order_no}</div>
          <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold">{o.order_no} <StatusBadge value={o.status} /> {o.priority !== 'normal' && <StatusBadge value={o.priority} />}</h1>
          <p className="text-sm text-ink-2">{o.buyer} · PO {o.buyer_po} · {o.fabric} in {o.colour}</p>
          {o.status === 'on_hold' && <Notice tone="warn" className="mt-2">On hold: {o.hold_reason}</Notice>}
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {A.has('confirm') && <Button variant="primary" icon={<CheckCheck className="size-4" />} loading={act.isPending}
              onClick={async () => (await confirm({ title: `Confirm ${o.order_no}?`, body: 'Required yarn, dye and chemicals will be reserved from free stock. Any shortage is reported, and you can top up the reservation later.', confirm: 'Confirm and reserve' })) && act.mutate({ action: 'confirm' })}>Confirm order</Button>}
            {A.has('reserve') && o.requirements.some((r) => r.shortage < r.still_needed && r.still_needed > 0) && <Button icon={<RefreshCcw className="size-4" />} onClick={() => act.mutate({ action: 'reserve' })}>Top up reservation</Button>}
            {A.has('resume') && <Button icon={<Play className="size-4" />} onClick={() => act.mutate({ action: 'resume' })}>Resume</Button>}
            {A.has('hold') && <Button icon={<Pause className="size-4" />} onClick={() => setReasonFor('hold')}>Put on hold</Button>}
            {o.status !== 'completed' && o.status !== 'cancelled' && <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>Edit</Button>}
            {A.has('cancel') && <Button variant="ghost" className="text-bad" icon={<Ban className="size-4" />} onClick={() => setReasonFor('cancel')}>Cancel order</Button>}
          </div>
        )}
      </div>

      <Panel>
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div>
            <ThreadStrip progress={o.progress} quantity={o.quantity} problem={m.quality_shortfall_m > 0} />
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Fig label="Ordered" v={metres(o.quantity)} />
              <Fig label="Woven" v={metres(m.produced_m)} />
              <Fig label="Accepted" v={metres(m.accepted_m)} tone="ok" />
              <Fig label="Rejected" v={metres(m.rejected_m)} tone={m.rejected_m > 0 ? 'bad' : undefined} />
              <Fig label="In rework / on hold" v={`${num(m.rework_m)} / ${num(m.hold_m)} m`} tone={m.rework_m + m.hold_m > 0 ? 'warn' : undefined} />
              <Fig label="Not yet inspected" v={metres(m.pending_inspection_m)} />
              <Fig label="Dispatched" v={metres(m.dispatched_m)} />
              <Fig label="Replacement needed" v={metres(m.quality_shortfall_m)} tone={m.quality_shortfall_m > 0 ? 'bad' : undefined}
                hint="Rejected fabric that must be re-woven to deliver the full quantity" />
            </div>
          </div>
          <div className="border-line lg:border-l lg:pl-5">
            <KV items={[['Order date', date(o.order_date)], ['Promised', date(o.promised_date)], ['Dispatch', <StatusBadge value={o.dispatch_status} />],
              ['Fabric code', o.fabric_code], ['Remaining to weave', metres(m.remaining_to_weave_m)], ['Rejection rate', m.rejection_rate == null ? '–' : `${(m.rejection_rate * 100).toFixed(1)}%`]]} />
            {o.notes && <p className="mt-3 text-[13px] text-ink-2"><span className="text-ink-3">Buyer notes: </span>{o.notes}</p>}
            {o.internal_notes && <p className="mt-1 text-[13px] text-ink-2"><span className="text-ink-3">Internal: </span>{o.internal_notes}</p>}
          </div>
        </div>
      </Panel>

      <RiskCard risk={o.risk} />

      <Panel bodyClass="p-0">
        <div className="px-3 pt-1">
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'rolls', label: `Rolls (${o.rolls.length})` }, { value: 'materials', label: 'Materials' },
            { value: 'jobs', label: `Production jobs (${o.jobs.length})` }, ...(o.cost ? [{ value: 'cost' as const, label: 'Cost' }] : []),
            { value: 'history', label: 'History' }]} />
        </div>
        {tab === 'rolls' && (o.rolls.length === 0
          ? <p className="p-4 text-sm text-ink-2">No rolls yet. Rolls are created when a weaving job is completed.</p>
          : <TableWrap><table className="data-table min-w-[760px]"><thead><tr><th>Roll</th><th className="num">Length</th><th>Stage</th><th>Quality</th><th>Location</th><th>Loom</th><th>Yarn lots</th></tr></thead>
            <tbody>{o.rolls.map((r) => (
              <tr key={r.id}><td><Link className="font-medium text-indigo-thread hover:underline" to={`/rolls/${r.roll_no}`}>{r.roll_no}</Link></td><td className="num">{metres(r.length_m)}</td>
                <td>{human(r.stage)}</td><td><StatusBadge value={r.quality} /></td><td>{r.location}</td><td>{r.machine ?? '–'}</td><td className="text-[12.5px] text-ink-3">{r.material_lots.join(', ')}</td></tr>))}</tbody></table></TableWrap>)}
        {tab === 'materials' && (
          <TableWrap><table className="data-table min-w-[760px]"><thead><tr><th>Material</th><th className="num">Per metre</th><th className="num">Required</th><th className="num">Consumed</th><th className="num">Reserved</th><th className="num">Still needed</th><th className="num">Free stock</th><th className="num">On order</th><th className="num">Shortage</th></tr></thead>
            <tbody>{o.requirements.map((r) => (
              <tr key={r.sku}><td>{r.sku}<div className="text-[12px] text-ink-3">{r.name}</div></td><td className="num">{r.qty_per_m} {r.uom}</td><td className="num">{num(r.required)}</td>
                <td className="num">{num(r.consumed)}</td><td className="num">{num(r.reserved)}</td><td className="num">{num(r.still_needed)}</td><td className="num">{num(r.free_available)}</td><td className="num">{num(r.on_order)}</td>
                <td className={r.shortage > 0 ? 'num font-semibold text-bad' : 'num text-ok'}>{r.shortage > 0 ? num(r.shortage) : 'None'}</td></tr>))}</tbody></table>
            <p className="px-4 py-2 text-[12.5px] text-ink-3">Required = order quantity × per-metre consumption. Yarn is consumed only when a weaving job is completed.</p></TableWrap>)}
        {tab === 'jobs' && (o.jobs.length === 0 ? <p className="p-4 text-sm text-ink-2">No production jobs planned. <Link to="/production" className="text-indigo-thread underline">Plan a job</Link></p>
          : <TableWrap><table className="data-table min-w-[760px]"><thead><tr><th>Job</th><th>Stage</th><th>Machine</th><th>Date / shift</th><th className="num">Planned</th><th className="num">Actual</th><th>Status</th><th>Delay reason</th></tr></thead>
            <tbody>{o.jobs.map((j) => (
              <tr key={j.id}><td className="font-medium">{j.job_no}</td><td>{human(j.stage_code)}</td><td>{j.machine ?? '–'}</td><td>{date(j.planned_date)} / {j.shift}</td>
                <td className="num">{metres(j.planned_qty)}</td><td className="num">{j.status === 'completed' ? metres(j.actual_qty) : '–'}</td><td><StatusBadge value={j.status} /></td>
                <td className="text-[13px] text-ink-2">{j.delay_reason || '–'}</td></tr>))}</tbody></table></TableWrap>)}
        {tab === 'cost' && o.cost && <div className="p-4"><CostBreakdown c={o.cost} /></div>}
        {tab === 'history' && (
          <ol className="divide-y divide-line">
            {o.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
                <span className="w-32 shrink-0 text-ink-3">{dateTime(e.at)}</span>
                <span className="min-w-0 flex-1">{e.message}</span>
                {e.severity !== 'info' && <Badge tone={e.severity === 'critical' ? 'bad' : e.severity === 'warning' ? 'warn' : 'ok'}>{human(e.severity)}</Badge>}
                <span className="text-ink-3">{e.user ?? 'System'}</span>
              </li>))}
          </ol>)}
      </Panel>
      {edit && <OrderForm initial={o} onClose={() => setEdit(false)} onSaved={() => refetch()} />}
      {reasonFor && <ReasonModal kind={reasonFor} loading={act.isPending} onClose={() => setReasonFor(null)} onSubmit={(reason) => act.mutate({ action: reasonFor, reason })} />}
    </div>
  )
}

function Fig({ label, v, tone, hint }: { label: string; v: string; tone?: 'ok' | 'bad' | 'warn'; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className={`font-display text-[19px] font-semibold ${tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-indigo-loom'}`}>{v}</div>
    </div>
  )
}

function ReasonModal({ kind, onClose, onSubmit, loading }: { kind: 'hold' | 'cancel'; onClose: () => void; onSubmit: (r: string) => void; loading: boolean }) {
  const [r, setR] = useState('')
  return (
    <Modal open onClose={onClose} title={kind === 'hold' ? 'Put order on hold' : 'Cancel order'}
      footer={<><Button variant="ghost" onClick={onClose}>Go back</Button><Button variant={kind === 'cancel' ? 'danger' : 'primary'} loading={loading} disabled={r.trim().length < 3} onClick={() => onSubmit(r)}>{kind === 'hold' ? 'Put on hold' : 'Cancel order'}</Button></>}>
      {kind === 'cancel' && <Notice tone="warn" className="mb-3">Reserved materials go back to free stock and open jobs and planned dispatches are cancelled. Orders with dispatched rolls cannot be cancelled.</Notice>}
      {kind === 'hold' && <Notice className="mb-3">Running jobs are paused and dispatch is blocked until the order is resumed. The buyer sees that the order is on hold.</Notice>}
      <Field label="Reason (required)">{(id) => <Textarea id={id} value={r} onChange={(e) => setR(e.target.value)} />}</Field>
    </Modal>
  )
}
