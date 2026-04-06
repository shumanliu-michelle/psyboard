import express from 'express'
import boardRouter from './routes/board.js'
import columnsRouter from './routes/columns.js'
import tasksRouter from './routes/tasks.js'
import homeAssistantRouter from './home-assistant/index.js'
import eventsRouter from './routes/events.js'
import { startScheduler } from './home-assistant/scheduler.js'

export const app = express()
const PORT = 3001

app.use(express.json())

// Routes
app.use('/api/board', boardRouter)
app.use('/api/columns', columnsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/home-assistant', homeAssistantRouter)
app.use('/api/events', eventsRouter)

// Start server (only when not running tests)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`psyboard server running on http://localhost:${PORT}`)
    startScheduler()
  })
}
