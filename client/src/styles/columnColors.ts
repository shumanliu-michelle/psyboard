// Maps column systemKey to its accent color and shadow tint
export const COLUMN_COLORS: Record<string, { accent: string; bg: string; shadow: string }> = {
  backlog: { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' },
  today:   { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' },
  done:    { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' },
}

// Palette for random custom column colors — picked at creation time
export const COLUMN_PALETTE: Array<{ accent: string; bg: string; shadow: string }> = [
  { accent: '#ec4899', bg: '#fdf2f8', shadow: 'rgba(236,72,153,0.10)' },  // pink
  { accent: '#14b8a6', bg: '#f0fdfa', shadow: 'rgba(20,184,166,0.10)' }, // teal
  { accent: '#8b5cf6', bg: '#f5f3ff', shadow: 'rgba(139,92,246,0.10)' }, // violet
  { accent: '#f97316', bg: '#fff7ed', shadow: 'rgba(249,115,22,0.10)' }, // orange
  { accent: '#06b6d4', bg: '#ecfeff', shadow: 'rgba(6,182,212,0.10)' },  // cyan
  { accent: '#84cc16', bg: '#f7fee7', shadow: 'rgba(132,204,22,0.10)' }, // lime
  { accent: '#f43f5e', bg: '#fff1f2', shadow: 'rgba(244,63,94,0.10)' },  // rose
  { accent: '#a855f7', bg: '#faf5ff', shadow: 'rgba(168,85,247,0.10)' }, // purple
]

export function pickRandomPaletteColor() {
  return COLUMN_PALETTE[Math.floor(Math.random() * COLUMN_PALETTE.length)]
}

export const CUSTOM_COLUMN_COLOR = { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' }

// Convert hex to rgb components
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null
}

function tint(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#f9fafb'
  const r = Math.round(rgb.r + (255 - rgb.r) * amount)
  const g = Math.round(rgb.g + (255 - rgb.g) * amount)
  const b = Math.round(rgb.b + (255 - rgb.b) * amount)
  return `rgb(${r}, ${g}, ${b})`
}

export function getColumnColor(systemKey?: string, accent?: string) {
  // Custom columns with a stored accent — compute bg from accent
  if (!systemKey && accent) {
    return {
      accent,
      bg: tint(accent, 0.95),
      shadow: `rgba(0,0,0,0.08)`,
    }
  }
  if (!systemKey) return CUSTOM_COLUMN_COLOR
  return COLUMN_COLORS[systemKey] ?? CUSTOM_COLUMN_COLOR
}