import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { FileImage, ImageUp, ScanSearch, ShieldCheck, Upload } from 'lucide-react'
import { api, blobUrl } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, Empty, ErrorBox, Field, Input, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap, Tabs, Textarea, useToast } from '../components/ui'
import { ImpactChain } from '../components/ImpactChain'
import { dateTime, human, metres } from '../lib/format'
import type { Defect, Inspection, Roll } from '../lib/types'

const MAX_MB = 10
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const BOX: Record<string, string> = { spot: '#C2362F', colour: '#B07F2A', texture: '#3D5FA8' }

export default function Quality() {
  const { can } = useAuth()
  const [tab, setTab] = useState<'inspect' | 'review' | 'issues' | 'history'>('inspect')
  return (
    <div>
      <PageHeader title="AI quality inspection" subtitle="Image-assisted fabric inspection. The analysis suggests; a qualified inspector decides." />
      <Notice tone="warn" className="mb-4">
        <b>Baseline, not a validated detector.</b> No trained fabric-defect model or labelled dataset was available, so LoomIQ uses a classical computer-vision
        baseline that flags regions differing from the fabric's own texture and colour. It reports a heuristic anomaly score, never a confidence, and every result needs inspector review.
      </Notice>
      <Panel bodyClass="p-0">
        <div className="px-3 pt-1"><Tabs value={tab} onChange={setTab} items={[
          { value: 'inspect', label: 'Inspection queue' }, { value: 'review', label: 'Awaiting review' },
          { value: 'issues', label: 'Rejected, held and rework' }, { value: 'history', label: 'Inspection history' }]} /></div>
        {tab === 'inspect' && <Queue canInspect={can('quality.inspect')} />}
        {tab === 'review' && <ReviewList />}
        {tab === 'issues' && <Issues canDispose={can('quality.disposition')} />}
        {tab === 'history' && <History />}
      </Panel>
    </div>
  )
}

function Queue({ canInspect }: { canInspect: boolean }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['qqueue'], queryFn: () => api<Roll[]>('/api/quality/queue') })
  const [roll, setRoll] = useState<Roll | null>(null)
  const [openInsp, setOpenInsp] = useState<number | null>(null)
  if (isLoading) return <LoadingBlock />
  if (error) return <ErrorBox error={error} />
  if (!data?.length) return <Empty icon={<ShieldCheck className="size-8" />} title="No rolls are waiting for inspection">Rolls arrive here after dyeing, or after weaving if dyeing is switched off.</Empty>
  return (
    <>
      <TableWrap><table className="data-table min-w-[760px]">
        <thead><tr><th>Roll</th><th>Order</th><th>Fabric</th><th className="num">Length</th><th>Loom</th><th>Status</th><th /></tr></thead>
        <tbody>{data.map((r) => (
          <tr key={r.id}>
            <td><Link to={`/rolls/${r.roll_no}`} className="font-medium text-indigo-thread hover:underline">{r.roll_no}</Link></td>
            <td>{r.order_no}<div className="text-[12px] text-ink-3">{r.buyer}</div></td>
            <td>{r.fabric}<div className="text-[12px] text-ink-3">{r.colour}</div></td>
            <td className="num">{metres(r.length_m)}</td><td>{r.machine}</td>
            <td>{r.open_inspection_id ? <StatusBadge value="pending_review" /> : <StatusBadge value={r.quality} />}</td>
            <td className="text-right">{r.open_inspection_id
              ? <Button size="sm" onClick={() => setOpenInsp(r.open_inspection_id!)}>Review</Button>
              : canInspect && <Button size="sm" variant="primary" icon={<ScanSearch className="size-3.5" />} onClick={() => setRoll(r)}>Inspect</Button>}</td>
          </tr>))}</tbody></table></TableWrap>
      {roll && <InspectModal roll={roll} onClose={() => setRoll(null)} onCreated={(id) => { setRoll(null); setOpenInsp(id) }} />}
      {openInsp && <ReviewModal id={openInsp} onClose={() => setOpenInsp(null)} />}
    </>
  )
}

function InspectModal({ roll, onClose, onCreated }: { roll: Roll; onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const pick = (f: File | undefined) => {
    setErr(null)
    if (!f) return
    if (!ACCEPT.includes(f.type)) { setErr('Use a JPEG, PNG or WebP photo.'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`The photo is ${(f.size / 1048576).toFixed(1)} MB; the limit is ${MAX_MB} MB.`); return }
    setFile(f); setPreview(URL.createObjectURL(f))
  }
  const m = useMutation({
    mutationFn: (withImage: boolean) => {
      const fd = new FormData()
      fd.set('roll_id', String(roll.id))
      if (withImage && file) fd.set('image', file)
      return api<Inspection>('/api/quality/inspections', { form: fd })
    },
    onSuccess: (i) => { qc.invalidateQueries({ queryKey: ['qqueue'] }); toast('ok', i.method === 'manual' ? 'Manual inspection started' : 'Image analysed'); onCreated(i.id) },
    onError: (e) => toast('bad', (e as Error).message),
  })
  return (
    <Modal open onClose={onClose} title={`Inspect ${roll.roll_no}`} wide
      footer={<>
        <Button variant="ghost" onClick={() => m.mutate(false)} loading={m.isPending && m.variables === false}>Inspect manually, no photo</Button>
        <Button variant="primary" disabled={!file} loading={m.isPending && m.variables === true} icon={<ScanSearch className="size-4" />} onClick={() => m.mutate(true)}>Analyse photo</Button></>}>
      <p className="mb-3 text-sm text-ink-2">{roll.fabric}, {roll.colour} · {metres(roll.length_m)} · {roll.order_no}</p>
      <div
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
        className={clsx('flex min-h-52 flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center', err ? 'border-bad/50' : 'border-line-strong')}>
        {preview ? <img src={preview} alt="Selected fabric" className="max-h-72 rounded" /> : <>
          <ImageUp className="mb-2 size-8 text-ink-3" />
          <p className="text-sm text-ink-2">Drop a photo of the fabric surface here</p>
          <p className="text-[12.5px] text-ink-3">JPEG, PNG or WebP, up to {MAX_MB} MB. Shoot square-on in even light.</p></>}
        <input ref={input} type="file" accept={ACCEPT.join(',')} capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        <Button className="mt-3" size="sm" icon={<Upload className="size-3.5" />} onClick={() => input.current?.click()}>{file ? 'Choose another photo' : 'Choose photo'}</Button>
      </div>
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
    </Modal>
  )
}

export function ImageWithBoxes({ insp }: { insp: Inspection }) {
  const [url, setUrl] = useState<string | null>(null)
  const [show, setShow] = useState(true)
  useEffect(() => {
    let u: string | null = null
    if (insp.has_image) blobUrl(`/api/quality/inspections/${insp.id}/image`).then((x) => { u = x; setUrl(x) }).catch(() => setUrl(null))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [insp.id, insp.has_image])
  if (!insp.has_image) return <div className="grid h-40 place-items-center rounded-md bg-sunk text-sm text-ink-3"><span className="flex items-center gap-2"><FileImage className="size-4" />Manual inspection, no photo</span></div>
  const W = insp.image_width ?? 100, H = insp.image_height ?? 100
  return (
    <div>
      <div className="relative overflow-hidden rounded-md bg-sunk">
        {url ? <img src={url} alt={`Fabric photo for ${insp.roll_no}`} className="block w-full" /> : <div className="skeleton aspect-[4/3]" />}
        {url && show && insp.suggested_defects.length > 0 && insp.image_width && (
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-label="Regions flagged by the baseline">
            {insp.suggested_defects.map((d: Defect, i) => (
              <g key={i}>
                <rect x={d.bbox[0]} y={d.bbox[1]} width={d.bbox[2]} height={d.bbox[3]} fill="none" stroke={BOX[d.type] ?? '#C2362F'} strokeWidth={Math.max(2, W / 250)} vectorEffect="non-scaling-stroke" />
                <text x={d.bbox[0]} y={Math.max(14, d.bbox[1] - 4)} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke" fontSize={Math.max(12, W / 40)} fontWeight={600}>{i + 1}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
      {insp.suggested_defects.length > 0 && (
        <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-2"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show flagged regions (measured by the baseline, not invented)</label>
      )}
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = { spot: 'Hole / spot', colour: 'Stain / shade', texture: 'Weave irregularity' }

export function SuggestionPanel({ insp }: { insp: Inspection }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {insp.method === 'manual' ? <Badge>Manual inspection</Badge> : insp.suggested_outcome ? <StatusBadge value={insp.suggested_outcome} /> : <Badge tone="warn">Analysis failed</Badge>}
        {insp.anomaly_score != null && <Badge tone="neutral">Anomaly score {insp.anomaly_score} (heuristic)</Badge>}
        <Badge tone="neutral">Confidence: not available</Badge>
      </div>
      <p className="text-[14px] text-ink">{insp.explanation}</p>
      {insp.suggested_defects.length > 0 && (
        <ol className="space-y-1 text-[13px]">
          {insp.suggested_defects.map((d, i) => (
            <li key={i} className="flex gap-2"><span className="mt-1 size-2.5 shrink-0 rounded-sm" style={{ background: BOX[d.type] }} />
              <span><b>{i + 1}. {TYPE_LABEL[d.type] ?? d.type}</b> <span className="text-ink-2">{d.explanation}</span></span></li>))}
        </ol>
      )}
      <p className="text-[12px] text-ink-3">{insp.analysis_version}{insp.inferred_at && ` · analysed ${dateTime(insp.inferred_at)}`}</p>
    </div>
  )
}

export function ReviewModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { can } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const insp = useQuery({ queryKey: ['insp', id], queryFn: () => api<Inspection>(`/api/quality/inspections/${id}`) })
  const types = useQuery({ queryKey: ['defect-types'], queryFn: () => api<string[]>('/api/quality/defect-types') })
  const [f, setF] = useState({ decision: '', confirmed_defect: '', notes: '', buyer_note: '' })
  const [done, setDone] = useState<{ before: { quality_shortfall_m: number }; after: { quality_shortfall_m: number; accepted_m: number }; baseline_agreed: boolean | null } | null>(null)
  useEffect(() => {
    const i = insp.data
    if (i && !f.decision && i.suggested_outcome) {
      const guess = i.suggested_types[0]
      setF((x) => ({ ...x, confirmed_defect: i.suggested_outcome === 'pass' ? '' : guess?.includes('hole') ? 'hole' : guess?.includes('stain') ? 'stain' : guess?.includes('weav') ? 'irregular weaving' : '' }))
    }
  }, [insp.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({
    mutationFn: () => api<typeof done>(`/api/quality/inspections/${id}/review`, { body: f }),
    onSuccess: (r) => { qc.invalidateQueries(); setDone(r); toast('ok', `Decision recorded: ${f.decision}`) },
    onError: (e) => toast('bad', (e as Error).message),
  })
  const needDefect = f.decision && f.decision !== 'accept'
  const needNote = f.decision === 'reject' || f.decision === 'hold'
  const valid = f.decision && (!needDefect || (f.confirmed_defect && f.confirmed_defect !== 'none')) && (!needNote || f.notes.trim().length > 2)
  const i = insp.data
  return (
    <Modal open onClose={onClose} wide title={i ? `Inspection #${i.id} · ${i.roll_no}` : 'Inspection'}>
      {insp.isLoading && <LoadingBlock />}
      {i && (
        <div className="grid gap-5 md:grid-cols-2">
          <ImageWithBoxes insp={i} />
          <div className="space-y-4">
            <section>
              <h3 className="mb-1.5 text-[15px] font-semibold">Baseline suggestion</h3>
              <SuggestionPanel insp={i} />
            </section>
            {done ? (
              <section className="space-y-3">
                <Notice tone="ok">Decision saved. The roll, order quantities, dispatch eligibility and quality cost have been updated.
                  {done.baseline_agreed != null && ` The baseline ${done.baseline_agreed ? 'agreed' : 'did not agree'} with your decision.`}</Notice>
                <p className="text-[13.5px]">Replacement needed for {i.order_no}: {metres(done.before.quality_shortfall_m)} → <b>{metres(done.after.quality_shortfall_m)}</b>; accepted now {metres(done.after.accepted_m)}</p>
                {f.decision !== 'accept' && <><h3 className="text-[15px] font-semibold">Quality impact chain</h3><ImpactChain rollId={i.roll_id} /></>}
                <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>
              </section>
            ) : i.status === 'reviewed' ? (
              <Notice>Reviewed by {i.reviewer} on {dateTime(i.reviewed_at)}: <b>{i.decision}</b>{i.confirmed_defect && ` (${i.confirmed_defect})`}. {i.review_notes}</Notice>
            ) : can('quality.review') ? (
              <section className="space-y-3">
                <h3 className="text-[15px] font-semibold">Inspector decision</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Decision">
                  {[['accept', 'Accept', 'ok'], ['rework', 'Rework', 'warn'], ['hold', 'Hold', 'warn'], ['reject', 'Reject', 'bad']].map(([v, l, t]) => (
                    <button key={v} type="button" role="radio" aria-checked={f.decision === v} onClick={() => setF({ ...f, decision: v })}
                      className={clsx('h-10 rounded-md border text-sm font-medium', f.decision === v
                        ? t === 'ok' ? 'border-ok bg-ok text-white' : t === 'bad' ? 'border-bad bg-bad text-white' : 'border-warn bg-warn text-white'
                        : 'border-line-strong hover:bg-sunk')}>{l}</button>))}
                </div>
                {needDefect && <Field label="Confirmed defect">{(fid) => <Select id={fid} value={f.confirmed_defect} onChange={(e) => setF({ ...f, confirmed_defect: e.target.value })}><option value="">Select defect</option>{types.data?.filter((t) => t !== 'none').map((t) => <option key={t}>{t}</option>)}</Select>}</Field>}
                <Field label={needNote ? 'Inspector notes (required)' : 'Inspector notes'}>{(fid) => <Textarea id={fid} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Location, extent, cause if known" />}</Field>
                <Field label="Note for buyer (optional)" hint="Shown in the buyer portal for released rolls only">{(fid) => <Input id={fid} value={f.buyer_note} onChange={(e) => setF({ ...f, buyer_note: e.target.value })} />}</Field>
                <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Decide later</Button><Button variant="primary" disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>Save decision</Button></div>
              </section>
            ) : <Notice>Only a quality inspector can record the decision.</Notice>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReviewList() {
  const { data, isLoading } = useQuery({ queryKey: ['insp-pending'], queryFn: () => api<Inspection[]>('/api/quality/inspections?status=pending_review') })
  const [open, setOpen] = useState<number | null>(null)
  if (isLoading) return <LoadingBlock />
  if (!data?.length) return <Empty title="Nothing awaiting review">Analysed photos and manual inspections waiting for a decision appear here.</Empty>
  return (<>
    <ul className="divide-y divide-line">{data.map((i) => (
      <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex-1"><div className="font-medium">#{i.id} · {i.roll_no} <span className="text-ink-3">· {i.order_no}</span></div><div className="text-[13px] text-ink-2">{i.explanation}</div></div>
        {i.suggested_outcome && <StatusBadge value={i.suggested_outcome} />}<Button size="sm" variant="primary" onClick={() => setOpen(i.id)}>Review</Button>
      </li>))}</ul>
    {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
  </>)
}

function Issues({ canDispose }: { canDispose: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const rolls = useQuery({ queryKey: ['issue-rolls'], queryFn: async () => {
    const all = await Promise.all(['rejected', 'hold', 'rework'].map((q) => api<Roll[]>(`/api/rolls?quality_status=${q}`)))
    return all.flat()
  } })
  const [chain, setChain] = useState<Roll | null>(null)
  const [disp, setDisp] = useState<{ roll: Roll; action: 'rework_done' | 'scrap' } | null>(null)
  const [notes, setNotes] = useState('')
  const m = useMutation({
    mutationFn: () => api(`/api/rolls/${disp!.roll.id}/disposition`, { body: { action: disp!.action, notes } }),
    onSuccess: () => { qc.invalidateQueries(); toast('ok', disp!.action === 'scrap' ? `${disp!.roll.roll_no} scrapped` : `${disp!.roll.roll_no} back in the inspection queue`); setDisp(null); setNotes('') },
    onError: (e) => toast('bad', (e as Error).message),
  })
  if (rolls.isLoading) return <LoadingBlock />
  if (!rolls.data?.length) return <Empty title="No rejected, held or rework rolls" />
  return (<>
    <TableWrap><table className="data-table min-w-[800px]"><thead><tr><th>Roll</th><th>Order</th><th className="num">Length</th><th>Quality</th><th>Stage</th><th>Location</th><th /></tr></thead>
      <tbody>{rolls.data.map((r) => (
        <tr key={r.id}><td><Link to={`/rolls/${r.roll_no}`} className="font-medium text-indigo-thread hover:underline">{r.roll_no}</Link></td><td>{r.order_no}</td><td className="num">{metres(r.length_m)}</td>
          <td><StatusBadge value={r.quality} /></td><td>{human(r.stage)}</td><td>{r.location}</td>
          <td className="text-right whitespace-nowrap">
            <Button size="sm" variant="ghost" onClick={() => setChain(r)}>Impact chain</Button>
            {canDispose && r.quality === 'rework' && <Button size="sm" onClick={() => setDisp({ roll: r, action: 'rework_done' })}>Rework done</Button>}
            {canDispose && r.quality === 'rejected' && r.stage !== 'scrapped' && <Button size="sm" variant="ghost" className="text-bad" onClick={() => setDisp({ roll: r, action: 'scrap' })}>Scrap</Button>}
          </td></tr>))}</tbody></table></TableWrap>
    {chain && <Modal open wide onClose={() => setChain(null)} title={`Quality impact chain · ${chain.roll_no}`}><ImpactChain rollId={chain.id} /></Modal>}
    {disp && <Modal open onClose={() => setDisp(null)} title={disp.action === 'scrap' ? `Scrap ${disp.roll.roll_no}` : `Confirm rework of ${disp.roll.roll_no}`}
      footer={<><Button variant="ghost" onClick={() => setDisp(null)}>Cancel</Button><Button variant={disp.action === 'scrap' ? 'danger' : 'primary'} disabled={disp.action === 'scrap' && notes.trim().length < 3} loading={m.isPending} onClick={() => m.mutate()}>{disp.action === 'scrap' ? 'Scrap roll' : 'Confirm rework done'}</Button></>}>
      <Notice className="mb-3">{disp.action === 'scrap' ? 'The roll moves to the waste store. This is a final disposition.' : 'The documented rework cost is booked once, and the roll goes back to the inspection queue. It is not released until it passes a new inspection.'}</Notice>
      <Field label={disp.action === 'scrap' ? 'Disposition reason (required)' : 'Notes'}>{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
    </Modal>}
  </>)
}

function History() {
  const { data, isLoading } = useQuery({ queryKey: ['insp-all'], queryFn: () => api<Inspection[]>('/api/quality/inspections?status=reviewed') })
  const [open, setOpen] = useState<number | null>(null)
  if (isLoading) return <LoadingBlock />
  return (<>
    <TableWrap><table className="data-table min-w-[900px]"><thead><tr><th>#</th><th>Roll</th><th>Method</th><th>Baseline said</th><th>Decision</th><th>Defect</th><th>Reviewer</th><th>When</th></tr></thead>
      <tbody>{data?.map((i) => (
        <tr key={i.id} className="cursor-pointer" onClick={() => setOpen(i.id)}><td>{i.id}</td><td>{i.roll_no}</td><td>{i.method === 'manual' ? 'Manual' : 'Photo + baseline'}</td>
          <td>{i.suggested_outcome ? <StatusBadge value={i.suggested_outcome} /> : '–'}</td><td><StatusBadge value={i.decision === 'accept' ? 'accepted' : i.decision === 'reject' ? 'rejected' : i.decision} /></td>
          <td>{i.confirmed_defect || '–'}</td><td>{i.reviewer}</td><td>{dateTime(i.reviewed_at)}</td></tr>))}</tbody></table></TableWrap>
    {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
  </>)
}
