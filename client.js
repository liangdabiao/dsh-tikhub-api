// ============================================================================
// TikHub API 助手 · 浏览器半边（调研工作台）。
// 布局对齐「投资尽调」：🏠 概览 / 📋 调研历史 / 🔎 端点库 / ⚙️ 设置 / 📖 指南。
// 按钮怎么工作：点击 → startPrompt(prompt) → 宿主 uiWorkspace.startSession(...)
// → 打开新对话并把指令填进输入框（不自动发送）。
// ============================================================================
const h = require('react').createElement
const { useState, useEffect } = require('react')

const PANEL_ID = 'tikhub-api'
const BASE = 'tikhub-api'

let startPrompt = null
function act(prompt) {
  if (startPrompt) startPrompt(prompt)
}

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

const vlabel = (v) => {
  const s = String(v || '').trim()
  return s ? 'V' + s.replace(/^[Vv]/, '') : 'V?'
}

const SOURCE_LABEL = { panel: '面板已保存', config: '插件 Config', env: 'TIKHUB_TOKEN 环境变量', none: '未配置' }

function statusText(r) {
  if (r.status === 'ok') return `✓ ${r.httpStatus || ''}`
  if (r.status === 'running') return '⏳ 调用中'
  return `✗ ${r.httpStatus || (r.error || '').slice(0, 30) || ''}`
}
function statusColor(r) {
  return r.status === 'ok' ? '#1a7f37' : r.status === 'running' ? '#b58a00' : '#c0392b'
}

// ---------------------------------------------------------------------------
// 🏠 概览
// ---------------------------------------------------------------------------
const QUICK = [
  { icon: '📕', label: '小红书关键词调研', prompt: '帮我调研小红书「」关键词下的爆款笔记：先 tikhub_endpoint 找端点，再 tikhub_call 调用，按点赞排序汇总。' },
  { icon: '🎵', label: '抖音账号分析', prompt: '分析这个抖音账号最近的作品数据：先用 tikhub_endpoint 找用户作品端点，再 tikhub_call 调用并汇总。账号：' },
  { icon: '💬', label: '评论与卖点洞察', prompt: '抓取这条小红书笔记的评论并做情感与卖点分析：先 tikhub_endpoint 找评论端点，再 tikhub_call 调用。笔记链接：' },
]

function HomeTab(props) {
  const [stats, setStats] = useState(null)
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    Promise.all([fetchJson('/api/stats'), fetchJson('/api/calls')])
      .then(([s, c]) => { setStats(s); setCalls(c.calls) })
      .catch((e) => setError(e.message))
  }, [])
  if (error) return h('div', { style: styles.error }, error)
  const recent = (calls || []).slice(0, 5)
  return h('div', null,
    h('div', { style: styles.ctaCard },
      h('div', { style: styles.ctaText },
        h('div', { style: styles.ctaTitle }, '把社媒数据变成可复用的调研'),
        h('div', { style: styles.ctaMuted }, '点右边的按钮 → 打开新对话，输入框已填好示例；换成你的关键词/账号回车即可。')),
      h('button', {
        style: styles.ctaButton,
        onClick: () => act('帮我调研小红书上的「防晒衣」爆款笔记：先 tikhub_endpoint 找端点，再 tikhub_call 调用并汇总。'),
        title: '填进对话：帮我调研小红书上的「防晒衣」爆款笔记',
      }, '🚀 发起新调研')),

    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '工作台'),
      h('div', { style: styles.statGrid },
        h('div', { style: styles.stat }, h('div', { style: styles.statNum }, stats ? String(stats.total) : '—'), h('div', { style: styles.mutedSmall }, '调研次数')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: '#1a7f37' } }, stats ? String(stats.ok) : '—'), h('div', { style: styles.mutedSmall }, '成功')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: '#c0392b' } }, stats ? String(stats.error) : '—'), h('div', { style: styles.mutedSmall }, '失败')),
        h('div', { style: styles.stat }, h('div', { style: styles.statNum }, stats ? String(stats.today) : '—'), h('div', { style: styles.mutedSmall }, '今日')),
        h('div', { style: styles.stat }, h('div', { style: { ...styles.statNum, color: stats?.configured ? '#1a7f37' : '#b58a00' } }, stats ? (stats.configured ? '✓' : '!') : '—'), h('div', { style: styles.mutedSmall }, 'Token'))),
      !stats?.configured ? h('div', { style: styles.hint }, '还没配置 TikHub token：去「⚙️ 设置」粘贴即可真实调用（或设 TIKHUB_TOKEN 环境变量）。') : null),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '常用调研'),
        h('span', { style: styles.grow }),
        h('span', { style: styles.mutedSmall }, '点一下 → 填进对话')),
      h('div', { style: styles.quickList },
        QUICK.map((q) => h('button', { key: q.label, style: styles.quick, onClick: () => act(q.prompt), title: `填进对话：${q.prompt}` },
          h('span', { style: styles.quickIcon }, q.icon), q.label)))),

    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('div', { style: styles.sectionTitle }, '最近调研'),
        h('span', { style: styles.grow }),
        h('button', { style: styles.linkBtn, onClick: () => props.go('history') }, '查看全部 →')),
      recent.length === 0
        ? h('div', { style: styles.muted }, '还没有调研记录。发起一次调研后，这里会按时间列出每次调用。')
        : recent.map((r) => h('div', { key: r.id, style: styles.callRow, onClick: () => props.open(r) },
          h('span', { style: { ...styles.status, color: statusColor(r) } }, statusText(r)),
          h('span', { style: styles.callPath }, r.path),
          h('span', { style: styles.mutedSmall }, r.note || fmtTime(r.ts))))))
}

// ---------------------------------------------------------------------------
// 📋 调研历史
// ---------------------------------------------------------------------------
function HistoryTab(props) {
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(props.pending || null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = () => fetchJson('/api/calls').then((d) => setCalls(d.calls)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const remove = async (id) => {
    try {
      await fetch(BASE + '/api/calls/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      if (selected?.id === id) setSelected(null)
      await load()
    } catch (e) { setError(e.message) }
  }
  const clearAll = async () => {
    try {
      await fetch(BASE + '/api/calls/clear', { method: 'POST' })
      setSelected(null); setConfirmClear(false); await load()
    } catch (e) { setError(e.message) }
  }

  if (error) return h('div', { style: styles.error }, error)
  if (calls === null) return h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? calls.filter((r) => `${r.path} ${r.note || ''} ${JSON.stringify(r.params || {})}`.toLowerCase().includes(q))
    : calls

  return h('div', null,
    selected ? h('div', { style: styles.detailCard },
      h('div', { style: styles.row },
        h('span', { style: { ...styles.status, color: statusColor(selected) } }, statusText(selected)),
        h('span', { style: styles.callPath }, selected.path),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: () => act(`再调用一次这个端点：${selected.path}\n参数：${JSON.stringify(selected.params || {})}${selected.note ? `\n用途：${selected.note}` : ''}`) }, '🔁 再调一次'),
        h('button', { style: styles.actionBtn, onClick: () => remove(selected.id) }, '🗑 删除'),
        h('button', { style: styles.linkBtn, onClick: () => setSelected(null) }, '关闭')),
      h('div', { style: styles.mutedSmall }, `${fmtTime(selected.ts)} · GET · ${selected.ms != null ? `${selected.ms}ms` : '—'}${selected.note ? ` · ${selected.note}` : ''}`),
      Object.keys(selected.params || {}).length ? h('pre', { style: styles.pre }, `参数\n${JSON.stringify(selected.params, null, 2)}`) : null,
      selected.error ? h('div', { style: styles.errorBox }, selected.error) : null,
      selected.responseSnippet
        ? h('pre', { style: styles.pre }, selected.responseSnippet)
        : h('div', { style: styles.muted }, '这条记录没有响应片段（旧记录或请求失败）。完整数据以工作区文件为准。')) : null,

    h('div', { style: styles.row },
      h('input', { style: styles.search, placeholder: '搜索路径 / 参数 / 用途…', value: query, onChange: (e) => setQuery(e.target.value) }),
      h('button', { style: styles.actionBtn, onClick: () => act('帮我调研小红书上的「防晒衣」爆款笔记：先 tikhub_endpoint 找端点，再 tikhub_call 调用并汇总。') }, '🚀 新调研')),
    h('div', { style: styles.row },
      h('span', { style: styles.mutedSmall }, `共 ${calls.length} 条${q ? `，匹配 ${filtered.length} 条` : ''}`),
      h('span', { style: styles.grow }),
      confirmClear
        ? h('span', null,
            h('button', { style: styles.dangerBtn, onClick: clearAll }, '确认清空'),
            h('button', { style: styles.linkBtn, onClick: () => setConfirmClear(false) }, '取消'))
        : h('button', { style: styles.linkBtn, onClick: () => setConfirmClear(true) }, '清空历史')),

    filtered.length === 0
      ? h('div', { style: styles.card },
          h('div', { style: styles.muted }, calls.length ? '没有匹配的调研记录。' : '还没有调研历史。点「🚀 新调研」把指令填进对话，或在对话里说「搜一下小红书上的…」。'))
      : filtered.map((r) => h('div', { key: r.id, style: styles.card, onClick: () => setSelected(r) },
          h('div', { style: styles.row },
            h('span', { style: { ...styles.status, color: statusColor(r) } }, statusText(r)),
            r.ms != null ? h('span', { style: styles.mutedSmall }, `${r.ms}ms`) : null,
            h('span', { style: styles.mutedSmall }, fmtTime(r.ts)),
            r.note ? h('span', { style: styles.note }, r.note) : null,
            r.responseSnippet ? h('span', { style: styles.tag }, '可读响应') : null),
          h('div', { style: styles.callPath }, `GET ${r.path}`),
          Object.keys(r.params || {}).length ? h('div', { style: styles.mutedSmall }, `参数 ${JSON.stringify(r.params)}`) : null)))
}

// ---------------------------------------------------------------------------
// 🔎 端点库
// ---------------------------------------------------------------------------
function EndpointsTab() {
  const [endpoints, setEndpoints] = useState(null)
  const [spec, setSpec] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [query, setQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const load = () => fetchJson('/api/endpoints')
    .then((d) => { setEndpoints(d.endpoints); setSpec(d.spec) })
    .catch((e) => setError(e.message))
  useEffect(() => { load() }, [])
  const sync = async () => {
    setSyncing(true); setError(''); setMsg('')
    try {
      const d = await fetch(BASE + '/api/openapi/refresh', { method: 'POST' }).then((r) => r.json())
      if (d.error) throw new Error(d.error)
      setMsg(`已同步线上 OpenAPI：${vlabel(d.version)} · ${d.paths} 条路径`)
      await load()
    } catch (e) { setError(e.message) } finally { setSyncing(false) }
  }
  if (error && endpoints === null) return h('div', { style: styles.error }, error)
  if (endpoints === null) return h('div', { style: styles.muted }, '加载中…')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? endpoints.filter((e) => `${e.path} ${e.summary || ''} ${(e.samples || []).join(' ')}`.toLowerCase().includes(q))
    : endpoints
  const specLine = spec
    ? `线上 OpenAPI ${vlabel(spec.version)} · ${spec.paths} 条路径${spec.fetchedAt && spec.fetchedAt !== '本地快照' ? ` · 同步于 ${fmtTime(spec.fetchedAt)}` : ' · 本地快照（建议同步线上）'}`
    : '未同步线上 OpenAPI（当前仅技能文档，路径可能过期）'

  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: styles.sectionTitle }, '🔎 端点库'),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: sync, disabled: syncing }, syncing ? '同步中…' : '🔄 同步线上 OpenAPI')),
      h('div', { style: styles.mutedSmall }, specLine),
      msg ? h('div', { style: styles.ok }, msg) : null,
      error ? h('div', { style: styles.error }, error) : null,
      spec && !spec.fetchedAt?.includes('T') ? h('div', { style: styles.hint }, '本地 openapi.json 是随技能分发的快照，可能落后；点「同步线上 OpenAPI」以线上为准。') : null),
    h('input', { style: styles.search, placeholder: '搜索端点，如「xiaohongshu」「search_notes」「douyin」…', value: query, onChange: (e) => setQuery(e.target.value) }),
    h('div', { style: styles.mutedSmall, marginBottom: 8 }, `共 ${endpoints.length} 个端点${q ? `，匹配 ${filtered.length} 个` : ''}`),
    filtered.map((e) => h('div', { key: e.path, style: styles.card },
      h('div', { style: styles.row },
        h('span', { style: styles.callPath }, e.path),
        e.source === 'openapi' ? h('span', { style: styles.tag }, '线上') : h('span', { style: styles.warnTag }, e.stale ? '文档·线上未收录' : '文档'),
        h('span', { style: styles.grow }),
        h('button', { style: styles.actionBtn, onClick: () => act(`用 tikhub_call 调用 ${e.path}，参数：`) }, '用这个调研')),
      e.summary ? h('div', { style: styles.mutedSmall }, e.summary) : null,
      (e.samples || []).map((s, i) => h('div', { key: i, style: styles.mutedSmall }, s)),
      (e.docs || []).length ? h('div', { style: styles.mutedSmall }, `来源：${e.docs.join('、')}`) : null)))
}

// ---------------------------------------------------------------------------
// ⚙️ 设置
// ---------------------------------------------------------------------------
function SettingsTab() {
  const [info, setInfo] = useState(null)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const load = () => fetchJson('/api/config').then(setInfo).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(''); setMsg('')
    if (!token.trim()) { setError('先粘贴 TikHub token。'); return }
    try {
      const d = await fetch(BASE + '/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tikhubToken: token.trim() }) }).then((r) => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setToken('')
      setMsg('已保存（存本机 $DSH_HOME/tikhub-api/settings.json，不会上传）。现在可以发起真实调用。')
    } catch (e) { setError(e.message) }
  }
  const clear = async () => {
    setError(''); setMsg('')
    try {
      const d = await fetch(BASE + '/api/config', { method: 'DELETE' }).then((r) => r.json())
      if (d.error) throw new Error(d.error)
      setInfo(d.credentials); setMsg('已清除本机保存的 token。')
    } catch (e) { setError(e.message) }
  }

  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '⚙️ TikHub token'),
      info === null ? h('div', { style: styles.muted }, '加载中…')
        : h('div', { style: styles.muted },
            info.configured ? `已配置 ✓（${info.tokenMasked}）· 来源：${SOURCE_LABEL[info.source] || info.source || '面板'}` : '未配置。粘贴下面并保存，即可真实调用。'),
      h('input', { type: 'password', placeholder: 'TikHub token（sk-... 或用户中心 token）', value: token, onChange: (e) => setToken(e.target.value), style: styles.search }),
      h('div', { style: styles.row },
        h('button', { style: styles.button, onClick: save }, '保存'),
        info?.configured ? h('button', { style: styles.tab, onClick: clear }, '清除已存') : null),
      msg ? h('div', { style: styles.ok }, msg) : null,
      error ? h('div', { style: styles.error }, error) : null,
      h('div', { style: styles.mutedSmall },
        '获取：api.tikhub.io 用户中心 → API Token。密钥只存本机，任何接口不回显明文。调用按 TikHub 计费规则消耗点数。')))
}

// ---------------------------------------------------------------------------
// 📖 指南
// ---------------------------------------------------------------------------
function GuideTab() {
  return h('div', null,
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '怎么用'),
      h('div', { style: styles.stepList },
        h('div', { style: styles.quote }, '「搜一下小红书上「防晒衣」的爆款笔记」'),
        h('div', { style: styles.quote }, '「拉取这个抖音用户的最近 10 条视频」'),
        h('div', { style: styles.quote }, '「TikTok 搜 #kitchen gadget 的热门视频」'),
        '模型先调 tikhub_endpoint 找端点，再 tikhub_call 真实调用，结果自动进「调研历史」。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '调用返回 404 / 路径过期怎么办'),
      h('div', { style: styles.stepList },
        '技能文档里的 web 路径可能已下线（例如 xiaohongshu/web/search_notes 已不存在，实际用 app_v2/search_notes）。按这个顺序排查：',
        h('div', { style: styles.quote }, '1. tikhub_endpoint action=openapi  → 同步线上 OpenAPI'),
        h('div', { style: styles.quote }, '2. tikhub_endpoint action=search keyword=search_notes  → 用线上路径'),
        h('div', { style: styles.quote }, '3. tikhub_call 用 spec 里的完整路径重试'),
        'tikhub_call 遇到 404 会自动从线上 spec 里列出相近端点。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '3 个工具'),
      h('div', { style: styles.muted, lineHeight: 2 },
        h('b', null, 'tikhub_endpoint'), ' — 端点索引：list/search 以线上 OpenAPI 为准；openapi 同步线上 spec。',
        h('br'), h('b', null, 'tikhub_call'), ' — 真实 GET 调用（需配置 token），自动入调研历史，404 给替代路径。',
        h('br'), h('b', null, 'tikhub_history'), ' — 列表 / 详情 / 删除 / 清空调研历史。')),
    h('div', { style: styles.card },
      h('div', { style: styles.sectionTitle }, '前置条件'),
      h('div', { style: styles.muted, lineHeight: 1.8 },
        '在「⚙️ 设置」粘贴 TikHub token（api.tikhub.io 用户中心获取），或设 TIKHUB_TOKEN 环境变量。',
        h('br'), '调用按 TikHub 计费规则消耗点数，批量抓取前先确认额度。')))
}

// ---------- 主面板 ----------
const TABS = [
  ['home', '🏠 概览'],
  ['history', '📋 调研历史'],
  ['endpoints', '🔎 端点库'],
  ['settings', '⚙️ 设置'],
  ['guide', '📖 指南'],
]

function Panel() {
  const [tab, setTab] = useState('home')
  const [pending, setPending] = useState(null)
  const openFromHome = (call) => { setPending(call); setTab('history') }
  const go = (id) => { setPending(null); setTab(id) }
  return h('div', { style: styles.wrap },
    h('div', { style: styles.tabBar },
      TABS.map(([id, label]) => h('button', {
        key: id, style: tab === id ? styles.tabActive : styles.tab, onClick: () => { setPending(null); setTab(id) },
      }, label))),
    tab === 'home' ? h(HomeTab, { go, open: openFromHome })
      : tab === 'history' ? h(HistoryTab, { pending })
        : tab === 'endpoints' ? h(EndpointsTab)
          : tab === 'settings' ? h(SettingsTab)
            : h(GuideTab))
}

const styles = {
  wrap: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', fontSize: 13, color: '#1a1a1a' },
  tabBar: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  tab: { padding: '8px 16px', border: '1px solid #d9d9de', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer', fontSize: 13 },
  tabActive: { padding: '8px 16px', border: '1px solid #1d3557', borderRadius: 8, background: '#e8eef7', color: '#1d3557', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  grow: { flex: 1 },
  card: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 10, padding: 12, marginBottom: 10, cursor: 'default' },
  detailCard: { background: '#f7fafc', border: '1px solid #cfe0ee', borderRadius: 10, padding: 12, marginBottom: 12 },
  ctaCard: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', background: '#e8eef7', border: '1px solid #cfe0ee', borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  ctaText: { flex: 1, minWidth: 200 },
  ctaTitle: { fontWeight: 700, color: '#1d3557', marginBottom: 4 },
  ctaMuted: { color: '#5a7591', lineHeight: 1.7, fontSize: 12.5 },
  ctaButton: { padding: '10px 20px', border: 'none', borderRadius: 10, background: '#1d3557', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 2px 6px rgba(29,53,87,.25)' },
  actionBtn: { padding: '5px 12px', border: '1px solid #cfe0ee', borderRadius: 8, background: '#f4f9ff', color: '#1d3557', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  dangerBtn: { padding: '5px 12px', border: '1px solid #e7b4b4', borderRadius: 8, background: '#fdf2f2', color: '#c0392b', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  linkBtn: { padding: '4px 8px', border: 'none', background: 'transparent', color: '#1d3557', cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline' },
  button: { padding: '6px 14px', border: 'none', borderRadius: 8, background: '#1d3557', color: '#fff', cursor: 'pointer', fontSize: 13 },
  sectionTitle: { fontWeight: 700, marginBottom: 6, color: '#1d3557' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 6 },
  stat: { background: '#f7fafc', borderRadius: 8, padding: '8px 6px', textAlign: 'center' },
  statNum: { fontSize: 18, fontWeight: 800, color: '#1d3557' },
  hint: { background: '#fff8e6', border: '1px solid #f0dca8', borderRadius: 8, padding: '8px 10px', color: '#8a6d1a', fontSize: 12, lineHeight: 1.7, marginTop: 6 },
  quickList: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  quick: { display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 12px', border: '1px solid #cfe0ee', borderRadius: 999, background: '#f4f9ff', color: '#1d3557', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 },
  quickIcon: { fontSize: 14 },
  callRow: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f2f5', cursor: 'pointer' },
  callPath: { fontFamily: 'Consolas, monospace', fontSize: 12, color: '#1d3557', wordBreak: 'break-all' },
  status: { fontWeight: 700, fontSize: 12, minWidth: 52 },
  note: { background: '#e8eef7', color: '#1d3557', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  tag: { background: '#e7f6ec', color: '#1a7f37', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  warnTag: { background: '#fff6e0', color: '#8a6d1a', borderRadius: 4, padding: '1px 6px', fontSize: 11 },
  muted: { color: '#8a8a92', lineHeight: 1.8 },
  hint: { background: '#fff8e6', border: '1px solid #f0dca8', borderRadius: 8, padding: '8px 10px', color: '#8a6d1a', fontSize: 12, lineHeight: 1.7, marginTop: 6 },
  mutedSmall: { color: '#a0a0a8', fontSize: 11.5, lineHeight: 1.7 },
  ok: { color: '#1a7f37', marginTop: 6 },
  error: { color: '#c0392b', padding: 12 },
  errorBox: { background: '#fdf2f2', border: '1px solid #e7b4b4', borderRadius: 8, padding: '8px 10px', color: '#c0392b', fontSize: 12, marginTop: 8 },
  search: { flex: 1, minWidth: 180, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d9d9de', borderRadius: 8, fontSize: 13, marginBottom: 10 },
  pre: { background: '#0f172a', color: '#d7e3f4', borderRadius: 8, padding: 10, fontSize: 11.5, lineHeight: 1.6, overflow: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 },
  stepList: { lineHeight: 1.9 },
  quote: { background: '#e8eef7', borderRadius: 6, padding: '4px 10px', margin: '4px 0', color: '#1d3557' },
}

function apply(ctx) {
  // 启动打点：证明浏览器半边被宿主真正 apply（宿主写 client-boot.log），面板自查用。
  try { fetch(BASE + '/api/health').catch(() => {}) } catch { /* 老宿主无 fetch 也不影响面板 */ }
  startPrompt = (prompt) => {
    try {
      ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
    } catch (err) {
      console.error('[tikhub-api] 开新对话失败', err)
      alert('开新对话失败：' + ((err && err.message) || err))
    }
  }
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 15, label: () => 'TikHub 调研' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}

exports.isPlugin = true
exports.inject = ['slots', 'uiWorkspace']
exports.apply = apply
