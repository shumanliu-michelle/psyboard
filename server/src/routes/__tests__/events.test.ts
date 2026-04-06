import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { writeBoard } from '../../store/boardStore.js'
import { BACKLOG_COLUMN_ID } from '../../types.js'

describe('GET /api/events — SSE', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = setupTestBoard()
    const board = createTestBoard([])
    writeBoard(board)
  })

  afterEach(() => {
    teardownTestBoard()
  })

  it('returns 200 with text/event-stream content-type', (done) => {
    request(app)
      .get('/api/events')
      .buffer(true)
      .end((err, res) => {
        if (err) return done(err)
        expect(res.status).toBe(200)
        expect(res.type).toBe('text/event-stream')
        done()
      })
  })

  it('accepts tabId query param', (done) => {
    const sseReq = request(app)
      .get('/api/events?tabId=my-tab')
      .buffer(true)

    // Short delay to ensure connection is established before mutating
    setTimeout(() => {
      // Mutate the board
      request(app)
        .post('/api/tasks')
        .send({ title: 'Test task', columnId: BACKLOG_COLUMN_ID })
        .end((err) => {
          if (err) return done(err)
          // Now retrieve the SSE response
          sseReq.end((err, res) => {
            if (err) return done(err)
            expect(res.status).toBe(200)
            expect(res.type).toBe('text/event-stream')
            // Verify event data was actually delivered
            expect(res.text).toContain('board_updated')
            done()
          })
        })
    }, 50)
  })

  it('emits board_updated event after board mutation', (done) => {
    const sseReq = request(app)
      .get('/api/events')
      .buffer(true)

    // Short delay to ensure SSE connection is established
    setTimeout(() => {
      // Mutate the board
      request(app)
        .post('/api/tasks')
        .send({ title: 'SSE test task', columnId: BACKLOG_COLUMN_ID })
        .end((err) => {
          if (err) return done(err)
          // Now get the SSE response
          sseReq.end((err, res) => {
            if (err) return done(err)
            expect(res.status).toBe(200)
            expect(res.text).toContain('board_updated')
            done()
          })
        })
    }, 50)
  })
})
