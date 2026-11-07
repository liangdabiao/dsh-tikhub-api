// TikHub API 助手 · 调用历史持久化（$DSH_HOME/tikhub-api/）。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'tikhub-api')
const HISTORY_FILE = join(DATA_DIR, 'calls.json')
const MAX_RECORDS = 200

export function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function atomicWrite(file, value) {
  ensureDirs()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function readHistory() {
  try {
    const raw = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function appendHistory(record) {
  const list = readHistory()
  list.unshift(record)
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS
  atomicWrite(HISTORY_FILE, list)
  return record
}

export function updateHistory(id, patch) {
  const list = readHistory()
  const index = list.findIndex((r) => r.id === id)
  if (index === -1) return null
  list[index] = { ...list[index], ...patch }
  atomicWrite(HISTORY_FILE, list)
  return list[index]
}

export function clearHistory() {
  atomicWrite(HISTORY_FILE, [])
}
