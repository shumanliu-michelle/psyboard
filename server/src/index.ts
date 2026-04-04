import express from 'express'
import boardRouter from './routes/board.js'
import columnsRouter from './routes/columns.js'
import tasksRouter from './routes/tasks.js'

const app = express()
const PORT = 3001

app.use(express.json())

// Routes
app.use('/api/board', boardRouter)
app.use('/api/columns', columnsRouter)
app.use('/api/tasks', tasksRouter)

// Start server
app.listen(PORT, () => {
  console.log(`psyboard server running on http://localhost:${PORT}`)
})
