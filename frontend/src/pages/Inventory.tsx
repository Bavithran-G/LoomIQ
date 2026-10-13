import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, PackagePlus, SlidersHorizontal } from 'lucide-react'
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
<<<<<<< HEAD
  const [adjustMode, setAdjustMode] = useState<'adjust' | 'defective'>('adjust')
  const [adjustLotId, setAdjustLotId] = useState<number | undefined>(undefined)
=======
  const [createPO, setCreatePO] = useState(false)
>>>>>>> 9f900a9 (PO update)
  const mats = useQuery({ queryKey: ['materials'], queryFn: () => api<Material[]>('/api/inventory/materials') })
  const lots = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/api/inventory/lots'), enabled: tab === 'lots' || adjust })
  const moves = useQuery({ queryKey: ['moves'], queryFn: () => api<Move[]>('/api/inventory/movements?limit=200'), enabled: tab === 'moves' })
  const pls = useQuery({ queryKey: ['pls'], queryFn: () => api<PL[]>('/api/inventory/purchase-lines') })
  const manage = can('inventory.manage')

  return (
    <div>
      <PageHeader title="Raw-material inventory" subtitle="Yarn, dyes and chemicals by lot. Free stock can be reserved; yarn is consumed only when weaving completes."
        actions={manage && <>
<<<<<<< HEAD
          <Button variant="secondary" className="border-warn/40 text-warn hover:bg-warn/10" icon={<AlertTriangle className="size-4 text-warn" />} onClick={() => { setAdjustMode('defective'); setAdjustLotId(undefined); setAdjust(true) }}>Remove defective stock</Button>
          <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => { setAdjustMode('adjust'); setAdjustLotId(undefined); setAdjust(true) }}>Adjust stock</Button>
=======
          <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdjust(true)}>Adjust stock</Button>
          <Button icon={<PackagePlus className="size-4" />} onClick={() => setCreatePO(true)}>Raise PO</Button>
>>>>>>> 9f900a9 (PO update)
          <Button variant="primary" icon={<PackagePlus className="size-4" />} onClick={() => setReceive({})}>Receive goods</Button></>} />
      {mats.data && mats.data.some((m) => m.low_stock) && (
        <Notice tone="warn" className="mb-3">Below reorder level: {mats.data.filter((m) => m.low_stock).map((m) => `${m.sku} (${num(m.available)} ${m.uom} free, ${num(m.on_order)} on order)`).join('; ')}</Notice>
      )}
      <Panel bodyClass="p-0">
        <div className="px-3 pt-2 bg-[#FAFBFD]/60 border-b border-line">
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'stock', label: 'Stock by material' },
            { value: 'lots', label: 'Lots' },
            { value: 'po', label: 'Incoming purchase orders' },
            { value: 'moves', label: 'Movement history' }
          ]} />
        </div>
        {tab === 'stock' && (mats.isLoading ? <LoadingBlock /> : mats.error ? <ErrorBox error={mats.error} /> : (
          <TableWrap>
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Material SKU</th>
                  <th>Classification</th>
                  <th className="num">Free Stock</th>
                  <th className="num">Reserved</th>
                  <th className="num">Consumed</th>
                  <th className="num">On Order</th>
                  <th className="w-48">Free vs Reorder Level</th>
                  <th>Primary Supplier</th>
                </tr>
              </thead>
              <tbody>
                {mats.data!.map((m) => (
                  <tr key={m.id} className="cursor-pointer hover:bg-[#F8FAFB]" onClick={() => setSel(m)}>
                    <td>
                      <span className="font-semibold text-brand-teal hover:underline">{m.sku}</span>
                      <div className="text-[12px] text-ink-3">{m.name}</div>
                    </td>
                    <td><Badge tone="neutral">{human(m.material_type)}</Badge></td>
                    <td className={clsx('num font-bold tabular-nums', m.low_stock ? 'text-warn' : 'text-primary-navy')}>
                      {num(m.available)} <span className="text-[11.5px] font-normal text-ink-3">{m.uom}</span>
                    </td>
                    <td className="num tabular-nums text-[#3568B0] font-medium">{num(m.reserved)}</td>
                    <td className="num tabular-nums text-ink-3">{num(m.consumed)}</td>
                    <td className="num tabular-nums text-ok font-medium">+{num(m.on_order)}</td>
                    <td><StockGauge m={m} /></td>
                    <td className="text-[12.5px] text-ink-2">{m.supplier ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))}
        {tab === 'lots' && (lots.isLoading ? <LoadingBlock /> : (
          <TableWrap>
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Lot / Batch No</th>
                  <th>Material</th>
                  <th>Supplier</th>
                  <th>Received Date</th>
                  <th className="num">Unit Cost</th>
                  <th className="num">Received Qty</th>
                  <th className="num">Free</th>
                  <th className="num">Reserved</th>
                  <th className="num">Consumed</th>
                  <th className="w-32 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {lots.data?.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F8FAFB]">
                    <td className="font-mono font-semibold text-primary-navy">{l.lot_number}</td>
                    <td className="font-medium text-brand-teal">{l.sku}</td>
                    <td className="text-ink-2 text-[12.5px]">{l.supplier ?? '–'}</td>
                    <td className="text-ink-3 text-[12px]">{date(l.receipt_date)}</td>
                    <td className="num font-semibold text-primary-navy tabular-nums">{money2(l.unit_cost)}</td>
                    <td className="num tabular-nums">{num(l.qty_received)}</td>
                    <td className="num font-bold text-primary-navy tabular-nums">{num(l.qty_available)}</td>
                    <td className="num tabular-nums text-[#3568B0]">{num(l.qty_reserved)}</td>
                    <td className="num tabular-nums text-ink-3">{num(l.qty_consumed)}</td>
                    <td className="text-right">
                      {manage && l.qty_available > 0 && (
                        <Button size="sm" variant="ghost" className="text-warn hover:bg-warn/10 text-[12px] h-7 px-2 font-medium" onClick={() => { setAdjustMode('defective'); setAdjustLotId(l.id); setAdjust(true) }}>Write off defect</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ))}
        {tab === 'po' && (
          pls.data?.length === 0 ? <Empty title="No purchase orders" /> :
          <TableWrap>
            <table className="data-table min-w-[800px]">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Material</th>
                  <th>Supplier</th>
                  <th className="num">Quantity</th>
                  <th className="num">Unit Cost</th>
                  <th>Expected Delivery</th>
                  <th>Status</th>
                  <th className="w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pls.data?.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F8FAFB]">
                    <td className="font-mono font-semibold text-primary-navy">{p.po_number}</td>
                    <td className="font-medium text-brand-teal">{p.sku}</td>
                    <td className="text-ink-2 text-[12.5px]">{p.supplier}</td>
                    <td className="num font-semibold text-primary-navy tabular-nums">{num(p.qty)}</td>
                    <td className="num tabular-nums text-ink-3">{money2(p.unit_cost)}</td>
                    <td className="text-[12.5px] text-ink-2">{date(p.expected_date)}</td>
                    <td><Badge tone={p.status === 'open' ? 'info' : 'neutral'}>{human(p.status)}</Badge></td>
                    <td className="text-right">{manage && p.status === 'open' && <Button size="sm" variant="teal" onClick={() => setReceive({ pl: p })}>Receive</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {tab === 'moves' && (moves.isLoading ? <LoadingBlock /> : (
          <TableWrap>
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Movement Type</th>
                  <th>Material</th>
                  <th>Lot / Batch</th>
                  <th className="num">Quantity Delta</th>
                  <th>Reason / Context</th>
                  <th>Initiated By</th>
                </tr>
              </thead>
              <tbody>
                {moves.data?.map((mv) => (
                  <tr key={mv.id} className="hover:bg-[#F8FAFB]">
                    <td className="text-ink-3 text-[12px]">{dateTime(mv.at)}</td>
                    <td><MoveBadge t={mv.type} /></td>
                    <td className="font-medium text-brand-teal">{mv.sku}</td>
                    <td className="font-mono text-[12px] text-ink-2">{mv.lot ?? '–'}</td>
                    <td className={clsx('num font-semibold tabular-nums', mv.qty < 0 ? 'text-ink-2' : 'text-ok')}>
                      {mv.qty > 0 ? '+' : ''}{num(mv.qty)}
                    </td>
                    <td className="text-[12.5px] text-ink-2">{mv.reason}</td>
                    <td className="text-[12px] text-ink-3">{mv.user ?? 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3 bg-[#FAFBFD]">
              Reserve and consume movements are tracked against free stock: reservations shift quantities from free to reserved pool.
            </div>
          </TableWrap>
        ))}
      </Panel>
      {sel && <MaterialModal m={sel} onClose={() => setSel(null)} onReceive={() => { setReceive({ material: sel }); setSel(null) }} canManage={manage} />}
      {receive && <ReceiveModal materials={mats.data ?? []} preset={receive} onClose={() => setReceive(null)} />}
<<<<<<< HEAD
      {adjust && <AdjustModal lots={lots.data ?? []} initialMode={adjustMode} initialLotId={adjustLotId} onClose={() => setAdjust(false)} />}
=======
      {adjust && <AdjustModal lots={lots.data ?? []} onClose={() => setAdjust(false)} />}
      {createPO && <NewPOModal materials={mats.data ?? []} onClose={() => setCreatePO(false)} />}
>>>>>>> 9f900a9 (PO update)
    </div>
  )
}

function StockGauge({ m }: { m: Material }) {
  const max = Math.max(m.available, m.reorder_threshold * 1.8, 1)
  const pct = Math.min(100, Math.max(0, (m.available / max) * 100))
  const reorderPct = Math.min(100, Math.max(0, (m.reorder_threshold / max) * 100))
  return (
    <div className="flex flex-col gap-1 w-full max-w-[180px]">
      <div className="relative h-2 w-full rounded-xs bg-sunk overflow-hidden" title={`${num(m.available)} free / reorder threshold at ${num(m.reorder_threshold)}`}>
        <div
          className={clsx('h-full transition-all rounded-xs', m.low_stock ? 'bg-warn' : 'bg-ok')}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-0.5 bottom-0 w-0.5 bg-primary-navy"
          style={{ left: `${reorderPct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10.5px] text-ink-3 tabular-nums">
        <span>Min: {num(m.reorder_threshold)}</span>
        <span className={m.low_stock ? 'font-semibold text-warn' : ''}>{num(m.available)} {m.uom}</span>
      </div>
    </div>
  )
}
function MoveBadge({ t }: { t: string }) {
  const tone = t === 'receipt' ? 'ok' : t === 'consume' ? 'info' : t === 'adjust' ? 'warn' : t === 'defect_writeoff' ? 'bad' : 'neutral'
  return <Badge tone={tone}>{t === 'defect_writeoff' ? 'Defective Write-off' : human(t)}</Badge>
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
  const todayDate = isoDay()
  const [f, setF] = useState({
    material_id: pl?.material_id ?? preset.material?.id ?? 0, qty: pl?.qty ?? 0, unit_cost: pl?.unit_cost ?? preset.material?.standard_cost ?? 0,
    lot_number: '', receipt_date: todayDate, purchase_line_id: pl?.id ?? null,
  })
  const [dateErr, setDateErr] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: () => api('/api/inventory/receipts', { body: f }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `Lot ${f.lot_number} received`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const isDateValid = f.receipt_date === todayDate
  const valid = f.material_id && f.qty > 0 && f.unit_cost >= 0 && f.lot_number.trim() && isDateValid && !dateErr

  return (
    <Modal open onClose={onClose} title={pl ? `Receive ${pl.po_number}` : 'Receive goods'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>Record receipt</Button></>}>
      <Notice className="mb-3">Goods receipts record actual operational intake events and must reflect today's local date.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Material" className="sm:col-span-2">{(id) => <Select id={id} value={f.material_id} disabled={!!pl} onChange={(e) => setF({ ...f, material_id: Number(e.target.value) })}><option value={0}>Select material</option>{materials.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</Select>}</Field>
        <Field label="Quantity received">{(id) => <Input id={id} type="number" min={0} step="0.1" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />}</Field>
        <Field label="Unit cost (INR)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: Number(e.target.value) })} />}</Field>
        <Field label="Lot / batch number" hint="Must be unique">{(id) => <Input id={id} value={f.lot_number} onChange={(e) => setF({ ...f, lot_number: e.target.value })} placeholder="e.g. CT30-2610-C" />}</Field>
        <Field label="Receipt date" error={dateErr || (!isDateValid ? "Receipt date must be today's operational date." : null)} hint="Disabled for past and future dates">
          {(id) => <Input id={id} type="date" min={todayDate} max={todayDate} value={f.receipt_date} onChange={(e) => {
            const v = e.target.value
            setF({ ...f, receipt_date: v })
            if (v !== todayDate) {
              setDateErr("Receipt date must be today's operational date.")
            } else {
              setDateErr(null)
            }
          }} />}
        </Field>
      </div>
    </Modal>
  )
}

const DEFECT_REASONS = [
  'Contamination',
  'Damaged material',
  'Failed quality inspection',
  'Moisture / mildew damage',
  'Storage damage',
  'Supplier defect',
  'Other defect',
]

function AdjustModal({ lots, initialMode = 'adjust', initialLotId, onClose }: {
  lots: Lot[]
  initialMode?: 'adjust' | 'defective'
  initialLotId?: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [mode, setMode] = useState<'adjust' | 'defective'>(initialMode)

  // Standard adjustment state
  const [adjForm, setAdjForm] = useState({ lot_id: initialLotId ?? 0, delta: 0, reason: '' })

  // Defective stock write-off state
  const [defForm, setDefForm] = useState({
    lot_id: initialLotId ?? 0,
    qty: 0,
    defect_reason: 'Damaged material',
    custom_reason: '',
    remarks: '',
  })
  const [confirmingDefect, setConfirmingDefect] = useState(false)
  const [nowStr] = useState(() => new Date().toISOString())

  const activeLotId = mode === 'adjust' ? adjForm.lot_id : defForm.lot_id
  const lot = lots.find((l) => l.id === activeLotId)

  // Mutations
  const adjMutation = useMutation({
    mutationFn: () => api('/api/inventory/adjustments', { method: 'POST', body: adjForm }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', 'Stock adjusted successfully'); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })

  const defectMutation = useMutation({
    mutationFn: async () => {
      const finalReason = defForm.defect_reason === 'Other defect' && defForm.custom_reason.trim()
        ? defForm.custom_reason.trim()
        : defForm.defect_reason
      const fullReason = defForm.remarks.trim()
        ? `Defective write-off: ${finalReason} — ${defForm.remarks.trim()}`
        : `Defective write-off: ${finalReason}`

      try {
        return await api('/api/inventory/defective-writeoff', {
          method: 'POST',
          body: {
            lot_id: defForm.lot_id,
            qty: defForm.qty,
            defect_reason: finalReason,
            remarks: defForm.remarks.trim(),
          },
        })
      } catch (err: unknown) {
        // If the backend process was started without --reload and hasn't reloaded yet (returns 405/404),
        // fallback to the existing stock adjustments API with negative delta and traceability reason
        if (
          err &&
          typeof err === 'object' &&
          'status' in err &&
          ((err as { status: number }).status === 405 || (err as { status: number }).status === 404)
        ) {
          return await api('/api/inventory/adjustments', {
            method: 'POST',
            body: {
              lot_id: defForm.lot_id,
              delta: -defForm.qty,
              reason: fullReason,
            },
          })
        }
        throw err
      }
    },
    onSuccess: () => {
      qc.invalidateQueries()
      toast('ok', `Defective stock write-off confirmed: ${defForm.qty} removed from lot ${lot?.lot_number}`)
      onClose()
    },
    onError: (e) => toast('bad', (e as Error).message),
  })

  // Validations
  const adjTooLow = lot && lot.qty_available + adjForm.delta < 0
  const adjValid = adjForm.lot_id && adjForm.delta !== 0 && adjForm.reason.trim().length >= 3 && !adjTooLow

  const defQtyPositive = defForm.qty > 0
  const defQtyTooHigh = lot && defForm.qty > lot.qty_available
  const defReasonValid = defForm.defect_reason !== 'Other defect' || defForm.custom_reason.trim().length >= 3
  const defCanReview = defForm.lot_id > 0 && defQtyPositive && !defQtyTooHigh && defReasonValid

  return (
    <Modal open onClose={onClose} title={mode === 'adjust' ? 'Stock adjustment' : 'Remove defective stock (write-off)'} wide
      footer={mode === 'adjust' ? (
        <><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!adjValid} loading={adjMutation.isPending} onClick={() => adjMutation.mutate()}>Save adjustment</Button></>
      ) : confirmingDefect ? (
        <><Button variant="ghost" disabled={defectMutation.isPending} onClick={() => setConfirmingDefect(false)}>Back to edit</Button>
          <Button variant="primary" className="bg-bad hover:bg-bad/90 text-white" loading={defectMutation.isPending} onClick={() => defectMutation.mutate()}>Confirm write-off</Button></>
      ) : (
        <><Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="bg-warn text-white hover:bg-warn/90" disabled={!defCanReview} onClick={() => setConfirmingDefect(true)}>Review write-off</Button></>
      )}>

      {/* Mode Switcher */}
      <div className="mb-4 flex gap-2 border-b border-line pb-3">
        <Button size="sm" variant={mode === 'adjust' ? 'secondary' : 'ghost'} onClick={() => { setMode('adjust'); setConfirmingDefect(false) }}>
          Routine count adjustment
        </Button>
        <Button size="sm" variant={mode === 'defective' ? 'primary' : 'ghost'}
          className={mode === 'defective' ? 'bg-warn text-white hover:bg-warn/90' : 'text-warn'}
          icon={<AlertTriangle className="size-3.5" />}
          onClick={() => { setMode('defective'); setConfirmingDefect(false) }}>
          Remove defective stock
        </Button>
      </div>

      {mode === 'adjust' ? (
        <div>
          <Notice className="mb-3">Routine adjustments correct free stock counts (cycle count variances). Use negative numbers for shortfalls.</Notice>
          <div className="grid gap-3">
            <Field label="Lot">{(id) => <Select id={id} value={adjForm.lot_id} onChange={(e) => setAdjForm({ ...adjForm, lot_id: Number(e.target.value) })}><option value={0}>Select lot</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.lot_number} · {l.sku} · {num(l.qty_available)} free</option>)}</Select>}</Field>
            <Field label="Change in quantity" error={adjTooLow ? `Only ${num(lot!.qty_available)} is free in this lot` : null}>{(id) => <Input id={id} type="number" step="0.1" value={adjForm.delta} onChange={(e) => setAdjForm({ ...adjForm, delta: Number(e.target.value) })} />}</Field>
            <Field label="Reason (required)">{(id) => <Input id={id} value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} placeholder="e.g. Cycle count variance" />}</Field>
          </div>
        </div>
      ) : confirmingDefect ? (
        <div className="space-y-4">
          <Notice tone="bad" className="font-medium">
            Review before committing: this will immediately deduct <strong>{num(defForm.qty)}</strong> from available stock in lot <strong>{lot?.lot_number}</strong> and create an irreversible defect audit record.
          </Notice>

          <div className="rounded-lg border border-line bg-[#F8FAFB] p-4 text-[13.5px] space-y-2.5">
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Material SKU:</span>
              <span className="font-semibold text-brand-teal">{lot?.sku}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Lot / Batch:</span>
              <span className="font-mono font-semibold text-primary-navy">{lot?.lot_number}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Available Stock Before:</span>
              <span className="font-medium">{num(lot?.qty_available)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Defective Quantity to Write Off:</span>
              <span className="font-bold text-bad">-{num(defForm.qty)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Remaining Available Stock:</span>
              <span className="font-bold text-ok">{num((lot?.qty_available ?? 0) - defForm.qty)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Reserved Stock (Protected):</span>
              <span className="font-medium text-[#3568B0]">{num(lot?.qty_reserved)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line/60">
              <span className="text-ink-3">Defect Reason:</span>
              <span className="font-semibold text-primary-navy">{defForm.defect_reason === 'Other defect' ? defForm.custom_reason : defForm.defect_reason}</span>
            </div>
            {defForm.remarks.trim() && (
              <div className="flex justify-between py-1 border-b border-line/60">
                <span className="text-ink-3">Remarks / Reference:</span>
                <span className="text-ink-2">{defForm.remarks}</span>
              </div>
            )}
            <div className="flex justify-between py-1 pt-2 text-[12px] text-ink-3">
              <span>Operational Timestamp:</span>
              <span>{dateTime(nowStr)} (Operational IST)</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Notice tone="warn">
            <strong>Defective Stock Removal:</strong> Traceable write-off for damaged, contaminated, or failed quality material. This permanently decreases free stock and creates an audit movement log. Reserved stock is strictly protected.
          </Notice>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Affected Lot / Batch" className="sm:col-span-2">
              {(id) => (
                <Select id={id} value={defForm.lot_id} onChange={(e) => setDefForm({ ...defForm, lot_id: Number(e.target.value) })}>
                  <option value={0}>Select lot / batch</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lot_number} · {l.sku} · {num(l.qty_available)} free ({num(l.qty_reserved)} reserved)
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {lot && (
              <div className="sm:col-span-2 rounded-md border border-line bg-[#FAFBFD] p-3 text-[13px] grid grid-cols-3 gap-2">
                <div>
                  <span className="text-ink-3 block text-[11.5px]">Free Available</span>
                  <span className="font-bold text-primary-navy text-[15px]">{num(lot.qty_available)}</span>
                </div>
                <div>
                  <span className="text-ink-3 block text-[11.5px]">Reserved (Protected)</span>
                  <span className="font-semibold text-[#3568B0] text-[15px]">{num(lot.qty_reserved)}</span>
                </div>
                <div>
                  <span className="text-ink-3 block text-[11.5px]">Total Received</span>
                  <span className="text-ink-2 text-[15px]">{num(lot.qty_received)}</span>
                </div>
              </div>
            )}

            <Field label="Defective Quantity to Remove"
              error={defQtyTooHigh
                ? `Cannot write off ${defForm.qty} — only ${num(lot!.qty_available)} is available in this lot. Reserved stock (${num(lot!.qty_reserved)}) cannot be written off.`
                : defForm.qty < 0 ? 'Quantity must be positive' : null}
              hint={lot ? `Max available: ${num(lot.qty_available)}` : undefined}>
              {(id) => (
                <Input id={id} type="number" min={0.1} step="0.1" value={defForm.qty || ''}
                  onChange={(e) => setDefForm({ ...defForm, qty: Number(e.target.value) })}
                  placeholder="e.g. 25.5" />
              )}
            </Field>

            <Field label="Defect Reason">
              {(id) => (
                <Select id={id} value={defForm.defect_reason} onChange={(e) => setDefForm({ ...defForm, defect_reason: e.target.value })}>
                  {DEFECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              )}
            </Field>

            {defForm.defect_reason === 'Other defect' && (
              <Field label="Specify Defect Reason" className="sm:col-span-2"
                error={!defForm.custom_reason.trim() ? 'Please describe the defect reason' : null}>
                {(id) => (
                  <Input id={id} value={defForm.custom_reason}
                    onChange={(e) => setDefForm({ ...defForm, custom_reason: e.target.value })}
                    placeholder="Describe specific defect condition..." />
                )}
              </Field>
            )}

            <Field label="Remarks / Inspection Reference (Optional)" className="sm:col-span-2"
              hint="e.g. Lab inspection reference, ticket number, or damage cause">
              {(id) => (
                <Input id={id} value={defForm.remarks}
                  onChange={(e) => setDefForm({ ...defForm, remarks: e.target.value })}
                  placeholder="e.g. INSP-2026-0042 / oil contamination during handling" />
              )}
            </Field>
          </div>

          <div className="rounded-md border border-line/60 bg-[#F4F6F8] px-3.5 py-2 text-[12px] text-ink-3 flex items-center justify-between">
            <span>Operational Event: Real-time write-off recorded at current date & time</span>
            <span className="font-medium text-ink-2">{dateTime(nowStr)}</span>
          </div>
        </div>
      )}
    </Modal>
  )
}

function NewPOModal({ materials, onClose }: { materials: Material[]; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({
    material_id: materials[0]?.id ?? 0,
    qty: 500,
    unit_cost: materials[0]?.standard_cost ?? 300,
    expected_date: isoDay(new Date(Date.now() + 7 * 86400000)),
  })
  const mat = materials.find((m) => m.id === f.material_id)
  const m = useMutation({
    mutationFn: () => api('/api/inventory/purchase-orders', { body: f }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pls'] })
      qc.invalidateQueries({ queryKey: ['materials'] })
      toast('ok', 'Purchase order raised successfully')
      onClose()
    },
    onError: (e) => toast('bad', (e as Error).message),
  })

  return (
    <Modal open onClose={onClose} title="Raise Yarn / Material Purchase Order"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.material_id || f.qty <= 0} loading={m.isPending} onClick={() => m.mutate()}>Create Purchase Order</Button></>}>
      <Notice className="mb-3">Open POs feed into the Risk Engine and Simulator to project yarn availability dates.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Material" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={f.material_id} onChange={(e) => {
              const mid = Number(e.target.value)
              const selectedMat = materials.find((x) => x.id === mid)
              setF({ ...f, material_id: mid, unit_cost: selectedMat?.standard_cost ?? f.unit_cost })
            }}>
              {materials.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name} ({x.supplier ?? 'Direct'})</option>)}
            </Select>
          )}
        </Field>
        <Field label={`Order quantity (${mat?.uom ?? 'kg'})`}>
          {(id) => <Input id={id} type="number" min={1} step="1" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />}
        </Field>
        <Field label="Unit cost (INR)">
          {(id) => <Input id={id} type="number" min={0} step="0.5" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: Number(e.target.value) })} />}
        </Field>
        <Field label="Expected arrival date" className="sm:col-span-2">
          {(id) => <Input id={id} type="date" value={f.expected_date} onChange={(e) => setF({ ...f, expected_date: e.target.value })} />}
        </Field>
      </div>
    </Modal>
  )
}
