import clsx from 'clsx'
import { STAGE_NAMES, metres } from '../lib/format'

/** LoomIQ mark: three warp threads interlaced with three weft rows (plain weave). */
export function Mark({ className = 'size-8', inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill={inverted ? '#ffffff' : '#13294B'} />
      <g fill="none" strokeWidth="3.2" strokeLinecap="round">
        <path d="M10 7v18M16 7v18M22 7v18" stroke={inverted ? '#13294B' : '#8FA6CC'} />
        <path d="M7 11h6m6 0h6M7 16h3m4 0h4m4 0h3M7 21h6m6 0h6" stroke="#2BB3A3" />
      </g>
    </svg>
  )
}

export function Wordmark({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <Mark className="size-8 shrink-0" />
      <span className={clsx('font-display text-[22px] leading-none font-bold tracking-tight', light ? 'text-white' : 'text-indigo-loom')}>
        Loom<span className={light ? 'text-[#8FA6CC]' : 'text-indigo-thread'}>IQ</span>
      </span>
    </span>
  )
}

type Stage = { stage: string; done_m: number; pct: number }

/** The thread strip: one band per production stage, completed metres woven in twill. */
export function ThreadStrip({ progress, quantity, compact, problem }: { progress: Stage[]; quantity: number; compact?: boolean; problem?: boolean }) {
  return (
    <div className={clsx('grid gap-1', compact ? 'grid-cols-[repeat(var(--n),minmax(0,1fr))]' : 'grid-cols-2 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]')}
      style={{ ['--n' as string]: progress.length }}
      role="img"
      aria-label={progress.map((s) => `${STAGE_NAMES[s.stage] ?? s.stage} ${Math.round(s.pct * 100)}%`).join(', ')}>
      {progress.map((s) => (
        <div key={s.stage} className="min-w-0">
          {!compact && (
            <div className="mb-1 flex items-baseline justify-between gap-1 text-[12.5px]">
              <span className="truncate font-medium text-ink-2">{STAGE_NAMES[s.stage] ?? s.stage}</span>
              <span className="text-ink-3">{Math.round(s.pct * 100)}%</span>
            </div>
          )}
          <div className={clsx('overflow-hidden rounded-sm bg-sunk', compact ? 'h-1.5' : 'h-2.5')} title={`${STAGE_NAMES[s.stage] ?? s.stage}: ${metres(s.done_m)} of ${metres(quantity)}`}>
            <div className={clsx('h-full', problem ? 'twill twill-warn' : s.pct >= 0.999 ? 'twill' : 'twill twill-indigo')} style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
