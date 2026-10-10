import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api'
import { Wordmark } from '../components/brand'
import { ErrorBox, KV, LoadingBlock } from '../components/ui'
import { date, metres } from '../lib/format'

type Pub = { roll_no: string; order_no: string; fabric: string; colour: string; length_m: number; quality: string; dispatched: boolean; produced_on: string; last_inspected: string | null }

/** Public QR verification page: shows only non-sensitive roll facts. */
export default function PublicRoll() {
  const params = useParams()
  const roll = params.rollNo ?? params.ref ?? ''
  const [sp] = useSearchParams()
  const t = sp.get('t') ?? ''
  const q = useQuery({ queryKey: ['public', roll, t], queryFn: () => api<Pub>(`/api/public/rolls/${encodeURIComponent(roll)}?t=${encodeURIComponent(t)}`, { auth: false }) })
  return (
    <div className="mx-auto min-h-screen max-w-md p-5">
      <Wordmark className="mb-6" />
      <div className="rounded-lg border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <h1 className="text-xl font-semibold">Roll verification</h1>
          <p className="text-[13px] text-ink-3">Everest Textile Mills</p>
        </div>
        {q.isLoading && <LoadingBlock rows={4} />}
        {q.isError && <ErrorBox error={new Error('This roll code could not be verified. Scan the label again or contact the mill.')} />}
        {q.data && (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              {q.data.quality === 'accepted'
                ? <><CheckCircle2 className="size-6 text-ok" /><span className="font-display text-lg font-semibold text-ok">Inspected and released</span></>
                : <><ShieldAlert className="size-6 text-warn" /><span className="font-display text-lg font-semibold text-warn">Not released for shipment</span></>}
            </div>
            <KV items={[["Roll", q.data.roll_no], ["Order", q.data.order_no], ["Fabric", q.data.fabric], ["Colour", q.data.colour],
              ["Length", metres(q.data.length_m)], ["Woven on", date(q.data.produced_on)],
              ["Last inspected", date(q.data.last_inspected)], ["Shipped", q.data.dispatched ? 'Yes' : 'Not yet']]} />
            <p className="text-[12.5px] text-ink-3">Mill staff: sign in to LoomIQ to open the full roll passport.</p>
          </div>
        )}
      </div>
    </div>
  )
}
