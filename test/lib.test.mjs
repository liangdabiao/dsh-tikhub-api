// dsh-tikhub-api 单测（node test/lib.test.mjs 直接跑）。
process.env.DSH_HOME = new URL('../.tmp/test-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')

import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIRS = [join(ROOT, 'skills')]

rmSync(process.env.DSH_HOME, { recursive: true, force: true })

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err?.message?.split('\n')[0]}`) }
}

// ── endpoints.js ───────────────────────────────────────────
const { indexEndpoints, searchEndpoints } = await import('../lib/endpoints.js')

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

await test('host: tikhub_history list/clear', async () => {
  const listed = await host.tikhubHistoryTool.execute({ action: 'list' })
  assert.equal(listed.ok, true)
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

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
