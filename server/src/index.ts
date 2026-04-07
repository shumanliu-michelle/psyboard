import express from 'express'
import boardRouter from './routes/board.js'
import columnsRouter from './routes/columns.js'
import tasksRouter from './routes/tasks.js'
import homeAssistantRouter from './home-assistant/index.js'
import eventsRouter from './routes/events.js'
import backupRouter from './routes/backup.js'
import schemaRouter from './routes/schema.js'
import { startHAConnection } from './home-assistant/haConnection.js'
import { startBackupScheduler } from './backup.js'

export const app = express()
const PORT = 3001

app.use(express.json())

// Routes
app.use('/api/board', boardRouter)
app.use('/api/columns', columnsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/home-assistant', homeAssistantRouter)
app.use('/api/events', eventsRouter)
app.use('/api/backup', backupRouter)
app.use('/api/schema', schemaRouter)

// Start server (only when not running tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`psyboard server running on http://localhost:${PORT}`)
    startHAConnection()
    startBackupScheduler(2 * 60 * 60 * 1000) // 2 hours
  })
}
