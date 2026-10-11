import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { int, num } from '../lib/format'

// Token-driven enterprise industrial palette
export const S1 = '#142B46'
export const S2 = '#B87519'
export const OK = '#187B5B'
export const BAD = '#C74343'
const AXIS = { fontSize: 11.5, fill: '#657286', fontFamily: 'Inter, sans-serif' }
const shortDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

function Tip({ active, payload, label, unit = 'm' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-[12.5px] shadow-lg">
      <div className="mb-1 font-semibold text-primary-navy">{label && /^\d{4}-/.test(label) ? shortDay(label) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-xs" style={{ background: p.color }} />
          <span>{p.name}</span><span className="ml-auto pl-4 font-semibold text-primary-navy tabular-nums">{unit === '%' ? `${num(p.value)}%` : `${int(p.value)} ${unit}`}</span>
        </div>
      ))}
    </div>
  )
}

export function ProductionChart({ data }: { data: { date: string; output_m: number; target_m: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#EDF1F4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(20,43,70,0.04)' }} />
        <Legend iconSize={9} wrapperStyle={{ fontSize: 12.5, paddingTop: 6 }} />
        <Bar dataKey="output_m" name="Woven output" fill={S1} radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Line dataKey="target_m" name="Planned target" stroke={S2} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3.5, fill: S2, strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function QualityChart({ data }: { data: { date: string; accepted: number; rejected: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#EDF1F4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(20,43,70,0.04)' }} />
        <Legend iconSize={9} wrapperStyle={{ fontSize: 12.5, paddingTop: 6 }} />
        <Bar dataKey="accepted" name="Accepted" stackId="q" fill={OK} stroke="#FFFFFF" strokeWidth={1} maxBarSize={26} />
        <Bar dataKey="rejected" name="Rejected" stackId="q" fill={BAD} stroke="#FFFFFF" strokeWidth={1} radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function UtilizationBars({ data, onSelect }: { data: { code: string; utilization: number; status: string; output_m: number; capacity_m: number; machine_id: number }[]; onSelect?: (id: number) => void }) {
  return (
    <ul className="space-y-2.5">
      {data.map((m) => (
        <li key={m.code}>
          <button onClick={() => onSelect?.(m.machine_id)} className="group grid w-full grid-cols-[54px_1fr_48px] items-center gap-2.5 text-left text-[12.5px]"
            title={`${m.code}: ${int(m.output_m)} m of ${int(m.capacity_m)} m capacity`}>
            <span className="font-semibold text-primary-navy group-hover:text-brand-teal transition-colors">{m.code}</span>
            <span className="relative h-2.5 overflow-hidden rounded-xs bg-sunk">
              <span className="absolute inset-y-0 left-0 rounded-r-xs transition-all" style={{ width: `${Math.min(100, m.utilization * 100)}%`, background: m.utilization > 0.85 ? '#187B5B' : m.utilization > 0.5 ? '#142B46' : '#B87519' }} />
            </span>
            <span className="text-right font-medium text-ink-2 tabular-nums">{Math.round(m.utilization * 100)}%</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
