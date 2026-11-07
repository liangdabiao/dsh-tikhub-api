// TikHub API 快照单测。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSkillProvider, requestRejection: _unused } = await import('../lib/skills.js')
const api = await import('../lib/api.js')

test('快照：SKILL.md + openapi 说明存在', () => {
  assert.ok(existsSync(join(ROOT, 'skills', 'tikhub-api', 'SKILL.md')), '缺 SKILL.md')
  const files = readdirSync(join(ROOT, 'skills', 'tikhub-api'))
  assert.ok(files.some(f => f.includes('openapi') || f.includes('README')), '缺 openapi 说明')
})

test('provider：注册 + 正文含平台列表', async () => {
  const provider = createSkillProvider([join(ROOT, 'skills')])
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  assert.ok(candidates[0].name.includes('tikhub'), 'name should contain tikhub')
  const skill = await provider.get(candidates[0])
  assert.ok(skill.content.length > 2000)
  assert.match(skill.content, /抖音|TikTok|小红书/)
  assert.match(skill.content, /工作区|读不到/, '应有工作区约定')
})

test('面板 API 鉴权', () => {
  assert.equal(api.requestRejection({ get: () => undefined }, { headers: {} }), 403)
})
