import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Empty, ErrorBox, Field, Input, KV, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap, Textarea, useToast } from '../components/ui'
import { ThreadStrip } from '../components/brand'
import { date, dateTime, metres } from '../lib/format'
import type { StageProgress } from '../lib/types'

type BO = { id: number; order_no: string; buyer_po: string; fabric: string; colour: string; quantity: number; unit: string; order_date: string; promised_date: string; status: string; progress: StageProgress[]; dispatch_status: string; accepted_m: number; dispatched_m: number; ready_m: number; notes: string }
type BODetail = BO & { timeline: { message: string; at: string }[]; quality: { released_rolls: { roll_no: string; length_m: number; status: string; inspected_on: string | null; note: string }[]; inspected_m: number }; dispatches: { id: number; dispatch_no: string; status: string; planned_date: string; confirmed_at: string | null; vehicle_no: string; total_m: number; rolls: number }[] }
type FabricSpec = { id: number; code: string; name: string; construction: string; gsm: number; width_cm: number }

function todayStr() { return new Date().toISOString().slice(0, 10) }
function minDelivery() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (n: string) => void }) {
  const toast = useToast()
  const { data: specs, isLoading: specsLoading } = useQuery({
    queryKey: ['portal-fabric-specs'],
    queryFn: () => api<FabricSpec[]>('/api/portal/fabric-specs'),
  })
  
  const [f, setF] = useState({ buyerPo: '', fabricId: 0, colour: '', quantity: '', deliveryDate: '', notes: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (!f.buyerPo.trim()) { setErr('Your PO reference is required.'); return }
    if (!f.fabricId) { setErr('Please select a fabric.'); return }
    if (!f.colour.trim()) { setErr('Colour / shade is required.'); return }
    const qty = parseFloat(f.quantity)
    if (!f.quantity || isNaN(qty) || qty <= 0) { setErr('Quantity must be a positive number.'); return }
    if (qty > 1_000_000) { setErr('Quantity exceeds maximum of 1,000,000 m.'); return }
    if (!f.deliveryDate) { setErr('Requested delivery date is required.'); return }
    if (f.deliveryDate <= todayStr()) { setErr('Delivery date must be in the future.'); return }
    setBusy(true)
    try {
      const order = await api<BO>('/api/portal/orders', {
        method: 'POST',
        body: { buyer_po: f.buyerPo.trim(), fabric_spec_id: f.fabricId, colour: f.colour.trim(), quantity: qty, promised_date: f.deliveryDate, notes: f.notes.trim() },
      })
      setSuccess(order.order_no)
      toast('ok', `Order ${order.order_no} submitted successfully.`)
      onCreated(order.order_no)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Create New Order" wide
      footer={success
        ? <Button variant="primary" onClick={onClose}>Close</Button>
        : <><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} type="submit" form="new-order-form">Submit Order</Button></>
      }
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-ok-soft"><FileText className="size-7 text-ok" /></div>
          <p className="text-[17px] font-bold text-ink">Order Submitted!</p>
          <p className="text-[15px] font-semibold text-indigo-loom">{success}</p>
          <p className="max-w-xs text-sm text-ink-2">Your order has been received and is now under review. It will appear in your order list once confirmed by the mill.</p>
        </div>
      ) : (
        <form id="new-order-form" onSubmit={handleSubmit} className="space-y-4">
          <Notice tone="info">Orders are created as <strong>Draft</strong> and reviewed by the mill before confirmation. Inventory is reserved only after the mill confirms your order.</Notice>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your PO Reference" hint="Your internal purchase order number">
              {(id) => <Input id={id} value={f.buyerPo} onChange={(e) => setF({ ...f, buyerPo: e.target.value })} placeholder="e.g. PO-2026-001" autoFocus />}
            </Field>
            <Field label="Fabric / Product">
              {(id) => specsLoading
                ? <div className="h-10 animate-pulse rounded-md bg-sunk" />
                : <Select id={id} value={f.fabricId} onChange={(e) => setF({ ...f, fabricId: Number(e.target.value) })}>
                    <option value={0}>Select fabric…</option>
                    {specs?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code}){s.gsm ? ` · ${s.gsm} GSM` : ''}{s.width_cm ? ` · ${s.width_cm} cm` : ''}</option>)}
                  </Select>}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour / Shade">
              {(id) => <Input id={id} value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} placeholder="e.g. Navy Blue, Ecru, 100% White" />}
            </Field>
            <Field label="Quantity (metres)">
              {(id) => <Input id={id} type="number" min="0.001" step="0.001" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} placeholder="e.g. 5000" />}
            </Field>
          </div>
          <Field label="Requested Delivery Date">
            {(id) => <Input id={id} type="date" min={minDelivery()} value={f.deliveryDate} onChange={(e) => setF({ ...f, deliveryDate: e.target.value })} className="w-full sm:w-60" />}
          </Field>
          <Field label="Notes / Special Requirements" hint="Finishing, packaging, certifications, or other requirements">
            {(id) => <Textarea id={id} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional — any special requirements for this order" />}
          </Field>
          {err && <Notice tone="bad">{err}</Notice>}
        </form>
      )}
    </Modal>
  )
}

export default function Portal() {
  const { id } = useParams()
  const { user } = useAuth()
  return id ? <PortalOrder id={id} /> : <PortalList name={user?.buyer_name ?? user?.full_name ?? ''} />
}

function PortalList({ name }: { name: string }) {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const { data, isLoading, error } = useQuery({ queryKey: ['portal'], queryFn: () => api<BO[]>('/api/portal/orders') })
  function handleCreated(_orderNo: string) { qc.invalidateQueries({ queryKey: ['portal'] }) }
  return (
    <div>
      <PageHeader
        title={`Orders — ${name}`}
        subtitle="Production stage, released quantity and shipments for your orders with Everest Textile Mills."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setShowNew(true)}>Create New Order</Button>}
      />
      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
      {isLoading && <LoadingBlock />}
      {error && <ErrorBox error={error} />}
      {data?.length === 0 && (
        <Empty title="No confirmed orders yet"
          action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setShowNew(true)}>Create New Order</Button>}>
          Submit your first order using the button above. Orders appear here once the mill confirms them.
        </Empty>
      )}
      <div className="grid gap-3">
        {data?.map((o) => (
          <Link key={o.id} to={`/portal/orders/${o.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-indigo-mist">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-display text-[19px] font-semibold text-indigo-loom">{o.order_no} <span className="text-[14px] font-normal text-ink-3">· your PO {o.buyer_po}</span></div>
                <div className="text-sm text-ink-2">{o.fabric}, {o.colour} · {metres(o.quantity)}</div>
              </div>
              <div className="flex gap-2"><StatusBadge value={o.status} /><StatusBadge value={o.dispatch_status} /></div>
            </div>
            <div className="mt-3"><ThreadStrip progress={o.progress} quantity={o.quantity} /></div>
            <div className="mt-2 text-[13px] text-ink-2">Delivery promised {date(o.promised_date)} · {metres(o.accepted_m)} released after inspection · {metres(o.dispatched_m)} shipped</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function PortalOrder({ id }: { id: string }) {
  const { data: o, isLoading, error } = useQuery({ queryKey: ['portal', id], queryFn: () => api<BODetail>(`/api/portal/orders/${id}`) })
  if (isLoading) return <LoadingBlock />
  if (error || !o) return <ErrorBox error={error ?? 'Order not found'} />
  return (
    <div className="space-y-4">
      <div className="text-[13px] text-ink-3"><Link to="/portal" className="hover:underline">Your orders</Link> / {o.order_no}</div>
      <PageHeader title={o.order_no} subtitle={`Your PO ${o.buyer_po} · ${o.fabric}, ${o.colour}`} actions={<><StatusBadge value={o.status} /><StatusBadge value={o.dispatch_status} /></>} />
      {o.status === 'on_hold' && <Notice tone="warn">This order is on hold. The mill will contact you with details.</Notice>}
      <Panel>
        <ThreadStrip progress={o.progress} quantity={o.quantity} />
        <div className="mt-4"><KV cols={4} items={[['Ordered', metres(o.quantity)], ['Released after inspection', metres(o.accepted_m)], ['Ready to ship', metres(o.ready_m)], ['Shipped', metres(o.dispatched_m)], ['Order date', date(o.order_date)], ['Promised delivery', date(o.promised_date)]]} /></div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Shipments" bodyClass="p-0">
          {o.dispatches.length === 0 ? <p className="p-4 text-sm text-ink-2">No shipments planned yet.</p> : (
            <ul className="divide-y divide-line">{o.dispatches.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
                <div className="flex-1"><b>{d.dispatch_no}</b> · {d.rolls} rolls · {metres(d.total_m)}<div className="text-ink-3">{d.status === 'confirmed' ? `Left the mill ${dateTime(d.confirmed_at)} · vehicle ${d.vehicle_no}` : `Planned for ${date(d.planned_date)}`}</div></div>
                {d.status === 'confirmed' && <Link to={`/dispatch/${d.id}/packing-list`} className="flex items-center gap-1 text-indigo-thread hover:underline"><FileText className="size-4" />Packing list</Link>}
              </li>))}</ul>)}</Panel>
        <Panel title="Order timeline" bodyClass="p-0">
          <ol className="max-h-80 divide-y divide-line overflow-y-auto">{o.timeline.map((e, i) => <li key={i} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2 text-[13.5px]"><span className="text-ink-3">{dateTime(e.at)}</span><span>{e.message}</span></li>)}</ol>
        </Panel>
      </div>
      <Panel title="Released rolls" subtitle="Rolls that passed the mill's inspection" bodyClass="p-0">
        {o.quality.released_rolls.length === 0 ? <p className="p-4 text-sm text-ink-2">No rolls released yet.</p> : (
          <TableWrap><table className="data-table"><thead><tr><th>Roll</th><th className="num">Length</th><th>Inspected</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>{o.quality.released_rolls.map((r) => <tr key={r.roll_no}><td>{r.roll_no}</td><td className="num">{metres(r.length_m)}</td><td>{date(r.inspected_on)}</td><td><StatusBadge value={r.status === 'dispatched' ? 'fully_dispatched' : 'ready'} /></td><td className="text-[13px] text-ink-2">{r.note || '–'}</td></tr>)}</tbody></table></TableWrap>)}
      </Panel>
    </div>
  )
}
