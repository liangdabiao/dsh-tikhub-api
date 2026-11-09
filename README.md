# dsh-tikhub-api · TikHub 社媒调研工作台

DeepSeek Harness（dsh）插件：**TikHub 多平台社交媒体数据 API** 的搜索与调用技能（抖音/TikTok/小红书/Instagram/YouTube/Twitter/Reddit/B站/微博/知乎 12+ 平台，400+ 端点），侧栏带一个类似「投资尽调」的调研工作台。

技能来自 [tikhub_api_skill](https://github.com/liangdabiao/tikhub_api_skill)（liangdabiao）。

## 使用

需要 [TikHub](https://www.tikhub.io) token：侧栏「⚙️ 设置」里直接粘贴保存（或插件 Config / `TIKHUB_TOKEN` 环境变量）。

## 侧栏工作台

| 标签 | 内容 |
|---|---|
| 🏠 概览 | 调研次数/成功/失败/今日/Token 状态 + 常用调研（一键填进对话）+ 最近调研 |
| 📋 调研历史 | 每次调用的路径、参数、状态、耗时、响应片段；可搜索、点开看响应、删除、清空、一键「再调一次」 |
| 🔎 端点库 | 从技能文档索引 400+ API 端点，搜索 + 「用这个调研」一键填进对话 |
| ⚙️ 设置 | 面板内直配 TikHub token（显示来源：面板/Config/环境变量），明文不回显 |
| 📖 指南 | 用法示例与工具说明 |

**按钮怎么工作**：点击「发起新调研 / 用这个调研 / 再调一次」→ 打开新对话并把指令填进输入框（不自动发送），补完关键词/账号回车即可。

## 工具

- `tikhub_endpoint` — 索引/搜索 API 端点
- `tikhub_call` — 真实 GET 调用（自动入调研历史，存响应片段）
- `tikhub_history` — 列表 / 详情 / 删除 / 清空调研历史

## 安装

```bash
dsh plugin --profile web add dsh-tikhub-api
```

## 许可

MIT
