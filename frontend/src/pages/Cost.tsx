import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { ErrorBox, LoadingBlock, Modal, PageHeader, Panel, StatusBadge, TableWrap } from '../components/ui'
import { CostBreakdown } from '../components/CostBreakdown'
import { metres, money, money2 } from '../lib/format'
import type { CostBlock } from '../lib/types'

type Row = CostBlock & { order_id: number; order_no: string; buyer: string; fabric: string; status: string; quantity: number; produced_m: number; rejected_m: number }
type Resp = { orders: Row[]; totals: Record<string, number> }

export default function Cost() {
  const { data, isLoading, error } = useQuery({ queryKey: ['cost'], queryFn: () => api<Resp>('/api/cost/orders') })
  const [sel, setSel] = useState<number | null>(null)
  const detail = useQuery({ queryKey: ['cost', sel], enabled: !!sel, queryFn: () => api<CostBlock & { order_no: string }>(`/api/cost/orders/${sel}`) })
  return (
    <div>
      <PageHeader title="Cost intelligence" subtitle="Standard-cost estimates beside costs recorded from production events. Estimates and actuals are never mixed." />
      {isLoading && <LoadingBlock />}
      {error && <ErrorBox error={error} />}
      {data && (<>
        <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5" style={{ gap: 1 }}>
          {[['Estimated, all orders', data.totals.estimated_total, 'estimate'], ['Recorded to date', data.totals.actual_total, 'actual'],
            ['Rework recorded', data.totals.rework_actual, 'actual'], ['Sunk in rejected fabric', data.totals.embedded_rejected, 'inside recorded'],
            ['Replacement estimate', data.totals.replacement_estimate, 'estimate, excluded']].map(([l, v, b]) => (
            <div key={l as string} className="bg-surface px-4 py-3"><div className="text-[12.5px] text-ink-3">{l}</div>
              <div className="font-display text-[22px] font-semibold text-indigo-loom">{money(v as number)}</div><div className="text-[12px] text-ink-3">{b}</div></div>))}
        </div>
        <Panel bodyClass="p-0" title="By order" subtitle="Select an order for the full breakdown and the cost ledger">
          <TableWrap><table className="data-table min-w-[1000px]">
            <thead><tr><th>Order</th><th>Status</th><th className="num">Qty</th><th className="num">Woven</th><th className="num">Accepted</th><th className="num">Estimate</th><th className="num">Recorded</th><th className="num">Rework</th><th className="num">Per accepted m</th><th className="num">Est. per m</th></tr></thead>
            <tbody>{data.orders.map((o) => (
              <tr key={o.order_id} className="cursor-pointer" onClick={() => setSel(o.order_id)}>
                <td><span className="font-medium text-indigo-thread">{o.order_no}</span><div className="text-[12px] text-ink-3">{o.buyer} · {o.fabric}</div></td>
                <td><StatusBadge value={o.status} /></td><td className="num">{metres(o.quantity)}</td><td className="num">{metres(o.produced_m)}</td><td className="num">{metres(o.accepted_m)}</td>
                <td className="num">{money(o.estimated_total)}</td><td className="num">{money(o.actual_total)}</td><td className="num">{money(o.actual.rework)}</td>
                <td className="num font-medium">{o.actual_cost_per_accepted_m == null ? '–' : money2(o.actual_cost_per_accepted_m)}</td><td className="num">{money2(o.estimated_cost_per_m)}</td>
              </tr>))}</tbody></table></TableWrap>
          <p className="px-4 py-2 text-[12.5px] text-ink-3">Recorded cost per accepted metre runs above the estimate while production is part-way (yarn and weaving are booked before fabric is accepted) and when fabric is rejected.</p>
        </Panel>
      </>)}
      {sel && <Modal open wide onClose={() => setSel(null)} title={`Cost breakdown · ${detail.data?.order_no ?? ''}`}>
        {detail.isLoading ? <LoadingBlock /> : detail.data && <><CostBreakdown c={detail.data} /><p className="mt-3 text-sm"><Link className="text-indigo-thread underline" to={`/orders/${sel}`}>Open order</Link></p></>}
      </Modal>}
    </div>
  )
}
