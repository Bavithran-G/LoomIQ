import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { PackagePlus, SlidersHorizontal } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, Empty, ErrorBox, Field, Input, KV, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap, Tabs, useToast } from '../components/ui'
import { date, dateTime, human, isoDay, money2, num } from '../lib/format'
import type { Material } from '../lib/types'

type Lot = { id: number; lot_number: string; material_id: number; sku: string; supplier: string | null; receipt_date: string; unit_cost: number; qty_received: number; qty_available: number; qty_reserved: number; qty_consumed: number }
type Move = { id: number; sku: string; lot: string | null; type: string; qty: number; order_id: number | null; reason: string; user: string | null; at: string }
type PL = { id: number; po_number: string; material_id: number; sku: string; supplier: string | null; supplier_id: number | null; qty: number; unit_cost: number; expected_date: string; status: string }

export default function Inventory() {
  const { can } = useAuth()
  const [tab, setTab] = useState<'stock' | 'lots' | 'po' | 'moves'>('stock')
  const [sel, setSel] = useState<Material | null>(null)
  const [receive, setReceive] = useState<{ material?: Material; pl?: PL } | null>(null)
  const [adjust, setAdjust] = useState(false)
  const mats = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('/api/inventory/materials') })
  const lots = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/api/inventory/lots'), enabled: tab === 'lots' || adjust })
  const moves = useQuery({ queryKey: ['moves'], queryFn: () => api<Move[]>('/api/inventory/movements?limit=200'), enabled: tab === 'moves' })
  const pls = useQuery({ queryKey: ['pls'], queryFn: () => api<PL[]>('/api/inventory/purchase-lines') })
  const manage = can('inventory.manage')

  return (
    <div>
      <PageHeader title="Raw-material inventory" subtitle="Yarn, dyes and chemicals by lot. Free stock can be reserved; yarn is consumed only when weaving completes."
        actions={manage && <>
          <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjust(true)}>Adjust stock</Button>
          <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={() => setReceive({})}>Receive goods</Button></>} />
      {mats.data && mats.data.some((m) => m.low_stock) && (
        <Notice tone="warn" className="mb-3">Below reorder level: {mats.data.filter((m) => m.low_stock).map((m) => `${m.sku} (${num(m.available)} ${m.uom} free, ${num(m.on_order)} on order)`).join('; ')}</Notice>
      )}
      <Panel bodyClass="p-0">
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} items={[{ value: 'stock', label: 'Stock by material' }, { value: 'lots', label: 'Lots' }, { value: 'po', label: 'Incoming purchase orders' }, { value: 'moves', label: 'Movement history' }]} /></div>
        {tab === 'stock' && (mats.isLoading ? <LoadingBlock /> : mats.error ? <ErrorBox error={mats.error} /> : (
          <TableWrap><table className="data-table min-w-[900px]">
            <thead><tr><th>Material</th><th>Type</th><th className="num">Free</th><th className="num">Reserved</th><th className="num">Consumed</th><th className="num">On order</th><th className="w-44">Free vs reorder level</th><th>Supplier</th></tr></thead>
            <tbody>{mats.data!.map((m) => (
              <tr key={m.id} className="cursor-pointer" onClick={() => setSel(m)}>
                <td><span className="font-medium text-indigo-thread">{m.sku}</span><div className="text-[12px] text-ink-3">{m.name}</div></td>
                <td>{human(m.material_type)}</td>
                <td className={clsx('num font-medium', m.low_stock && 'text-warn')}>{num(m.available)} {m.uom}</td>
                <td className="num">{num(m.reserved)}</td><td className="num">{num(m.consumed)}</td><td className="num">{num(m.on_order)}</td>
                <td><StockGauge m={m} /></td>
                <td className="text-[13px]">{m.supplier ?? '–'}</td>
              </tr>))}</tbody></table></TableWrap>))}
        {tab === 'lots' && (lots.isLoading ? <LoadingBlock /> : (
          <TableWrap><table className="data-table min-w-[900px]"><thead><tr><th>Lot</th><th>Material</th><th>Supplier</th><th>Received</th><th className="num">Unit cost</th><th className="num">Received</th><th className="num">Free</th><th className="num">Reserved</th><th className="num">Consumed</th></tr></thead>
            <tbody>{lots.data?.map((l) => <tr key={l.id}><td className="font-medium">{l.lot_number}</td><td>{l.sku}</td><td>{l.supplier ?? '–'}</td><td>{date(l.receipt_date)}</td><td className="num">{money2(l.unit_cost)}</td>
              <td className="num">{num(l.qty_received)}</td><td className="num">{num(l.qty_available)}</td><td className="num">{num(l.qty_reserved)}</td><td className="num">{num(l.qty_consumed)}</td></tr>)}</tbody></table></TableWrap>))}
        {tab === 'po' && (
          pls.data?.length === 0 ? <Empty title="No purchase orders" /> :
          <TableWrap><table className="data-table min-w-[760px]"><thead><tr><th>PO</th><th>Material</th><th>Supplier</th><th className="num">Qty</th><th className="num">Unit cost</th><th>Expected</th><th>Status</th><th /></tr></thead>
            <tbody>{pls.data?.map((p) => <tr key={p.id}><td className="font-medium">{p.po_number}</td><td>{p.sku}</td><td>{p.supplier}</td><td className="num">{num(p.qty)}</td><td className="num">{money2(p.unit_cost)}</td>
              <td>{date(p.expected_date)}</td><td><Badge tone={p.status === 'open' ? 'info' : 'neutral'}>{human(p.status)}</Badge></td>
              <td>{manage && p.status === 'open' && <Button size="sm" onClick={() => setReceive({ pl: p })}>Receive</Button>}</td></tr>)}</tbody></table></TableWrap>)}
        {tab === 'moves' && (moves.isLoading ? <LoadingBlock /> : (
          <TableWrap><table className="data-table min-w-[900px]"><thead><tr><th>When</th><th>Type</th><th>Material</th><th>Lot</th><th className="num">Qty</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{moves.data?.map((mv) => <tr key={mv.id}><td>{dateTime(mv.at)}</td><td><MoveBadge t={mv.type} /></td><td>{mv.sku}</td><td>{mv.lot}</td>
              <td className={clsx('num', mv.qty < 0 ? 'text-ink-2' : 'text-ok')}>{mv.qty > 0 ? '+' : ''}{num(mv.qty)}</td><td className="text-[13px]">{mv.reason}</td><td>{mv.user ?? 'System'}</td></tr>)}</tbody></table>
            <p className="px-4 py-2 text-[12.5px] text-ink-3">Reserve and consume movements are shown from the free-stock point of view: a reservation moves stock out of free into reserved.</p></TableWrap>))}
      </Panel>
      {sel && <MaterialModal m={sel} onClose={() => setSel(null)} onReceive={() => { setReceive({ material: sel }); setSel(null) }} canManage={manage} />}
      {receive && <ReceiveModal materials={mats.data ?? []} preset={receive} onClose={() => setReceive(null)} />}
      {adjust && <AdjustModal lots={lots.data ?? []} onClose={() => setAdjust(false)} />}
    </div>
  )
}

function StockGauge({ m }: { m: Material }) {
  const max = Math.max(m.available, m.reorder_threshold * 2, 1)
  return (
    <div className="relative h-2.5 rounded-sm bg-sunk" title={`${num(m.available)} free / reorder at ${num(m.reorder_threshold)}`}>
      <div className={clsx('h-full rounded-sm', m.low_stock ? 'bg-warn' : 'bg-ok')} style={{ width: `${(m.available / max) * 100}%` }} />
      <div className="absolute -top-0.5 h-3.5 w-0.5 bg-ink" style={{ left: `${(m.reorder_threshold / max) * 100}%` }} aria-hidden />
    </div>
  )
}
function MoveBadge({ t }: { t: string }) {
  const tone = t === 'receipt' ? 'ok' : t === 'consume' ? 'info' : t === 'adjust' ? 'warn' : 'neutral'
  return <Badge tone={tone}>{human(t)}</Badge>
}

function MaterialModal({ m, onClose, onReceive, canManage }: { m: Material; onClose: () => void; onReceive: () => void; canManage: boolean }) {
  const d = useQuery({ queryKey: ['material', m.id], queryFn: () => api<Material & { lots: Lot[]; movements: Move[] }>(`/api/inventory/materials/${m.id}`) })
  return (
    <Modal open onClose={onClose} title={`${m.sku} · ${m.name}`} wide footer={canManage && <Button variant="primary" onClick={onReceive}>Receive this material</Button>}>
      <KV cols={4} items={[['Free', `${num(m.available)} ${m.uom}`], ['Reserved', num(m.reserved)], ['Consumed', num(m.consumed)], ['On order', num(m.on_order)],
        ['Reorder level', num(m.reorder_threshold)], ['Standard cost', money2(m.standard_cost)], ['Supplier', m.supplier ?? '–'], ['Status', m.low_stock ? <StatusBadge value="hold" /> : 'OK']]} />
      <h3 className="mt-5 mb-2 font-semibold">Lots</h3>
      {d.data && <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Lot</th><th>Received</th><th className="num">Free</th><th className="num">Reserved</th><th className="num">Consumed</th></tr></thead>
        <tbody>{d.data.lots.map((l) => <tr key={l.id}><td>{l.lot_number}</td><td>{date(l.receipt_date)}</td><td className="num">{num(l.qty_available)}</td><td className="num">{num(l.qty_reserved)}</td><td className="num">{num(l.qty_consumed)}</td></tr>)}</tbody></table></div>}
      <h3 className="mt-5 mb-2 font-semibold">Recent movements</h3>
      {d.data && <ul className="max-h-56 divide-y divide-line overflow-y-auto text-[13px]">{d.data.movements.slice(0, 30).map((mv) => <li key={mv.id} className="flex gap-3 py-1.5"><span className="w-28 text-ink-3">{dateTime(mv.at)}</span><MoveBadge t={mv.type} /><span className="flex-1">{mv.reason}</span><span>{num(mv.qty)}</span></li>)}</ul>}
    </Modal>
  )
}

function ReceiveModal({ materials, preset, onClose }: { materials: Material[]; preset: { material?: Material; pl?: PL }; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const pl = preset.pl
  const [f, setF] = useState({
    material_id: pl?.material_id ?? preset.material?.id ?? 0, qty: pl?.qty ?? 0, unit_cost: pl?.unit_cost ?? preset.material?.standard_cost ?? 0,
    lot_number: '', receipt_date: isoDay(), purchase_line_id: pl?.id ?? null,
  })
  const m = useMutation({
    mutationFn: () => api('/api/inventory/receipts', { body: f }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `Lot ${f.lot_number} received`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const valid = f.material_id && f.qty > 0 && f.unit_cost >= 0 && f.lot_number.trim()
  return (
    <Modal open onClose={onClose} title={pl ? `Receive ${pl.po_number}` : 'Receive goods'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>Record receipt</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Material" className="sm:col-span-2">{(id) => <Select id={id} value={f.material_id} disabled={!!pl} onChange={(e) => setF({ ...f, material_id: Number(e.target.value) })}><option value={0}>Select material</option>{materials.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</Select>}</Field>
        <Field label="Quantity received">{(id) => <Input id={id} type="number" min={0} step="0.1" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />}</Field>
        <Field label="Unit cost (INR)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: Number(e.target.value) })} />}</Field>
        <Field label="Lot / batch number" hint="Must be unique">{(id) => <Input id={id} value={f.lot_number} onChange={(e) => setF({ ...f, lot_number: e.target.value })} placeholder="e.g. CT30-2610-C" />}</Field>
        <Field label="Receipt date">{(id) => <Input id={id} type="date" value={f.receipt_date} onChange={(e) => setF({ ...f, receipt_date: e.target.value })} />}</Field>
      </div>
    </Modal>
  )
}

function AdjustModal({ lots, onClose }: { lots: Lot[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ lot_id: 0, delta: 0, reason: '' })
  const lot = lots.find((l) => l.id === f.lot_id)
  const m = useMutation({
    mutationFn: () => api('/api/inventory/adjustments', { body: f }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Stock adjusted'); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const tooLow = lot && lot.qty_available + f.delta < 0
  return (
    <Modal open onClose={onClose} title="Adjust stock"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.lot_id || !f.delta || f.reason.trim().length < 3 || !!tooLow} loading={m.isPending} onClick={() => m.mutate()}>Save adjustment</Button></>}>
      <Notice className="mb-3">Adjustments change free stock only. Use a negative quantity for losses or count shortfalls.</Notice>
      <div className="grid gap-3">
        <Field label="Lot">{(id) => <Select id={id} value={f.lot_id} onChange={(e) => setF({ ...f, lot_id: Number(e.target.value) })}><option value={0}>Select lot</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number} · {l.sku} · {num(l.qty_available)} free</option>)}</Select>}</Field>
        <Field label="Change in quantity" error={tooLow ? `Only ${num(lot!.qty_available)} is free in this lot` : null}>{(id) => <Input id={id} type="number" step="0.1" value={f.delta} onChange={(e) => setF({ ...f, delta: Number(e.target.value) })} />}</Field>
        <Field label="Reason (required)">{(id) => <Input id={id} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Cycle count variance" />}</Field>
      </div>
    </Modal>
  )
}
