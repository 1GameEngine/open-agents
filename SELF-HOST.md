# Open Agents 私有化部署与开发指南

本文档介绍了如何本地开发和私有化部署改造后的 Open Agents（基于 `feat/self-host` 分支）。

此版本移除了对 Vercel 专有基础设施（如 Vercel Postgres、Vercel Sandbox、Vercel Analytics）的强依赖，转而使用本地文件系统沙盒（LocalFsSandbox）、API Key 认证，并在开发环境中使用 PGlite 替代 PostgreSQL，从而实现真正的 Self-Host。

## 架构变化

1. **认证系统**：移除 OAuth 和 NextAuth，改用轻量级的 API Key（Bearer Token）认证机制。
2. **沙盒环境**：移除 Vercel 远程沙盒依赖，实现基于进程隔离的 `LocalFsSandbox`，保障基础的文件读写隔离与路径安全。
3. **Workflow 引擎**：从 `@workflow/world-vercel` 切换至 `@workflow/world-postgres`，使用标准 PostgreSQL 作为状态存储。
4. **开发数据库**：集成 `@electric-sql/pglite-socket`，在本地开发时直接使用 PGlite，无需安装完整的 PostgreSQL 服务。

---

## 快速开始（本地开发环境）

本地开发环境只需 Node.js/Bun 环境，数据库由 PGlite 自动提供。

### 1. 环境准备

确保你已经安装了 [Bun](https://bun.sh/)（推荐使用 v1.0+）。

### 2. 安装依赖

在仓库根目录执行：

```bash
bun install
```

### 3. 配置环境变量

进入 `apps/web` 目录，环境文件按“一个基线 + 少量差量”维护：

- 基线默认：`apps/web/.env`（已随仓库提供，可直接使用）
- 开发差量模板：`cp .env.dev.example .env.dev`
- 生产差量模板：`cp .env.prod.example .env.prod`

如需本地私密变量（不进 git，如 `AI_GATEWAY_API_KEY`），额外创建本地覆盖文件：

- 通用私密：`cp .env.local.example .env.local`
- 开发私密：`cp .env.dev.local.example .env.dev.local`
- 生产私密：`cp .env.prod.local.example .env.prod.local`

启动时会按以下顺序自动加载（后者覆盖前者同名变量）：
- `.env`
- `.env.dev` / `.env.prod`（按 `NODE_ENV`）
- `.env.local`
- `.env.dev.local` / `.env.prod.local`（按 `NODE_ENV`）

建议把公共默认值放 `.env`，环境差异项放 `.env.dev` / `.env.prod`，所有密钥只放在 `*.local` 文件或部署平台环境变量中。

核心环境变量说明：
- `DATABASE_URL` / `WORKFLOW_POSTGRES_URL`: 数据库连接字符串（默认连接本地 PGlite 端口 `5432`）。
- `WORKFLOW_TARGET_WORLD`: 必须设置为 `@workflow/world-postgres`。
- `AI_GATEWAY_API_KEY`: 访问 Vercel AI Gateway 的凭证。

### 4. 启动开发服务

我们提供了一个聚合脚本，可以同时启动 PGlite 数据库和 Next.js 开发服务器。

在 `apps/web` 目录下运行：

```bash
bun run dev:pglite
```

*(该命令会启动 PGlite Server 监听 5432 端口，并在后台运行 `next dev`)*

### 5. 初始化管理员与 API Key

首次启动系统后，数据库是空的。你需要运行初始化脚本来创建第一个管理员用户和对应的 API Key：

```bash
# 在 apps/web 目录下运行
bun run bootstrap
```

脚本执行成功后，会在控制台输出生成的 API Key。请妥善保存此 Key，后续调用 API 时需在 Header 中携带：
`Authorization: Bearer <YOUR_API_KEY>`

---

## 生产环境部署

在生产环境中，建议使用真正的 PostgreSQL 数据库（如 AWS RDS、Supabase 等）替代 PGlite。

### 1. 准备 PostgreSQL 数据库

创建一个 PostgreSQL 数据库，并获取连接字符串。

### 2. 生产环境变量配置

在生产环境中，需要设置以下环境变量：

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
WORKFLOW_TARGET_WORLD="@workflow/world-postgres"
WORKFLOW_POSTGRES_URL="postgres://user:password@host:5432/dbname"
AI_GATEWAY_API_KEY="your_gateway_key"
```

### 3. 构建与运行

```bash
# 构建项目（构建过程中会自动执行数据库迁移）
bun run build

# 启动生产服务器
bun start
```

### 4. 生产环境初始化

同样，在生产环境首次启动后，需要运行一次初始化脚本：

```bash
bun run bootstrap
```

---

## 常见问题

**Q: `dev:pglite` 启动失败，提示端口被占用？**
A: 请确保本地没有其他 PostgreSQL 实例或服务正在占用 `5432` 端口。如果需要更改端口，请同步修改 `package.json` 中的 `dev:pglite` 脚本以及 `.env` / `.env.dev`（或你使用的本地覆盖 env 文件）中的数据库 URL 端口。

**Q: 如何管理 API Key？**
A: 系统提供了 RESTful API 端点来管理 API Key：
- `GET /api/auth/api-keys` - 列出所有 Key
- `POST /api/auth/api-keys` - 创建新 Key
- `DELETE /api/auth/api-keys/:id` - 删除指定 Key

*(调用这些端点本身也需要提供有效的 API Key 进行鉴权)*
