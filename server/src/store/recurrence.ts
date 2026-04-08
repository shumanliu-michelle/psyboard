import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig, RecurrenceKind } from '../types.js'
import { getTodayString } from './dates.js'

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
      base.setUTCDate(base.getUTCDate() + 1)
      while (base.getUTCDay() === 0 || base.getUTCDay() === 6) {
        base.setUTCDate(base.getUTCDate() + 1)
      }
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

  const today = todayStr ?? getTodayString()

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

  // For fixed recurrence, skip past-due occurrences.
  // If next landed exactly on today: advance to avoid same-day duplicate
  // UNLESS the task was overdue before completion (baseDate < today).
  // For overdue tasks, same-day is a valid next occurrence.
  if (!isCompletionBased) {
    while (true) {
      const nextMs = next ? new Date(next + 'T00:00:00Z').getTime() : 0
      const todayMs = new Date(today + 'T00:00:00Z').getTime()
      // For interval_days, today is a valid next occurrence only when the task
      // was due TODAY (baseDate === today). If the task is overdue (baseDate < today),
      // today in the sequence means it was skipped due to lateness — advance.
      const isIntervalKind = kind === 'interval_days'
      // overdue means baseDate < today (task was due before today)
      // For interval_days: today is a valid occurrence when overdue
      // For other kinds: always advance past today
      const overdue = isIntervalKind && baseDate < today
      const overdueNonInterval = !isIntervalKind && baseDate < today
      if (nextMs > todayMs) break
      if (nextMs === todayMs && !overdue && !overdueNonInterval && kind !== 'weekdays') break
      // For weekdays, today is never valid — always advance.
      const shouldAdvance = kind === 'weekdays' || nextMs <= todayMs
      if (!shouldAdvance) break
      const advanced = advanceOneStep(next, kind, config)
      if (!advanced) { next = null; break }
      next = advanced
    }
    // Same-day skip: for daily/weekly/monthly, on-time same-day completion means
    // skip to avoid duplicate on the same day. For interval_days, same-day IS valid
    // (e.g., every 3 days — today April 8 is a valid occurrence after done April 8).
    if (next && next === today && baseDate === today && kind !== 'interval_days') {
      next = advanceOneStep(next, kind, config)
    }
  }

  return next
}
