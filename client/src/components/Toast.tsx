import { useEffect, useState } from 'react'
import type { BroadcastSummary, Task } from '../types'

interface ToastProps {
  summary: BroadcastSummary
  visible: boolean
  onDismiss: () => void
}

function getIcon(summary: BroadcastSummary): string {
  if (summary === null) return '🔄'
  if (summary.source === 'home_assistant') return '🏠'
  return '🔄'
}

function getLabel(summary: BroadcastSummary): string {
  if (summary === null) return 'Board updated in another tab'
  if (summary.source === 'home_assistant') return 'Home Assistant'
  return 'Board updated'
}

function getCreatedCount(summary: BroadcastSummary): number {
  if (summary === null) return 0
  return summary.created.length
}

function getUpdatedCount(summary: BroadcastSummary): number {
  if (summary === null || summary.source !== 'tab') return 0
  return summary.updated.length
}

function getSkippedCount(summary: BroadcastSummary): number {
  if (summary === null || summary.source !== 'home_assistant') return 0
  return summary.skipped.length
}

export function Toast({ summary, visible, onDismiss }: ToastProps) {
  const [animKey, setAnimKey] = useState(0)

  // Re-trigger animation when a new toast arrives
  useEffect(() => {
    if (visible) setAnimKey(k => k + 1)
  }, [visible])

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [visible, onDismiss])

  if (!visible) return null

  const createdCount = getCreatedCount(summary)
  const updatedCount = getUpdatedCount(summary)
  const skippedCount = getSkippedCount(summary)

  return (
    <div className="toast" role="status" aria-live="polite" key={animKey}>
      <div className="toast-row">
        <span className="toast-icon">{getIcon(summary)}</span>
        <span className="toast-label">{getLabel(summary)}</span>
        {createdCount > 0 && (
          <span className="toast-badge toast-badge-created">+{createdCount}</span>
        )}
        {updatedCount > 0 && (
          <span className="toast-badge toast-badge-updated">~{updatedCount}</span>
        )}
        {skippedCount > 0 && (
          <span className="toast-badge toast-badge-skipped">~{skippedCount} skipped</span>
        )}
        <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      {summary !== null && summary.created.length > 0 && (
        <div className="toast-task-list">
          {summary.created.map((item, i) => (
            <div key={i} className="toast-task-item">
              <span className="toast-task-marker">+</span>
              <span>{typeof item === 'string' ? item : (item as Task).title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
