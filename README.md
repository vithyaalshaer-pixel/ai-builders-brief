# AI Builders Daily

一个基于 `follow-builders` 公共 feed 的个性化 AI 简报站。  
内容由 GitHub Actions 每天生成，页面由 Vercel 自动部署。

## 功能

- 每天北京时间 08:00 自动生成 AI Builders 简报
- 从 X 和 podcast 两类上游内容里筛出高信号动态
- 站内直接展示正文或关键片段，不需要 X 账号也能阅读精选内容
- 默认展示中文译文，并保留英文原文折叠区和原帖链接
- 通过 `config/profile.json` 控制关注主题、偏好 builders 和屏蔽项
- 生成结构化 `JSON` 产物和每天一篇 `Markdown` 简报
- GitHub 有新 commit 时，Vercel 自动重新部署

## 本地运行

```bash
npm install
npm test
npm run generate
npm run dev
```

本地生成前需要设置：

```bash
export OPENAI_API_KEY=...
export OPENAI_TRANSLATION_MODEL=...
export GOOGLE_TRANSLATE_API_KEY=...
```

首页会读取：

- `data/digests/latest.json`
- `data/digests/archive.json`
- `public/briefs/*.md`

## 个性化配置

编辑 `config/profile.json`：

- `focusAreas`：关注主题和关键词
- `favoriteBuilders`：优先加权的 builders
- `mutedBuilders`：完全屏蔽的 builders
- `mutedKeywords`：命中后直接过滤
- `maxTweetHighlights` / `maxPodcastHighlights`：每天展示上限

## 翻译配置

- `OPENAI_API_KEY`：OpenAI 主翻译引擎
- `OPENAI_TRANSLATION_MODEL`：OpenAI 翻译模型名
- `GOOGLE_TRANSLATE_API_KEY`：Google Cloud Translation API 兜底翻译

GitHub Actions 中也需要把以上 3 个值配置为 repository secrets。

## 自动更新

工作流位于 `.github/workflows/daily-digest.yml`：

- `schedule`：每天 `00:00 UTC`，即北京时间 `08:00`
- `workflow_dispatch`：支持手动触发
- 对抓取和生成自动重试 3 次
- 生成前会校验翻译 secrets 是否存在
- 有变更时自动提交 `data/digests` 和 `public/briefs`

## Vercel 部署

1. 将代码推到你自己的 GitHub 仓库。
2. 在 Vercel 中 Import 该仓库。
3. Framework Preset 选择 Next.js。
4. 首次部署完成后，后续每日 digest commit 会自动触发重新部署。

## 说明

- v1 不接数据库，不做站内编辑偏好。
- 页面不在运行时抓上游 feed，避免部署时网络波动。
- 首次创建 GitHub 仓库、配置远程和接入 Vercel 需要人工完成一次。
