// Maps column systemKey to its accent color and shadow tint
export const COLUMN_COLORS: Record<string, { accent: string; bg: string; shadow: string }> = {
  backlog: { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' },
  today:   { accent: '#f59e0b', bg: '#fffbeb', shadow: 'rgba(245,158,11,0.10)' },
  done:    { accent: '#22c55e', bg: '#f0fdf4', shadow: 'rgba(34,197,94,0.10)' },
  thisweek: { accent: '#8b5cf6', bg: '#f5f3ff', shadow: 'rgba(139,92,246,0.10)' },
}

export const CUSTOM_COLUMN_COLOR = { accent: '#f97316', bg: '#fff7ed', shadow: 'rgba(249,115,22,0.10)' }

export function getColumnColor(systemKey?: string) {
  if (!systemKey) return CUSTOM_COLUMN_COLOR
  return COLUMN_COLORS[systemKey] ?? CUSTOM_COLUMN_COLOR
}