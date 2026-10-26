# AIM-Radar 评测服务连接

当前业务入口：**https://go-judge.unnc.space**。该入口将请求转发到 AIM-Radar 原生 go-judge 的 5050 端口，同时支持 HTTPS API 和 WSS 流协议。

## 地址与配置

| 地址                                  | 用途                                     |
| ------------------------------------- | ---------------------------------------- |
| `https://go-judge.unnc.space`         | API、worker 使用的服务根地址             |
| `https://go-judge.unnc.space/version` | 版本与连通性探测                         |
| `https://go-judge.unnc.space/run`     | 带令牌的编译／执行请求                   |
| `wss://go-judge.unnc.space/stream`    | 带令牌的交互输入、输出、EOF 与取消       |
| `10.176.29.102:5050`                  | Linux 节点的原生服务监听地址，供入口转发 |

本地 `.env`：

```dotenv
GO_JUDGE_URL=https://go-judge.unnc.space
GO_JUDGE_AUTH_TOKEN=<现有评测机令牌>
GO_JUDGE_TIMEOUT_MS=10000
```

`GO_JUDGE_URL` 填服务根地址，不追加 `/api`、`/run` 或 `/stream`。worker 会将 HTTPS 根地址转换为 WSS 地址以访问 `/stream`。修改配置后重启 API、worker；本地开发运行 `pnpm dev`。

令牌保存在忽略的本地 `.env` 和节点 `/etc/cpp-classroom/go-judge.env` 中，不提交、不输出到日志，也不传给浏览器。浏览器仅访问课堂 API。

## 入口要求

- HTTPS 证书可正常验证。
- 反向代理转发 `Authorization` 请求头，保留 go-judge 的令牌认证。
- `/stream` 支持 WebSocket Upgrade，并允许交互运行持续到配置的运行时限。
- `/run`、`/file` 与 `/stream` 均转发到同一个原生 go-judge 服务。
- HTTP 自动跳转 HTTPS；业务进程直接配置 HTTPS 地址。

## 验证

在项目根目录运行：

```sh
curl --fail --show-error --max-time 10 https://go-judge.unnc.space/version

# 未认证的执行请求应返回 401。
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --max-time 10 -H 'Content-Type: application/json' \
  -d '{"cmd":[]}' https://go-judge.unnc.space/run

# API 已加载本地配置后，检查评测节点状态。
curl --fail --show-error --max-time 15 http://127.0.0.1:3000/api/health/readiness

# worker 启动后验证队列处理。
pnpm queue:probe
```

`/version` 只证明连通性，不能代替执行认证。带正确令牌的空 `/run` 请求会进入参数校验，返回 `400` 和 `no cmd provided`；WebSocket 握手应返回 `101`。API 就绪结果需单独查看 `checks.runner.status`。

完整执行验证应包含 GCC 编译、输出核对、运行时输入与 EOF；资源隔离与限制仍由原生 Linux 节点提供，macOS 只运行业务进程。

2026-10-26 已通过当前入口验证：工作器执行模块经 HTTPS 编译 C++ 程序，经 WSS 运行；预填 `4`、`12` 后自动 EOF，以及逐行输入 `4`、`12` 后发送 EOF，均得到 `sum=16`、`0 · Accepted`。该探针不修改学生作品；历史并发与隔离验收范围见部署记录。

## 当前节点

引擎版本为 `v1.13.3-classroom-eof.2`，GCC 13.3，支持受控 C++17／C++20。服务由 Linux 原生 systemd 管理，配置、隔离与历史验收见 [部署记录](go-judge-deployment.md) 和 [节点说明](../infra/go-judge/README.md)。

## 排查

| 现象                          | 检查项                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| DNS 或 TLS 失败               | 域名解析、证书有效期、HTTPS 入口                           |
| `/version` 成功，执行返回 401 | 本地与节点令牌是否一致；API、worker 是否已重新加载配置     |
| `/run` 成功，交互握手失败     | `/stream` Upgrade、认证头转发、反向代理超时                |
| 缓存文件找不到                | `/run`、`/file`、`/stream` 是否转发到同一节点              |
| `502`／`504`                  | 入口到 `10.176.29.102:5050` 的连接、原生服务状态、代理超时 |
| 输出未结束                    | 学生是否发送 EOF，运行是否仍在配置时限内                   |
