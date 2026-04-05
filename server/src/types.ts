// Shared types for psyboard
// Used by server. Client defines these locally in src/types.ts

export type ColumnKind = 'system' | 'custom'

export type SystemKey = 'backlog' | 'today' | 'done'

export type Column = {
  id: string
  title: string
  kind: ColumnKind
  systemKey?: SystemKey  // only for kind === 'system'
  position: number       // replaces `order`, lower = more left
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

  doDate?: string | null  // YYYY-MM-DD — when user plans to work on it
  dueDate?: string | null // YYYY-MM-DD — deadline
  priority?: TaskPriority
  assignee?: 'SL' | 'KL' | undefined  // undefined means not assigned

  manualOrder?: number  // for manual ordering in Today and custom columns

  createdAt: string
  updatedAt: string
  completedAt?: string // ISO datetime — set when moved to Done, cleared when moved out
}

export type Board = {
  columns: Column[]
  tasks: Task[]
}

export type CreateColumnInput = { title: string }
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
  priority?: TaskPriority
  completedAt?: string
  manualOrder?: number
}
