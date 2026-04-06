import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig, RecurrenceKind, RecurrenceMode } from '../types.js'

export function computeNextDate(
  currentDate: string | null,
  kind: RecurrenceKind,
  config: RecurrenceConfig,
  baseTimestamp: string,
): string | null {
  const mode: RecurrenceMode = config.mode ?? 'fixed'

  // For completion_based, advance from the completion timestamp.
  // For fixed, advance from the scheduled date (doDate/dueDate).
  const referenceDate = mode === 'completion_based'
    ? baseTimestamp.slice(0, 10)
    : currentDate

  if (!referenceDate) return null

  function advance(base: Date, days: number): Date {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + days)
    return d
  }

  switch (kind) {
    case 'daily': {
      const base = new Date(referenceDate + 'T00:00:00Z')
      return advance(base, 1).toISOString().slice(0, 10)
    }
    case 'weekly': {
      const base = new Date(referenceDate + 'T00:00:00Z')
      return advance(base, 7).toISOString().slice(0, 10)
    }
    case 'monthly': {
      const base = new Date(referenceDate + 'T00:00:00Z')
      const targetDay = config.dayOfMonth ?? base.getUTCDate()
      const currentMonth = base.getUTCMonth()
      const targetMonth = currentMonth + 1
      const targetYear = targetMonth > 11 ? base.getUTCFullYear() + 1 : base.getUTCFullYear()
      const actualTargetMonth = targetMonth % 12
      const lastDay = new Date(Date.UTC(targetYear, actualTargetMonth + 1, 0)).getUTCDate()
      const result = new Date(Date.UTC(targetYear, actualTargetMonth, Math.min(targetDay, lastDay)))
      return result.toISOString().slice(0, 10)
    }
    case 'interval_days': {
      const intervalDays = config.intervalDays ?? 1
      if (intervalDays < 1) return null
      const base = new Date(referenceDate + 'T00:00:00Z')
      return advance(base, intervalDays).toISOString().slice(0, 10)
    }
    case 'weekdays': {
      const base = new Date(referenceDate + 'T00:00:00Z')
      do { base.setUTCDate(base.getUTCDate() + 1) }
      while (base.getUTCDay() === 0 || base.getUTCDay() === 6)
      return base.toISOString().slice(0, 10)
    }
    case 'cron': {
      if (!config.cronExpr) return null
      // For cron, the reference is always the baseTimestamp (completion time for
      // completion_based, or scheduled date for fixed)
      const interval = CronExpressionParser.parse(config.cronExpr, { currentDate: new Date(baseTimestamp) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = interval.next() as any
      const next2 = interval.next() as any
      return next2 ? next2.toISOString().slice(0, 10) : (next ? next.toISOString().slice(0, 10) : null)
    }
  }
}
