import clsx from 'clsx'
import { Panel, StatusBadge } from './ui'
import { date, dateTime } from '../lib/format'
import type { Risk } from '../lib/types'

const KIND: Record<string, string> = { schedule: 'Schedule', material: 'Material', quality: 'Quality', hold: 'Hold', downtime: 'Downtime', workload: 'Planning' }

export function RiskCard({ risk }: { risk: Risk }) {
  if (risk.band === 'not_assessed') return null
  const d = risk.data as Record<string, number | string>
  return (
    <Panel title={<span className="flex items-center gap-2">Production risk <StatusBadge value={risk.band} />{risk.score != null && <span className="text-sm font-normal text-ink-3">{risk.score} / 100</span>}</span>}
      subtitle={`Deterministic rule-based score, not a trained model · assessed ${dateTime(risk.assessed_at)}${risk.confidence === 'low' ? ' · low confidence: no production planned yet' : ''}`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="text-[14.5px] text-ink">{risk.summary}</p>
          {risk.recommendation && <p className="mt-1 text-[14px] font-medium text-indigo-thread">Recommended: {risk.recommendation}</p>}
          {risk.factors.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line">
              {risk.factors.map((f, i) => (
                <li key={i} className="grid grid-cols-[86px_1fr_44px] items-start gap-3 px-3 py-2 text-[13.5px]">
                  <span className="font-medium text-ink-2">{KIND[f.kind] ?? f.kind}</span>
                  <span><span className="text-ink">{f.detail}</span><span className="block text-[12px] text-ink-3">Rule: {f.rule}</span></span>
                  <span className={clsx('text-right font-display text-[16px] font-semibold', f.points >= 25 ? 'text-bad' : 'text-warn')}>+{f.points}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-3">Projected finish</dt><dd className="font-medium">{date(risk.projected_finish)}</dd>
          <dt className="text-ink-3">Promised</dt><dd className="font-medium">{date(risk.promised_date)}</dd>
          <dt className="text-ink-3">Days to deadline</dt><dd className="font-medium">{String(d.days_to_deadline ?? '–')}</dd>
          <dt className="text-ink-3">Slack</dt><dd className="font-medium">{d.slack_days != null ? `${d.slack_days} days` : '–'}</dd>
          <dt className="text-ink-3">Left to weave</dt><dd className="font-medium">{String(d.remaining_to_weave_m ?? '–')} m</dd>
          <dt className="text-ink-3">Weaving queue incl. this</dt><dd className="font-medium">{String(d.queue_ahead_incl_this_m ?? '–')} m</dd>
          <dt className="text-ink-3">Loom capacity / day</dt><dd className="font-medium">{String(d.weaving_capacity_m_per_day ?? '–')} m</dd>
        </dl>
      </div>
    </Panel>
  )
}
