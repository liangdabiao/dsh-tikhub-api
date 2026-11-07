// 面板数据面：/tikhub-api 前缀路由（端点搜索 + 调用历史）。
import { indexEndpoints, searchEndpoints } from './endpoints.js'
import { readHistory } from './data.js'
import { DATA_DIR } from './data.js'

const BASE = '/tikhub-api'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return false // dsh 0.2.x 宿主已 token 鉴权，服务缺席时放行（fail-closed 会把面板永久 403）
  return connection.requestRejection({ headers: req.headers })
}
export function registerApi(ctx, { skillDirs }) {
  return ctx.webServer.register({
    kind: 'prefix', path: BASE,
    async handler(req, res) {
      try {
        const r = requestRejection(ctx, req)
        if (typeof r === 'number') return json(res, r, { error: '未授权' })
        const url = new URL(req.url, 'http://x')
        const path = url.pathname.slice(BASE.length) || '/'
        if (path === '/api/health') return json(res, 200, { ok: true, dataDir: DATA_DIR })
        if (path === '/api/endpoints') {
          const q = url.searchParams.get('q')
          const endpoints = q ? searchEndpoints(skillDirs, q) : indexEndpoints(skillDirs)
          return json(res, 200, { count: endpoints.length, endpoints: endpoints.slice(0, 50) })
        }
        if (path === '/api/calls') {
          return json(res, 200, { calls: readHistory() })
        }
        json(res, 404, { error: 'not found' })
      } catch (err) { json(res, 500, { error: err?.message }) }
    },
  })
}
