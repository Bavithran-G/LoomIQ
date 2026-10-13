import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '../lib/api'
import { ErrorBox, LoadingBlock, Modal, PageHeader, Panel, StatusBadge, TableWrap } from '../components/ui'
import { CostBreakdown } from '../components/CostBreakdown'
import { human, metres, money, money2 } from '../lib/format'
import type { CostBlock } from '../lib/types'

type Row = CostBlock & {
  order_id: number
  order_no: string
  buyer: string
  fabric: string
  status: string
  quantity: number
  produced_m: number
  rejected_m: number
  order_revenue_value?: number
  invoiced_amount?: number
  payment_received?: number
  outstanding_receivable?: number
  payment_status?: string
  gross_margin?: number
  margin_pct?: number
}
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
        <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-6 shadow-xs">
          {[
            ['Order Value (Revenue)', data.totals?.order_revenue_value ?? data.totals?.estimated_total ?? 0, 'billed', 'info'],
            ['Collected Payments', data.totals?.payment_received ?? 0, 'bank receipts', 'ok'],
            ['Outstanding Receivables', data.totals?.outstanding_receivable ?? 0, 'due from buyers', 'warn'],
            ['Recorded Production Cost', data.totals?.actual_total ?? 0, 'actual sunk', 'ok'],
            ['Estimated Gross Margin', data.totals?.total_gross_margin ?? 0, 'operating margin', 'ok'],
            ['Sunk in Rejected Fabric', data.totals?.embedded_rejected ?? 0, 'scrap loss', 'bad'],
          ].map(([l, v, b, tone]) => (
            <div key={l as string} className="bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</span>
                <span className={clsx('rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider',
                  tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : tone === 'warn' ? 'bg-amber-50 text-amber-700' : tone === 'bad' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700')}>
                  {b}
                </span>
              </div>
              <div className="text-[20px] font-bold text-slate-900 tabular-nums mt-1">{money(v as number)}</div>
            </div>
          ))}
        </div>
        <Panel bodyClass="p-0" title="Cost & Revenue by sales order" subtitle="Select any order for detailed stage breakdown, payment status, and event ledger. Estimates, actuals, and buyer payments are clearly consolidated.">
          <TableWrap>
            <table className="data-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th className="num">Ordered</th>
                  <th className="num">Woven</th>
                  <th className="num">Order Value</th>
                  <th className="num">Paid / Collected</th>
                  <th className="num">Recorded Cost</th>
                  <th className="num">Gross Margin</th>
                  <th className="num">Cost / m</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.order_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSel(o.order_id)}>
                    <td>
                      <span className="font-semibold text-teal-700 hover:underline">{o.order_no}</span>
                      <div className="text-[12px] text-slate-500">{o.buyer} · {o.fabric}</div>
                    </td>
                    <td><StatusBadge value={o.status} /></td>
                    <td className="num tabular-nums">{metres(o.quantity)}</td>
                    <td className="num tabular-nums text-slate-600">{metres(o.produced_m)}</td>
                    <td className="num tabular-nums font-semibold text-slate-900">{money(o.order_revenue_value ?? o.estimated_total)}</td>
                    <td className="num tabular-nums">
                      <span className="font-semibold text-emerald-700">{money(o.payment_received ?? 0)}</span>
                      <div className="text-[10.5px]">
                        <span className={clsx('rounded px-1 py-0.5 font-medium',
                          o.payment_status === 'fully_paid' ? 'bg-emerald-50 text-emerald-700' :
                          o.payment_status === 'partially_paid' ? 'bg-amber-50 text-amber-700' :
                          o.payment_status === 'advance_received' ? 'bg-blue-50 text-blue-700' : 'text-slate-500')}>
                          {human(o.payment_status ?? 'pending')}
                        </span>
                      </div>
                    </td>
                    <td className="num tabular-nums font-semibold text-slate-900">{money(o.actual_total)}</td>
                    <td className="num tabular-nums">
                      <span className={clsx('font-bold', (o.gross_margin ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                        {money(o.gross_margin ?? 0)}
                      </span>
                      <div className="text-[11px] text-slate-500">({o.margin_pct ?? 0}%)</div>
                    </td>
                    <td className="num tabular-nums font-semibold text-slate-900">
                      {o.actual_cost_per_accepted_m == null ? '–' : money2(o.actual_cost_per_accepted_m)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="border-t border-slate-200 px-4 py-2.5 text-[12px] text-slate-500 bg-slate-50">
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
