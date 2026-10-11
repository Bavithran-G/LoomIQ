import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
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
        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5 shadow-xs">
          {[
            ['Estimated, all orders', data.totals.estimated_total, 'estimate', 'info'],
            ['Recorded to date', data.totals.actual_total, 'actual', 'ok'],
            ['Rework recorded', data.totals.rework_actual, 'actual', 'warn'],
            ['Sunk in rejected fabric', data.totals.embedded_rejected, 'inside recorded', 'bad'],
            ['Replacement estimate', data.totals.replacement_estimate, 'estimate, excluded', 'info'],
          ].map(([l, v, b, tone]) => (
            <div key={l as string} className="bg-surface px-4.5 py-3.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">{l}</span>
                <span className={clsx('rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider',
                  tone === 'ok' ? 'bg-[#E5F4ED] text-[#187B5B]' : tone === 'warn' ? 'bg-[#FFF3DF] text-[#B87519]' : tone === 'bad' ? 'bg-[#FCEAEA] text-[#C74343]' : 'bg-[#EBF2FA] text-[#3568B0]')}>
                  {b}
                </span>
              </div>
              <div className="font-display text-[22px] font-bold text-primary-navy tabular-nums mt-1">{money(v as number)}</div>
            </div>
          ))}
        </div>
        <Panel bodyClass="p-0" title="Cost by sales order" subtitle="Select any order for detailed stage breakdown and event ledger. Estimates and actuals are strictly separated.">
          <TableWrap>
            <table className="data-table min-w-[1000px]">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th className="num">Ordered</th>
                  <th className="num">Woven</th>
                  <th className="num">Accepted</th>
                  <th className="num">Estimate</th>
                  <th className="num">Recorded</th>
                  <th className="num">Rework</th>
                  <th className="num">Per accepted m</th>
                  <th className="num">Est. per m</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.order_id} className="cursor-pointer hover:bg-[#F8FAFB]" onClick={() => setSel(o.order_id)}>
                    <td>
                      <span className="font-semibold text-brand-teal hover:underline">{o.order_no}</span>
                      <div className="text-[12px] text-ink-3">{o.buyer} · {o.fabric}</div>
                    </td>
                    <td><StatusBadge value={o.status} /></td>
                    <td className="num tabular-nums">{metres(o.quantity)}</td>
                    <td className="num tabular-nums">{metres(o.produced_m)}</td>
                    <td className="num tabular-nums font-medium text-ok">{metres(o.accepted_m)}</td>
                    <td className="num tabular-nums text-ink-2">{money(o.estimated_total)}</td>
                    <td className="num tabular-nums font-semibold text-primary-navy">{money(o.actual_total)}</td>
                    <td className="num tabular-nums text-ink-2">{money(o.actual.rework)}</td>
                    <td className="num tabular-nums font-semibold text-primary-navy">
                      {o.actual_cost_per_accepted_m == null ? '–' : money2(o.actual_cost_per_accepted_m)}
                    </td>
                    <td className="num tabular-nums text-ink-3">{money2(o.estimated_cost_per_m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3 bg-[#FAFBFD]">
            Recorded cost per accepted metre runs above the estimate while production is part-way (yarn and weaving are booked before fabric is accepted) and when fabric is rejected.
          </div>
        </Panel>
      </>)}
      {sel && <Modal open wide onClose={() => setSel(null)} title={`Cost Intelligence · ${detail.data?.order_no ?? ''}`}>
        {detail.isLoading ? <LoadingBlock /> : detail.data && (
          <>
            <CostBreakdown c={detail.data} />
            <div className="mt-4 pt-3 border-t border-line flex justify-end">
              <Link className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-teal hover:underline" to={`/orders/${sel}`}>
                Open full order record →
              </Link>
            </div>
          </>
        )}
      </Modal>}
    </div>
  )
}
