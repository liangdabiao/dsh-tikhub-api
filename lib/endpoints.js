// TikHub API 助手 · 端点索引（文档提取 + 线上 OpenAPI 合并），工具与面板 API 共用。
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { indexSpec } from './openapi.js'

// 扫描技能目录下所有 .md 文件，提取 TikHub API 路径及上下文行。
export function indexEndpoints(skillDirs) {
  const seen = new Map() // path -> { path, docs: Set(source), samples: [] }
  for (const dir of [].concat(skillDirs)) {
    if (!existsSync(dir)) continue
    for (const entry of walk(dir)) {
      if (!entry.endsWith('.md')) continue
      let text
      try { text = readFileSync(entry, 'utf8') } catch { continue }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const matches = lines[i].match(/api\/v1\/[a-z0-9_/-]+/g)
        if (!matches) continue
        for (const path of matches) {
          const record = seen.get(path) || { path, docs: new Set(), samples: [] }
          record.docs.add(entry.split(/[\\/]/).pop())
          if (record.samples.length < 2) {
            const context = lines.slice(Math.max(0, i - 1), i + 2).join(' ').replace(/\s+/g, ' ').trim()
            record.samples.push(context.slice(0, 160))
          }
          seen.set(path, record)
        }
      }
    }
  }
  return [...seen.values()]
    .map((r) => ({ path: r.path, docs: [...r.docs], samples: r.samples }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

export function searchEndpoints(skillDirs, keyword) {
  const needle = String(keyword).toLowerCase()
  return indexEndpoints(skillDirs).filter((e) =>
    `${e.path} ${e.samples.join(' ')}`.toLowerCase().includes(needle))
}

// 以线上 OpenAPI 为准的合并索引：线上路径优先，文档里有但线上没有的标 stale。
export function mergedEndpoints(skillDirs, spec) {
  const docs = indexEndpoints(skillDirs)
  const merged = new Map()
  if (spec) {
    for (const e of indexSpec(spec)) merged.set(e.path, { ...e, docs: [], samples: [] })
  }
  for (const d of docs) {
    const hit = merged.get(d.path)
    if (hit) {
      hit.docs = d.docs
      hit.samples = d.samples
    } else {
      merged.set(d.path, {
        ...d,
        source: spec ? 'docs-stale' : 'docs',
        stale: Boolean(spec),
      })
    }
  }
  return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path))
}

export function searchMerged(endpoints, keyword) {
  const needle = String(keyword || '').trim().toLowerCase()
  if (!needle) return endpoints
  return endpoints.filter((e) =>
    `${e.path} ${e.summary || ''} ${(e.tags || []).join(' ')} ${(e.samples || []).join(' ')}`
      .toLowerCase().includes(needle))
}
