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

服务器需要 Linux x86_64、root SSH、Git、curl、tar、flock、acl、原生 PostgreSQL 17、可全局访问的 PM2，以及已启用的 `pm2-root.service`。
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

后端更新在服务器上运行，代码拉取由你手动执行：

```sh
ssh b
cd ~/cpp-classroom
git pull --ff-only origin main
bash deploy.sh
```

`deploy.sh` 只部署服务器当前工作区，不执行 Git pull／fetch／push，也不从本机复制任何文件。
`pnpm deploy:backend` 是同一个脚本的别名，也必须在服务器项目目录运行。
服务器现有 `.env`（0600）直接沿用；需要调整配置时，在服务器修改它后重新部署。
首次安装如果还没有管理员，通过 `ADMIN_PASSWORD` 环境变量提供初始化密码；现有管理员的日常更新无需输入密码，保留密码与权限。
所有代码仍通过 Git 传输；旧的本机远程部署及临时环境仓库传输入口已移除。

部署脚本完成：

1. 检查 Linux、root、项目目录、原生依赖和服务器 `.env`，获取部署锁，防止两个部署同时运行。
2. 检查独立 Node 24，按锁文件安装依赖，构建 API／worker。
3. 保留专用 `cppclass` 服务身份和权限，检查持久化 PostgreSQL 及 systemd 自启配置。
4. 应用版本化 Drizzle 迁移，检查管理员，保留已有账号。
5. 使用 PM2 重启 API／worker，等待 API readiness，运行 `pnpm queue:probe`，验证后保存 PM2 列表。

执行时打印阶段进度，同时追加保存到 `.local/deploy.log`。失败时显示所在阶段，并立即退出。
另开终端可查看进度：

```sh
ssh b 'tail -f ~/cpp-classroom/.local/deploy.log'
```

只有进入 PM2 重启步骤才替换运行进程；依赖安装和构建失败会停止部署。
迁移在重启前执行，因此数据库迁移仍需与现有版本兼容；脚本不自动回滚迁移，也不重置数据库。
生产环境覆盖值保留在 `ecosystem.config.cjs`：`NODE_ENV=production`、`API_HOST=127.0.0.1`、`API_PORT=3020`。
服务数据、备份与运行时保留在忽略的 `.local/`。

```text
/root/cpp-classroom/           Git clone、依赖与后端产物
  .env                        服务器环境配置，部署时沿用
  .local/runtime/             独立 Node 与 pnpm
  .local/postgres/             PostgreSQL 数据，仅本机 55432
  .local/backups/              业务备份
  .local/deploy.log            部署阶段与输出日志
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

手动 Git pull 建议使用 `--ff-only`。发布失败时检查日志，必要时人工检出已知兼容的旧提交，再运行 `bash deploy.sh`。
迁移不自动回滚；不要删除共享数据目录，也不要在未经核对时把旧环境文件覆盖回当前数据库配置。
源码版本由 Git 历史保存，部署脚本不创建文件复制的 release 目录。
