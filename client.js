// TikHub API 助手面板。
const h = require('react').createElement
const { useState, useEffect } = require('react')
const PANEL_ID = 'tikhub-api'
const BASE = 'tikhub-api'

function PanelIcon(props) {
  return h('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', ...props },
    h('rect', { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5, fill: '#06b6d4' }),
    h('text', { x: 12, y: 15, 'font-size': 7, 'font-weight': 'bold', fill: '#fff', 'text-anchor': 'middle' }, 'TH'))
}

function Panel() {
  const [skills, setSkills] = useState(null)
  useEffect(() => {
    fetch(BASE + '/api/skills').then(r => r.json()).then(d => setSkills(d.skills)).catch(() => {})
  }, [])
  return h('div', { style: { padding: 16, overflow: 'auto', height: '100%', fontFamily: 'sans-serif', fontSize: 13 } },
    h('div', { style: { fontWeight: 700, marginBottom: 8, color: '#06b6d4' } }, 'TikHub API 助手'),
    h('div', { style: { color: '#666', marginBottom: 12 } }, '多平台社交媒体数据 API（抖音/TikTok/小红书/Instagram/YouTube/Twitter/Reddit）的搜索与调用。需 TikHub token。'),
    skills?.map(s => h('div', { key: s.name, style: { background: '#fff', border: '1px solid #e3e3e6', borderRadius: 8, padding: 10, marginBottom: 6 } },
      h('div', { style: { fontWeight: 600, color: '#06b6d4' } }, '/' + s.name),
      h('div', { style: { color: '#666', marginTop: 4 } }, s.description.slice(0, 150)))))
}

function apply(ctx) {
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 23, label: () => 'TikHub API' }, PanelIcon))
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: PANEL_ID }, Panel))
}
exports.isPlugin = true
exports.inject = ['slots']
exports.apply = apply
