# C++ Classroom

Vue 3、TypeScript、shadcn-vue、Tailwind CSS、NestJS、PostgreSQL 与原生 Linux go-judge 构成的浏览器 C++ 编程教室。当前已接通真实账号、课堂权限、题目、草稿同步、编译运行、交互输入／EOF、教师巡视、求助、不可变提交、投屏和导出。

学生代码只在独立 Linux 评测节点执行，业务 API 不执行学生程序。全部服务使用原生进程，数据库与凭据放在忽略的本地文件中。详细功能、验收和边界见 [后端实现说明](docs/backend-implementation.md)。

## 本地启动

需要 Node.js 24、pnpm 11.20.0、PostgreSQL 17+。macOS 可使用 `brew install postgresql@17`。

```sh
pnpm install
pnpm setup:local
# 首次创建管理员，从环境变量提供至少 12 位密码；不会覆盖已有账号
ADMIN_PASSWORD='自行生成的随机密码' pnpm auth:bootstrap
pnpm dev
```

`setup:local` 生成随机数据库凭据，启动项目独立 PostgreSQL，构建共享包并应用版本化 Drizzle 迁移。重复执行保留数据；不会重置或接管其他数据库实例。已有 PostgreSQL 时配置 `.env` 的 `DATABASE_URL`，改为执行 `pnpm build:packages && pnpm db:migrate`。

- 登录：`http://127.0.0.1:5173/login`，端口使用 `.env` 中的 `WEB_PORT`；本次交付环境为 **5174**。
- API：`http://127.0.0.1:3000/api/health`，就绪检查 `/api/health/readiness`。
- 管理员登录后在账号管理创建教师；教师创建并开放课堂，添加学生或审批入班，再创建和发布练习。
- 本次交付的初始账号保存在本机 `.local/initial-accounts.json`（0600，不提交、不发布）。
- 停止开发进程：终端 Ctrl+C；数据库状态／停止：`pnpm pg:status`、`pnpm pg:stop`。

本机 API／worker／隧道的登录自启项已按要求停用。需要使用时手动运行开发进程和隧道，见 [部署记录](docs/go-judge-deployment.md)。

## Linux 评测节点

AIM-Radar 已安装原生 systemd 服务，监听内网地址；实际部署与验收见 [部署记录](docs/go-judge-deployment.md)。本机业务进程通过认证 SSH 隧道连接该节点：

```sh
pnpm runner:tunnel
```

隧道默认本地端口 15050，远端地址与 SSH 别名通过 `.env` 中的 `RUNNER_*` 配置；断开后自动重连。API／worker 使用 `GO_JUDGE_URL` 和 `GO_JUDGE_AUTH_TOKEN`，令牌永远不传给浏览器。服务器 `/version` 只是连通检查，完整功能由业务验收脚本验证。

重建节点使用 `scripts/build-go-judge.sh` 和 [原生部署模板](infra/go-judge/README.md)。该脚本固定上游版本和 commit，应用真正关闭 stdin 的 EOF 补丁并执行 Go 测试。不要将 macOS 执行结果作为正式沙箱验收。

## 使用

教师端支持课堂、练习、名册、授课与独立巡视窗口。学生端支持 Monaco 编辑、服务器自动保存、真实运行、历史、求助和主动提交。编译与运行结果始终关联当次不可变代码版本。

- 基础交互：勾选“运行时输入”，运行后按行发送文本，EOF 真正关闭 stdin；可随时停止。默认 CPU 2 秒、交互墙钟 60 秒、内存 256 MiB、输出 1 MiB。
- 草稿同步：停止输入约 600 ms 后保存；断网时显示异常并保存本机备份，重连自动重试。多窗口版本冲突返回 409，先下载本机修改再比较服务器版本，不静默覆盖。
- 教师查看：服务器轮询同步当前草稿，历史运行与提交使用固定快照；投屏匿名、只读、可撤销且 2 小时过期。
- 本地目录：桌面 Chrome／Edge 学生工作区可授权读写本地目录，已有文件和外部修改先比较；不支持时使用浏览器备份和源文件下载。
- 浏览器 clangd：编辑器底部默认关闭，可按需启用 SharedWorker/WASM C++17 补全和诊断；首次加载较大，要求新版桌面 Chrome／Edge。见 [clangd 文档](docs/browser-clangd.md)。
- 管理：真实健康结果、教师／学生账号与恢复、运行限额、失败任务和审计；备份按钮执行 pg_dump，并恢复到独立临时库校验，现有数据库不覆盖。

## 检查

```sh
pnpm check
pnpm test
pnpm build
pnpm db:migrate
pnpm queue:probe          # worker 需运行
pnpm acceptance           # 本地验收管理员凭据，创建独立测试课堂
pnpm capacity:probe       # 创建 50 人测试课堂并验证独立输出
pnpm backup:verify        # 原生 PostgreSQL 备份及临时库恢复
```

所有迁移和锁文件均提交。备份在 `.local/backups/`，含账号与作品，只应保存在受控位置。

## 目录

```text
apps/web             Vue 前端与 Monaco
apps/api             账号、课堂、草稿、运行网关、教学与管理 API
apps/worker          原生评测任务工作者与 pg-boss 基础设施自检
packages/contracts   共享类型与默认限额
packages/config      服务环境配置
packages/database    Drizzle schema、版本迁移与 PostgreSQL 连接
infra/go-judge       systemd、挂载配置与 EOF 补丁
scripts              原生启动、构建、备份和验收
```

构建后 API／worker 分别通过 `pnpm --filter @classroom/api start`、`pnpm --filter @classroom/worker start` 运行。生产前端产物为 `apps/web/dist`；使用原生反向代理服务静态文件，并将 `/api` 转发到 API。本次业务服务在开发机运行，远端部署的是独立 Linux 评测服务；未声称完成业务站点公网发布。

本轮 50 人为 HTTP 保存、心跳与集中运行基准；多个课堂和 50 台真实浏览器长期试课仍需实际教学验证。首版不包含自动判题、多文件工程、协作编辑、SSO 和内置 AI。需求与组件选型保留在仓库根目录。

## 扩大压力测试与图文报告

见 [2026-10-25 压测结果](docs/stress-test-2026-10-25.md)。`pnpm stress:test` 执行边界、分档集中运行、持续编辑、混合异常与交互 EOF；`pnpm stress:report` 生成内嵌真实截图的自包含 HTML。
