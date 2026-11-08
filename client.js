// ============================================================================
// TikHub API 助手 · 浏览器半边（调用历史 / 端点搜索 / 指南 三标签面板）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'tikhub-api'
const BASE = 'tikhub-api'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#1d3557' }),
    h('path', { d: 'M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 7.5l-3 9', stroke: '#a8dadc', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }))
}

async function fetchJson(path) {
  const res = await fetch(BASE + path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`)
  return data
}

function fmtTime(iso) {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  } catch { return iso || '' }
}

function CallsTab() {
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetchJson('/api/calls').then((d) => setCalls(d.calls)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (calls === null) return h('div', { style: styles.muted }, '加载中…')
  if (!calls.length) return h('div', { style: styles.muted }, '还没有调用记录。在对话里说「帮我搜小红书上的保温杯笔记」，模型会先查端点再真实调用。')

  return h('div', null, calls.map((r) => h('div', { key: r.id, style: styles.card },
    h('div', { style: styles.row },
      h('span', {
        style: { fontWeight: 700, fontSize: 12, color: r.status === 'ok' ? '#1a7f37' : r.status === 'running' ? '#b58a00' : '#c0392b' },
      }, r.status === 'ok' ? `✓ ${r.httpStatus || ''}` : r.status === 'running' ? '⏳ 调用中' : `✗ ${r.httpStatus || r.error?.slice(0, 40) || ''}`),
      r.ms != null ? h('span', { style: styles.mutedSmall }, `${r.ms}ms`) : null,
      h('span', { style: styles.mutedSmall }, fmtTime(r.ts)),
      r.note ? h('span', { style: styles.note }, r.note) : null),
    h('div', { style: styles.path }, `GET ${r.path}`),
    Object.keys(r.params || {}).length ? h('div', { style: styles.mutedSmall }, `参数 ${JSON.stringify(r.params)}`) : null)))
}

function EndpointsTab() {
  const [endpoints, setEndpoints] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    fetchJson('/api/endpoints').then((d) => setEndpoints(d.endpoints)).catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  if (endpoints === null) return h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q ? endpoints.filter((e) => `${e.path} ${e.samples.join(' ')}`.toLowerCase().includes(q)) : endpoints

  return h('div', null,
    h('input', { style: styles.search, placeholder: '搜索端点，如「xiaohongshu」「douyin」「search」…', value: query, onChange: (e) => setQuery(e.target.value) }),
    h('div', { style: styles.mutedSmall, marginBottom: 8 }, `文档索引到 ${endpoints.length} 个端点${q ? `，匹配 ${filtered.length} 个` : ''}`),
    filtered.map((e) => h('div', { key: e.path, style: styles.card },
      h('div', { style: styles.path }, e.path),
      e.samples.map((s, i) => h('div', { key: i, style: styles.mutedSmall }, s)),
      e.docs.length ? h('div', { style: styles.mutedSmall }, `来源：${e.docs.join('、')}`) : null)))
}

function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '「搜一下小红书上「防晒衣」的爆款笔记」'),
        h('div', { style: styles.quote }, '「拉取这个抖音用户的最近 10 条视频」'),
        h('div', { style: styles.quote }, '「TikTok 搜 #kitchen gadget 的热门视频」'),
        '模型先调 tikhub_endpoint 找端点，再 tikhub_call 真实调用，结果自动入历史。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '3 个工具'),
      h('div', { style: styles.muted, lineHeight: 2 },
        h('b', null, 'tikhub_endpoint'), ' — 从技能文档索引/搜索 API 端点（api/v1/… 路径 + 用法上下文）。',
        h('br'), h('b', null, 'tikhub_call'), ' — 真实 GET 调用（需配置 token），自动入历史。',
        h('br'), h('b', null, 'tikhub_history'), ' — 查询/清空调用历史。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '前置条件'),
      h('div', { style: styles.muted, lineHeight: 1.8 },
        '在插件 Config 里填 TikHub token（api.tikhub.io 用户中心获取），或设 TIKHUB_TOKEN 环境变量。',
        h('br'), '调用按 TikHub 计费规则消耗点数，批量抓取前先确认额度。')))
}


// ---------- 设置：面板内直配 TikHub token（存本机，永不上传/回显明文） ----------
function SettingsTab() {
  const [info, setInfo] = useState(null)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => {
    fetchJson('/api/config').then(setInfo).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setError(''); setMsg('')
    if (!token.trim()) { setError('先粘贴 TikHub token。'); return }
    try {
      const d = await fetch(BASE + '/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tikhubToken: token.trim() }) }).then(r => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setToken('')
      setMsg('已保存（存本机 $DSH_HOME/tikhub-api/settings.json，不会上传）。现在可以回「调用历史」发起真实调用。')
    } catch (e) { setError(e.message) }
  }
  const clear = async () => {
    setError(''); setMsg('')
    try {
      const d = await fetch(BASE + '/api/config', { method: 'DELETE' }).then(r => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setMsg('已清除本机保存的 token。')
    } catch (e) { setError(e.message) }
  }
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚙️ TikHub token'),
      info === null ? h('div', { style: styles.muted }, '加载中…')
        : h('div', { style: styles.muted },
            info.configured ? `已配置 ✓（${info.tokenMasked}）` : '未配置。粘贴下面并保存，即可真实调用。'),
      h('input', { type: 'password', placeholder: 'TikHub token（sk-... 或用户中心 token）', value: token, onChange: (e) => setToken(e.target.value), style: { ...styles.search, marginBottom: 8 } }),
      h('div', { style: styles.row },
        h('button', { style: styles.button, onClick: save }, '保存'),
        info?.configured ? h('button', { style: styles.tab, onClick: clear }, '清除已存') : null),
      msg ? h('div', { style: styles.ok }, msg) : null,
      error ? h('div', { style: styles.error }, error) : null,
      h('div', { style: { ...styles.muted, fontSize: 12, lineHeight: 1.8 } },
        '获取：api.tikhub.io 用户中心 → API Token。密钥只存本机（$DSH_HOME/tikhub-api/settings.json），任何接口不回显明文。')))
}

const TABS = [['calls', '调用历史'], ['endpoints', '端点库'], ['settings', '⚙️ 设置'], ['guide', '指南']]

function Panel() {
  const [tab, setTab] = useState('calls')
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => setTab(id),
      }, label))),
    tab === 'calls' ? h(CallsTab) : tab === 'endpoints' ? h(EndpointsTab) : tab === 'settings' ? h(SettingsTab) : h(GuideTab))
}

const styles = {
  ok: { color: '#1a7f37', marginTop: 6 },
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #1d3557', borderRadius: 8, background: '#e8eef7', color: '#1d3557', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10 },
  sectionTitle: { fontWeight: 700, marginBottom: 6 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e8eef7', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#1d3557' },
  muted: { color: '#8a8a92', lineHeight: 1.8 },
  mutedSmall: { color: '#a0a0a8', fontSize: 11.5, lineHeight: 1.7 },
  error: { color: '#c0392b', padding: 12 },
  search: { width: '100%', boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d9d9de', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  path: { fontFamily: 'Consolas, monospace', fontSize: 12, color: '#1d3557', wordBreak: 'break-all' },
  note: { background: '#e8eef7', color: '#1d3557', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => 'TikHub API' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
