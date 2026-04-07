import { Router } from 'express'
import { readBoard } from '../store/boardStore.js'

const router = Router()

router.get('/', (_req, res) => {
  try {
    const board = readBoard()
    const columns = board.columns.map(col => ({
      id: col.id,
      title: col.title,
      kind: col.kind,
      systemKey: col.systemKey,
      position: col.position,
    }))

    res.json({
      columns,
      taskFields: {
        columnId: 'string',
        title: 'string',
        description: 'string?',
        doDate: 'YYYY-MM-DD?',
        dueDate: 'YYYY-MM-DD?',
        priority: 'low | medium | high?',
        assignee: 'SL | KL?',
        recurrence: 'RecurrenceConfig?',
        completedAt: 'ISO datetime?',
      },
      endpoints: {
        getBoard: 'GET /api/board',
        getSchema: 'GET /api/schema',
        getHASensors: 'GET /api/ha/sensors',
        getEvents: 'GET /api/events (SSE stream)',
        createColumn: 'POST /api/columns { title, accent? }',
        deleteColumn: 'DELETE /api/columns/:id',
        createTask: 'POST /api/tasks { title, columnId, description?, doDate?, dueDate?, priority?, assignee?, recurrence? }',
        updateTask: 'PATCH /api/tasks/:id { title?, columnId?, doDate?, dueDate?, priority?, assignee?, recurrence?, completedAt?, suppressNextOccurrence?, expectedUpdatedAt? }',
        deleteTask: 'DELETE /api/tasks/:id',
        reorderTasks: 'POST /api/tasks/reorder { taskId, targetColumnId, newIndex }',
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read schema' })
  }
})

export default router