import { Router } from 'express'
import { createBackup } from '../backup.js'

const router = Router()

router.post('/', async (_req, res) => {
  try {
    await createBackup()
    res.json({ backup: 'created' })
  } catch (err) {
    console.error('[backup] POST /api/backup failed:', err)
    res.status(500).json({ error: 'Backup failed' })
  }
})

export default router