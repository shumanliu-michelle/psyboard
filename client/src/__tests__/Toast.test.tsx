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

  it('renders updated task titles with ~ marker', () => {
    const task = { id: '1', title: 'Morning standup', columnId: 'today', order: 0, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [], updated: [task], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated')).toBeInTheDocument()
    expect(screen.getByText('Morning standup')).toBeInTheDocument()
    expect(screen.getByText('~1')).toBeInTheDocument()
  })

  it('renders deleted task titles with strikethrough red marker', () => {
    const summary = { source: 'tab' as const, created: [], updated: [], deleted: ['Old task one', 'Old task two'] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated')).toBeInTheDocument()
    expect(screen.getByText('Old task one')).toBeInTheDocument()
    expect(screen.getByText('Old task two')).toBeInTheDocument()
    expect(screen.getAllByText('−').length).toBeGreaterThanOrEqual(2)
  })

  it('renders celebration message for tasks moved to Done', () => {
    const doneTask = { id: '1', title: 'Morning standup', columnId: 'col-done', order: 0, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [], updated: [doneTask], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('🎉')).toBeInTheDocument()
    expect(screen.getByText('Morning standup is done')).toBeInTheDocument()
  })

  it('shows both done celebration and regular updated tasks', () => {
    const doneTask = { id: '1', title: 'Completed task', columnId: 'col-done', order: 0, createdAt: '', updatedAt: '' }
    const updatedTask = { id: '2', title: 'Edited task', columnId: 'today', order: 1, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [], updated: [doneTask, updatedTask], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Completed task is done')).toBeInTheDocument()
    expect(screen.getByText('Edited task')).toBeInTheDocument()
    expect(screen.getByText('~2')).toBeInTheDocument()
  })
})
