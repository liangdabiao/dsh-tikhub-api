// TikHub 线上 OpenAPI：以线上 spec 为端点真源（技能里的 openapi.json 与 markdown 会过期）。
// - 线上：GET https://api.tikhub.io/openapi.json（国内可回落 api.tikhub.dev）
// - 缓存：$DSH_HOME/tikhub-api/openapi.live.json
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'tikhub-api')
const LIVE_CACHE = join(DATA_DIR, 'openapi.live.json')
const SPEC_URLS = [
  'https://api.tikhub.io/openapi.json',
  'https://api.tikhub.dev/openapi.json',
]
const VERSION_SEG = /^(app|app_v\d+|web|web_v\d+)$/i
const STOP_TOKENS = new Set(['api', 'app', 'web', 'get', 'fetch', 'v1', 'v2', 'v3', 'v4'])

function segs(path) {
  return String(path || '').replace(/^\/+/, '').split('/').filter(Boolean)
}
function normalize(path) {
  return segs(path).filter((s) => !VERSION_SEG.test(s)).join('/')
}

// 把路径拆成「语义 token」：去掉 api/app/web/get/fetch/vN 与复数词尾。
function tokenSet(path) {
  const out = new Set()
  for (const seg of segs(path)) {
    const low = seg.toLowerCase()
    if (STOP_TOKENS.has(low) || /^v\d+$/.test(low)) continue
    for (const t of low.split('_')) {
      if (!t || STOP_TOKENS.has(t) || /^v\d+$/.test(t)) continue
      out.add(t.replace(/s$/, ''))
    }
  }
  return out
}
function coverage(requested, candidate) {
  if (!requested.size || !candidate.size) return 0
  let hit = 0
  for (const t of requested) if (candidate.has(t)) hit++
  return hit / requested.size
}

export function readCachedSpec() {
  try {
    const raw = JSON.parse(readFileSync(LIVE_CACHE, 'utf8'))
    if (raw && raw.spec && raw.spec.paths) return raw
    return null
  } catch {
    return null
  }
}

// 技能自带的 openapi.json 是随技能分发的快照，可能落后于线上；作为离线兜底。
// skillDirs 通常是「技能扫描根」（skills/），真正的技能包在它的子目录里。
export function findLocalSpec(skillDirs) {
  const seen = new Set()
  const check = (dir) => {
    if (seen.has(dir) || !existsSync(dir)) return null
    seen.add(dir)
    const candidates = [
      join(dir, 'openapi.json'),
      join(dir, '.claude', 'skills', 'tikhub-api-helper', 'openapi.json'),
    ]
    for (const file of candidates) {
      if (!existsSync(file)) continue
      try {
        const spec = JSON.parse(readFileSync(file, 'utf8'))
        if (spec && spec.paths) return { spec, file }
      } catch { /* 坏文件跳过 */ }
    }
    return null
  }
  for (const root of [].concat(skillDirs || [])) {
    const direct = check(root)
    if (direct) return direct
    try {
      for (const e of readdirSync(root, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const hit = check(join(root, e.name))
        if (hit) return hit
      }
    } catch { /* 目录不可读就跳过 */ }
  }
  return null
}

async function fetchOne(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`)
    const spec = await res.json()
    if (!spec || !spec.paths) throw new Error(`spec 缺少 paths @ ${url}`)
    return spec
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchLiveSpec(timeoutMs = 30_000) {
  let lastErr = null
  for (const url of SPEC_URLS) {
    try {
      const spec = await fetchOne(url, timeoutMs)
      const fetchedAt = new Date().toISOString()
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(LIVE_CACHE, JSON.stringify({ fetchedAt, source: url, spec }), 'utf8')
      return { spec, source: url, fetchedAt, pathCount: Object.keys(spec.paths).length }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('无法获取线上 OpenAPI')
}

export function specMeta(record) {
  if (!record) return null
  const spec = record.spec || record
  return {
    version: spec?.info?.version || '',
    title: spec?.info?.title || '',
    paths: spec?.paths ? Object.keys(spec.paths).length : 0,
    fetchedAt: record.fetchedAt || '',
    source: record.source || '',
  }
}

// 把 spec 里的 GET 路径转成端点条目（与文档索引同构）。
export function indexSpec(spec) {
  const out = []
  for (const [rawPath, methods] of Object.entries(spec?.paths || {})) {
    const get = methods?.get
    if (!get) continue
    out.push({
      path: rawPath.replace(/^\/+/, ''),
      summary: String(get.summary || get.description || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      tags: Array.isArray(get.tags) ? get.tags : [],
      source: 'openapi',
    })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

export function searchSpec(endpoints, keyword) {
  const needle = String(keyword || '').trim().toLowerCase()
  if (!needle) return endpoints
  return endpoints.filter((e) =>
    `${e.path} ${e.summary || ''} ${(e.tags || []).join(' ')}`.toLowerCase().includes(needle))
}

// 404 用：按「末级段 + 归一化路径（去掉 app_v2/web_v3 等版本段）」找最可能的替代端点。
export function suggestPaths(spec, requested, limit = 5) {
  const req = segs(requested)
  const tail = req[req.length - 1] || ''
  const norm = normalize(requested)
  // 平台段：api/v1/xiaohongshu/... → xiaohongshu；否则取第一段
  const platform = (req[0] === 'api' && req[1] && /^v\d+$/i.test(req[1])) ? (req[2] || '') : (req[0] || '')
  const reqTokens = tokenSet(requested)
  const self = segs(requested).join('/')
  const scored = []
  for (const e of indexSpec(spec)) {
    if (e.path === self) continue // 别推荐用户刚调过的那条（它已经 404 了）
    const ep = segs(e.path)
    const etail = ep[ep.length - 1] || ''
    const candTokens = tokenSet(e.path)
    const cover = coverage(reqTokens, candTokens)
    const candPlatform = (ep[0] === 'api' && ep[1] && /^v\d+$/i.test(ep[1])) ? (ep[2] || '') : (ep[0] || '')
    const samePlatform = Boolean(platform) && candPlatform === platform
    let score = 0
    if (etail && etail === tail) score += 3
    if (norm && normalize(e.path) === norm) score += 2
    if (cover === 1) score += 4
    else if (cover >= 0.66) score += 3
    else if (cover >= 0.5) score += 2
    if (samePlatform) score += 2
    else score -= 3 // 跨平台降权，避免混进无关平台
    if (score < 3) continue
    scored.push({ ...e, score, exact: cover === 1 && samePlatform })
  }
  // 只给「语义 token 完全覆盖」的候选（如 search_notes → app_v2/search_notes）；
  // 没有完全匹配就返回空，让调用方提示「线上没有相近端点」，别塞一堆无关路径。
  const exact = scored.filter((s) => s.exact)
  return exact.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, Math.min(limit, 3))
}
