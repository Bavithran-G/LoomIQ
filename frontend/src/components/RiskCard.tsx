import clsx from 'clsx'
import { Panel, StatusBadge } from './ui'
import { date, dateTime } from '../lib/format'
import type { Risk } from '../lib/types'

const KIND: Record<string, string> = { schedule: 'Schedule', material: 'Material', quality: 'Quality', hold: 'Hold', downtime: 'Downtime', workload: 'Planning' }

export function RiskCard({ risk }: { risk: Risk }) {
  if (risk.band === 'not_assessed') return null
  const d = risk.data as Record<string, number | string>
  return (
    <Panel
      title={
        <span className="flex items-center gap-2.5">
          <span>Production risk</span>
          <StatusBadge value={risk.band} />
          {risk.score != null && (
            <span className="rounded bg-sunk px-2 py-0.5 text-[12px] font-semibold text-primary-navy tabular-nums border border-line">
              Score: {risk.score} / 100
            </span>
          )}
        </span>
      }
      subtitle={`Deterministic rule-based score · assessed ${dateTime(risk.assessed_at)}${risk.confidence === 'low' ? ' · low confidence: no production planned yet' : ''}`}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="text-[14px] leading-relaxed text-ink font-medium">{risk.summary}</p>
          {risk.recommendation && (
            <div className="mt-2.5 rounded-md border border-brand-teal/25 bg-[#EBF2FA] px-3.5 py-2 text-[13px] text-primary-navy">
              <span className="font-semibold text-brand-teal mr-1">Recommended action:</span> {risk.recommendation}
            </div>
          )}
          {risk.factors.length > 0 && (
            <div className="mt-3.5">
              <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">Triggering risk factors ({risk.factors.length})</div>
              <ul className="divide-y divide-line rounded-lg border border-line overflow-hidden bg-surface">
                {risk.factors.map((f, i) => (
                  <li key={i} className="grid grid-cols-[88px_1fr_48px] items-start gap-3 px-3.5 py-2.5 text-[13px] hover:bg-sunk/40 transition-colors">
                    <span className="font-semibold text-ink-2 text-[12px]">{KIND[f.kind] ?? f.kind}</span>
                    <div>
                      <span className="text-ink font-medium">{f.detail}</span>
                      <span className="block text-[11.5px] text-ink-3 mt-0.5">Rule: {f.rule}</span>
                    </div>
                    <span className={clsx('text-right font-display text-[15px] font-bold tabular-nums', f.points >= 25 ? 'text-bad' : 'text-warn')}>
                      +{f.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-line bg-sunk/40 p-3.5">
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-3">Schedule & Queue Diagnostics</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
            <dt className="text-ink-3">Projected finish</dt><dd className="font-semibold text-primary-navy">{date(risk.projected_finish)}</dd>
            <dt className="text-ink-3">Promised date</dt><dd className="font-semibold text-primary-navy">{date(risk.promised_date)}</dd>
            <dt className="text-ink-3">Days to deadline</dt><dd className="font-medium tabular-nums">{String(d.days_to_deadline ?? '–')}</dd>
            <dt className="text-ink-3">Slack days</dt><dd className={clsx('font-medium tabular-nums', Number(d.slack_days) <= 1 ? 'text-bad' : 'text-ink')}>{d.slack_days != null ? `${d.slack_days} days` : '–'}</dd>
            <dt className="text-ink-3">Left to weave</dt><dd className="font-medium tabular-nums">{String(d.remaining_to_weave_m ?? '–')} m</dd>
            <dt className="text-ink-3">Weaving queue</dt><dd className="font-medium tabular-nums">{String(d.queue_ahead_incl_this_m ?? '–')} m</dd>
            <dt className="text-ink-3">Loom capacity / d</dt><dd className="font-medium tabular-nums">{String(d.weaving_capacity_m_per_day ?? '–')} m</dd>
          </dl>
        </div>
      </div>
    </Panel>
  )
}
