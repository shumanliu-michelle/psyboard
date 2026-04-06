// Shared types for psyboard — client copy
// Keep in sync with server/src/types.ts

export type ColumnKind = 'system' | 'custom'

export type SystemKey = 'backlog' | 'today' | 'done'

export type Column = {
  id: string
  title: string
  kind: ColumnKind
  systemKey?: SystemKey  // only for kind === 'system'
  position: number       // replaces `order`, lower = more left
  accent?: string        // hex color for custom columns, e.g. '#ec4899'
  createdAt: string
  updatedAt: string
}

export const BACKLOG_COLUMN_ID = 'col-backlog'
export const TODAY_COLUMN_ID  = 'col-today'
export const DONE_COLUMN_ID   = 'col-done'

export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number

  doDate?: string | null
  dueDate?: string | null
  priority?: TaskPriority
  assignee?: 'SL' | 'KL' | undefined  // undefined means not assigned

  manualOrder?: number

  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type Board = {
  columns: Column[]
  tasks: Task[]
}

export type CreateColumnInput = { title: string; accent?: string }
export type CreateTaskInput = {
  title: string
  columnId: string
  description?: string
  doDate?: string | null
  dueDate?: string | null
  priority?: TaskPriority
  assignee?: 'SL' | 'KL' | null
}
export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string | null
  dueDate?: string | null
  priority?: TaskPriority | null
  completedAt?: string
  manualOrder?: number
}
