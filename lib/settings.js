// TikHub API 助手 · 面板侧密钥配置（$DSH_HOME/tikhub-api/settings.json）。
// 面板「设置」标签直接配 token——比插件 Config 的隐藏入口可发现性强得多。
// 安全：API 只回掩码与是否已配置，绝不回明文。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'tikhub-api')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

function load() {
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function save(settings) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${SETTINGS_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(tmp, SETTINGS_FILE)
  try { chmodSync(SETTINGS_FILE, 0o600) } catch { /* Windows 上忽略 */ }
}

export function getSettings() {
  const s = load()
  return { tikhubToken: typeof s.tikhubToken === 'string' ? s.tikhubToken : '' }
}

export function saveSettings({ tikhubToken }) {
  const next = { tikhubToken: typeof tikhubToken === 'string' && tikhubToken.trim() ? tikhubToken.trim() : getSettings().tikhubToken }
  save(next)
  return maskSettings(next)
}

export function clearSettings() {
  save({ tikhubToken: '' })
}

// 解析生效 token：面板 settings.json 优先，回落插件 Config，再回落环境变量。
export function resolveToken(config = {}) {
  const s = getSettings()
  return (typeof s.tikhubToken === 'string' && s.tikhubToken)
    || (typeof config?.tikhubToken === 'string' && config.tikhubToken)
    || process.env.TIKHUB_TOKEN
    || ''
}

export function tokenSource(config = {}) {
  const s = getSettings()
  if (typeof s.tikhubToken === 'string' && s.tikhubToken) return 'panel'
  if (typeof config?.tikhubToken === 'string' && config.tikhubToken) return 'config'
  if (process.env.TIKHUB_TOKEN) return 'env'
  return 'none'
}

export function maskSettings(s = getSettings()) {
  const t = s.tikhubToken || ''
  return {
    configured: Boolean(t),
    tokenMasked: t ? `${t.slice(0, 4)}****${t.slice(-4)}` : '',
  }
}
