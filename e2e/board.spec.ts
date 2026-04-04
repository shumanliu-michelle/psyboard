import { test, expect, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, '..', 'server', 'data', 'board.json')
const BACKUP_FILE = path.join(__dirname, '..', 'server', 'data', 'board.json.backup')

const DEFAULT_BOARD = {
  columns: [
    { id: 'col-todo', title: 'Todo', order: 0 },
    { id: 'col-today', title: 'Today', order: 1 },
    { id: 'col-week', title: 'This Week', order: 2 },
    { id: 'col-done', title: 'Done', order: 3 },
  ],
  tasks: [],
}

function resetBoard() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_BOARD, null, 2), 'utf-8')
}

function backupBoard() {
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, BACKUP_FILE)
  }
}

function restoreBoard() {
  if (fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BACKUP_FILE, DATA_FILE)
    fs.unlinkSync(BACKUP_FILE)
  }
}

test.beforeAll(() => {
  backupBoard()
})

test.afterAll(() => {
  restoreBoard()
})

test.beforeEach(() => {
  resetBoard()
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

async function getColumn(page: Page, title: string) {
  return page.locator('.column', { has: page.locator('h3', { hasText: title }) })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test('board renders with 4 default columns', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('h3', { hasText: 'Todo' })).toBeVisible()
  await expect(page.locator('h3', { hasText: 'Today' })).toBeVisible()
  await expect(page.locator('h3', { hasText: 'This Week' })).toBeVisible()
  await expect(page.locator('h3', { hasText: 'Done' })).toBeVisible()

  // Columns are displayed horizontally
  const columns = page.locator('.column')
  await expect(columns).toHaveCount(4)
})

test('can create a task', async ({ page }) => {
  await page.goto('/')

  // Click "Add task" in Todo column
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) })
    .locator('button', { hasText: '+ Add task' }).click()

  // Form appears — type task title
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) })
    .locator('input[placeholder="Task title"]')
    .fill('Buy groceries')

  // Click Add
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) })
    .locator('button[type="submit"]', { hasText: 'Add' })
    .click()

  // Task appears in Todo column
  await expect(page.locator('.task-card', { hasText: 'Buy groceries' })).toBeVisible()
})

test('can edit a task title', async ({ page }) => {
  // Pre-seed a task via API
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.tasks.push({
    id: 'task-editing-001',
    title: 'Old title',
    columnId: board.columns[0].id,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  await page.goto('/')

  // Click edit button to enter edit mode
  await page.locator('.task-card', { hasText: 'Old title' })
    .locator('button', { hasText: 'edit' })
    .click()

  // Editable input appears
  const input = page.locator('.task-card input')
  await expect(input).toBeVisible()
  await input.fill('New title')
  await input.press('Enter')

  // New title visible
  await expect(page.locator('.task-card', { hasText: 'New title' })).toBeVisible()
  await expect(page.locator('.task-card', { hasText: 'Old title' })).not.toBeVisible()
})

test('can delete a task', async ({ page }) => {
  // Pre-seed a task
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.tasks.push({
    id: 'task-delete-001',
    title: 'Task to delete',
    columnId: board.columns[0].id,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  await page.goto('/')

  // Click delete on the task
  await page.locator('.task-card', { hasText: 'Task to delete' })
    .locator('button', { hasText: 'delete' })
    .click()

  // Task gone
  await expect(page.locator('.task-card', { hasText: 'Task to delete' })).not.toBeVisible()
})

test('can create a column', async ({ page }) => {
  await page.goto('/')

  await page.locator('.add-column-btn').click()
  await page.locator('.add-form input[placeholder="Column title"]').fill('Next Month')
  await page.locator('.add-form button[type="submit"]').click()

  await expect(page.locator('h3', { hasText: 'Next Month' })).toBeVisible()
})

test('can delete a column', async ({ page }) => {
  // Pre-seed a column with a valid long ID
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.columns.push({
    id: 'col-deletable-001',
    title: 'Deletable Column',
    order: board.columns.length,
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  page.on('dialog', d => d.accept())

  await page.goto('/')

  // Listen for DELETE /columns/:id
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().match(/\/columns\/.+/) !== null),
    (async () => {
      const col = page.locator('.column', { has: page.locator('h3', { hasText: 'Deletable Column' }) })
      await col.locator('.column-delete').click()
    })(),
  ])

  expect(response.status()).toBe(204)

  // Wait for the column to be removed
  await expect(page.locator('h3', { hasText: 'Deletable Column' })).not.toBeVisible()
})

test('board state persists after reload', async ({ page }) => {
  await page.goto('/')

  // Create a task
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) }).locator('button', { hasText: '+ Add task' }).click()
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) }).locator('input[placeholder="Task title"]').fill('Persistent task')
  await page.locator('.column', { has: page.locator('h3', { hasText: 'Todo' }) }).locator('button[type="submit"]').click()
  // Reload the page
  await page.reload()

  // Task still there
  await expect(page.locator('.task-card', { hasText: 'Persistent task' })).toBeVisible()
})
  
