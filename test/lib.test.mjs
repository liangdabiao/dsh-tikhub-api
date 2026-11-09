// dsh-tikhub-api 单测（node test/lib.test.mjs 直接跑）。
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
process.env.TIKHUB_NO_LIVE = '1' // 单测零网络：不走线上 OpenAPI 自动同步

import assert from 'node:assert/strict'
import { rmSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills')]

rmSync(process.env.DSH_HOME, { recursive: true, force: true })

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err?.message?.split('\n')[0]}`) }
}

// ── endpoints.js ───────────────────────────────────────────
const { indexEndpoints, searchEndpoints, mergedEndpoints, searchMerged } = await import('../lib/endpoints.js')
const openapi = await import('../lib/openapi.js')

await test('endpoints: 文档索引到多个 api/v1 端点', async () => {
  const all = indexEndpoints(SKILL_DIRS)
  assert.ok(all.length >= 5, `应至少 5 个端点，实际 ${all.length}`)
  assert.ok(all.every((e) => e.path.startsWith('api/v1/')))
  assert.ok(all.some((e) => e.path.includes('xiaohongshu')), '应含小红书端点')
})

await test('endpoints: search 平台关键词', async () => {
  assert.ok(searchEndpoints(SKILL_DIRS, 'douyin').length >= 1)
  assert.ok(searchEndpoints(SKILL_DIRS, 'profile').length >= 1)
  assert.equal(searchEndpoints(SKILL_DIRS, 'zzz不存在').length, 0)
})

await test('openapi: 本地 spec 含 app_v2/search_notes，404 替代路径优先 app_v2', async () => {
  const local = openapi.findLocalSpec(SKILL_DIRS)
  assert.ok(local?.spec, '应找到本地 openapi.json')
  const all = openapi.indexSpec(local.spec)
  assert.ok(all.some((e) => e.path === 'api/v1/xiaohongshu/app_v2/search_notes'))
  const sug = openapi.suggestPaths(local.spec, 'api/v1/xiaohongshu/web/search_notes', 5)
  assert.ok(sug.some((s) => s.path === 'api/v1/xiaohongshu/app_v2/search_notes'), sug.map((s) => s.path).join(','))
  // 不能推荐用户刚调过的那条（它已经 404）
  assert.ok(!sug.some((s) => s.path === 'api/v1/xiaohongshu/web/search_notes'))
  // 不能混进无关平台（平台段要靠 tail/归一化路径命中才算）
  assert.ok(sug.every((s) => s.path.includes('/xiaohongshu/')), sug.map((s) => s.path).join(','))
})

await test('endpoints: 线上 spec 优先，文档旧路径标 stale', async () => {
  const fakeSpec = { info: { version: 'live-test' }, paths: { '/api/v1/xiaohongshu/app_v2/search_notes': { get: { summary: '搜索笔记' } } } }
  const merged = mergedEndpoints(SKILL_DIRS, fakeSpec)
  const app = merged.find((e) => e.path === 'api/v1/xiaohongshu/app_v2/search_notes')
  assert.equal(app.source, 'openapi')
  // 文档里存在、但线上 spec 没有的路径 → stale
  const docOnly = merged.find((e) => e.path === 'api/v1/douyin/app/fetch_video_detail')
  assert.ok(docOnly, '文档里的其它路径保留')
  assert.equal(docOnly.stale, true)
  assert.ok(!merged.some((e) => e.path === 'api/v1/xiaohongshu/web/search_notes'), '已下线的旧路径不应再出现')
  assert.ok(searchMerged(merged, 'search_notes').some((e) => e.path.includes('app_v2/search_notes')))
})

// ── data.js ────────────────────────────────────────────────
const data = await import('../lib/data.js')

await test('data: 调用历史 追加/更新/清空', async () => {
  assert.equal(data.readHistory().length, 0)
  data.appendHistory({ id: 'c1', path: 'api/v1/x', status: 'running' })
  data.updateHistory('c1', { status: 'ok', httpStatus: 200, ms: 300 })
  assert.equal(data.readHistory()[0].httpStatus, 200)
  data.clearHistory()
  assert.equal(data.readHistory().length, 0)
})

await test('data: 详情/删除单条/响应片段', async () => {
  data.clearHistory()
  data.appendHistory({ id: 'c1', path: 'api/v1/x', status: 'ok' })
  data.appendHistory({ id: 'c2', path: 'api/v1/y', status: 'ok' })
  assert.equal(data.getHistory('c1').path, 'api/v1/x')
  data.updateHistory('c1', { responseSnippet: '{"data":[1,2]}' })
  assert.equal(data.getHistory('c1').responseSnippet, '{"data":[1,2]}')
  assert.equal(data.deleteHistory('c1'), true)
  assert.equal(data.getHistory('c1'), null)
  assert.equal(data.readHistory().length, 1)
  data.clearHistory()
})

// ── client.js（buildUrl 不打网络）──────────────────────────
const { buildUrl } = await import('../lib/client.js')

await test('client: buildUrl 拼接路径与参数', async () => {
  assert.equal(buildUrl('api/v1/x/search', { keyword: '保温杯', page: '1' }), 'https://api.tikhub.io/api/v1/x/search?keyword=%E4%BF%9D%E6%B8%A9%E6%9D%AF&page=1')
  assert.equal(buildUrl('/api/v1/y', {}), 'https://api.tikhub.io/api/v1/y')
  assert.ok(!buildUrl('api/v1/y', { empty: '' }).includes('empty'))
})

await test('client: callTikHub 无 token 报错指引', async () => {
  const { callTikHub } = await import('../lib/client.js')
  await assert.rejects(() => callTikHub('api/v1/health/check', {}, ''), /tikhubToken/)
})

// ── host.js ────────────────────────────────────────────────
const host = await import('../src/host.js')

await test('host: 3 个工具 schema + 校验 + endpoint list 全链路', async () => {
  assert.equal(host.name, 'tikhub-api')
  for (const tool of [host.tikhubEndpointTool, host.tikhubCallTool, host.tikhubHistoryTool]) {
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(tool.description.length > 30)
  }
  await assert.rejects(() => host.tikhubEndpointTool.execute({ action: 'list', bogus: 1 }), /未知参数/)
  // 用 mock ctx 跑 apply，完成 skillDirs 注入
  const effects = []
  const fakeCtx = {
    effect: (fn, label) => { try { fn() } catch {} effects.push(label) },
    tools: { register: () => {} },
    skills: { registerProvider: () => {} },
    webServer: { register: () => {} },
  }
  host.apply(fakeCtx)
  assert.ok(effects.length >= 5, `apply 应注册 5 个能力，实际 ${effects.length}`)
  const list = await host.tikhubEndpointTool.execute({ action: 'list', limit: 5 })
  assert.equal(list.ok, true)
  assert.ok(list.data.includes('api/v1/'))
  const miss = await host.tikhubEndpointTool.execute({ action: 'search', keyword: 'zzz不存在' })
  assert.equal(miss.ok, false)
})

await test('host: tikhub_call 无 token 报错且留痕 failed', async () => {
  process.env.TIKHUB_TOKEN = ''
  await assert.rejects(
    () => host.tikhubCallTool.execute({ path: 'api/v1/health/check' }),
    /tikhubToken|TIKHUB_TOKEN/)
  const hist = data.readHistory()
  assert.ok(hist.length >= 1 && hist[0].status === 'error', '失败也留痕')
})

await test('host: tikhub_history list/get/delete/clear', async () => {
  const listed = await host.tikhubHistoryTool.execute({ action: 'list' })
  assert.equal(listed.ok, true)
  const rec = data.readHistory()[0]
  assert.ok(rec, '应有一条失败留痕')
  const got = await host.tikhubHistoryTool.execute({ action: 'get', id: rec.id })
  assert.equal(got.ok, true)
  assert.ok(got.data.includes(rec.path))
  const missing = await host.tikhubHistoryTool.execute({ action: 'get', id: 'nope' })
  assert.equal(missing.ok, false)
  const noId = await assert.rejects(() => host.tikhubHistoryTool.execute({ action: 'delete' }), /需要 id/)
  assert.equal(noId, undefined)
  const deleted = await host.tikhubHistoryTool.execute({ action: 'delete', id: rec.id })
  assert.equal(deleted.ok, true)
  const noConfirm = await host.tikhubHistoryTool.execute({ action: 'clear' })
  assert.equal(noConfirm.ok, false)
  const cleared = await host.tikhubHistoryTool.execute({ action: 'clear', confirm: 'yes' })
  assert.equal(cleared.ok, true)
  assert.equal(data.readHistory().length, 0)
})

// ── api.js ─────────────────────────────────────────────────
await test('api: 鉴权深度防御语义', async () => {
  const api = await import('../lib/api.js')
  assert.equal(api.requestRejection({ get: () => undefined }, { headers: {} }), false)
  assert.equal(api.requestRejection({ get: () => ({ requestRejection: () => 403 }) }, { headers: {} }), 403)
})

// ── 浏览器半边产物 ─────────────────────────────────────────
await test('client: bundle 裸 load 注册 + 工作台 5 标签 + 一键填进对话', async () => {
  const code = readFileSync(join(ROOT, 'dist', 'client.js'), 'utf8')
  assert.ok(code.startsWith('window.__ModuleLoader__.load('), '产物必须是裸 load（包 wrapper 会导致宿主不激活）')
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
  }
  const loaded = []
  const sandbox = { window: { __ModuleLoader__: { load: (entry) => loaded.push(entry) } }, Set, console }
  runInNewContext(code, sandbox)
  assert.equal(loaded.length, 1)

  const mod = loaded[0].factory((name) => {
    if (name === 'react') return react
    throw new Error(`产物 require 了白名单外的模块：${name}`)
  })
  assert.equal(mod.isPlugin, true)
  assert.deepEqual(Array.from(mod.inject), ['slots', 'uiWorkspace'])

  const starts = []
  const registered = []
  const ctx = {
    uiWorkspace: { startSession: (_id, opts) => starts.push(opts) },
    slots: { inject: (_name, fn) => fn(), register: (spec, comp) => registered.push({ spec, comp }) },
  }
  mod.apply(ctx, {})
  assert.equal(registered.length, 2)
  assert.equal(registered[0].spec.name, 'sidebar.panellist')
  assert.equal(registered[0].spec.id, 'tikhub-api')
  assert.equal(registered[0].spec.label(), 'TikHub 调研')

  const tree = renderTree(registered[1].comp({}))
  const texts = collectText(tree)
  for (const label of ['🏠 概览', '📋 调研历史', '🔎 端点库', '⚙️ 设置', '📖 指南']) {
    assert.ok(texts.includes(label), `应包含标签 ${label}`)
  }
  const buttons = collectButtons(tree)
  const cta = buttons.find((b) => String(b.props.title || '').startsWith('填进对话'))
  assert.ok(cta, '概览页应有「发起新调研」按钮')
  cta.props.onClick()
  assert.equal(starts.length, 1)
  assert.equal(starts[0].whenDraftExists, 'replace')
  assert.match(starts[0].prompt, /调研/)
})

function renderTree(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return node
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(renderTree)
  if (typeof node.type === 'function') return renderTree(node.type(node.props || {}))
  return { type: node.type, props: node.props || {}, children: (node.children || []).map(renderTree) }
}

function collectButtons(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((child) => collectButtons(child, out))
    return out
  }
  if (node.type === 'button') out.push(node)
  ;(node.children || []).forEach((child) => collectButtons(child, out))
  return out
}

function collectText(node, out = []) {
  if (typeof node === 'string' || typeof node === 'number') out.push(String(node))
  else if (Array.isArray(node)) node.forEach((child) => collectText(child, out))
  else if (node && typeof node === 'object') (node.children || []).forEach((child) => collectText(child, out))
  return out
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
