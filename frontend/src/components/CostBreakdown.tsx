import { Badge, Notice } from './ui'
import { dateTime, human, money, money2 } from '../lib/format'
import type { CostBlock } from '../lib/types'

const CATS = ['material', 'labour', 'processing', 'rework', 'other']

export function CostBreakdown({ c }: { c: CostBlock }) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        <table className="data-table min-w-[560px]">
          <thead>
            <tr>
              <th>Component</th>
              <th className="num">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <span>Planned Estimate</span>
                  <Badge tone="info">estimate</Badge>
                </span>
              </th>
              <th className="num">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <span>Recorded Cost</span>
                  <Badge tone="ok">actual</Badge>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {CATS.map((k) => (
              <tr key={k}>
                <td className="font-medium text-ink">{human(k)}</td>
                <td className="num tabular-nums text-ink-2">{money(c.estimated[k])}</td>
                <td className="num tabular-nums font-semibold text-primary-navy">{money(c.actual[k])}</td>
              </tr>
            ))}
            <tr className="bg-sunk/50 font-bold border-t-2 border-line">
              <td className="text-primary-navy">Total Cost</td>
              <td className="num tabular-nums text-primary-navy">{money(c.estimated_total)}</td>
              <td className="num tabular-nums text-primary-navy">{money(c.actual_total)}</td>
            </tr>
            <tr className="bg-sunk/20">
              <td className="text-ink-2">Cost per Metre</td>
              <td className="num tabular-nums text-ink-2">{money2(c.estimated_cost_per_m)} / ordered m</td>
              <td className="num tabular-nums font-semibold text-primary-navy">
                {c.actual_cost_per_accepted_m == null ? 'No accepted fabric yet' : `${money2(c.actual_cost_per_accepted_m)} / accepted m`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <QBox label="Rework cost recorded" v={money(c.quality.rework_cost_actual)} basis="actual, inside total" />
        <QBox label="Cost sunk in rejected fabric" v={money(c.quality.cost_embedded_in_rejected)} basis="derived, already inside total" />
        <QBox label="Replacement production" v={money(c.quality.replacement_estimate)} basis="estimate, not in totals" />
      </div>
      <Notice tone="info">{c.quality.note}</Notice>
      <details className="text-[13px] rounded-lg border border-line bg-surface p-3">
        <summary className="cursor-pointer font-semibold text-brand-teal hover:underline">How these figures are calculated</summary>
        <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-ink-2">
          <li><b>Estimate</b> = order quantity × (Σ yarn per metre × standard cost + labour rate + processing rate). Rework is not planned, so its estimate is zero.</li>
          <li><b>Recorded material</b> = consumed quantity × the receiving lot's unit cost, booked when a weaving job completes.</li>
          <li><b>Recorded labour and processing</b> = metres completed × spec rate × stage share (weaving 50%, dyeing 35%, finishing 15%).</li>
          <li><b>Rework</b> = roll length × spec rework rate, booked once when rework is confirmed complete.</li>
          <li><b>Cost per accepted metre</b> = recorded total ÷ accepted metres, shown only when accepted metres are above zero.</li>
        </ul>
      </details>
      {c.entries && c.entries.length > 0 && (
        <details className="text-[13px] rounded-lg border border-line bg-surface p-3">
          <summary className="cursor-pointer font-semibold text-brand-teal hover:underline">Cost ledger ({c.entries.length} entries, each linked to its source event)</summary>
          <div className="mt-2.5 max-h-72 overflow-auto rounded border border-line">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {c.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-ink-3 text-[12px]">{dateTime(e.created_at)}</td>
                    <td><Badge tone="neutral">{human(e.category)}</Badge></td>
                    <td className="font-mono text-[12px] text-ink-2">{e.source_type} #{e.source_id}</td>
                    <td className="text-ink">{e.description}</td>
                    <td className="num font-semibold text-primary-navy tabular-nums">{money2(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function QBox({ label, v, basis }: { label: string; v: string; basis: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5 shadow-xs">
      <div className="text-[12px] font-medium text-ink-3">{label}</div>
      <div className="font-display text-[20px] font-bold text-primary-navy tabular-nums mt-0.5">{v}</div>
      <div className="text-[11.5px] text-ink-3 mt-0.5">{basis}</div>
    </div>
  )
}
