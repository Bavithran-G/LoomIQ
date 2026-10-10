import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, Printer } from 'lucide-react'
import { api, blobUrl } from '../lib/api'
import { Button, ErrorBox, KV, LoadingBlock, Notice, Panel, StatusBadge } from '../components/ui'
import { ImpactChain } from '../components/ImpactChain'
import { ImageWithBoxes, SuggestionPanel } from './Quality'
import { date, dateTime, human, metres, STAGE_NAMES } from '../lib/format'
import type { Inspection, Roll } from '../lib/types'

type PP = Roll & {
  public_url: string; events: { type: string; detail: string; stage: string; machine: string; at: string }[]
  inspections: Inspection[]; dispatches: { dispatch_no: string; status: string; vehicle_no: string; confirmed_at: string | null }[]
  dispatch_eligible: boolean; dispatch_block_reason: string | null; can_view_impact: boolean
}

export default function Passport() {
  const { ref } = useParams()
  const { data: p, isLoading, error } = useQuery({ queryKey: ['passport', ref], queryFn: () => api<PP>(`/api/rolls/${ref}/passport`) })
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    if (p) blobUrl(`/api/rolls/${p.roll_no}/qr.svg`).then((x) => { u = x; setQr(x) }).catch(() => setQr(null))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [p])
  if (isLoading) return <LoadingBlock rows={8} />
  if (error || !p) return <ErrorBox error={error ?? 'Roll not found'} />
  const issue = ['rejected', 'hold', 'rework'].includes(p.quality)
  return (
    <div className="space-y-4">
      <div className="no-print text-[13px] text-ink-3"><Link to="/rolls" className="hover:underline">Roll traceability</Link> / {p.roll_no}</div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel className="print-area">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-ink-3">Digital roll passport</p>
              <h1 className="font-display text-[30px] font-semibold">{p.roll_no}</h1>
              <div className="mt-1 flex flex-wrap gap-2"><StatusBadge value={p.quality} /><span className="text-sm text-ink-2">{human(p.stage)} · {p.location}</span></div>
            </div>
            {p.dispatch_eligible
              ? <Notice tone="ok"><span className="flex items-center gap-1.5"><CheckCircle2 className="size-4" />Eligible for dispatch</span></Notice>
              : <Notice tone={p.stage === 'dispatched' ? 'info' : 'warn'}><span className="flex items-center gap-1.5">{p.stage !== 'dispatched' && <Ban className="size-4" />}{p.dispatch_block_reason}</span></Notice>}
          </div>
          <div className="mt-5"><KV cols={3} items={[
            ['Order', <Link to={`/orders/${p.order_id}`} className="text-indigo-thread hover:underline">{p.order_no}</Link>], ['Buyer', p.buyer], ['Fabric', p.fabric],
            ['Colour', p.colour], ['Length', metres(p.length_m)], ['Woven on', date(p.produced_on)],
            ['Loom', p.machine ?? '–'], ['Weaving job', p.weaving_job ?? '–'], ['Yarn lots', p.material_lots.join(', ') || '–']]} /></div>
        </Panel>
        <Panel className="print-area" title="QR label">
          <div className="flex flex-col items-center">
            {qr ? <img src={qr} alt={`QR code for ${p.roll_no}`} className="size-44" /> : <div className="skeleton size-44" />}
            <p className="mt-1 font-display text-lg font-semibold">{p.roll_no}</p>
            <p className="text-center text-[12px] text-ink-3">{p.fabric} · {p.colour} · {metres(p.length_m)}</p>
            <p className="mt-2 text-center text-[12px] text-ink-3">Scanning shows a public verification page with no costs, suppliers or staff details. Staff who are signed in see this passport.</p>
            <Button className="no-print mt-3" size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>Print label</Button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Production and movement history" bodyClass="p-0">
          <ol className="divide-y divide-line">
            {p.events.map((e, i) => (
              <li key={i} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="text-ink-3">{dateTime(e.at)}</span>
                <span><span className="font-medium">{STAGE_NAMES[e.stage] ?? human(e.stage)}</span> · {e.detail}</span>
              </li>))}
          </ol>
        </Panel>
        <Panel title={`Inspections (${p.inspections.length})`} bodyClass="p-0">
          {p.inspections.length === 0 && <p className="p-4 text-sm text-ink-2">Not inspected yet.</p>}
          <ul className="divide-y divide-line">
            {p.inspections.map((i) => (
              <li key={i.id} className="grid gap-3 p-4 sm:grid-cols-[160px_1fr]">
                <ImageWithBoxes insp={i} />
                <div className="space-y-2 text-[13.5px]">
                  <SuggestionPanel insp={i} />
                  <div className="rounded-md bg-sunk px-3 py-2">{i.status === 'reviewed'
                    ? <>Inspector <b>{i.reviewer}</b>: <StatusBadge value={i.decision === 'accept' ? 'accepted' : i.decision === 'reject' ? 'rejected' : i.decision} />{i.confirmed_defect && ` ${i.confirmed_defect}`} · {dateTime(i.reviewed_at)}{i.review_notes && <div className="text-ink-2">{i.review_notes}</div>}</>
                    : 'Awaiting inspector review'}</div>
                </div>
              </li>))}
          </ul>
        </Panel>
      </div>
      {p.dispatches.length > 0 && (
        <Panel title="Dispatch history"><ul className="text-[13.5px]">{p.dispatches.map((d) => <li key={d.dispatch_no}>{d.dispatch_no} · <StatusBadge value={d.status} /> · vehicle {d.vehicle_no || '–'} · {dateTime(d.confirmed_at)}</li>)}</ul></Panel>
      )}
      {issue && p.can_view_impact && <Panel title="Quality impact chain" subtitle="How this roll's quality decision flows through the order, dispatch and cost"><ImpactChain rollId={p.id} /></Panel>}
    </div>
  )
}
