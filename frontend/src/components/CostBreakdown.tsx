import { Badge, Notice } from './ui'
import { dateTime, human, money, money2 } from '../lib/format'
import type { CostBlock } from '../lib/types'

const CATS = ['material', 'labour', 'processing', 'rework', 'other']

export function CostBreakdown({ c }: { c: CostBlock }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[560px]">
          <thead><tr><th>Component</th><th className="num">Estimate <Badge tone="info">estimated</Badge></th><th className="num">Recorded <Badge tone="ok">actual</Badge></th></tr></thead>
          <tbody>
            {CATS.map((k) => <tr key={k}><td>{human(k)}</td><td className="num">{money(c.estimated[k])}</td><td className="num">{money(c.actual[k])}</td></tr>)}
            <tr className="font-semibold"><td>Total</td><td className="num">{money(c.estimated_total)}</td><td className="num">{money(c.actual_total)}</td></tr>
            <tr><td>Per metre</td><td className="num">{money2(c.estimated_cost_per_m)} per ordered m</td>
              <td className="num">{c.actual_cost_per_accepted_m == null ? 'No accepted fabric yet' : `${money2(c.actual_cost_per_accepted_m)} per accepted m`}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <QBox label="Rework cost recorded" v={money(c.quality.rework_cost_actual)} basis="actual, inside total" />
        <QBox label="Cost sunk in rejected fabric" v={money(c.quality.cost_embedded_in_rejected)} basis="derived, already inside total" />
        <QBox label="Replacement production" v={money(c.quality.replacement_estimate)} basis="estimate, not in totals" />
      </div>
      <Notice>{c.quality.note}</Notice>
      <details className="text-[13px]">
        <summary className="cursor-pointer font-medium text-indigo-thread">How these figures are calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
          <li>Estimate = order quantity × (Σ yarn per metre × standard cost + labour rate + processing rate). Rework is not planned, so its estimate is zero.</li>
          <li>Recorded material = consumed quantity × the receiving lot's unit cost, booked when a weaving job completes.</li>
          <li>Recorded labour and processing = metres completed × spec rate × stage share (weaving 50%, dyeing 35%, finishing 15%).</li>
          <li>Rework = roll length × spec rework rate, booked once when rework is confirmed complete.</li>
          <li>Cost per accepted metre = recorded total ÷ accepted metres, shown only when accepted metres are above zero.</li>
        </ul>
      </details>
      {c.entries && c.entries.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-medium text-indigo-thread">Cost ledger ({c.entries.length} entries, each linked to its source event)</summary>
          <div className="mt-2 max-h-72 overflow-auto">
            <table className="data-table"><thead><tr><th>When</th><th>Category</th><th>Source</th><th>Description</th><th className="num">Amount</th></tr></thead>
              <tbody>{c.entries.map((e) => <tr key={e.id}><td>{dateTime(e.created_at)}</td><td>{human(e.category)}</td><td>{e.source_type} #{e.source_id}</td><td>{e.description}</td><td className="num">{money2(e.amount)}</td></tr>)}</tbody></table>
          </div>
        </details>
      )}
    </div>
  )
}

function QBox({ label, v, basis }: { label: string; v: string; basis: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="font-display text-[20px] font-semibold text-indigo-loom">{v}</div>
      <div className="text-[12px] text-ink-3">{basis}</div>
    </div>
  )
}
