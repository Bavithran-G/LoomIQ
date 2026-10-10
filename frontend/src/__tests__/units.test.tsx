import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { parseRollCode } from '../pages/Rolls'
import { addDays, metres, pct } from '../lib/format'
import { ThreadStrip } from '../components/brand'
import { StatusBadge } from '../components/ui'

describe('roll QR parsing', () => {
  it('extracts the roll number from a scanned verification link', () => {
    expect(parseRollCode('http://localhost:5173/r/RL-2026-00041?t=abc')).toBe('RL-2026-00041')
  })
  it('accepts typed lower-case codes and rejects junk', () => {
    expect(parseRollCode('rl-2026-00007')).toBe('RL-2026-00007')
    expect(parseRollCode('SO-2026-0003')).toBeNull()
  })
})

describe('formatting', () => {
  it('formats metres and percentages, and handles missing values', () => {
    expect(metres(1250)).toBe('1,250 m')
    expect(metres(null)).toBe('–')
    expect(pct(0.0488)).toBe('4.9%')
    expect(pct(null)).toBe('–')
  })
  it('adds days across month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })
})

describe('components', () => {
  it('thread strip exposes stage progress to assistive tech', () => {
    render(<ThreadStrip quantity={1000} progress={[{ stage: 'weaving', done_m: 500, pct: 0.5 }, { stage: 'dispatch', done_m: 0, pct: 0 }]} />)
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Weaving 50%, Dispatch 0%')
  })
  it('status badge uses readable labels', () => {
    render(<StatusBadge value="defect_suspected" />)
    expect(screen.getByText('Defect suspected')).toBeInTheDocument()
  })
})
