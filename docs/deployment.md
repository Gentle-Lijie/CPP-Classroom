# Makers 前端与 PM2 后端部署

前端目标域名 `https://cpp.lijie.space`，由用户在 Makers 控制台导入 Git 仓库并绑定。
后端入口 `https://cpp-backend.lijie.space`，Nginx 转发到 `ssh b` 的 `127.0.0.1:3020`。
业务 API 与 worker 使用 PM2；数据库使用独立原生 PostgreSQL 17，评测继续访问独立 Linux go-judge。

## Makers 控制台

导入 `Gentle-Lijie/CPP-Classroom`，选择 `main`，框架选 Other，项目根目录保持仓库根目录（不要选 `apps/web`）。
仓库根目录 `edgeone.json` 已提供：

| 设置         | 值                                                             |
| ------------ | -------------------------------------------------------------- |
| 安装命令     | `bash scripts/makers.sh install`                               |
| 构建命令     | `bash scripts/makers.sh build`                                 |
| 产物目录     | `apps/web/dist`                                                |
| 启动器 Node  | `22.11.0`（脚本安装并使用独立 Node 24.18.0、pnpm 11.20.0）     |
| 前端域名     | `cpp.lijie.space`，在 Makers 控制台配置其 CNAME 和 HTTPS       |
| 可选函数变量 | `API_ORIGIN=https://cpp-backend.lijie.space`（代码已默认该值） |

不要把本地 `.env`、数据库连接、评测令牌或管理员密码上传到 Makers。无需设置 `VITE_API_TARGET`：它只用于 Vite 开发代理。
`edge-functions/api/[[path]].js` 仅转发浏览器同源 `/api/*`，不承载业务或执行代码。
它先拒绝跨源写请求，再转换上游 Origin；Cookie 保持 HttpOnly、SameSite=Strict，并加 Secure。
全部 API 响应禁止缓存，后端失联返回 JSON 502，避免被 SPA fallback 返回 HTML。
因此生产和预览站点都使用自己的第一方 Cookie，无需开放跨域凭据或第三方 Cookie。

Makers 单文件上限为 25 MB。生产构建从固定版本的 jsDelivr npm CDN 加载 clangd WASM、标准库数据和系统索引，SharedWorker 与运行时代码保留在本站。
Vite 的 Worker 构建插件在打包前替换资源地址，避免把超过限制的资源打入发布产物；Makers 构建还会检查产物大小和固定版本 CDN 引用。
CDN 使用 `@algoproclub/clangd-wasm@0.1.1`，不使用浮动版本。首次加载依赖浏览器到公共 CDN 的网络连通性；CDN 不接收学生源码，分析仍在浏览器内完成。
参考：[Makers 配置](https://cloud.tencent.com/document/product/1552/127389)、[函数路由](https://pages.edgeone.ai/document/edge-functions)、[文件限制](https://pages.edgeone.ai/document/limits-and-quotas)。

## 后端部署

服务器需要 Linux x86_64、root SSH、Git、curl、tar、Python 3、acl、原生 PostgreSQL 17、可全局访问的 PM2，以及已启用的 `pm2-root.service`。
该机器现有 Nginx／PM2 服务继续使用现有系统运行时；项目另外下载校验过的 Node 24，不替换系统 Node。
若重建服务器，先从 PostgreSQL 官方 PGDG 仓库安装 `postgresql-common`，在其 `createcluster.conf` 设置 `create_main_cluster = false`，再安装 `postgresql-17`。
如 dpkg 提示已存在的配置文件，保留服务器现有配置，不覆盖。

本地先运行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

先提交并 Push 到 GitHub `main`，然后通过环境变量提供初始化密码，执行 `pnpm deploy:backend`（可用 `DEPLOY_HOST` 覆盖默认 SSH 别名 `b`）。
初始化用户名默认 `admin`，只创建不存在的账号；重复部署不会重置密码、权限或数据库。
所有文件传输只使用 Git。业务源码从 GitHub clone／pull 到 `ssh b:~/cpp-classroom`，不使用 scp 或 rsync。
环境文件和初始化密码通过单独的临时私有 Git 仓库经 SSH 传输；它位于本机忽略的 `.local/` 和远端 `.local/` 下，不接入 GitHub、不推到业务仓库，传入后立即删除两端临时 Git 历史。
环境文件最终仅保存为后端忽略的 `.env`（0600），初始化密码读入进程后删除临时文件，不写日志。

部署脚本完成：

1. clone／快进 pull GitHub `main`，核对远端版本与本地提交一致；不强制 reset 服务器工作区。
2. 经独立私有 Git 原样传入本地 `.env`，保留上一份配置为 `.local/env.previous`。
3. 创建专用 `cppclass` 系统账号，仅授予其穿过 `/root` 的 ACL 权限（无目录列举权限），以锁文件安装依赖并构建 API／worker。
4. 由非 root 的 `cppclass` 账号启动 `.local/` 内的 PostgreSQL，以版本化 Drizzle 迁移更新数据库并初始化管理员。
5. 启用 PostgreSQL systemd 自启，使用现有 PM2 管理器启动／重启两个独立进程；它们以 `cppclass` 身份运行。
6. 等待 API readiness，通过 `pnpm queue:probe` 后保存 PM2 进程列表。

本地 `.env` 内容保持不变。生产环境覆盖值只放在 `ecosystem.config.cjs`：`NODE_ENV=production`、`API_HOST=127.0.0.1`、`API_PORT=3020`。
复制环境配置不会复制本地业务数据；服务器初次部署创建空数据库和指定管理员。
同一服务器后续部署通过忽略的 `.local/` 保留业务数据、备份与运行时，不执行数据库重置或反向迁移。

```text
/root/cpp-classroom/           Git clone、依赖与后端产物
  .env                        本地环境文件的原样副本
  .local/runtime/             独立 Node 与 pnpm
  .local/postgres/             PostgreSQL 数据，仅本机 55432
  .local/backups/              业务备份
```

## 检查与维护

```sh
ssh b 'pm2 status'
ssh b 'pm2 logs cpp-classroom-api --lines 50 --nostream'
ssh b 'pm2 logs cpp-classroom-worker --lines 50 --nostream'
ssh b 'systemctl status cpp-classroom-postgres --no-pager'
curl --fail https://cpp-backend.lijie.space/api/health
curl --fail https://cpp-backend.lijie.space/api/health/readiness
```

Makers 上线后必须确认首页、直接打开／刷新 `/login` 和教师嵌套路由、JS/CSS、clangd CDN 加载，以及真实登录、`/api/auth/me` 和退出。
错误 Origin 的 POST 应返回 403；浏览器的同源请求不需要跨域 CORS 预检。
此前本地构建和服务器验证不能替代 Makers 上线后的浏览器验证。

Git pull 只接受快进；发布失败时检查日志，必要时人工检出已知兼容的旧提交、重新构建并用 PM2 重启。
迁移不自动回滚；不要删除共享数据目录，也不要在未经核对时把旧环境文件覆盖回当前数据库配置。
源码版本由 Git 历史保存，部署脚本不创建文件复制的 release 目录。
