import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api } from '../lib/api'
import { Button, ErrorBox, LoadingBlock } from '../components/ui'
import { Wordmark } from '../components/brand'
import { date, dateTime, metres } from '../lib/format'

type PL = { dispatch_no: string; status: string; order_no: string; buyer_po: string; buyer: string; buyer_city: string; fabric: string; construction: string; colour: string; planned_date: string; confirmed_at: string | null; vehicle_no: string; transporter: string; rolls: { roll_no: string; length_m: number; produced_on: string }[]; total_rolls: number; total_m: number; mill: string }

export default function PackingList() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({ queryKey: ['pl', id], queryFn: () => api<PL>(`/api/dispatch/${id}/packing-list`) })
  if (isLoading) return <LoadingBlock />
  if (error || !data) return <ErrorBox error={error ?? 'Not found'} />
  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-3 flex justify-end"><Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print packing list</Button></div>
      <article className="print-area rounded-lg border border-line bg-surface p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div><Wordmark /><p className="mt-1 text-[13px] text-ink-3">{data.mill}</p></div>
          <div className="text-right"><h1 className="text-2xl font-semibold">Packing list</h1><p className="font-medium">{data.dispatch_no}</p>
            <p className="text-[13px] text-ink-3">{data.status === 'confirmed' ? `Dispatched ${dateTime(data.confirmed_at)}` : `Planned for ${date(data.planned_date)} (not yet dispatched)`}</p></div>
        </header>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 py-4 text-sm">
          <div><dt className="text-ink-3">Consignee</dt><dd className="font-medium">{data.buyer}, {data.buyer_city}</dd></div>
          <div><dt className="text-ink-3">Order / buyer PO</dt><dd className="font-medium">{data.order_no} / {data.buyer_po}</dd></div>
          <div><dt className="text-ink-3">Fabric</dt><dd className="font-medium">{data.fabric}, {data.colour}</dd><dd className="text-[12.5px] text-ink-3">{data.construction}</dd></div>
          <div><dt className="text-ink-3">Vehicle / transporter</dt><dd className="font-medium">{data.vehicle_no || '–'} / {data.transporter || '–'}</dd></div>
        </dl>
        <table className="data-table"><thead><tr><th>#</th><th>Roll number</th><th>Woven on</th><th className="num">Length</th></tr></thead>
          <tbody>{data.rolls.map((r, i) => <tr key={r.roll_no}><td>{i + 1}</td><td>{r.roll_no}</td><td>{date(r.produced_on)}</td><td className="num">{metres(r.length_m)}</td></tr>)}
            <tr className="font-semibold"><td colSpan={3}>Total: {data.total_rolls} rolls</td><td className="num">{metres(data.total_m)}</td></tr></tbody></table>
        <p className="mt-6 text-[12.5px] text-ink-3">Every roll listed passed inspection and carries a QR label that links to its verification page.</p>
      </article>
    </div>
  )
}
