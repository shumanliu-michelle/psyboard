import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { writeBoard } from '../../store/boardStore.js'

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
    request(app)
      .get('/api/events?tabId=my-tab')
      .buffer(true)
      .end((err, res) => {
        if (err) return done(err)
        expect(res.status).toBe(200)
        expect(res.type).toBe('text/event-stream')
        done()
      })
  })

  it('streams events when board changes', (done) => {
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
})
