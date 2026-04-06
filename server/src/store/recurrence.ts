import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig, RecurrenceKind } from '../types.js'

export function computeNextDate(
  currentDate: string | null,
  kind: RecurrenceKind,
  config: RecurrenceConfig,
  _baseTimestamp: string, // unused for non-cron kinds; kept for API clarity
): string | null {
  if (!currentDate) return null

  switch (kind) {
    case 'daily': {
      const base = new Date(currentDate + 'T00:00:00Z')
      base.setUTCDate(base.getUTCDate() + 1)
      return base.toISOString().slice(0, 10)
    }
    case 'weekly': {
      const base = new Date(currentDate + 'T00:00:00Z')
      base.setUTCDate(base.getUTCDate() + 7)
      return base.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const base = new Date(currentDate + 'T00:00:00Z')
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
      const base = new Date(currentDate + 'T00:00:00Z')
      base.setUTCDate(base.getUTCDate() + intervalDays)
      return base.toISOString().slice(0, 10)
    }
    case 'weekdays': {
      const base = new Date(currentDate + 'T00:00:00Z')
      do { base.setUTCDate(base.getUTCDate() + 1) }
      while (base.getUTCDay() === 0 || base.getUTCDay() === 6)
      return base.toISOString().slice(0, 10)
    }
    case 'cron': {
      if (!config.cronExpr) return null
      const interval = CronExpressionParser.parse(config.cronExpr, { currentDate: new Date(_baseTimestamp) })
      // First next() returns occurrence at or after currentDate.
      // Second next() returns the following occurrence (next cron match).
      interval.next()
      return interval.next().toISOString().slice(0, 10)
    }
  }
}
