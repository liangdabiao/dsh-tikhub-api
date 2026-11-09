// 面板数据面：/tikhub-api 前缀路由（端点搜索 + 调研历史 + 设置）。
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergedEndpoints, searchMerged } from './endpoints.js'
import { readCachedSpec, findLocalSpec, fetchLiveSpec, specMeta } from './openapi.js'
import { readHistory, getHistory, deleteHistory, clearHistory } from './data.js'
import { DATA_DIR } from './data.js'
import { maskSettings, saveSettings, clearSettings, resolveToken, tokenSource } from './settings.js'

const BASE = '/tikhub-api'

function readJson(req, max = 512 * 1024) {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') return reject(Object.assign(new Error('只接受 POST'), { status: 405 }))
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      return reject(Object.assign(new Error('要 application/json'), { status: 415 }))
    }
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > max) { reject(Object.assign(new Error('请求体过大'), { status: 413 })); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}
export function registerApi(ctx, { skillDirs, configRef }) {
  return ctx.webServer.register({
    kind: 'prefix', path: BASE,
    async handler(req, res) {
      try {
        const r = requestRejection(ctx, req)
        if (typeof r === 'number') return json(res, r, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'
        const config = configRef?.config || {}
        if (path === '/api/health') {
          try { appendFileSync(join(DATA_DIR, 'client-boot.log'), `${new Date().toISOString()} client-apply\n`) } catch { /* 诊断日志失败不影响业务 */ }
          return json(res, 200, { ok: true, dataDir: DATA_DIR, credentials: maskSettings(), hasToken: Boolean(resolveToken(config)) })
        }
        if (path === '/api/config' && req.method === 'GET') {
          return json(res, 200, { ...maskSettings(), source: tokenSource(config) })
        }
        if (path === '/api/config' && req.method === 'POST') {
          const body = await readJson(req)
          return json(res, 200, { ok: true, credentials: { ...saveSettings(body), source: tokenSource(config) } })
        }
        if (path === '/api/config' && req.method === 'DELETE') {
          clearSettings()
          return json(res, 200, { ok: true, credentials: { ...maskSettings(), source: tokenSource(config) } })
        }
        if (path === '/api/openapi' && req.method === 'GET') {
          const cached = readCachedSpec()
          return json(res, 200, {
            cached: Boolean(cached),
            local: Boolean(findLocalSpec(skillDirs)),
            ...(cached ? specMeta(cached) : { version: '', paths: 0, fetchedAt: '', source: '' }),
          })
        }
        if (path === '/api/openapi/refresh' && req.method === 'POST') {
          try {
            const live = await fetchLiveSpec()
            return json(res, 200, { ok: true, ...specMeta(live) })
          } catch (err) {
            return json(res, 502, { error: `线上 OpenAPI 同步失败：${err?.message || err}` })
          }
        }
        if (path === '/api/endpoints') {
          const cached = readCachedSpec()
          const spec = cached?.spec || findLocalSpec(skillDirs)?.spec || null
          const q = url.searchParams.get('q')
          const all = mergedEndpoints(skillDirs, spec)
          const endpoints = q ? searchMerged(all, q) : all
          return json(res, 200, {
            count: endpoints.length,
            endpoints: endpoints.slice(0, 200),
            spec: cached ? specMeta(cached) : spec ? { ...specMeta({ spec }), fetchedAt: '本地快照' } : null,
          })
        }
        if (path === '/api/stats') {
          const calls = readHistory()
          const now = new Date()
          const today = calls.filter((c) => {
            const d = new Date(c.ts)
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
          }).length
          return json(res, 200, {
            total: calls.length,
            ok: calls.filter((c) => c.status === 'ok').length,
            error: calls.filter((c) => c.status === 'error').length,
            today,
            configured: Boolean(resolveToken(config)),
          })
        }
        if (path === '/api/calls') {
          return json(res, 200, { calls: readHistory() })
        }
        if (path === '/api/calls/get') {
          return json(res, 200, { call: getHistory(url.searchParams.get('id') || '') })
        }
        if (path === '/api/calls/delete' && req.method === 'POST') {
          const body = await readJson(req)
          return json(res, 200, { ok: deleteHistory(body?.id || '') })
        }
        if (path === '/api/calls/clear' && req.method === 'POST') {
          clearHistory()
          return json(res, 200, { ok: true })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) { json(res, 500, { error: err?.message }) }
    },
  })
}
