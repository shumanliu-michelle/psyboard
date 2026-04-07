import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AlertRule } from './alertEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'ha')
const ENV_FILE = path.join(CONFIG_DIR, '.env')
const JSON_FILE = path.join(CONFIG_DIR, 'home-assistant.json')

export type HAConfig = {
  defaultColumn: string
  alerts: AlertRule[]
}

type EnvVars = {
  HOME_ASSISTANT_URL: string
  HOME_ASSISTANT_TOKEN: string
}

function loadEnv(): EnvVars {
  const env: EnvVars = { HOME_ASSISTANT_URL: '', HOME_ASSISTANT_TOKEN: '' }
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`HA .env file not found at ${ENV_FILE}`)
  }
  const lines = fs.readFileSync(ENV_FILE, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key === 'HOME_ASSISTANT_URL' || key === 'HOME_ASSISTANT_TOKEN') {
      ;(env as Record<string, string>)[key] = value
    }
  }
  if (!env.HOME_ASSISTANT_URL || !env.HOME_ASSISTANT_TOKEN) {
    throw new Error('HOME_ASSISTANT_URL or HOME_ASSISTANT_TOKEN is missing in .env')
  }
  return env
}

export type LoadedConfig = ReturnType<typeof loadEnv>

let _cachedEnv: LoadedConfig | null = null
let _cachedHAConfig: HAConfig | null = null

export function loadHAEnv(): LoadedConfig {
  if (_cachedEnv) return _cachedEnv
  _cachedEnv = loadEnv()
  return _cachedEnv
}

export function loadHAConfig(): HAConfig {
  if (_cachedHAConfig) return _cachedHAConfig
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`home-assistant.json not found at ${JSON_FILE}`)
  }
  const raw = fs.readFileSync(JSON_FILE, 'utf-8')
  const parsed = JSON.parse(raw) as HAConfig
  if (!parsed.alerts || !Array.isArray(parsed.alerts)) {
    throw new Error('home-assistant.json must contain an "alerts" array')
  }
  _cachedHAConfig = parsed
  return _cachedHAConfig
}
