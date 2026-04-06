import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type { Task } from '../types'

export type AssigneeFilter = Set<'SL' | 'KL' | 'none'>

type ExpandedMode = 'search' | 'filter' | null

interface FilterContextValue {
  // Expanded toolbar state
  expanded: ExpandedMode
  setExpanded: (mode: ExpandedMode) => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Assignee filter (multi-select)
  assigneeFilter: AssigneeFilter
  toggleAssignee: (a: 'SL' | 'KL' | 'none') => void

  // Derived: is a task dimmed?
  isTaskDimmed: (task: Task) => boolean

  // Matching count for search badge
  matchingCount: number
}

const FilterContext = createContext<FilterContextValue | null>(null)

interface FilterProviderProps {
  children: ReactNode
  tasks: Task[]
}

export function FilterProvider({ children, tasks }: FilterProviderProps) {
  const [expanded, setExpanded] = useState<ExpandedMode>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>(new Set())

  function toggleAssignee(a: 'SL' | 'KL' | 'none') {
    setAssigneeFilter(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a)
      else next.add(a)
      return next
    })
  }

  const { isTaskDimmed, matchingCount } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const hasFilter = assigneeFilter.size > 0
    const hasSearch = query.length > 0

    const matching = tasks.filter(task => {
      const matchesSearch = !hasSearch || task.title.toLowerCase().includes(query)
      const matchesAssignee = !hasFilter || (
        assigneeFilter.has('SL') && task.assignee === 'SL' ||
        assigneeFilter.has('KL') && task.assignee === 'KL' ||
        assigneeFilter.has('none') && task.assignee === undefined
      )
      return matchesSearch && matchesAssignee
    })

    const matchingSet = new Set(matching.map(t => t.id))
    const matchingCount = matching.length

    const isTaskDimmed = (task: Task) => !matchingSet.has(task.id)

    return { isTaskDimmed, matchingCount }
  }, [searchQuery, assigneeFilter, tasks])

  return (
    <FilterContext.Provider value={{
      expanded, setExpanded,
      searchQuery, setSearchQuery,
      assigneeFilter, toggleAssignee,
      isTaskDimmed,
      matchingCount,
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilterContext must be used inside FilterProvider')
  return ctx
}
