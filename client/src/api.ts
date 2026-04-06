import type { Board, Column, CreateColumnInput, CreateTaskInput, UpdateTaskInput, Task } from './types'

const BASE = '/api'

// Tab ID for SSE self-filtering — set by App on mount
let tabId: string | null = null
export function setTabId(id: string): void {
  tabId = id
}

export class ConflictError extends Error {
  readonly currentTask: Task
  constructor(currentTask: Task) {
    super('Task was modified by someone else. Please reload and try again.')
    this.name = 'ConflictError'
    this.currentTask = currentTask
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (tabId) {
    headers['X-Tab-Id'] = tabId
  }
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    if (res.status === 409) {
      throw new ConflictError((body as { currentTask: Task }).currentTask)
    }
    throw new Error((body as { error: string }).error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  getBoard: () => request<Board>('/board'),

  createColumn: (data: CreateColumnInput) =>
    request<Column>('/columns', { method: 'POST', body: JSON.stringify(data) }),

  deleteColumn: (id: string) =>
    request<void>(`/columns/${id}`, { method: 'DELETE' }),

  updateColumn: (id: string, updates: { title?: string; position?: number }) =>
    request<Column>(`/columns/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),

  createTask: (data: CreateTaskInput) =>
    request<import('./types').Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  updateTask: (id: string, data: UpdateTaskInput) =>
    request<import('./types').Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  reorderTasks: (taskId: string, targetColumnId: string, newIndex: number) =>
    request<{ tasks: import('./types').Task[] }>('/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify({ taskId, targetColumnId, newIndex }),
    }),

  reorderColumns: (columnIds: string[]) =>
    request<{ columns: Column[] }>('/columns/reorder', { method: 'POST', body: JSON.stringify({ columnIds }) }),
}
