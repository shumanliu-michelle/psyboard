import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickAddForm } from '../components/QuickAddForm'
import { api } from '../api'

vi.mock('../api', () => ({
  api: {
    createTask: vi.fn(),
  },
}))

describe('QuickAddForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title input and Add/More fields buttons', () => {
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={() => {}} />)
    expect(screen.getByPlaceholderText('Task title')).toBeTruthy()
    expect(screen.getByText('Add')).toBeTruthy()
    expect(screen.getByText('More fields')).toBeTruthy()
  })

  it('Add button is disabled when title is empty', () => {
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={() => {}} />)
    expect(screen.getByText('Add') as HTMLButtonElement).toBeDisabled()
  })

  it('Add button is enabled when title has content', () => {
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Quick task' } })
    expect(screen.getByText('Add') as HTMLButtonElement).not.toBeDisabled()
  })

  it('calls createTask when Add is clicked with non-empty title', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as any)
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Quick task' } })
    fireEvent.click(screen.getByText('Add'))
    await new Promise(r => setTimeout(r, 0))
    expect(vi.mocked(api.createTask)).toHaveBeenCalledWith({ title: 'Quick task', columnId: 'col-backlog' })
  })

  it('clears input after successful add', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as any)
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Quick task' } })
    fireEvent.click(screen.getByText('Add'))
    await new Promise(r => setTimeout(r, 0))
    expect((screen.getByPlaceholderText('Task title') as HTMLInputElement).value).toBe('')
  })

  it('calls onExpandToDrawer when More fields is clicked with non-empty title', () => {
    const expand = vi.fn()
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={expand} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'My task' } })
    fireEvent.click(screen.getByText('More fields'))
    expect(expand).toHaveBeenCalledWith('My task')
  })

  it('clears input when More fields is clicked', () => {
    const expand = vi.fn()
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={expand} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'My task' } })
    fireEvent.click(screen.getByText('More fields'))
    expect((screen.getByPlaceholderText('Task title') as HTMLInputElement).value).toBe('')
  })

  it('does NOT call onExpandToDrawer when More fields is clicked with empty title', () => {
    const expand = vi.fn()
    render(<QuickAddForm columnId="col-backlog" onExpandToDrawer={expand} />)
    fireEvent.click(screen.getByText('More fields'))
    expect(expand).not.toHaveBeenCalled()
  })
})