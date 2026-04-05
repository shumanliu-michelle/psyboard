# Regression Test Plan

## Purpose
This document defines regression test coverage for EPIC 1–5:

- EPIC 1: Column System
- EPIC 2: Task Model & Reconciliation
- EPIC 3: Task Creation UX
- EPIC 4: Drag & Drop
- EPIC 5: Task Detail / Edit UX

The goal is to ensure new features do not break core board behavior.

---

## Test Strategy

Use three layers of tests:

1. **Unit tests**
   - pure functions
   - sorting
   - validation
   - reconciliation
   - move rules

2. **Integration / API tests**
   - backend behavior
   - persistence
   - reconciliation on create/update/load
   - column and task mutations

3. **E2E tests**
   - user workflows
   - quick add
   - edit drawer
   - drag and drop
   - blocked move flows

---

## 1. Column System

### System columns
- initializes with exactly 3 default system columns:
  - Backlog
  - Today
  - Done
- system columns use fixed IDs:
  - `col-backlog`
  - `col-today`
  - `col-done`
- system columns cannot be renamed
- system columns cannot be deleted
- system columns can be reordered

### Auto-heal
- if board data is missing one system column, load recreates it
- if board data is missing multiple system columns, load recreates all missing ones
- auto-heal preserves existing custom columns
- auto-heal preserves existing tasks
- auto-heal does not duplicate an already existing system column

### Custom columns
- user can create a custom column
- new custom column is appended to the end
- new custom column enters inline rename/edit mode
- user can rename custom column
- user can reorder custom column
- user can delete custom column

### Column name validation
- custom column cannot be renamed to `Backlog`
- custom column cannot be renamed to `Today`
- custom column cannot be renamed to `Done`
- duplicate custom column names are otherwise allowed

### Column deletion behavior
- deleting a custom column shows confirmation
- cancelling delete keeps the column unchanged
- confirming delete removes the column
- deleting a custom column moves all its tasks to Backlog
- deleting an empty custom column succeeds
- deleting a custom column preserves moved tasks

### Column ordering
- all columns can be reordered freely
- reordered column order persists across reload
- logic does not break if Today is visually first/last/middle
- logic does not depend on column position

---

## 2. Task Creation

### Quick add availability
- quick add is available in Backlog
- quick add is available in Today
- quick add is available in custom columns
- quick add is not available in Done

### Quick add basic behavior
- pressing Enter with valid title creates task
- empty title does not create task
- whitespace-only title does not create task
- title is trimmed before save
- after quick add, task appears in correct column
- quick add can create multiple tasks consecutively

### Context-aware defaults
- quick add in Backlog creates task with `columnId = col-backlog`
- quick add in Today creates task with `columnId = col-today`
- quick add in Today auto-fills `doDate = today`
- quick add in custom column creates task with that custom column’s `columnId`

### Expanded/full form creation
- user can expand from quick add to full form
- full form can set:
  - title
  - notes
  - doDate
  - dueDate
  - priority
  - assignee
- full form save creates task correctly
- cancel in full form does not create task

### Date combinations on create
- create task with no `doDate` and no `dueDate`
- create task with only `doDate`
- create task with only `dueDate`
- create task with both `doDate` and `dueDate`
- cannot create task when `dueDate < doDate`
- can create task when `dueDate = doDate`

### Priority and assignee
- can create task with no priority
- can create task with priority low
- can create task with priority medium
- can create task with priority high
- can create task with no assignee
- can create task with assignee

---

## 3. Task Edit Drawer

### Open/close
- clicking task opens detail drawer
- only one drawer can be open at a time
- drawer shows current task values
- cancel closes drawer and discards unsaved edits
- save keeps drawer open
- delete closes drawer

### Edit fields
- can edit title
- can edit notes
- can edit doDate
- can edit dueDate
- can edit priority
- can edit assignee

### Validation
- title cannot be empty on save
- title cannot be whitespace-only on save
- cannot save when `dueDate < doDate`
- can save when only `doDate` exists
- can save when only `dueDate` exists
- can save when both dates are removed

### Save effects
- saving updates `updatedAt`
- saving preserves unchanged fields
- saving title updates card display
- saving notes persists correctly
- saving date fields persists correctly
- saving priority persists correctly
- saving assignee persists correctly

### Mark done
- clicking Mark done moves task to Done
- clicking Mark done sets `completedAt`
- Done-sorted task appears correctly

### Delete
- clicking Delete shows confirmation
- cancelling delete keeps task
- confirming delete removes task
- task is removed from board after delete

---

## 4. Task Model Edge Cases

### Required fields
- task always has id
- task always has title
- task always has columnId
- task always has createdAt
- task always has updatedAt

### Optional fields
- task can exist without notes
- task can exist without doDate
- task can exist without dueDate
- task can exist without priority
- task can exist without assignee
- task can exist without manualOrder unless needed

### Done state
- moving task into Done sets `completedAt`
- moving task out of Done clears `completedAt`

---

## 5. Reconciliation Rules

### When reconciliation runs
- runs on app load
- runs on page reload
- runs after task create
- runs after task update
- does not evaluate tasks already in Today
- does not evaluate tasks already in Done

### Promotion into Today using doDate
- task in Backlog with `doDate = today` moves to Today
- task in Backlog with `doDate < today` moves to Today
- task in custom column with `doDate = today` moves to Today
- task in custom column with `doDate < today` moves to Today
- task with `doDate > today` does not move to Today

### Fallback promotion using dueDate
- task with no `doDate` and `dueDate = today` moves to Today
- task with no `doDate` and `dueDate < today` moves to Today
- task with no `doDate` and `dueDate > today` does not move to Today

### Tasks already in Today
- task already in Today is not re-evaluated
- task already in Today with future `doDate` remains in Today
- task already in Today with no dates remains in Today
- task already in Today with updated non-qualifying dates remains in Today

### Done exclusion
- task in Done with `doDate = today` is not moved out of Done
- task in Done with `dueDate < today` is not reconciled

### Mixed date precedence
- task with `doDate > today` and `dueDate <= today` does not use dueDate fallback, because doDate exists
- task with `doDate <= today` and `dueDate > today` moves to Today because doDate wins

---

## 6. Backlog Sorting

### Basic sorting
- Backlog sorts by `doDate` ascending
- if `doDate` missing, falls back to `dueDate`
- tasks with neither date appear below dated tasks
- tie-breaker uses `createdAt`

### Examples
- task with earlier `doDate` appears before later `doDate`
- task with no `doDate` but earlier `dueDate` appears before later `dueDate`
- task with `doDate` appears before task with only `dueDate` if earlier by rule
- undated task appears after dated task
- two undated tasks are ordered by `createdAt`

### Non-manual behavior
- cannot manually reorder within Backlog
- dropping into Backlog ignores drop position
- task dropped into Backlog ends up in sorted position, not dropped position

---

## 7. Today Ordering

### Manual order
- can reorder tasks within Today
- moving task within Today updates order
- moving task from another column into Today inserts at the top position
- manual order persists across reload

### Interaction with reconciliation
- reconciled task moved into Today appears in Today
- manually ordered Today tasks remain stable after unrelated reconciliation
- task already in Today is not automatically re-sorted by doDate/dueDate

---

## 8. Done Sorting

### Basic sorting
- Done sorts by `completedAt` descending
- more recently completed task appears above older completed task

### Non-manual behavior
- cannot manually reorder within Done
- dropping into Done ignores drop position

### Leaving Done
- moving task out of Done clears `completedAt`
- moved-out task no longer participates in Done sort

---

## 9. Drag and Drop: Allowed Moves

### Into Today
- task can move from Backlog to Today
- task can move from custom column to Today
- moving into Today does not automatically modify `doDate`
- moving into Today does not automatically modify `dueDate`

### Into Done
- task can move from Backlog to Done
- task can move from Today to Done
- task can move from custom column to Done
- moving into Done sets `completedAt`

### Between custom columns
- task can move from one custom column to another
- task can be placed at a specific position in destination custom column

### Out of Done
- task can move from Done to Backlog
- task can move from Done to Today
- task can move from Done to custom column
- moving out of Done clears `completedAt`
- moving out of Done would check doDate and dueDate is <= today, prompt user to set new dates if they are, and dodate<= duedate rule also apply

## Out of Today
- moving out of Today would check doDate and dueDate is <= today, prompt user to set new dates if they are, and dodate<= duedate rule also apply

---

## 10. Drag and Drop: Blocked Moves

### Today-required tasks
- task in Today with `doDate <= today` cannot be dragged to Backlog without a promp, prompt user to set new dates if they are, and dodate<= duedate rule also apply
- task in Today with `doDate <= today` cannot be dragged to custom column without a promp, prompt user to set new dates if they are, and dodate<= duedate rule also apply
- task in Today with no `doDate` and `dueDate <= today` cannot be dragged to Backlog  without a promp, prompt user to set new dates if they are, and dodate<= duedate rule also apply
- task in Today with no `doDate` and `dueDate <= today` cannot be dragged to custom column  without a promp, prompt user to set new dates if they are, and dodate<= duedate rule also apply

### Allowed exceptions
- Today-required task can still be dragged to Done
- task in Today with future `doDate` can be dragged out
- task in Today with no `doDate` and future `dueDate` can be dragged out
- task in Today with no dates can be dragged out

### Blocked move UX
- blocked move shows popup/toast
- blocked popup shows current `doDate`
- blocked popup shows current `dueDate`
- blocked popup allows editing `doDate`
- blocked popup validates `doDate <= dueDate` when dueDate exists
- blocked popup cancel keeps task in Today
- blocked popup Save and Move updates date and completes move if valid
- blocked popup does not allow invalid save

---

## 11. Column Drag and Drop

- can reorder columns including system columns
- reordered columns persist across reload
- moving Today column position does not affect reconciliation logic
- moving Done column position does not affect Done logic

---

## 12. Overdue Visual Behavior

### Overdue definition
- task is overdue when not in Done and `dueDate < today`

### Display
- overdue task shows overdue styling
- overdue task in Today shows overdue styling
- task with `dueDate = today` is not overdue yet
- task without dueDate is not overdue
- task in Done is not shown as overdue

### Relationship to Today
- task with no `doDate` and overdue `dueDate` outside Today gets promoted into Today by reconciliation
- overdue styling remains visible after promotion into Today

---

## 13. Custom Column Interactions

- quick add works in custom column
- full detail creation works in custom column
- task can be reordered within custom column
- task order in custom column persists
- deleting custom column moves its tasks to Backlog
- tasks moved from deleted custom column are then sorted correctly in Backlog
- reconciliation can promote eligible tasks from custom column into Today

---

## 14. Persistence / Reload Regression

- created tasks persist after reload
- edited tasks persist after reload
- reordered Today tasks persist after reload
- reordered custom-column tasks persist after reload
- reordered columns persist after reload
- deleted tasks stay deleted after reload
- deleted custom columns stay deleted after reload
- moved tasks remain in correct columns after reload
- completed tasks remain in Done after reload
- system columns still exist after reload

---

## E2E User Flows

### Flow 1: Create simple undated backlog task
- open board
- quick add in Backlog
- task appears in Backlog
- reload
- task still in Backlog

### Flow 2: Create task in Today
- quick add in Today
- task created with `doDate = today`
- task appears in Today
- reload
- task remains in Today

### Flow 3: Create task in Backlog with `doDate = today`
- create from Backlog using full form
- set `doDate = today`
- save
- reconciliation moves task to Today

### Flow 4: Create task in Backlog with only `dueDate = today`
- create from Backlog using full form
- no doDate
- set `dueDate = today`
- save
- reconciliation moves task to Today

### Flow 5: Create invalid date combination
- set `doDate = tomorrow`
- set `dueDate = today`
- save blocked with validation error

### Flow 6: Reorder Today tasks
- create multiple Today tasks
- drag reorder them
- reload
- order persists

### Flow 7: Drag non-restricted task out of Today
- create Today task with no required-today date rule
- drag to Backlog
- move succeeds

### Flow 8: Drag restricted task out of Today
- task in Today with `doDate = today`
- try dragging to Backlog
- blocked popup appears
- cancel
- task stays in Today

### Flow 9: Resolve blocked move through popup
- task in Today with `doDate = today`
- drag to Backlog
- popup appears
- change `doDate` to future valid date
- save and move
- task moves successfully

### Flow 10: Mark task done from drawer
- open task drawer
- click Mark done
- task moves to Done
- Done ordering updates

### Flow 11: Move task out of Done
- drag task from Done to Backlog or Today
- `completedAt` cleared
- task no longer sorted as Done

### Flow 12: Delete custom column with tasks
- create custom column
- add tasks into it
- delete custom column
- confirm
- tasks move to Backlog

### Flow 13: Auto-heal system columns
- simulate missing Today column in persisted data
- reload app
- Today column is recreated

---

## Suggested Logic Unit Tests

Write pure unit tests for these functions if they exist:

- `isTaskRequiredInToday(task, today)`
- `shouldUseDueDateFallback(task)`
- `validateTaskDates(doDate, dueDate)`
- `sortBacklogTasks(tasks)`
- `sortDoneTasks(tasks)`
- `reconcileBoard(board, today)`
- `canMoveTask(task, sourceColumnId, destinationColumnId, today)`
- `applyManualOrder(tasks, movedTaskId, destinationIndex)`
- `autoHealSystemColumns(columns)`

---

## Easy-to-miss Edge Cases

- task with `doDate = today` and `dueDate = today`
- task with `doDate < today` and `dueDate = future`
- task with `doDate` removed while already in Today
- task with `dueDate` removed while already in Today
- task in Today with both dates removed can still stay there
- task in Backlog with no dates never gets promoted
- task in custom column with no dates never gets promoted
- blocked drag from Today to custom column behaves same as to Backlog
- deleting last custom column does not affect system columns
- creating a custom column named `today` lowercase:
  - decide whether validation is case-sensitive or case-insensitive
  - then test it consistently
- `createdAt` tie-break sorting is deterministic
- reload after partial corrupted board data still restores system columns correctly