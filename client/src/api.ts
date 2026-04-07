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

  syncHA: () =>
    request<{ created: string[]; skipped: string[] }>('/home-assistant/check', { method: 'POST' }),

  backup: () =>
    request<{ backup: string }>('/backup', { method: 'POST' }),

  queryTasks: (params: {
    columnId?: string
    columnIdOp?: 'eq' | 'ne'
    completedAtOp?: 'lt' | 'gte'
    completedAt?: string
    dueDateOp?: 'eq' | 'gte' | 'lte' | 'lt'
    dueDate?: string
    doDateOp?: 'eq' | 'gte' | 'lt'
    doDate?: string
    priority?: string
    assignee?: string
    titleCont?: string
    limit?: number
    offset?: number
    sortBy?: 'dueDate' | 'doDate' | 'completedAt' | 'order' | 'priority' | 'createdAt'
    sortDir?: 'asc' | 'desc'
  }) => {
    const searchParams = new URLSearchParams()
    if (params.columnId) {
      const op = params.columnIdOp || 'eq'
      searchParams.set(`columnId=${op}`, params.columnId)
    }
    if (params.completedAt) {
      const op = params.completedAtOp || 'lt'
      searchParams.set(`completedAt=${op}`, params.completedAt)
    }
    if (params.dueDate) {
      const op = params.dueDateOp || 'eq'
      searchParams.set(`dueDate=${op}`, params.dueDate)
    }
    if (params.doDate) {
      const op = params.doDateOp || 'eq'
      searchParams.set(`doDate=${op}`, params.doDate)
    }
    if (params.priority) searchParams.set('priority=eq', params.priority)
    if (params.assignee) searchParams.set('assignee=eq', params.assignee)
    if (params.titleCont) searchParams.set('title=cont', params.titleCont)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    if (params.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params.sortDir) searchParams.set('sortDir', params.sortDir)

    return request<{ tasks: Task[]; hasMore: boolean }>(`/tasks?${searchParams.toString()}`)
  },
}
