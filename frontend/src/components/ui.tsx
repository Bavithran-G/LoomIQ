import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok'
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3.5 text-sm',
        variant === 'primary' && 'bg-indigo-loom text-white hover:bg-indigo-deep',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:bg-sunk',
        variant === 'ghost' && 'text-ink-2 hover:bg-sunk hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-95',
        variant === 'ok' && 'bg-ok text-white hover:brightness-95',
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/* ---------- Badges ---------- */
const TONES = {
  ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-indigo-thread', neutral: 'bg-sunk text-ink-2',
}
export type Tone = keyof typeof TONES
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12.5px] font-medium leading-tight whitespace-nowrap', TONES[tone], className)}>{children}</span>
}

const STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral', confirmed: 'info', in_production: 'info', completed: 'ok', on_hold: 'warn', cancelled: 'neutral',
  planned: 'neutral', running: 'ok', paused: 'warn',
  pending: 'neutral', accepted: 'ok', rejected: 'bad', rework: 'warn', hold: 'warn',
  high: 'bad', medium: 'warn', low: 'ok', unknown: 'neutral', not_assessed: 'neutral',
  available: 'ok', idle: 'neutral', maintenance: 'warn', breakdown: 'bad',
  ready: 'ok', not_ready: 'neutral', partially_dispatched: 'info', fully_dispatched: 'ok',
  pass: 'ok', defect_suspected: 'bad', pending_review: 'warn', reviewed: 'neutral',
  urgent: 'bad', normal: 'neutral',
}
const LABEL: Record<string, string> = {
  in_production: 'In production', on_hold: 'On hold', not_ready: 'Not ready', partially_dispatched: 'Partly dispatched',
  fully_dispatched: 'Dispatched', defect_suspected: 'Defect suspected', pending_review: 'Awaiting review',
  not_assessed: 'Not assessed', pass: 'No anomaly found', pending: 'Not inspected',
}
export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-ink-3">–</span>
  const label = LABEL[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
  return <Badge tone={STATUS_TONE[value] ?? 'neutral'} className={className}>{label}</Badge>
}

/* ---------- Panel ---------- */
export function Panel({ title, actions, children, className, bodyClass, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={clsx('min-w-0 rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>}
            {subtitle && <p className="text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(bodyClass ?? 'p-4')}>{children}</div>
    </section>
  )
}

/* ---------- Form fields ---------- */
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">{label}</label>
      {children(id)}
      {error ? <p className="text-[12.5px] text-bad">{error}</p> : hint ? <p className="text-[12.5px] text-ink-3">{hint}</p> : null}
    </div>
  )
}
const inputCls = 'h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-indigo-thread focus:outline-none focus:ring-2 focus:ring-indigo-thread/15 disabled:bg-sunk'
const widthOf = (c?: string) => (c && /(^|\s)(w-|flex-1)/.test(c) ? '' : 'w-full')
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx(inputCls, widthOf(className), className)} />
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx(inputCls, widthOf(className), 'pr-8', className)}>{children}</select>
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx(inputCls, 'w-full h-auto min-h-20 py-2', className)} />

/* ---------- States ---------- */
export function Skeleton({ className }: { className?: string }) { return <div className={clsx('skeleton', className)} aria-hidden /> }
export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2.5 p-4" role="status" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
}
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-2 text-ink-3">{icon}</div>}
      <p className="font-display text-[17px] font-semibold text-indigo-loom">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="m-4 flex items-start gap-3 rounded-md border border-bad/30 bg-bad-soft p-3 text-sm text-bad" role="alert">
      <XCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{msg}</div>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div className={clsx('flex items-start gap-2 rounded-md px-3 py-2 text-[13.5px]',
      tone === 'info' && 'bg-info-soft text-indigo-loom', tone === 'warn' && 'bg-warn-soft text-[#7a4f10]',
      tone === 'bad' && 'bg-bad-soft text-bad', tone === 'ok' && 'bg-ok-soft text-[#0a5e56]', className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 30)
    return () => { document.removeEventListener('keydown', key); prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo-deep/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal aria-label={title}
        className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-2xl sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button data-close onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-sunk hover:text-ink" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Confirm ---------- */
type ConfirmOpts = { title: string; body: ReactNode; confirm: string; tone?: 'danger' | 'primary' | 'ok' }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}
        footer={<><Button variant="ghost" onClick={() => close(false)}>Go back</Button>
          <Button variant={state?.tone ?? 'primary'} onClick={() => close(true)}>{state?.confirm}</Button></>}>
        <div className="text-sm text-ink-2">{state?.body}</div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmCtx)

/* ---------- Toasts ---------- */
type Toast = { id: number; tone: 'ok' | 'bad' | 'info'; text: string }
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, tone, text }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 4000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={clsx('pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface p-3 text-sm shadow-lg',
            t.tone === 'ok' && 'border-ok/40', t.tone === 'bad' && 'border-bad/40', t.tone === 'info' && 'border-line')}>
            {t.tone === 'ok' ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : t.tone === 'bad' ? <XCircle className="size-4 shrink-0 text-bad" /> : <Info className="size-4 shrink-0 text-indigo-thread" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Table wrapper ---------- */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('overflow-x-auto', className)}>{children}</div>
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={clsx('-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
            value === it.value ? 'border-indigo-loom text-indigo-loom' : 'border-transparent text-ink-3 hover:text-ink')}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Key/value ---------- */
export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-2.5 text-sm', cols === 3 ? 'grid-cols-2 md:grid-cols-3' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0"><dt className="text-[12.5px] text-ink-3">{k}</dt><dd className="truncate font-medium text-ink">{v}</dd></div>
      ))}
    </dl>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
