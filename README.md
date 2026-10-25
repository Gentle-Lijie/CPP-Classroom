# C++ Classroom

浏览器 C++ 编程教室的基础工程。已确定 Vue 3、TypeScript、shadcn-vue、PostgreSQL 与 go-judge；当前只交付工程框架、开发环境、API 健康检查、数据库迁移和任务工作者。前端是验证组件集成的启动占位页，暂不实现 IDE 或课堂业务。

全部使用原生进程。数据库数据留在项目 `.local/`，go-judge 单独部署到原生 Linux 节点。

## 本地启动

需要 Node.js 24、pnpm 11.20.0、PostgreSQL 17+ 服务端工具。macOS 可执行 `brew install postgresql@17`；Linux 安装发行版对应 PostgreSQL 服务端，不要以 root 运行本项目开发脚本。

```sh
pnpm install
pnpm setup:local
pnpm dev
```

`setup:local` 会生成带随机本地数据库密码的 `.env`，初始化项目独立 PostgreSQL 数据目录，启动 `127.0.0.1:55432`，构建共享包并执行迁移。重复执行保留配置和数据；不会启动 Homebrew 全局数据库服务。已有端口冲突或配置不匹配会报错，不会接管其他实例。

- 前端：<http://127.0.0.1:5173>
- API 存活检查：<http://127.0.0.1:3000/api/health>
- 依赖就绪检查：<http://127.0.0.1:3000/api/health/readiness>
- 停止开发进程：在 `pnpm dev` 终端按 Ctrl+C。
- 停止项目数据库：`pnpm pg:stop`；重启：`pnpm pg:start`；查询状态：`pnpm pg:status`。

端口可在 `.env` 修改。修改 API 端口时同时调整 `VITE_API_TARGET`。更换数据库用户名、密码或端口后应手动迁移现有实例配置，脚本不会静默重建数据。

使用已有 PostgreSQL 时，先运行 `pnpm env:init`，修改 `DATABASE_URL`，再运行 `pnpm build:packages` 和 `pnpm db:migrate`；跳过 `setup:local` 和 `pg:*`。所有包读取仓库根目录 `.env`，CI／生产环境注入的同名变量优先。

## 目录

```text
apps/web                Vue + Vite + shadcn-vue + Tailwind CSS
apps/api                NestJS，/api/health 与依赖检查
apps/worker             pg-boss 原生工作者，目前仅处理自检任务
packages/contracts      前后端共享响应类型和队列名称
packages/config         环境变量加载、验证与敏感值保护
packages/database       Drizzle schema、迁移和 PostgreSQL 连接池
scripts                 本地环境、原生 PostgreSQL 与 go-judge 下载脚本
infra/go-judge          原生 Linux 配置、systemd 模板与部署说明
.github/workflows       原生 Node/PostgreSQL 的 CI
```

首次迁移只创建运维审计表 `audit_events`；身份认证、课堂、草稿及不可变 Run 数据模型会随功能迁移加入。队列自行管理独立 `pgboss` schema。前端保留启动占位页，不提供虚构的课堂数据。用户提供的洛谷 IDE 截图与后续布局约定见 [IDE 参考](docs/ide-reference.md)，当前不实现编辑器和运行交互。

## 常用检查

```sh
pnpm check          # 类型、ESLint、Prettier
pnpm test           # 环境验证与 HTTP 健康接口测试
pnpm build          # 共享包、前端、API 和 worker 生产构建
pnpm db:generate    # 修改数据库 schema 后生成需要审查、提交的迁移
pnpm db:migrate     # 应用已提交迁移
pnpm queue:probe    # dev/worker 运行时验证入队、处理与审计写入
```

构建后分别用 `pnpm --filter @classroom/api start` 和 `pnpm --filter @classroom/worker start` 运行 Node 进程。前端构建产物为 `apps/web/dist`，生产环境用原生反向代理服务静态文件，并把 `/api` 转发到 API；Vite 开发代理不作为生产代理。

添加 shadcn-vue 组件：`pnpm dlx shadcn-vue@2.8.2 add <组件名> --cwd apps/web`。生成的组件源码归项目管理，提交生成文件、依赖变更和锁文件。

## 执行节点与当前边界

见 [原生 go-judge 部署说明](infra/go-judge/README.md)。macOS 可开发前端、API 和数据库；正式运行隔离必须在 Linux 验证。`GO_JUDGE_URL` 留空时依赖检查返回 `unconfigured`，不阻断 API 和数据库开发。健康接口不返回凭据，执行节点故障不会让业务 API 的存活检查失败。

当前没有实现 IDE、登录、课堂权限、学生运行接口或交互 EOF。Monaco、实时草稿同步和执行网关在相应功能阶段接入。认证接入前仅在可信本地网络运行此开发工程。

需求与选型说明保留在仓库根目录。用户约束与工程规范见 [AGENTS.md](AGENTS.md)。
