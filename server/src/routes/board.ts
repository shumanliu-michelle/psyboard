import { Router } from 'express'
import { readBoard } from '../store/boardStore.js'
import { DONE_COLUMN_ID } from '../types.js'

const router = Router()

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

router.get('/', (_req, res) => {
  try {
    const board = readBoard()

    // Filter Done tasks to last 7 days by default
    const now = Date.now()
    const sevenDaysAgo = now - SEVEN_DAYS_MS

    const filteredTasks = board.tasks.filter(task => {
      if (task.columnId !== DONE_COLUMN_ID) {
        return true
      }
      if (!task.completedAt) {
        return true
      }
      const completedAtMs = new Date(task.completedAt).getTime()
      return completedAtMs >= sevenDaysAgo
    })

    res.json({ ...board, tasks: filteredTasks })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read board' })
  }
})

export default router
