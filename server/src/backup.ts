import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Server runs from psyboard root via `npm run dev`, so process.cwd() = project root
const DEFAULT_DATA_DIR = path.join(process.cwd(), 'server', 'data')

// Configurable data dir — mirrors boardStore path configuration
let _dataDir: string | null = null

export function setDataDir(dir: string): void {
  _dataDir = dir
}

export function resetDataDir(): void {
  _dataDir = null
}

function getDataDir(): string {
  if (_dataDir !== null) return _dataDir
  if (process.env.DATA_DIR) return process.env.DATA_DIR
  return DEFAULT_DATA_DIR
}

function getBoardFile(): string {
  return path.join(getDataDir(), 'board.json')
}

let _backupTimer: ReturnType<typeof setInterval> | null = null

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function createBackup(): Promise<void> {
  const boardFile = getBoardFile()

  if (!fs.existsSync(boardFile)) {
    return
  }

  try {
    const timestamp = formatTimestamp(new Date())
    const backupFile = path.join(getDataDir(), `board.${timestamp}.json`)
    fs.copyFileSync(boardFile, backupFile)

    // Cleanup old backups — keep only the most recent
    const files = fs.readdirSync(getDataDir())
      .filter(f => f.startsWith('board.') && f.endsWith('.json') && f !== 'board.json')
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(getDataDir(), f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Delete all but the first (most recent)
    for (const file of files.slice(1)) {
      try {
        fs.unlinkSync(path.join(getDataDir(), file.name))
      } catch {
        console.warn(`[backup] Failed to delete old backup: ${file.name}`)
      }
    }
  } catch (err) {
    console.warn('[backup] Backup failed:', err)
  }
}

export function startBackupScheduler(intervalMs: number): void {
  stopBackupScheduler()
  // Fire immediately, then on interval
  createBackup()
  _backupTimer = setInterval(() => {
    createBackup()
  }, intervalMs)
}

export function stopBackupScheduler(): void {
  if (_backupTimer !== null) {
    clearInterval(_backupTimer)
    _backupTimer = null
  }
}
