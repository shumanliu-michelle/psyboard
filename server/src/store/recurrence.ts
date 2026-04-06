import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig, RecurrenceKind } from '../types.js'

/** Advance a date by one step for the given recurrence kind. Does NOT handle cron. */
function advanceOneStep(dateStr: string, kind: RecurrenceKind, config: RecurrenceConfig): string | null {
  const base = new Date(dateStr + 'T00:00:00Z')
  switch (kind) {
    case 'daily': {
      base.setUTCDate(base.getUTCDate() + 1)
      return base.toISOString().slice(0, 10)
    }
    case 'weekly': {
      base.setUTCDate(base.getUTCDate() + 7)
      return base.toISOString().slice(0, 10)
    }
    case 'monthly': {
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
      base.setUTCDate(base.getUTCDate() + intervalDays)
      return base.toISOString().slice(0, 10)
    }
    case 'weekdays': {
      do { base.setUTCDate(base.getUTCDate() + 1) }
      while (base.getUTCDay() === 0 || base.getUTCDay() === 6)
      return base.toISOString().slice(0, 10)
    }
    case 'cron': {
      // Should not reach here — cron is handled inline in computeNextDate
      return null
    }
  }
}

export function computeNextDate(
  currentDate: string | null,
  kind: RecurrenceKind,
  config: RecurrenceConfig,
  _baseTimestamp: string, // completion date for completion_based; unused for fixed
  todayStr?: string, // defaults to real today — injectable for tests
): string | null {
  if (!currentDate) return null

  const today = todayStr ?? new Date().toISOString().slice(0, 10)

  // Cron is always completion-based (uses _baseTimestamp) and does not loop.
  if (kind === 'cron') {
    if (!config.cronExpr) return null
    const interval = CronExpressionParser.parse(config.cronExpr, { currentDate: new Date(_baseTimestamp) })
    // Skip same-day occurrence: call next() twice and return the second.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = interval.next() as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next2 = interval.next() as any
    return next2 ? next2.toISOString().slice(0, 10) : (next ? next.toISOString().slice(0, 10) : null)
  }

  // For completion_based, next occurrence is relative to completion date.
  // For fixed, next occurrence is relative to the doDate (currentDate).
  const isCompletionBased = config.mode === 'completion_based'
  const baseDate = isCompletionBased
    ? _baseTimestamp.slice(0, 10)
    : currentDate

  let next = advanceOneStep(baseDate, kind, config)

  // For fixed recurrence, if the next date is in the past (or today), keep
  // advancing until we find a strictly future date. This prevents overdue
  // next occurrences when a scheduled task is completed late (e.g. monthly on
  // day 1, completed May 15 -> next is June 1, not May 1).
  if (!isCompletionBased) {
    while (next && next <= today) {
      next = advanceOneStep(next, kind, config)
    }
  }

  return next
}
