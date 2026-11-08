// TikHub API 助手 · 真实调用封装（GET https://api.tikhub.io/<path>）。
const BASE = 'https://api.tikhub.io'

export function buildUrl(path, params) {
  const clean = String(path).replace(/^\/+/, '')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const qs = query.toString()
  return `${BASE}/${clean}${qs ? `?${qs}` : ''}`
}

// 发起 GET 请求；返回 { status, json, ms }。token 绝不写入返回值。
export async function callTikHub(path, params, token, timeoutMs = 30_000) {
  if (!token) throw new Error('未配置 TikHub token：在本面板「⚙️ 设置」标签粘贴即可（或插件 Config / TIKHUB_TOKEN 环境变量）。')
  const url = buildUrl(path, params)
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = text.slice(0, 2000) }
    return { status: res.status, json, ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}
