import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Empty, ErrorBox, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Panel, StatusBadge, TableWrap, Tabs, useConfirm, useToast } from '../components/ui'
import { date, dateTime, isoDay, metres } from '../lib/format'
import type { Roll } from '../lib/types'

type ReadyOrder = { order_id: number; order_no: string; buyer: string; status: string; quantity: number; dispatched_m: number; accepted_m: number; promised_date: string; order_block: string | null; eligible: Roll[]; blocked: { roll_no: string; reason: string }[] }
type D = { id: number; dispatch_no: string; order_id: number; order_no: string; buyer: string; status: string; planned_date: string; vehicle_no: string; transporter: string; confirmed_at: string | null; rolls: { roll_id: number; roll_no: string; length_m: number }[]; total_m: number }

export default function Dispatch() {
  const { can } = useAuth()
  const [tab, setTab] = useState<'ready' | 'shipments'>('ready')
  const ready = useQuery({ queryKey: ['dispatch-ready'], queryFn: () => api<ReadyOrder[]>('/api/dispatch/ready') })
  const ships = useQuery({ queryKey: ['dispatches'], queryFn: () => api<D[]>('/api/dispatch') })
  const [plan, setPlan] = useState<ReadyOrder | null>(null)
  const [confirmD, setConfirmD] = useState<D | null>(null)
  const manage = can('dispatch.manage')
  const planned = ships.data?.filter((d) => d.status === 'planned') ?? []
  return (
    <div>
      <PageHeader title="Dispatch" subtitle="Only accepted, packed rolls of a confirmed order can ship. Confirmation updates stock and order status together." />
      {planned.length > 0 && (
        <Panel title="Planned dispatches" className="mb-4" bodyClass="p-0">
          <ul className="divide-y divide-line">{planned.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
              <div className="flex-1"><b>{d.dispatch_no}</b> · {d.order_no} · {d.buyer}<div className="text-ink-3">{d.rolls.length} rolls · {metres(d.total_m)} · planned {date(d.planned_date)} · {d.vehicle_no ? `vehicle ${d.vehicle_no}` : 'no vehicle yet'}</div></div>
              <Link to={`/dispatch/${d.id}/packing-list`}><Button size="sm" icon={<FileText className="size-3.5" />}>Packing list</Button></Link>
              {manage && <Button size="sm" variant="primary" icon={<Truck className="size-3.5" />} onClick={() => setConfirmD(d)}>Confirm dispatch</Button>}
            </li>))}</ul>
        </Panel>
      )}
      <Panel bodyClass="p-0">
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} items={[{ value: 'ready', label: 'Finished rolls by order' }, { value: 'shipments', label: 'Shipment history' }]} /></div>
        {tab === 'ready' && (ready.isLoading ? <LoadingBlock /> : ready.error ? <ErrorBox error={ready.error} /> : !ready.data?.length ? <Empty title="No finished rolls" /> : (
          <ul className="divide-y divide-line">{ready.data.map((o) => (
            <li key={o.order_id} className="grid gap-3 px-4 py-3 lg:grid-cols-[260px_1fr_auto]">
              <div>
                <Link to={`/orders/${o.order_id}`} className="font-display text-[16px] font-semibold text-indigo-loom hover:underline">{o.order_no}</Link>
                <div className="text-[13px] text-ink-2">{o.buyer}</div>
                <div className="text-[12.5px] text-ink-3">{metres(o.dispatched_m)} of {metres(o.quantity)} shipped · due {date(o.promised_date)}</div>
              </div>
              <div className="text-[13px]">
                {o.order_block && <Notice tone="warn" className="mb-1.5">Dispatch blocked: {o.order_block}</Notice>}
                <div><span className="font-medium text-ok">{o.eligible.length} ready</span> ({metres(o.eligible.reduce((s, r) => s + r.length_m, 0))})</div>
                {o.blocked.length > 0 && <details><summary className="cursor-pointer text-ink-2">{o.blocked.length} roll(s) not dispatchable</summary>
                  <ul className="mt-1 space-y-0.5 text-ink-3">{o.blocked.map((b) => <li key={b.roll_no}>{b.reason}</li>)}</ul></details>}
              </div>
              <div>{manage && o.eligible.length > 0 && !o.order_block && <Button variant="primary" size="sm" onClick={() => setPlan(o)}>Plan dispatch</Button>}</div>
            </li>))}</ul>))}
        {tab === 'shipments' && (
          <TableWrap><table className="data-table min-w-[820px]"><thead><tr><th>Dispatch</th><th>Order</th><th>Buyer</th><th>Status</th><th className="num">Rolls</th><th className="num">Metres</th><th>Vehicle</th><th>Confirmed</th><th /></tr></thead>
            <tbody>{ships.data?.map((d) => <tr key={d.id}><td className="font-medium">{d.dispatch_no}</td><td>{d.order_no}</td><td>{d.buyer}</td><td><StatusBadge value={d.status === 'confirmed' ? 'completed' : d.status} /></td>
              <td className="num">{d.rolls.length}</td><td className="num">{metres(d.total_m)}</td><td>{d.vehicle_no || '–'}</td><td>{dateTime(d.confirmed_at)}</td>
              <td><Link className="text-indigo-thread hover:underline" to={`/dispatch/${d.id}/packing-list`}>Packing list</Link></td></tr>)}</tbody></table></TableWrap>)}
      </Panel>
      {plan && <PlanDispatch o={plan} onClose={() => setPlan(null)} />}
      {confirmD && <ConfirmDispatch d={confirmD} onClose={() => setConfirmD(null)} />}
    </div>
  )
}

function PlanDispatch({ o, onClose }: { o: ReadyOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [sel, setSel] = useState<Set<number>>(new Set(o.eligible.map((r) => r.id)))
  const [f, setF] = useState({ planned_date: isoDay(), vehicle_no: '', transporter: '' })
  const total = o.eligible.filter((r) => sel.has(r.id)).reduce((s, r) => s + r.length_m, 0)
  const m = useMutation({
    mutationFn: () => api<D>('/api/dispatch', { body: { order_id: o.order_id, roll_ids: [...sel], ...f } }),
    onSuccess: (d) => { qc.invalidateQueries(); toast('ok', `${d.dispatch_no} planned`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  return (
    <Modal open wide onClose={onClose} title={`Plan dispatch for ${o.order_no}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={sel.size === 0 || f.planned_date < isoDay()} loading={m.isPending} onClick={() => m.mutate()}>Plan dispatch of {sel.size} rolls</Button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Planned date" error={f.planned_date < isoDay() ? 'Planned dispatch date cannot be in the past' : null}>
          {(id) => <Input id={id} type="date" min={isoDay()} value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} />}
        </Field>
        <Field label="Vehicle number" hint="Needed before confirming">{(id) => <Input id={id} value={f.vehicle_no} onChange={(e) => setF({ ...f, vehicle_no: e.target.value })} placeholder="TN-33-AB-1234" />}</Field>
        <Field label="Transporter">{(id) => <Input id={id} value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })} />}</Field>
      </div>
      <p className="mt-4 mb-1 text-[13px] text-ink-2">{sel.size} rolls · {metres(total)} selected · {metres(o.dispatched_m + total)} of {metres(o.quantity)} after this shipment{o.dispatched_m + total < o.quantity && ' (partial shipment)'}</p>
      <div className="max-h-64 overflow-y-auto rounded-md border border-line">
        <table className="data-table"><tbody>{o.eligible.map((r) => (
          <tr key={r.id}><td className="w-8"><input type="checkbox" aria-label={`Include ${r.roll_no}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td><td>{r.roll_no}</td><td className="num">{metres(r.length_m)}</td><td>{r.location}</td></tr>))}</tbody></table>
      </div>
    </Modal>
  )
}

function ConfirmDispatch({ d, onClose }: { d: D; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [vehicle, setVehicle] = useState(d.vehicle_no)
  const [transporter, setTransporter] = useState(d.transporter)
  const m = useMutation({
    mutationFn: async () => {
      if (vehicle !== d.vehicle_no || transporter !== d.transporter) await api(`/api/dispatch/${d.id}`, { method: 'PATCH', body: { vehicle_no: vehicle, transporter } })
      return api<{ order_status: string; dispatched_m: number }>(`/api/dispatch/${d.id}/confirm`, { method: 'POST' })
    },
    onSuccess: (r) => { qc.invalidateQueries(); toast('ok', `${d.dispatch_no} confirmed. ${d.order_no} is ${r.order_status === 'completed' ? 'complete' : `${metres(r.dispatched_m)} shipped`}`); onClose() },
    onError: (e) => { qc.invalidateQueries(); toast('bad', (e as Error).message) },
  })
  const cancel = useMutation({
    mutationFn: () => api(`/api/dispatch/${d.id}/cancel`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `${d.dispatch_no} cancelled`); onClose() },
  })
  return (
    <Modal open onClose={onClose} title={`Confirm ${d.dispatch_no}`}
      footer={<>
        <Button variant="ghost" className="mr-auto text-bad" onClick={async () => (await confirm({ title: 'Cancel this planned dispatch?', body: 'The rolls go back to ready-for-dispatch.', confirm: 'Cancel dispatch', tone: 'danger' })) && cancel.mutate()}>Cancel dispatch</Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" disabled={!vehicle.trim()} loading={m.isPending} onClick={() => m.mutate()}>Confirm dispatch</Button></>}>
      <Notice className="mb-3">Each roll is re-checked at confirmation. If any roll has been rejected, held or already shipped since planning, nothing is dispatched.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vehicle number">{(id) => <Input id={id} value={vehicle} onChange={(e) => setVehicle(e.target.value)} />}</Field>
        <Field label="Transporter">{(id) => <Input id={id} value={transporter} onChange={(e) => setTransporter(e.target.value)} />}</Field>
      </div>
      <p className="mt-3 text-[13.5px]">{d.rolls.length} rolls · {metres(d.total_m)} for {d.buyer}</p>
    </Modal>
  )
}
