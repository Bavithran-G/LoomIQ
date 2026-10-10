import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Empty, ErrorBox, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap, Textarea, useToast } from '../components/ui'
import { ThreadStrip } from '../components/brand'
import { addDays, date, isoDay, metres } from '../lib/format'
import type { Order } from '../lib/types'

type Ref = { buyers: { id: number; name: string; code: string }[]; fabric_specs: { id: number; code: string; name: string; construction: string; materials: { sku: string; qty_per_m: number; uom: string }[] }[] }

export default function Orders() {
  const { can } = useAuth()
  const nav = useNavigate()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const params = new URLSearchParams({ ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(term ? { q: term } : {}) })
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['orders', status, priority, term], queryFn: () => api<Order[]>(`/api/orders?${params}`) })

  return (
    <div>
      <PageHeader title="Sales orders" subtitle="Customer orders from confirmation to final dispatch."
        actions={can('orders.manage') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New order</Button>} />
      <Panel bodyClass="p-0">
        <form className="flex flex-wrap gap-2 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }}>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-2.5 size-4 text-ink-3" />
            <Input aria-label="Search orders" placeholder="Order no., buyer PO, buyer, fabric, colour" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {['draft', 'confirmed', 'in_production', 'on_hold', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
          <Select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-36">
            <option value="">Any priority</option>{['urgent', 'high', 'normal', 'low'].map((p) => <option key={p}>{p}</option>)}
          </Select>
          <Button type="submit">Search</Button>
        </form>
        {isLoading && <LoadingBlock />}
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {data && data.length === 0 && <Empty title="No orders match these filters" action={<Button onClick={() => { setStatus(''); setPriority(''); setQ(''); setTerm('') }}>Clear filters</Button>} />}
        {data && data.length > 0 && (
          <TableWrap>
            <table className="data-table min-w-[1000px]">
              <thead><tr><th>Order</th><th>Buyer</th><th>Fabric</th><th className="num">Qty</th><th className="w-[260px]">Progress</th><th>Promised</th><th>Status</th><th>Risk</th><th>Dispatch</th></tr></thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} className="cursor-pointer" onClick={() => nav(`/orders/${o.id}`)}>
                    <td><Link to={`/orders/${o.id}`} className="font-semibold text-indigo-loom hover:underline" onClick={(e) => e.stopPropagation()}>{o.order_no}</Link>
                      <div className="text-[12px] text-ink-3">PO {o.buyer_po}{o.priority !== 'normal' && <> · <span className={o.priority === 'urgent' || o.priority === 'high' ? 'text-bad' : ''}>{o.priority}</span></>}</div></td>
                    <td>{o.buyer}</td>
                    <td>{o.fabric}<div className="text-[12px] text-ink-3">{o.colour}</div></td>
                    <td className="num">{metres(o.quantity)}</td>
                    <td><ThreadStrip compact progress={o.progress} quantity={o.quantity} problem={o.metrics.quality_shortfall_m > 0} />
                      <div className="mt-1 text-[12px] text-ink-3">{metres(o.metrics.accepted_m)} accepted{o.metrics.rejected_m > 0 && <span className="text-bad"> · {metres(o.metrics.rejected_m)} rejected</span>}</div></td>
                    <td>{date(o.promised_date)}</td>
                    <td><StatusBadge value={o.status} /></td>
                    <td>{o.risk ? <StatusBadge value={o.risk.band} /> : <span className="text-ink-3">–</span>}</td>
                    <td><StatusBadge value={o.dispatch_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
      {open && <OrderForm onClose={() => setOpen(false)} onSaved={(o) => nav(`/orders/${o.id}`)} />}
    </div>
  )
}

export function OrderForm({ onClose, onSaved, initial }: { onClose: () => void; onSaved: (o: Order) => void; initial?: Order }) {
  const qc = useQueryClient()
  const toast = useToast()
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Ref>('/api/reference') })
  const draft = !initial || initial.status === 'draft'
  const [f, setF] = useState({
    buyer_id: initial?.buyer_id ?? 0, buyer_po: initial?.buyer_po ?? '', fabric_spec_id: initial?.fabric_spec_id ?? 0,
    colour: initial?.colour ?? '', quantity: initial?.quantity ?? 1000, order_date: initial?.order_date ?? isoDay(),
    promised_date: initial?.promised_date ?? addDays(isoDay(), 21), priority: initial?.priority ?? 'normal',
    notes: initial?.notes ?? '', internal_notes: initial?.internal_notes ?? '',
  })
  const [errs, setErrs] = useState<Record<string, string>>({})
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }))
  const avail = useQuery({
    queryKey: ['avail-new', f.fabric_spec_id, f.quantity], enabled: !initial && f.fabric_spec_id > 0 && f.quantity > 0,
    queryFn: () => api<{ requirements: { sku: string; uom: string; required: number; free_available: number; on_order: number; shortage: number }[]; fully_covered: boolean }>(
      '/api/orders/check-availability', { body: { ...f, buyer_id: f.buyer_id || 1, buyer_po: f.buyer_po || 'x', colour: f.colour || 'x' } }),
  })
  const m = useMutation({
    mutationFn: () => initial
      ? api<Order>(`/api/orders/${initial.id}`, { method: 'PATCH', body: draft ? f : { promised_date: f.promised_date, priority: f.priority, notes: f.notes, internal_notes: f.internal_notes } })
      : api<Order>('/api/orders', { body: f }),
    onSuccess: (o) => { qc.invalidateQueries(); toast('ok', initial ? `${o.order_no} saved` : `${o.order_no} created as draft`); onSaved(o); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const validate = () => {
    const e: Record<string, string> = {}
    if (!f.buyer_id) e.buyer_id = 'Choose a buyer'
    if (!f.buyer_po.trim()) e.buyer_po = "Enter the buyer's PO reference"
    if (!f.fabric_spec_id) e.fabric_spec_id = 'Choose a fabric'
    if (!f.colour.trim()) e.colour = 'Enter the colour'
    if (!(f.quantity > 0)) e.quantity = 'Quantity must be more than zero'
    if (f.promised_date < f.order_date) e.promised_date = 'Must be on or after the order date'
    setErrs(e)
    return Object.keys(e).length === 0
  }
  return (
    <Modal open onClose={onClose} title={initial ? `Edit ${initial.order_no}` : 'New sales order'} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => validate() && m.mutate()}>{initial ? 'Save changes' : 'Create draft order'}</Button></>}>
      {!draft && <Notice className="mb-3">Buyer, fabric, colour and quantity are locked once an order is confirmed. You can still change the promised date, priority and notes.</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Buyer" error={errs.buyer_id}>{(id) => <Select id={id} disabled={!draft} value={f.buyer_id} onChange={(e) => set('buyer_id', Number(e.target.value))}><option value={0}>Select buyer</option>{ref.data?.buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}</Field>
        <Field label="Buyer PO reference" error={errs.buyer_po} hint="Used to prevent duplicate orders">{(id) => <Input id={id} disabled={!draft} value={f.buyer_po} onChange={(e) => set('buyer_po', e.target.value)} />}</Field>
        <Field label="Fabric" error={errs.fabric_spec_id}>{(id) => <Select id={id} disabled={!draft} value={f.fabric_spec_id} onChange={(e) => set('fabric_spec_id', Number(e.target.value))}><option value={0}>Select fabric</option>{ref.data?.fabric_specs.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.construction})</option>)}</Select>}</Field>
        <Field label="Colour" error={errs.colour}>{(id) => <Input id={id} disabled={!draft} value={f.colour} onChange={(e) => set('colour', e.target.value)} placeholder="e.g. Navy blue" />}</Field>
        <Field label="Quantity (metres)" error={errs.quantity}>{(id) => <Input id={id} disabled={!draft} type="number" min={1} step={1} value={f.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />}</Field>
        <Field label="Priority">{(id) => <Select id={id} value={f.priority} onChange={(e) => set('priority', e.target.value)}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p}>{p}</option>)}</Select>}</Field>
        <Field label="Order date">{(id) => <Input id={id} disabled={!draft} type="date" value={f.order_date} onChange={(e) => set('order_date', e.target.value)} />}</Field>
        <Field label="Promised delivery" error={errs.promised_date}>{(id) => <Input id={id} type="date" value={f.promised_date} onChange={(e) => set('promised_date', e.target.value)} />}</Field>
        <Field label="Notes (visible to buyer)" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        <Field label="Internal notes (mill only)" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.internal_notes} onChange={(e) => set('internal_notes', e.target.value)} />}</Field>
      </div>
      {avail.data && (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">Material check (nothing is reserved until the order is confirmed)</p>
          <table className="data-table"><thead><tr><th>Material</th><th className="num">Required</th><th className="num">Free now</th><th className="num">On order</th><th className="num">Short</th></tr></thead>
            <tbody>{avail.data.requirements.map((r) => (
              <tr key={r.sku}><td>{r.sku}</td><td className="num">{r.required} {r.uom}</td><td className="num">{r.free_available}</td><td className="num">{r.on_order}</td>
                <td className={r.shortage > 0 ? 'num font-semibold text-bad' : 'num text-ok'}>{r.shortage > 0 ? r.shortage : 'Covered'}</td></tr>))}</tbody></table>
        </div>
      )}
    </Modal>
  )
}
