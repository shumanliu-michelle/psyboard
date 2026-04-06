import { describe, it, expect } from 'vitest'
import { broadcast } from '../events.js'

describe('broadcast', () => {
  it('should export a broadcast function', () => {
    expect(typeof broadcast).toBe('function')
  })
})