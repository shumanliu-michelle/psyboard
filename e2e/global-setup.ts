import { spawn, type ChildProcess } from 'child_process'

let serverProc: ChildProcess | null = null
let viteProc: ChildProcess | null = null

async function waitForUrl(url: string, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

async function setup(): Promise<void> {
  // Start API server
  serverProc = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: '/Users/shumanliu/Projects/psyboard/server',
    detached: true,
    stdio: 'ignore',
  })

  // Start Vite preview
  viteProc = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: '/Users/shumanliu/Projects/psyboard/client',
    detached: true,
    stdio: 'ignore',
  })

  // Wait for both to be ready
  await Promise.all([
    waitForUrl('http://localhost:3001/api/board', 30_000),
    waitForUrl('http://localhost:4173', 30_000),
  ])
}

async function teardown(): Promise<void> {
  const killSafe = (pid: number) => {
    try {
      process.kill(-pid)
    } catch {
      // Process may have already exited
    }
  }
  if (serverProc) killSafe(serverProc.pid!)
  if (viteProc) killSafe(viteProc.pid!)
}

export default async function global() {
  await setup()
  return teardown
}
