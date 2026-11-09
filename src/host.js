// TikHub API 助手 · Host 半边（技能 + tikhub_endpoint / tikhub_call 原生工具 + 面板数据面）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { mergedEndpoints, searchMerged } from '../lib/endpoints.js'
import { readCachedSpec, findLocalSpec, fetchLiveSpec, indexSpec, searchSpec, suggestPaths, specMeta } from '../lib/openapi.js'
import { callTikHub } from '../lib/client.js'
import { readHistory, appendHistory, updateHistory, clearHistory, getHistory, deleteHistory } from '../lib/data.js'
import { resolveToken, maskSettings, saveSettings, clearSettings } from '../lib/settings.js'

export const name = 'tikhub-api'
export const inject = ['tools', 'skills', 'webServer', 'connection']

export const Config = Schema.object({
  tikhubToken: Schema.string().default('').description('TikHub API token（api.tikhub.io 用户中心获取；敏感，仅本插件使用）'),
})

const configRef = { config: Config }

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：端点列表/响应 JSON' },
    },
  },
  render: (_args, value) => text(value.data ? `${value.summary}\n\n${value.data}` : value.summary),
}

const result = (ok, summary, data = '') => ({ ok, summary, data })
const vlabel = (v) => {
  const s = String(v || '').trim()
  return s ? (s.startsWith('V') || s.startsWith('v') ? 'V' + s.replace(/^[Vv]/, '') : `V${s}`) : 'V?'
}

// ---------------------------------------------------------------------------
// 工具 1：tikhub_endpoint —— 技能文档 + 线上 OpenAPI 的端点索引
// ---------------------------------------------------------------------------
export const tikhubEndpointTool = {
  name: 'tikhub_endpoint',
  description:
    '索引/搜索 TikHub API 端点。**以线上 OpenAPI 为准**：action=openapi 会拉取 https://api.tikhub.io/openapi.json 并缓存，' +
    'list/search 优先用线上 spec（技能文档里的 web 路径可能已下线，如 xiaohongshu/web/search_notes 已不存在，实际用 app_v2/search_notes）。' +
    '调 tikhub_call 之前先用它找正确端点；返回 404 时也先跑 action=openapi。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列已知端点；search 关键词搜索；openapi 同步线上 spec（可带 keyword）', { enum: ['list', 'search', 'openapi'] }),
      keyword: str('search/openapi：关键词，如「xiaohongshu」「search_notes」「douyin」「profile」'),
      limit: num('最多返回条数，默认 15'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const skillDirs = skillDirsRef.dirs
    const limit = args.limit || 15
    const fmt = (e) => {
      const tag = e.source === 'openapi' ? '线上' : e.stale ? '文档·线上未收录' : '文档'
      return `- ${e.path} [${tag}]${e.summary ? ` · ${e.summary}` : ''}`
    }

    if (args.action === 'openapi') {
      let live
      try {
        live = await fetchLiveSpec()
      } catch (err) {
        const cached = readCachedSpec()
        if (!cached) return result(false, `线上 OpenAPI 获取失败：${err?.message || err}。网络恢复后再试，或先看本地快照/文档（可能过期）。`)
        const meta = specMeta(cached)
        const hits = args.keyword ? searchSpec(indexSpec(cached.spec), args.keyword).slice(0, limit) : []
        return result(true, `线上获取失败（${err?.message || err}），使用缓存快照：${vlabel(meta.version)} · ${meta.paths} 条 · ${meta.fetchedAt}`,
          hits.length ? hits.map(fmt).join('\n') : '（未指定 keyword；缓存已可用于 list/search）')
      }
      const meta = specMeta(live)
      const all = indexSpec(live.spec)
      const hits = args.keyword ? searchSpec(all, args.keyword) : all
      const sliced = hits.slice(0, limit)
      return result(true,
        `已同步线上 OpenAPI：${vlabel(meta.version)} · ${meta.paths} 条路径 · ${meta.source}${args.keyword ? ` · 匹配 ${hits.length} 条，显示 ${sliced.length}` : ` · 显示前 ${sliced.length}`}`,
        sliced.length ? sliced.map(fmt).join('\n') : `没有匹配「${args.keyword}」的线上端点。`)
    }

    const rec = await currentSpecRecord(skillDirs)
    const spec = rec?.spec || null
    const base = mergedEndpoints(skillDirs, spec)
    const list = args.action === 'search' ? searchMerged(base, args.keyword || '') : base
    const sliced = list.slice(0, limit)
    const meta = rec ? specMeta(rec) : null
    const metaNote = rec?.fetchedAt
      ? `线上 ${vlabel(meta.version)}（${meta.paths} 条，${meta.fetchedAt}）`
      : rec ? '本地 OpenAPI 快照（可能过期，建议 action=openapi 同步）' : '仅技能文档（可能过期，建议 action=openapi 同步）'
    if (!sliced.length) {
      return result(false, args.action === 'search' ? `没有匹配「${args.keyword}」的端点。先 action=openapi 同步线上 spec 再搜。` : '没有端点。先 action=openapi 同步线上 spec。')
    }
    return result(true,
      `${metaNote} · ${args.action === 'search' ? `匹配 ${list.length} 条，显示 ${sliced.length}` : `共 ${base.length} 个端点，显示前 ${sliced.length}`}：`,
      sliced.map(fmt).join('\n'))
  },
}

// ---------------------------------------------------------------------------
// 工具 2：tikhub_call —— 真实 GET 调用 + 历史留痕
// ---------------------------------------------------------------------------
export const tikhubCallTool = {
  name: 'tikhub_call',
  description:
    '真实调用 TikHub API（GET https://api.tikhub.io/<path>）。token 在面板「⚙️ 设置」标签配置（或插件 Config / TIKHUB_TOKEN 环境变量）。' +
    '先用 tikhub_endpoint 找端点，再传 path 与 query params。调用自动入历史（可在面板查看）；响应超过 6000 字符会被截断，完整数据以工作区文件为准。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['path'],
    properties: {
      path: str('API 路径，不带域名，如 api/v1/xiaohongshu/web/search_notes'),
      params: str('query 参数 JSON 字符串，如 {"keyword":"保温杯","page":"1"}'),
      timeout: num('超时秒数，默认 30'),
      note: str('可选：本次调用用途标注（进历史）'),
    },
  },
  timeoutMs: 60_000,
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    let params = {}
    if (args.params) {
      try { params = JSON.parse(args.params) } catch { throw new Error('params 不是合法 JSON，如 {"keyword":"保温杯"}。') }
    }
    const cfg = configRef.config
    const token = resolveToken(cfg)
    const record = {
      id: `call-${Date.now()}`,
      ts: new Date().toISOString(),
      path: args.path,
      params,
      note: args.note || '',
      status: 'running',
    }
    appendHistory(record)
    try {
      const { status, json, ms } = await callTikHub(args.path, params, token, (args.timeout || 30) * 1000)
      const body = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
      // 存一份响应片段进历史，面板「调研历史」可直接展开阅读（完整数据仍以工作区文件为准）。
      updateHistory(record.id, { status: status < 400 ? 'ok' : 'error', httpStatus: status, ms, responseSnippet: body.slice(0, 4000) })
      const truncated = body.length > 6000 ? `${body.slice(0, 6000)}\n…（响应过长已截断 ${body.length} 字符，建议把分析重点写进工作区文件）` : body
      // 404 时给出线上 spec 里的相近端点（技能文档路径可能已下线）。
      let hint = ''
      if (status === 404) {
        const cached = readCachedSpec()
        const local = findLocalSpec(skillDirsRef.dirs)
        const spec = cached?.spec || local?.spec
        const suggestions = spec ? suggestPaths(spec, args.path, 5) : []
        hint = suggestions.length
          ? `\n\n⚠️ 该路径返回 404，可能已下线。线上 spec 里的相近端点：\n${suggestions.map((s) => `- ${s.path}${s.summary ? ` · ${s.summary}` : ''}`).join('\n')}\n先 tikhub_endpoint action=openapi 同步线上 spec，再用上面的路径重试。`
          : spec
            ? '\n\n⚠️ 该路径返回 404；线上 spec 里没有相近端点，可能该功能已下线。用 tikhub_endpoint action=openapi 搜索可用端点。'
            : '\n\n⚠️ 该路径返回 404。先 tikhub_endpoint action=openapi 同步线上 spec，再按 spec 里的路径重试。'
      }
      return result(status < 400,
        `HTTP ${status}（${ms}ms）${args.note ? ` · ${args.note}` : ''}。完整响应可在面板「调用历史」查看。${hint}`,
        truncated)
    } catch (err) {
      updateHistory(record.id, { status: 'error', error: String(err?.message || err).slice(0, 300) })
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// 工具 3：tikhub_history —— 调研历史（列表 / 详情 / 删除 / 清空）
// ---------------------------------------------------------------------------
export const tikhubHistoryTool = {
  name: 'tikhub_history',
  description:
    '查询/读取/删除 TikHub API 调研历史（每次调用的路径、参数、状态、耗时、响应片段）。' +
    'list 看列表；get 按 id 读详情（含响应片段）；delete 删单条；clear 清空。用户问「刚才调了什么接口/结果是什么」时使用。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列表；get 详情；delete 删单条；clear 清空（需 confirm）', { enum: ['list', 'get', 'delete', 'clear'] }),
      id: str('get/delete：记录 id（list 里能看到）'),
      limit: num('list：最多返回条数，默认 15'),
      confirm: str('clear 必须传 "yes"', { enum: ['yes'] }),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    if (args.action === 'clear') {
      if (args.confirm !== 'yes') return result(false, '清空历史请用 confirm:"yes" 确认。')
      clearHistory()
      return result(true, '调研历史已清空。')
    }
    if (args.action === 'get') {
      if (!args.id) throw new Error('get 需要 id（从 list 里找）。')
      const record = getHistory(args.id)
      if (!record) return result(false, `没有找到记录 ${args.id}。`)
      return result(true, `记录 ${args.id}（${record.status}）`, JSON.stringify(record, null, 2))
    }
    if (args.action === 'delete') {
      if (!args.id) throw new Error('delete 需要 id（从 list 里找）。')
      const removed = deleteHistory(args.id)
      return result(removed, removed ? `已删除记录 ${args.id}。` : `没有找到记录 ${args.id}。`)
    }
    const all = readHistory()
    const list = all.slice(0, args.limit || 15)
    if (!list.length) return result(true, '还没有调研历史。先用 tikhub_endpoint 找端点，再 tikhub_call 调用。')
    return result(true, `共 ${all.length} 条，最近 ${list.length} 条：`,
      list.map((r) => `- ${r.ts} [${r.status}${r.httpStatus ? ' ' + r.httpStatus : ''}] ${r.path} ${JSON.stringify(r.params)}${r.note ? ` · ${r.note}` : ''}${r.responseSnippet ? ' · 有响应片段' : ''}\n  id=${r.id}`).join('\n'))
  },
}

const skillDirsRef = { dirs: [] }
let autoSyncFailedAt = 0

// 端点查询默认也要用线上 spec：没有缓存时自动同步一次，失败再回落本地快照。
async function currentSpecRecord(skillDirs) {
  const cached = readCachedSpec()
  if (cached) return cached
  if (process.env.TIKHUB_NO_LIVE !== '1' && Date.now() - autoSyncFailedAt > 60_000) {
    try {
      const live = await fetchLiveSpec(12_000)
      return { spec: live.spec, fetchedAt: live.fetchedAt, source: live.source }
    } catch {
      autoSyncFailedAt = Date.now()
    }
  }
  const local = findLocalSpec(skillDirs)
  return local ? { spec: local.spec, fetchedAt: '', source: local.file } : null
}

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(tikhubEndpointTool), `${name}: tool endpoints`)
  ctx.effect(() => ctx.tools.register(tikhubCallTool), `${name}: tool call`)
  ctx.effect(() => ctx.tools.register(tikhubHistoryTool), `${name}: tool history`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs, configRef }), `${name}: routes`)
}
