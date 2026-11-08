// TikHub API 助手 · Host 半边（技能 + tikhub_endpoint / tikhub_call 原生工具 + 面板数据面）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { registerApi } from '../lib/api.js'
import { indexEndpoints, searchEndpoints } from '../lib/endpoints.js'
import { callTikHub } from '../lib/client.js'
import { readHistory, appendHistory, updateHistory, clearHistory } from '../lib/data.js'
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

// ---------------------------------------------------------------------------
// 工具 1：tikhub_endpoint —— 从技能文档索引 TikHub API 端点
// ---------------------------------------------------------------------------
export const tikhubEndpointTool = {
  name: 'tikhub_endpoint',
  description:
    '在 TikHub 技能文档中索引/搜索 API 端点（api/v1/... 路径 + 用法上下文）。' +
    '调 tikhub_call 之前先用它找到正确端点：search 按平台/功能关键词（如「小红书」「douyin」「user_profile」「search」）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列全部已知端点；search 关键词搜索', { enum: ['list', 'search'] }),
      keyword: str('search：关键词，如「xiaohongshu」「douyin」「tiktok」「profile」「search」'),
      limit: num('最多返回条数，默认 15'),
    },
  },
  output: OUTPUT,
  async execute(args) {
    check(args, this.parameters)
    const skillDirs = skillDirsRef.dirs
    const endpoints = args.action === 'search'
      ? (args.keyword ? searchEndpoints(skillDirs, args.keyword) : [])
      : indexEndpoints(skillDirs)
    const sliced = endpoints.slice(0, args.limit || 15)
    if (!sliced.length) return result(false, args.action === 'search' ? `没有匹配「${args.keyword}」的端点，试试 list 看全部。` : '技能文档里没有找到端点。')
    return result(true, `${args.action === 'search' ? `匹配到 ${sliced.length}` : `共 ${endpoints.length} 个已知端点，显示前 ${sliced.length}`} 个：`,
      sliced.map((e) => `- ${e.path}${e.docs.length ? `（见 ${e.docs.join('、')}）` : ''}${e.samples[0] ? `\n  ${e.samples[0]}` : ''}`).join('\n'))
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
      updateHistory(record.id, { status: status < 400 ? 'ok' : 'error', httpStatus: status, ms })
      const truncated = body.length > 6000 ? `${body.slice(0, 6000)}\n…（响应过长已截断 ${body.length} 字符，建议把分析重点写进工作区文件）` : body
      return result(status < 400,
        `HTTP ${status}（${ms}ms）${args.note ? ` · ${args.note}` : ''}。完整响应可在面板「调用历史」查看。`,
        truncated)
    } catch (err) {
      updateHistory(record.id, { status: 'error', error: String(err?.message || err).slice(0, 300) })
      throw err
    }
  },
}

// ---------------------------------------------------------------------------
// 工具 3：tikhub_history —— 调用历史
// ---------------------------------------------------------------------------
export const tikhubHistoryTool = {
  name: 'tikhub_history',
  description: '查询/清空 TikHub API 调用历史：每次调用的路径、参数、HTTP 状态、耗时、时间。用户问「刚才调了什么接口」时使用。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('list 列历史；clear 清空（需 confirm）', { enum: ['list', 'clear'] }),
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
      return result(true, '调用历史已清空。')
    }
    const all = readHistory()
    const list = all.slice(0, args.limit || 15)
    if (!list.length) return result(true, '还没有调用历史。先用 tikhub_endpoint 找端点，再 tikhub_call 调用。')
    return result(true, `共 ${all.length} 条，最近 ${list.length} 条：`,
      list.map((r) => `- ${r.ts} [${r.status}${r.httpStatus ? ' ' + r.httpStatus : ''}] ${r.path} ${JSON.stringify(r.params)}${r.note ? ` · ${r.note}` : ''}`).join('\n'))
  },
}

const skillDirsRef = { dirs: [] }

export function apply(ctx) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]
  skillDirsRef.dirs = skillDirs
  ctx.effect(() => ctx.tools.register(tikhubEndpointTool), `${name}: tool endpoints`)
  ctx.effect(() => ctx.tools.register(tikhubCallTool), `${name}: tool call`)
  ctx.effect(() => ctx.tools.register(tikhubHistoryTool), `${name}: tool history`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  ctx.effect(() => registerApi(ctx, { skillDirs, configRef }), `${name}: routes`)
}
