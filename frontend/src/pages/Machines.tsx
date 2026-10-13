import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Wrench } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, ErrorBox, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Select, StatusBadge, useToast } from '../components/ui'
import { date, human, num } from '../lib/format'
import type { Machine } from '../lib/types'

const STAGES = ['weaving', 'dyeing', 'finishing']

export default function Machines() {
  const { can } = useAuth()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['machines'], queryFn: () => api<Machine[]>('/api/machines'), refetchInterval: 30000 })
  const [edit, setEdit] = useState<Machine | null>(null)
  const [hist, setHist] = useState<Machine | null>(null)
  return (
    <div>
      <PageHeader title="Machine monitoring" subtitle="Looms, jiggers and the stenter line by current state." />
      <Notice className="mb-4">
        <b>Mill Flow Note:</b> Spinning is outsourced to specialized spinners (Salem Spinners &amp; Rajapalayam Mills) who supply yarn cones directly to the warehouse. Machine monitoring tracks the mill's active internal stages: <b>Weaving Shed</b> (Air-jet looms), <b>Dyeing House</b> (Jiggers), and <b>Finishing Line</b> (Stenter).
      </Notice>
      {isLoading && <LoadingBlock />}
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {data && STAGES.map((s) => (
        <section key={s} className="mb-5">
          <h2 className="mb-2 text-lg font-semibold">{human(s)}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.filter((m) => m.stage_code === s).map((m) => (
              <article key={m.id} className={clsx('rounded-lg border bg-surface p-3', m.status === 'breakdown' ? 'border-bad/50' : m.status === 'maintenance' ? 'border-warn/50' : 'border-line')}>
                <div className="flex items-start justify-between">
                  <div><div className="font-display text-[19px] font-semibold text-indigo-loom">{m.code}</div><div className="text-[12.5px] text-ink-3">{m.name}</div></div>
                  <StatusBadge value={m.status} />
                </div>
                <div className="mt-2 min-h-12 text-[13px]">
                  {m.current_job ? (<>
                    <div>Running <b>{m.current_job.job_no}</b> for <Link to={`/orders/${m.current_job.order_id}`} className="text-indigo-thread hover:underline">{m.current_job.order_no}</Link></div>
                    <div className="text-ink-3">{num(m.current_job.planned_qty)} m · shift {m.current_job.shift} · {m.current_job.fabric}</div>
                  </>) : m.state !== 'available' ? <div className="text-warn">{m.state_note || human(m.state)}</div> : <div className="text-ink-3">No job running</div>}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[12.5px] text-ink-3">
                  <span>{num(m.capacity_per_shift)} m / shift</span>
                  <button className={clsx('hover:underline', m.downtime_7d_min > 120 && 'font-medium text-warn')} onClick={() => setHist(m)}>{m.downtime_7d_min} min down, 7 days</button>
                </div>
                {can('machines.manage') && <Button size="sm" variant="ghost" className="mt-1 -ml-2" icon={<Wrench className="size-3.5" />} onClick={() => setEdit(m)}>Change state</Button>}
              </article>
            ))}
          </div>
        </section>
      ))}
      {edit && <StateModal m={edit} onClose={() => setEdit(null)} />}
      {hist && <HistoryModal m={hist} onClose={() => setHist(null)} />}
    </div>
  )
}

function StateModal({ m, onClose }: { m: Machine; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [state, setState] = useState(m.state)
  const [note, setNote] = useState(m.state_note)
  const mut = useMutation({
    mutationFn: () => api(`/api/machines/${m.id}/state`, { body: { state, note } }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', `${m.code} set to ${state}`); onClose() },
    onError: (e) => toast('bad', (e as Error).message),
  })
  return (
    <Modal open onClose={onClose} title={`Change state of ${m.code}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={mut.isPending} onClick={() => mut.mutate()}>Save state</Button></>}>
      {state !== 'available' && m.current_job && <Notice tone="warn" className="mb-3">{m.current_job.job_no} is running and will be paused.</Notice>}
      <div className="grid gap-3">
        <Field label="State">{(id) => <Select id={id} value={state} onChange={(e) => setState(e.target.value)}><option value="available">Available</option><option value="maintenance">Maintenance</option><option value="breakdown">Breakdown</option></Select>}</Field>
        <Field label="Note">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Preventive maintenance, shed timing" />}</Field>
      </div>
    </Modal>
  )
}

function HistoryModal({ m, onClose }: { m: Machine; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ['downtime', m.id], queryFn: () => api<{ id: number; minutes: number; reason: string; occurred_on: string; job_no: string | null }[]>(`/api/machines/${m.id}/downtime`) })
  return (
    <Modal open onClose={onClose} title={`Downtime log for ${m.code}`}>
      {data?.length === 0 && <p className="text-sm text-ink-2">No downtime recorded.</p>}
      <table className="data-table"><tbody>{data?.map((d) => <tr key={d.id}><td>{date(d.occurred_on)}</td><td>{d.reason}</td><td>{d.job_no ?? ''}</td><td className="num">{d.minutes} min</td></tr>)}</tbody></table>
    </Modal>
  )
}
