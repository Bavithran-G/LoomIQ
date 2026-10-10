import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, QrCode, Search } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Empty, ErrorBox, Input, LoadingBlock, Modal, Notice, PageHeader, Panel, Select, StatusBadge, TableWrap } from '../components/ui'
import { date, human, metres } from '../lib/format'
import type { Roll } from '../lib/types'

export default function Rolls() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [quality, setQuality] = useState('')
  const [stage, setStage] = useState('')
  const [scan, setScan] = useState(false)
  const params = new URLSearchParams({ ...(term ? { q: term } : {}), ...(quality ? { quality_status: quality } : {}), ...(stage ? { stage } : {}) })
  const { data, isLoading, error } = useQuery({ queryKey: ['rolls', term, quality, stage], queryFn: () => api<Roll[]>(`/api/rolls?${params}`) })
  return (
    <div>
      <PageHeader title="Roll traceability" subtitle="Every fabric roll has a passport: origin order, loom, yarn lots, inspections and dispatch."
        actions={<Button variant="primary" icon={<QrCode className="size-4" />} onClick={() => setScan(true)}>Scan or look up roll</Button>} />
      <Panel bodyClass="p-0">
        <form className="flex flex-wrap gap-2 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }}>
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute top-3 left-2.5 size-4 text-ink-3" />
            <Input aria-label="Search rolls" className="pl-8" placeholder="Roll or order number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select aria-label="Quality" value={quality} onChange={(e) => setQuality(e.target.value)} className="w-40"><option value="">Any quality</option>{['pending', 'accepted', 'rejected', 'rework', 'hold'].map((x) => <option key={x} value={x}>{human(x)}</option>)}</Select>
          <Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="w-40"><option value="">Any stage</option>{['dyeing', 'inspection', 'finishing', 'packed', 'dispatched', 'scrapped'].map((x) => <option key={x} value={x}>{human(x)}</option>)}</Select>
          <Button type="submit">Search</Button>
        </form>
        {isLoading && <LoadingBlock />}
        {error && <ErrorBox error={error} />}
        {data?.length === 0 && <Empty title="No rolls match" />}
        {data && data.length > 0 && (
          <TableWrap><table className="data-table min-w-[900px]">
            <thead><tr><th>Roll</th><th>Order</th><th>Fabric</th><th className="num">Length</th><th>Stage</th><th>Quality</th><th>Location</th><th>Loom</th><th>Woven</th></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/rolls/${r.roll_no}`)}>
                <td><Link to={`/rolls/${r.roll_no}`} className="font-medium text-indigo-thread hover:underline" onClick={(e) => e.stopPropagation()}>{r.roll_no}</Link></td>
                <td>{r.order_no}</td><td>{r.fabric}<div className="text-[12px] text-ink-3">{r.colour}</div></td><td className="num">{metres(r.length_m)}</td>
                <td>{human(r.stage)}</td><td><StatusBadge value={r.quality} /></td><td className="text-[13px]">{r.location}</td><td>{r.machine}</td><td>{date(r.produced_on)}</td>
              </tr>))}</tbody></table></TableWrap>)}
      </Panel>
      {scan && <ScanModal onClose={() => setScan(false)} onFound={(ref) => nav(`/rolls/${ref}`)} />}
    </div>
  )
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

/** Extracts a roll number from a scanned LoomIQ URL or plain text. */
export function parseRollCode(raw: string): string | null {
  const m = raw.toUpperCase().match(/RL-\d{4}-\d{3,}/)
  return m ? m[0] : null
}

function ScanModal({ onClose, onFound }: { onClose: () => void; onFound: (ref: string) => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | null = null
    let stop = false
    const Det = (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector
    const det = new Det({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(async (s) => {
      stream = s
      if (!video.current) return
      video.current.srcObject = s
      await video.current.play()
      while (!stop) {
        try {
          const found = await det.detect(video.current)
          const ref = found.map((f) => parseRollCode(f.rawValue)).find(Boolean)
          if (ref) { onFound(ref); return }
        } catch { /* keep scanning */ }
        await new Promise((r) => setTimeout(r, 250))
      }
    }).catch(() => { setErr('Camera access was blocked. Type the roll number instead.'); setCamera(false) })
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [camera, onFound])
  const submit = () => {
    const ref = parseRollCode(code)
    if (!ref) { setErr('Enter a roll number like RL-2026-00012, or paste the QR link.'); return }
    onFound(ref)
  }
  return (
    <Modal open onClose={onClose} title="Find a roll"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Open passport</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input aria-label="Roll number or QR link" placeholder="RL-2026-00012 or scanned link" value={code} onChange={(e) => { setCode(e.target.value); setErr(null) }} />
      </form>
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      <div className="mt-4">
        {supported ? (camera
          ? <video ref={video} className="w-full rounded-md bg-ink" muted playsInline aria-label="Camera preview" />
          : <Button icon={<Camera className="size-4" />} onClick={() => setCamera(true)}>Scan with camera</Button>)
          : <p className="text-[13px] text-ink-3">This browser has no built-in QR scanner. Use a phone camera app to open the label link, or type the roll number.</p>}
      </div>
    </Modal>
  )
}
