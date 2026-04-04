// Shared types for psyboard — client copy
// Keep in sync with server/src/types.ts

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
}

export type Board = {
  columns: Column[]
  tasks: Task[]
}

export type CreateColumnInput = { title: string }
export type CreateTaskInput = { title: string; columnId: string; description?: string }
export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'columnId' | 'order'>>
