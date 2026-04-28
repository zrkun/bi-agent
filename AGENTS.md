---
inclusion: always
---

# AGENT 执行规范

本文件定义当前仓库的执行约束。仓库是一个 pnpm monorepo，前端使用 Next.js SSR，后端使用 FastAPI。执行时优先保持简单、改动可验证，并以当前仓库结构为准。

## 1. 项目结构

```text
apps/
  web/      # Next.js 16 + React 19 + TypeScript
  api/      # FastAPI + uv
packages/
  shared/   # 共享代码占位
```

## 2. 技术栈

- Monorepo: `pnpm` workspaces，配置在 `pnpm-workspace.yaml`
- Frontend: `apps/web`
  - `Next.js 16` App Router
  - `React 19`
  - `TypeScript`
  - `Tailwind CSS 4`
  - `shadcn/ui`，配置在 `apps/web/components.json`
  - `oxlint` / `oxfmt`
- Backend: `apps/api`
  - `FastAPI`
  - `uvicorn`
  - `uv` 管理 Python 依赖
  - `ruff` 负责 Python lint / format
- Shared: `packages/shared`

## 3. 包管理和命令

- Node 包管理只使用 `pnpm`，不要新增 `package-lock.json`、`yarn.lock` 或 `bun.lockb`。
- Python 依赖只使用 `uv`，依赖写入 `apps/api/pyproject.toml`，锁文件为 `apps/api/uv.lock`。
- 不手动使用全局 `pip install` 管理本项目依赖。

常用命令：

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm lint
pnpm lint:web
pnpm lint:api
pnpm format
pnpm format:check
pnpm build
uv sync --project apps/api
uv run --project apps/api python -c "from app.main import app; print(app.title)"
```

## 4. 前端约定

- 页面和布局位于 `apps/web/src/app/**`。
- shadcn/ui 组件位于 `apps/web/src/components/ui/**`。
- 工具函数位于 `apps/web/src/lib/**`。
- 导入优先使用 `@/` 别名。
- 样式优先使用 Tailwind utility 和 shadcn 语义 token，例如 `bg-background`、`text-muted-foreground`、`border-border`。
- 新增通用 UI 时优先使用 shadcn/ui 组件；缺组件时用 `pnpm dlx shadcn@latest add <component>` 添加。
- 避免无必要添加 `"use client"`。只有使用浏览器 API、事件处理、状态或 effect 时才创建客户端组件。
- 浏览器侧调用后端优先请求 Next API Route `/api/*`；该层在服务端调用 FastAPI。服务端组件取数优先使用 `@/lib/api` 中的 helper。
- 不再使用 CSS module 作为默认样式方案；除非确有局部复杂样式需求，否则使用 Tailwind。

## 5. 后端约定

- 后端代码位于 `apps/api/app/**`。
- 新增 Python 依赖使用 `uv add --project apps/api <package>`。
- 新增 Python 开发依赖使用 `uv add --project apps/api --dev <package>`。
- 本地运行后端使用 `pnpm dev:api` 或 `uv run --project apps/api python -m uvicorn ...`。
- Python 代码检查使用 `pnpm lint:api`，格式化使用 `pnpm format:api`。
- API 路由保持小而清晰，返回结构化 JSON。

## 6. 验证约定

按影响范围选择验证：

- 前端格式：`pnpm format:check`
- 前端 lint：`pnpm lint`
- 后端格式：`pnpm format:api:check`
- 后端 lint：`pnpm lint:api`
- 前端构建 / 类型 / Next 行为：`pnpm build`
- 后端导入或路由：`uv run --project apps/api python -c "from app.main import app; print(app.title)"`

若没有执行某项验证，需要在结果中说明原因。

## 7. 修改原则

- 保持改动聚焦，只修改与任务直接相关的文件。
- 不清理无关代码，不做无关重构。
- 不提交生成物，例如 `.next`、`.venv`、`.DS_Store`、`*.egg-info`。
- 修改配置后同步更新相关 lockfile。
- 若需求不清楚，先说明关键分歧；风险较高时先询问。
