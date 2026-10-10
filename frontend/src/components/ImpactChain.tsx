import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { api } from '../lib/api'
import { Badge, ErrorBox, LoadingBlock } from './ui'

type Node = { key: string; title: string; value: string; basis: string; why: string; rule: string; link: { type: string; id: number; ref?: string } | null }
type Chain = { roll_no: string; quality: string; nodes: Node[]; recommendations: { action: string; detail: string; requires_approval: boolean }[] }
const BASIS_TONE = { measured: 'ok', recorded: 'ok', derived: 'info', estimated: 'warn' } as const

function href(l: Node['link']) {
  if (!l) return null
  if (l.type === 'roll') return `/rolls/${l.ref}`
  if (l.type === 'order') return `/orders/${l.id}`
  if (l.type === 'dispatch') return '/dispatch'
  if (l.type === 'cost') return '/cost'
  return null
}

/** Quality Impact Chain: each consequence of a quality decision, traced through real records. */
export function ImpactChain({ rollId }: { rollId: number }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['impact', rollId], queryFn: () => api<Chain>(`/api/rolls/${rollId}/impact`) })
  if (isLoading) return <LoadingBlock rows={4} />
  if (error) return <ErrorBox error={error} />
  if (!data) return null
  return (
    <div>
      <ol className="relative">
        {data.nodes.map((n, i) => {
          const to = href(n.link)
          return (
            <li key={n.key} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4 last:pb-0">
              {i < data.nodes.length - 1 && <span className="absolute top-7 bottom-0 left-[13px] w-0.5 bg-[repeating-linear-gradient(180deg,var(--color-indigo-mist)_0_4px,transparent_4px_8px)]" aria-hidden />}
              <span className={clsx('z-[1] grid size-7 place-items-center rounded-full border-2 bg-surface text-[12px] font-semibold',
                n.key === 'defect' && data.quality !== 'accepted' ? 'border-bad text-bad' : 'border-indigo-thread text-indigo-thread')}>{i + 1}</span>
              <div className="min-w-0 rounded-md border border-line bg-surface p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-[15.5px] font-semibold text-indigo-loom">{to ? <Link to={to} className="hover:underline">{n.title}</Link> : n.title}</span>
                  <Badge tone={BASIS_TONE[n.basis as keyof typeof BASIS_TONE] ?? 'neutral'}>{n.basis}</Badge>
                </div>
                <div className="text-[14px] font-medium text-ink">{n.value}</div>
                <div className="text-[13px] text-ink-2">{n.why}</div>
                <div className="mt-1 text-[12px] text-ink-3">Rule: {n.rule}</div>
              </div>
            </li>
          )
        })}
      </ol>
      {data.recommendations.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-[15px] font-semibold">Waste recovery recommendations</h3>
          <ul className="space-y-1.5">
            {data.recommendations.map((r, i) => (
              <li key={i} className="rounded-md border border-line px-3 py-2 text-[13.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{r.action}</span>{r.requires_approval && <Badge tone="warn">Needs approval</Badge>}</div>
                <div className="text-ink-2">{r.detail}</div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-3">Suggestions only. Rejected fabric never returns to sellable stock without an authorised decision.</p>
        </div>
      )}
    </div>
  )
}
