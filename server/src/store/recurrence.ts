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
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + 1)
      return base.toISOString().slice(0, 10)
    }
    case 'weekly': {
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + 7)
      return base.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const base = new Date(currentDate + 'T00:00:00')
      const targetDay = config.dayOfMonth ?? base.getDate()
      const currentMonth = base.getMonth()
      const targetMonth = currentMonth + 1
      const targetYear = targetMonth > 11 ? base.getFullYear() + 1 : base.getFullYear()
      const actualTargetMonth = targetMonth % 12
      const lastDay = new Date(targetYear, actualTargetMonth + 1, 0).getDate()
      const result = new Date(targetYear, actualTargetMonth, Math.min(targetDay, lastDay))
      return result.toISOString().slice(0, 10)
    }
    case 'interval_days': {
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + (config.intervalDays ?? 1))
      return base.toISOString().slice(0, 10)
    }
    case 'weekdays': {
      const base = new Date(currentDate + 'T00:00:00')
      do { base.setDate(base.getDate() + 1) }
      while (base.getDay() === 0 || base.getDay() === 6)
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
