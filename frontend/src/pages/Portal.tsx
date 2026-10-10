import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Empty, ErrorBox, KV, LoadingBlock, Notice, PageHeader, Panel, StatusBadge, TableWrap } from '../components/ui'
import { ThreadStrip } from '../components/brand'
import { date, dateTime, metres } from '../lib/format'
import type { StageProgress } from '../lib/types'

type BO = { id: number; order_no: string; buyer_po: string; fabric: string; colour: string; quantity: number; unit: string; order_date: string; promised_date: string; status: string; progress: StageProgress[]; dispatch_status: string; accepted_m: number; dispatched_m: number; ready_m: number; notes: string }
type BODetail = BO & { timeline: { message: string; at: string }[]; quality: { released_rolls: { roll_no: string; length_m: number; status: string; inspected_on: string | null; note: string }[]; inspected_m: number }; dispatches: { id: number; dispatch_no: string; status: string; planned_date: string; confirmed_at: string | null; vehicle_no: string; total_m: number; rolls: number }[] }

export default function Portal() {
  const { id } = useParams()
  const { user } = useAuth()
  return id ? <PortalOrder id={id} /> : <PortalList name={user?.buyer_name ?? ''} />
}

function PortalList({ name }: { name: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['portal'], queryFn: () => api<BO[]>('/api/portal/orders') })
  return (
    <div>
      <PageHeader title={`Orders for ${name}`} subtitle="Production stage, released quantity and shipments for your orders with Everest Textile Mills." />
      {isLoading && <LoadingBlock />}
      {error && <ErrorBox error={error} />}
      {data?.length === 0 && <Empty title="No orders yet">Orders appear here once the mill confirms them.</Empty>}
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
        <div className="mt-4"><KV cols={4} items={[['Ordered', metres(o.quantity)], ['Released after inspection', metres(o.accepted_m)], ['Ready to ship', metres(o.ready_m)], ['Shipped', metres(o.dispatched_m)],
          ['Order date', date(o.order_date)], ['Promised delivery', date(o.promised_date)]]} /></div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Shipments" bodyClass="p-0">
          {o.dispatches.length === 0 ? <p className="p-4 text-sm text-ink-2">No shipments planned yet.</p> : (
            <ul className="divide-y divide-line">{o.dispatches.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
                <div className="flex-1"><b>{d.dispatch_no}</b> · {d.rolls} rolls · {metres(d.total_m)}<div className="text-ink-3">{d.status === 'confirmed' ? `Left the mill ${dateTime(d.confirmed_at)} · vehicle ${d.vehicle_no}` : `Planned for ${date(d.planned_date)}`}</div></div>
                {d.status === 'confirmed' && <Link to={`/dispatch/${d.id}/packing-list`} className="flex items-center gap-1 text-indigo-thread hover:underline"><FileText className="size-4" />Packing list</Link>}
              </li>))}</ul>)}
        </Panel>
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
