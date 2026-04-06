import { useRef } from 'react'
import { useFilterContext } from '../context/FilterContext'
import { useTheme } from '../hooks/useTheme'

type SseStatus = 'connected' | 'connecting' | 'disconnected'

interface HeaderToolbarProps {
  sseStatus: SseStatus
}

export function HeaderToolbar({ sseStatus }: HeaderToolbarProps) {
  const {
    expanded, setExpanded,
    searchQuery, setSearchQuery,
    assigneeFilter, toggleAssignee,
    matchingCount,
  } = useFilterContext()
  const { theme, toggleTheme } = useTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const isSearchOpen = expanded === 'search'
  const isFilterOpen = expanded === 'filter'

  function handleSearchToggle() {
    if (isSearchOpen) {
      setExpanded(null)
      setSearchQuery('')
    } else {
      setExpanded('search')
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }

  function handleFilterToggle() {
    if (isFilterOpen) {
      setExpanded(null)
    } else {
      setExpanded('filter')
    }
  }

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setExpanded(null)
      setSearchQuery('')
    }
    if (e.key === 'f' || e.key === 'F') {
      if (!isSearchOpen && !isFilterOpen && document.activeElement?.tagName !== 'INPUT') {
        handleFullscreen()
      }
    }
  }

  // Determine dark mode icon: 🌕 when in dark mode (click to go light), 🌑 when in light mode (click to go dark)
  const darkModeIcon = theme === 'dark' ? '🌕' : '🌑'

  return (
    <div
      className="header-toolbar"
      onKeyDown={handleKeyDown}
      role="toolbar"
      aria-label="Board toolbar"
    >
      {/* Collapsed state */}
      {!isSearchOpen && !isFilterOpen && (
        <div className="toolbar-row">
          <button
            className="toolbar-btn"
            onClick={handleSearchToggle}
            aria-label="Search tasks"
            title="Search (type to activate)"
          >
            🔍
          </button>
          <button
            className="toolbar-btn"
            onClick={handleFilterToggle}
            aria-label="Filter by assignee"
            title="Filter"
          >
            👤
          </button>
          <button
            className="toolbar-btn"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkModeIcon}
          </button>
          <button
            className="toolbar-btn"
            onClick={handleFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
          >
            🔲
          </button>
          <SseDot status={sseStatus} />
        </div>
      )}

      {/* Search expanded */}
      {isSearchOpen && (
        <div className="toolbar-expanded">
          <input
            ref={searchInputRef}
            type="text"
            className="toolbar-search-input"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search tasks"
          />
          {searchQuery.trim() && (
            <span className="toolbar-count">{matchingCount} task{matchingCount !== 1 ? 's' : ''}</span>
          )}
          <button
            className="toolbar-close"
            onClick={() => { setExpanded(null); setSearchQuery('') }}
            aria-label="Close search"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter expanded */}
      {isFilterOpen && (
        <div className="toolbar-expanded">
          <span className="toolbar-filter-label">Filter:</span>
          <button
            className={`filter-chip ${assigneeFilter.has('SL') ? 'selected' : ''}`}
            data-assignee="SL"
            onClick={() => toggleAssignee('SL')}
            aria-pressed={assigneeFilter.has('SL')}
          >
            SL
          </button>
          <button
            className={`filter-chip ${assigneeFilter.has('KL') ? 'selected' : ''}`}
            data-assignee="KL"
            onClick={() => toggleAssignee('KL')}
            aria-pressed={assigneeFilter.has('KL')}
          >
            KL
          </button>
          <button
            className={`filter-chip ${assigneeFilter.has('none') ? 'selected' : ''}`}
            data-assignee="none"
            onClick={() => toggleAssignee('none')}
            aria-pressed={assigneeFilter.has('none')}
          >
            None
          </button>
          <button
            className="toolbar-close"
            onClick={() => setExpanded(null)}
            aria-label="Close filter"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function SseDot({ status }: { status: SseStatus }) {
  const pulse = status === 'connecting' || status === 'connected' ? 'sse-pulse' : ''
  return (
    <span
      className={`sse-dot ${pulse}`}
      aria-label={`SSE ${status}`}
      title={`Connection: ${status}`}
    />
  )
}
