import '@testing-library/jest-dom'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from '../components/Toast'

describe('Toast', () => {
  it('renders nothing when visible is false', () => {
    render(<Toast visible={false} summary={null} onDismiss={vi.fn()} />)
    expect(screen.queryByText(/Home Assistant/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders Home Assistant toast with created task titles', () => {
    const summary = { source: 'home_assistant' as const, created: ['Refill S8 water tank', 'Roborock low'], skipped: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Home Assistant')).toBeInTheDocument()
    expect(screen.getByText('Refill S8 water tank')).toBeInTheDocument()
    expect(screen.getByText('Roborock low')).toBeInTheDocument()
  })

  it('shows skipped badge when tasks are skipped', () => {
    const summary = { source: 'home_assistant' as const, created: ['New task'], skipped: ['Old thing'] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('~1 skipped')).toBeInTheDocument()
  })

  it('renders tab toast with created task titles', () => {
    const task = { id: '1', title: 'Morning standup', columnId: 'today', order: 0, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [task], updated: [], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated')).toBeInTheDocument()
    expect(screen.getByText('Morning standup')).toBeInTheDocument()
  })

  it('renders generic message when summary is null', () => {
    render(<Toast visible={true} summary={null} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated in another tab')).toBeInTheDocument()
  })

  it('calls onDismiss when close button is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Toast visible={true} summary={null} onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows created count badge for tab source', () => {
    const task = { id: '1', title: 'Task A', columnId: 'today', order: 0, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [task], updated: [], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })
})
