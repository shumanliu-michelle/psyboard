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
  createdAt: string
  updatedAt: string
}

export const BACKLOG_COLUMN_ID = 'col-backlog'
export const TODAY_COLUMN_ID  = 'col-today'
export const DONE_COLUMN_ID   = 'col-done'

export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number
  createdAt: string
  updatedAt: string
  assignee?: 'SL' | 'KL'
}

export type Board = {
  columns: Column[]
  tasks: Task[]
}

export type CreateColumnInput = { title: string }
export type CreateTaskInput = { title: string; columnId: string; description?: string }
export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
}
