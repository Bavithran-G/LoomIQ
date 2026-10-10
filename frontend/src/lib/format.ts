const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

export const num = (v: number | null | undefined) => (v == null ? '–' : nf.format(v))
export const int = (v: number | null | undefined) => (v == null ? '–' : nf0.format(v))
export const metres = (v: number | null | undefined) => (v == null ? '–' : `${nf.format(v)} m`)
export const money = (v: number | null | undefined) => (v == null ? '–' : inr.format(v))
export const money2 = (v: number | null | undefined) => (v == null ? '–' : inr2.format(v))
export const pct = (v: number | null | undefined, digits = 1) => (v == null ? '–' : `${(v * 100).toFixed(digits)}%`)

export function date(d: string | null | undefined) {
  if (!d) return '–'
  const x = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function dateTime(d: string | null | undefined) {
  if (!d) return '–'
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
export const isoDay = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
export const human = (s: string | null | undefined) => (s ? (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ') : '–')

export const STAGE_NAMES: Record<string, string> = {
  spinning: 'Spinning', weaving: 'Weaving', dyeing: 'Dyeing', inspection: 'Inspection', finishing: 'Finishing',
  packed: 'Packed', dispatched: 'Dispatched', dispatch: 'Dispatch', scrapped: 'Scrapped',
}
export const ROLES: Record<string, string> = {
  admin: 'Administrator', production_manager: 'Production manager', storekeeper: 'Storekeeper',
  quality_inspector: 'Quality inspector', dispatch_operator: 'Dispatch operator', finance: 'Finance & management',
  buyer: 'Buyer',
}
