import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'

/* ---------- Button ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok' | 'teal'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-2.5 text-[12.5px]' : size === 'lg' ? 'h-10 px-4 text-sm' : 'h-9 px-3.5 text-[13.5px]',
        variant === 'primary' && 'bg-primary-navy text-white hover:bg-dark-navy active:bg-deep-teal shadow-xs',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-sunk hover:border-line-strong shadow-xs',
        variant === 'ghost' && 'text-ink-2 hover:bg-sunk hover:text-ink',
        variant === 'danger' && 'bg-bad text-white hover:brightness-95 shadow-xs',
        variant === 'ok' && 'bg-ok text-white hover:brightness-95 shadow-xs',
        variant === 'teal' && 'bg-brand-teal text-white hover:bg-deep-teal shadow-xs',
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/* ---------- Badges ---------- */
const TONES = {
  ok: 'bg-[#E5F4ED] text-[#187B5B] border border-[#187B5B]/20',
  warn: 'bg-[#FFF3DF] text-[#B87519] border border-[#B87519]/25',
  bad: 'bg-[#FCEAEA] text-[#C74343] border border-[#C74343]/25',
  info: 'bg-[#EBF2FA] text-[#3568B0] border border-[#3568B0]/20',
  neutral: 'bg-[#EDF1F4] text-[#657286] border border-[#DCE2E8]',
}
export type Tone = keyof typeof TONES
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium leading-tight whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  )
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
    <section className={clsx('min-w-0 rounded-lg border border-line bg-surface shadow-[0_1px_3px_rgba(20,43,70,0.04)]', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 bg-[#FAFBFD]/70">
          <div className="min-w-0">
            {title && <h2 className="text-[15.5px] font-semibold leading-tight text-primary-navy">{title}</h2>}
            {subtitle && <p className="text-[12.5px] text-ink-3 mt-0.5">{subtitle}</p>}
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
      <label htmlFor={id} className="text-[12.5px] font-medium text-ink-2">{label}</label>
      {children(id)}
      {error ? <p className="text-[12px] text-bad font-medium">{error}</p> : hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  )
}
const inputCls = 'h-9 rounded-md border border-line bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-3 transition-colors focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/15 disabled:bg-sunk'
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
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-display text-[16px] font-semibold text-primary-navy">{title}</p>
      {children && <p className="mt-1 max-w-md text-[13.5px] text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="m-4 flex items-start gap-3 rounded-md border border-bad/30 bg-bad-soft p-3 text-[13px] text-bad" role="alert">
      <XCircle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{msg}</div>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode; className?: string }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-[13px] border',
      tone === 'info' && 'bg-[#EBF2FA] text-[#142B46] border-[#3568B0]/20',
      tone === 'warn' && 'bg-[#FFF3DF] text-[#7A4F10] border-[#B87519]/25',
      tone === 'bad' && 'bg-[#FCEAEA] text-[#C74343] border-[#C74343]/25',
      tone === 'ok' && 'bg-[#E5F4ED] text-[#116B5C] border-[#187B5B]/20', className)}>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark-navy/50 backdrop-blur-xs sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal aria-label={title}
        className={clsx('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-2xl border border-line sm:rounded-xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-[#FAFBFD]">
          <h2 className="text-[16px] font-semibold text-primary-navy">{title}</h2>
          <button data-close onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-sunk hover:text-ink transition-colors" aria-label="Close"><X className="size-4.5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5 bg-[#FAFBFD]/60">{footer}</div>}
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
        <div className="text-[13.5px] text-ink-2">{state?.body}</div>
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
          <div key={t.id} className={clsx('pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface p-3 text-[13px] shadow-lg',
            t.tone === 'ok' && 'border-ok/30 text-ink', t.tone === 'bad' && 'border-bad/30 text-ink', t.tone === 'info' && 'border-line text-ink')}>
            {t.tone === 'ok' ? <CheckCircle2 className="size-4 shrink-0 text-ok mt-0.5" /> : t.tone === 'bad' ? <XCircle className="size-4 shrink-0 text-bad mt-0.5" /> : <Info className="size-4 shrink-0 text-information mt-0.5" />}
            <span className="font-medium">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Table wrapper ---------- */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(20,43,70,0.02)]', className)}>
      {children}
    </div>
  )
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="flex gap-2 overflow-x-auto border-b border-line px-1">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={clsx('-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === it.value ? 'border-brand-teal text-primary-navy font-semibold' : 'border-transparent text-ink-3 hover:text-ink hover:border-line-strong')}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Key/value ---------- */
export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-3 text-[13px]', cols === 3 ? 'grid-cols-2 md:grid-cols-3' : cols === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2')}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0"><dt className="text-[12px] text-ink-3">{k}</dt><dd className="truncate font-medium text-ink mt-0.5">{v}</dd></div>
      ))}
    </dl>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[24px] font-bold tracking-tight text-primary-navy leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
