import { Router } from 'express'
import { createColumn, deleteColumn, readBoard, updateColumn, reorderColumns } from '../store/boardStore.js'

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
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'Cannot create column with a reserved name') {
        res.status(400).json({ error: err.message })
        return
      }
    }
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

router.patch('/:id', (req, res) => {
  const { id } = req.params
  const updates = req.body as { title?: string; position?: number }

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid column ID' })
    return
  }

  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
      res.status(400).json({ error: 'Title must be a non-empty string' })
      return
    }
  }

  if (updates.position !== undefined) {
    if (typeof updates.position !== 'number' || updates.position < 0) {
      res.status(400).json({ error: 'Position must be a non-negative number' })
      return
    }
  }

  try {
    const column = updateColumn(id, updates)
    res.json(column)
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'Column not found') {
        res.status(404).json({ error: 'Column not found' })
        return
      }
      if (err.message === 'Cannot update a system column') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.message === 'Cannot rename column to a reserved name') {
        res.status(400).json({ error: err.message })
        return
      }
    }
    res.status(500).json({ error: 'Failed to update column' })
  }
})

router.post('/reorder', (req, res) => {
  const { columnIds } = req.body as { columnIds?: string[] }

  if (!Array.isArray(columnIds) || columnIds.length === 0) {
    res.status(400).json({ error: 'columnIds must be a non-empty array' })
    return
  }

  const board = readBoard()
  const allExist = columnIds.every(id => board.columns.some(c => c.id === id))
  if (!allExist) {
    res.status(400).json({ error: 'One or more column IDs are invalid' })
    return
  }

  try {
    const columns = reorderColumns(columnIds)
    res.json({ columns })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder columns' })
  }
})

export default router
