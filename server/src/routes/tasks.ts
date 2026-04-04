import { Router } from 'express'
import { createTask, updateTask, deleteTask, readBoard } from '../store/boardStore.js'

const router = Router()

router.post('/', (req, res) => {
  const { title, columnId, description } = req.body as { title?: string; columnId?: string; description?: string }

  // Validate
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Task title is required and must be non-empty' })
    return
  }
  if (!columnId || typeof columnId !== 'string') {
    res.status(400).json({ error: 'columnId is required' })
    return
  }

  // Verify column exists
  const board = readBoard()
  const column = board.columns.find(c => c.id === columnId)
  if (!column) {
    res.status(400).json({ error: 'Column not found' })
    return
  }

  try {
    const task = createTask(title.trim(), columnId, description?.trim())
    res.status(201).json(task)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' })
  }
})

router.patch('/:id', (req, res) => {
  const { id } = req.params
  const updates = req.body as { title?: string; description?: string; columnId?: string; order?: number }

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid task ID' })
    return
  }

  // If changing columnId, verify it exists
  if (updates.columnId) {
    const board = readBoard()
    const column = board.columns.find(c => c.id === updates.columnId)
    if (!column) {
      res.status(400).json({ error: 'Column not found' })
      return
    }
  }

  try {
    const task = updateTask(id, updates)
    res.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.status(500).json({ error: 'Failed to update task' })
  }
})

router.delete('/:id', (req, res) => {
  const { id } = req.params

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid task ID' })
    return
  }

  try {
    deleteTask(id)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

export default router
