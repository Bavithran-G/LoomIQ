import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { int, num } from '../lib/format'

// Validated categorical palette (scripts/validate_palette.js, light surface): S1 indigo, S2 ochre.
export const S1 = '#3D5FA8'
export const S2 = '#B07F2A'
export const OK = '#0E8A7E'
export const BAD = '#C2362F'
const AXIS = { fontSize: 12, fill: '#75808F' }
const shortDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })

function Tip({ active, payload, label, unit = 'm' }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] shadow-lg">
      <div className="mb-1 font-medium text-ink">{label && /^\d{4}-/.test(label) ? shortDay(label) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span><span className="ml-auto pl-4 font-medium text-ink">{unit === '%' ? `${num(p.value)}%` : `${int(p.value)} ${unit}`}</span>
        </div>
      ))}
    </div>
  )
}

export function ProductionChart({ data }: { data: { date: string; output_m: number; target_m: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#EEF1F5" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(61,95,168,0.06)' }} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="output_m" name="Woven output" fill={S1} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="target_m" name="Planned target" stroke={S2} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, fill: S2, strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function QualityChart({ data }: { data: { date: string; accepted: number; rejected: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="#EEF1F5" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(61,95,168,0.06)' }} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="accepted" name="Accepted" stackId="q" fill={OK} stroke="#fff" strokeWidth={1} maxBarSize={28} />
        <Bar dataKey="rejected" name="Rejected" stackId="q" fill={BAD} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function UtilizationBars({ data, onSelect }: { data: { code: string; utilization: number; status: string; output_m: number; capacity_m: number; machine_id: number }[]; onSelect?: (id: number) => void }) {
  return (
    <ul className="space-y-2">
      {data.map((m) => (
        <li key={m.code}>
          <button onClick={() => onSelect?.(m.machine_id)} className="group grid w-full grid-cols-[52px_1fr_52px] items-center gap-2 text-left text-[13px]"
            title={`${m.code}: ${int(m.output_m)} m of ${int(m.capacity_m)} m capacity`}>
            <span className="font-medium text-ink group-hover:underline">{m.code}</span>
            <span className="relative h-3 overflow-hidden rounded-sm bg-sunk">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${Math.min(100, m.utilization * 100)}%`, background: S1 }} />
            </span>
            <span className="text-right text-ink-2">{Math.round(m.utilization * 100)}%</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
