# C++ Classroom

浏览器 C++ 编程教室。技术栈为 Vue 3、TypeScript、shadcn-vue、PostgreSQL 与 go-judge。当前包含原生基础工程和可点击的完整前端设计原型；后端仍仅提供基础设施与健康检查，不包含课堂业务。

全部使用原生进程。数据库数据留在项目 `.local/`，go-judge 单独部署到原生 Linux 节点。

## 本地启动

只预览 UI，无需启动数据库、API 或执行节点：

```sh
pnpm install
pnpm --filter @classroom/web dev
```

打开 <http://127.0.0.1:5173> 查看教师总览；<http://127.0.0.1:5173/guide> 汇集所有页面入口。端口占用时可使用 `pnpm --filter @classroom/web dev --port 5174`。左下角账号菜单可切换教师、学生与管理员演示视角。

前端提供课堂、练习、名册、巡视、只读快照、投屏、登录入班与必要管理页面。Monaco 支持本机代码编辑；题目配置和演示状态保存到浏览器，并在同源窗口间同步。人物、日志、在线状态均为明确标注的示例，运行入口只播放固定场景，**不执行当前代码**。详见 [UI 设计说明](docs/ui-design.md)。

- 教师授课：<http://127.0.0.1:5173/teacher/teach>，提供 PPT 式题面／样例、示范代码和对照布局；可打开独立巡视窗口，再为每位学生打开详情窗口。浏览器需要允许本站弹窗。
- 题目编辑：从练习管理进入独立编辑页，支持 Markdown 实时预览、样例与初始代码，并为每题指定不同的 `.cpp`／`.cc`／`.cxx` 文件名。
- 学生目录：在桌面 Chrome／Edge 的学生工作区点击“选择工作目录”，明确授权后读写真实本地文件。编辑后约 750 ms 自动写入，每 2 秒检查外部修改；已有同名文件和两侧修改会先展示版本选择。目录句柄保存在 IndexedDB，刷新后可能需要重新授权。不支持目录接口时继续使用浏览器草稿与源文件下载。
- C++ 语言服务：统一 `CodeEditor` 底部提供独立的 clangd 开关，默认关闭。开启后在浏览器 SharedWorker 内运行 WASM，提供 C++17 补全、悬浮说明和实时错误提示；首次按需加载约 75 MB 静态资源。需要支持 WebAssembly JSPI、SharedWorker 和 Web Locks 的新版桌面 Chrome／Edge。详见 [浏览器 clangd](docs/browser-clangd.md)。
- 平台配置：<http://127.0.0.1:5173/admin/settings>，独立配置执行节点、运行限额和平台策略，保存与导出本机草稿；通过已有 API 读取真实 API／PostgreSQL／go-judge 健康结果。草稿不会修改服务器配置或 `.env`。

运行原生基础设施：

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

首次迁移只创建运维审计表 `audit_events`；身份认证、课堂、草稿及不可变 Run 数据模型会随功能迁移加入。队列自行管理独立 `pgboss` schema。前端原型数据与业务 API 分离，位于 `apps/web/src/data/demo.ts`。学生 IDE 沿用用户指定的 [IDE 布局参考](docs/ide-reference.md)。

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

当前已提供 Monaco 编辑与前端交互原型，尚未实现真实登录、课堂权限、教师实时同步、学生编译运行接口或交互 EOF。界面中的成功、失败、输入、EOF、停止均为明确标注的固定交互示例。运行引擎、权限与 50 人容量仍需后续独立验证。认证接入前仅在可信本地网络运行此开发工程。

需求与选型说明保留在仓库根目录。用户约束与工程规范见 [AGENTS.md](AGENTS.md)。
