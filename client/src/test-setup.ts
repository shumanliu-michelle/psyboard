import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test to avoid state leaking between tests
afterEach(() => {
  cleanup()
})
