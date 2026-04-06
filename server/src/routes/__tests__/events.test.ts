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

describe('broadcast() — tabId behavior', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = setupTestBoard()
    const board = createTestBoard([])
    writeBoard(board)
  })

  afterEach(() => {
    teardownTestBoard()
  })

  it('broadcasts with tabId: null when sourceTabId is undefined (server-initiated)', (done) => {
    const sseReq = request(app)
      .get('/api/events')
      .buffer(true)

    setTimeout(() => {
      // Task creation without X-Tab-Id header → getTabId returns undefined → broadcast(undefined)
      // → SSE message has tabId: null
      request(app)
        .post('/api/tasks')
        .set('X-Tab-Id', '') // explicitly empty — same as not sending the header
        .send({ title: 'Task A', columnId: BACKLOG_COLUMN_ID })
        .end(() => {
          sseReq.end((_err, res) => {
            expect(res.text).toMatch(/"tabId":null/)
            done()
          })
        })
    }, 50)
  })

  it('broadcasts with tabId: null and all clients receive it (not filtered as self)', (done) => {
    // Two SSE clients: one with tabId, one without
    const client1 = request(app).get('/api/events?tabId=client-1').buffer(true)
    const client2 = request(app).get('/api/events').buffer(true)

    setTimeout(() => {
      // HA sync (or any server-initiated broadcast) calls broadcast(undefined) → tabId: null
      // Both clients receive it regardless of their own tabId
      // We simulate via a task create without X-Tab-Id header
      request(app)
        .post('/api/tasks')
        .send({ title: 'Server task', columnId: BACKLOG_COLUMN_ID })
        .end(() => {
          client1.end((_err, res1) => {
            expect(res1.text).toContain('board_updated')
            expect(res1.text).toMatch(/"tabId":null/)
            client2.end((_err2, res2) => {
              expect(res2.text).toContain('board_updated')
              expect(res2.text).toMatch(/"tabId":null/)
              done()
            })
          })
        })
    }, 50)
  })

  it('broadcasts with the tabId string when X-Tab-Id header is present', (done) => {
    const sseReq = request(app)
      .get('/api/events')
      .buffer(true)

    setTimeout(() => {
      // Task creation with X-Tab-Id header → broadcast(tabId) → tabId: 'my-tab'
      request(app)
        .post('/api/tasks')
        .set('X-Tab-Id', 'my-tab')
        .send({ title: 'Task B', columnId: BACKLOG_COLUMN_ID })
        .end(() => {
          sseReq.end((_err, res) => {
            expect(res.text).toMatch(/"tabId":"my-tab"/)
            done()
          })
        })
    }, 50)
  })

  it('SSE message includes summary field in the payload', (done) => {
    const sseReq = request(app).get('/api/events').buffer(true)

    setTimeout(() => {
      request(app)
        .post('/api/tasks')
        .set('X-Tab-Id', 'test-tab')
        .send({ title: 'Task X', columnId: BACKLOG_COLUMN_ID })
        .end(() => {
          sseReq.end((_err, res) => {
            expect(res.text).toMatch(/"summary"/)
            done()
          })
        })
    }, 50)
  })
})
