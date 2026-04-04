import { Router } from 'express'
import { readBoard } from '../store/boardStore.js'

const router = Router()

router.get('/', (_req, res) => {
  try {
    const board = readBoard()
    res.json(board)
  } catch (err) {
    res.status(500).json({ error: 'Failed to read board' })
  }
})

export default router
