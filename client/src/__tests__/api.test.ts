import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('api client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
  })

  it('getBoard returns board data (GET /api/board)', async () => {
    const { api } = await import('../api')
    const board = { columns: [], tasks: [] }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => board })
    const result = await api.getBoard()
    expect(result).toEqual(board)
    expect(mockFetch).toHaveBeenCalledWith('/api/board', expect.any(Object))
  })

  it('createTask sends POST with correct body', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    const input = { title: 'Test task', columnId: 'col-1' }
    await api.createTask(input)
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('/api/tasks')
    expect(JSON.parse(call[1].body)).toEqual(input)
    expect(call[1].method).toBe('POST')
  })

  it('createTask sends X-Tab-Id header when tabId is set', async () => {
    const { api, setTabId } = await import('../api')
    setTabId('tab-abc123')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    await api.createTask({ title: 'Test', columnId: 'col-1' })
    const call = mockFetch.mock.calls[0]
    expect(call[1].headers['X-Tab-Id']).toBe('tab-abc123')
    // Clean up
    setTabId('' as any)
    vi.restoreAllMocks()
  })

  it('updateTask sends PATCH with correct body INCLUDING null assignee (CRITICAL: this was the original bug!)', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    await api.updateTask('task-1', { assignee: null })
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('/api/tasks/task-1')
    expect(call[1].method).toBe('PATCH')
    const body = JSON.parse(call[1].body)
    // CRITICAL: null must be sent in JSON, NOT converted to undefined
    expect(body.assignee).toBeNull()
    // Also verify it's not undefined
    expect(body.assignee).not.toBeUndefined()
  })

  it('updateTask sends correct body for other fields', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    const updates = { title: 'New title', description: 'New desc', columnId: 'col-2', order: 5 }
    await api.updateTask('task-1', updates)
    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body).toEqual(updates)
  })

  it('reorderTasks sends correct body', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tasks: [] }) })
    await api.reorderTasks('task-1', 'col-2', 3)
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('/api/tasks/reorder')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ taskId: 'task-1', targetColumnId: 'col-2', newIndex: 3 })
  })

  it('deleteTask sends DELETE', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => undefined })
    await api.deleteTask('task-1')
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('/api/tasks/task-1')
    expect(call[1].method).toBe('DELETE')
  })

  it('getBoard throws on non-ok response', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    })
    await expect(api.getBoard()).rejects.toThrow('Not found')
  })

  it('updateTask with null priority sends null in body', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    await api.updateTask('task-1', { priority: null })
    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.priority).toBeNull()
  })

  it('updateTask with null recurrence sends null in body', async () => {
    const { api } = await import('../api')
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
    await api.updateTask('task-1', { recurrence: null })
    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.recurrence).toBeNull()
  })
})
