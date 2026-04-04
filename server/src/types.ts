// Shared types for psyboard
// Used by server. Client defines these locally in src/types.ts

export type Column = {
  id: string
  title: string
  order: number
}

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
