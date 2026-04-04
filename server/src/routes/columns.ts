import { Router } from 'express'
import { createColumn, deleteColumn, readBoard } from '../store/boardStore.js'

const router = Router()

router.post('/', (req, res) => {
  const { title } = req.body as { title?: string }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Column title is required and must be non-empty' })
    return
  }

  try {
    const column = createColumn(title.trim())
    res.status(201).json(column)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create column' })
  }
})

router.delete('/:id', (req, res) => {
  const { id } = req.params

  // Validate UUID format (basic check)
  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid column ID' })
    return
  }

  try {
    // Check column exists
    const board = readBoard()
    const column = board.columns.find(c => c.id === id)
    if (!column) {
      res.status(404).json({ error: 'Column not found' })
      return
    }

    deleteColumn(id)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete column' })
  }
})

export default router
