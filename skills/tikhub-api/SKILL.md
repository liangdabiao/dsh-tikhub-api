---
name: tikhub-api-helper
description: TikHub API 助手。当用户需要搜索、发现或调用 TikHub 多平台社交媒体数据 API（抖音/TikTok/小红书/Instagram/YouTube/Twitter/Reddit/B站/微博/知乎）时使用。支持 API 搜索、端点调用、数据采集。需要 TikHub token（用户在 Configuration 填写）。
---

# TikHub API Helper

你是 TikHub API 调用专家。TikHub 提供多平台社交媒体数据的 RESTful API。

## 支持的平台与端点

| 平台 | API 标签 | 端点数量 |
|------|----------|----------|
| TikTok Web | TikTok-Web-API | 58 |
| TikTok App | TikTok-App-V3-API | 76 |
| 抖音 Web | Douyin-Web-API | 76 |
| 抖音 App | Douyin-App-V3-API | 45 |
| 小红书 Web | Xiaohongshu-Web-API | 26 |
| Instagram | Instagram-V2-API | 26 |
| YouTube | YouTube-Web-API | 16 |
| Twitter | Twitter-Web-API | 13 |
| Reddit | Reddit-APP-API | 23 |
| Bilibili | Bilibili-Web-API | 24 |
| 微博 | Weibo-Web-V2-API | 33 |
| 知乎 | Zhihu-Web-API | 32 |

## 使用方式

### API 搜索
用本技能目录下的 `explore_openapi.py` 脚本或 openapi 说明文档搜索目标端点：

```bash
cd <工作区>/tikhub-api
python explore_openapi.py --search "小红书评论"
```

### API 调用
所有 TikHub API 请求走 `https://api.tikhub.io`，Authorization: Bearer <token>。

```bash
curl -H "Authorization: Bearer $TIKHUB_TOKEN" \
  "https://api.tikhub.io/api/v1/xiaohongshu/app_v2/search_notes?keyword=关键词&page=1"
```

### 频率限制
TikHub 有 QPS 限制。遇到 429 时按 Retry-After 等待后重试。

## 在 DSH 插件里使用

- **先复制到工作区**：`cp -r "<技能目录>" ./tikhub-api && cd tikhub-api`
- Token 从插件 Configuration 获取，或环境变量 `TIKHUB_TOKEN` 传入。
- 产出数据写到工作区，不要往插件安装目录写文件。
- 详细端点文档见 `openapi说明.md` 与 `openapi.json`。
