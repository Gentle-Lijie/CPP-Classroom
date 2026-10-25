# AIM-Radar 评测机配置与 FRP 连接指南

核对日期：2026-10-25（Asia/Shanghai）。本文描述已部署配置，以及由你安装 FRPc 后可采用的连接方式。FRP 示例是待配置方案，尚未部署或验证。

## 1. 应该连接哪个端口

**雷达机上的 go-judge 服务地址是 `http://10.176.29.102:5050`。**

| 地址／端口                  | 用途                                 | 业务后端如何使用                              |
| --------------------------- | ------------------------------------ | --------------------------------------------- |
| 雷达机 `10.176.29.102:5050` | go-judge HTTP 与 WebSocket 服务      | 内网可达时直接连接；FRPc 的转发目标也填这里   |
| 开发机 `127.0.0.1:15050`    | 当前手动 SSH 隧道入口                | 当前 `.env` 的 `GO_JUDGE_URL` 指向这里        |
| FRPS 的 TCP `7000`          | 示例 FRP 控制／传输端口，可更换      | 雷达机 FRPc 连接这里；业务 API 不连接这个端口 |
| FRPS 的 TCP `15050`         | 示例转发入口，可更换                 | 接入 FRP 后，API、worker 连接这个入口         |
| `dev.uonaim.tech:51222`     | 当前 SSH 别名 `aim-radar` 的连接入口 | 用于 SSH 运维／隧道，不是 go-judge HTTP 端口  |

注意：**当前服务只绑定 `10.176.29.102`，没有绑定 `127.0.0.1` 或所有网卡。** 即使 FRPc 就装在雷达机本机，也应填写 `localIP = "10.176.29.102"`。雷达机另有 `192.168.100.109` 网卡地址，但 go-judge 当前没有在该地址监听。

浏览器只访问课堂前端与业务 API。只有业务 API 和 worker 需要访问 go-judge；go-judge 令牌保留在服务端。

## 2. 雷达机上已部署的配置

| 项目                   | 当前值                                                       |
| ---------------------- | ------------------------------------------------------------ |
| 主机／系统             | AIM-RADAR，Ubuntu 24.04 系列，amd64                          |
| 服务名                 | `go-judge.service`                                           |
| 服务状态               | 已核对为 `active / running`，已启用开机启动                  |
| 监听地址               | `10.176.29.102:5050`                                         |
| 引擎版本               | `v1.13.3-classroom-eof.2`，包含 stdin EOF 与流式输出限制补丁 |
| 编译器                 | GCC 13.3.0                                                   |
| 原生执行并行参数       | `-parallelism=16`                                            |
| 业务全局编译／运行槽位 | 16，由 worker 与 PostgreSQL 共同约束                         |
| 二进制                 | `/opt/cpp-classroom/bin/go-judge`                            |
| systemd unit           | `/etc/systemd/system/go-judge.service`                       |
| 环境配置               | `/etc/cpp-classroom/go-judge.env`                            |
| 沙箱挂载配置           | `/etc/cpp-classroom/mount.yaml`                              |
| 工作目录               | `/var/lib/cpp-classroom/go-judge`                            |
| 运行方式               | Linux 原生进程，systemd 管理；namespace 与 cgroup 隔离       |

远端环境配置的结构如下，实际令牌未写入本文：

```dotenv
GO_JUDGE_LISTEN=10.176.29.102:5050
GO_JUDGE_AUTH_TOKEN=<现有评测机令牌>
```

业务 API、worker 所用 `.env` 中的 `GO_JUDGE_AUTH_TOKEN` 必须与远端一致。现有值分别保存在项目根目录的忽略文件 `.env` 和远端上述配置文件中。需要查看或维护远端配置时，SSH 登录后使用 `sudoedit /etc/cpp-classroom/go-judge.env`；不要把令牌提交到仓库或放进前端环境变量。

当前业务限制：编译 CPU 10 秒、内存 512 MiB；运行 CPU 2 秒、内存 256 MiB；输出总上限 1024 KiB；默认 C++17，可配置为 C++20。非交互运行墙钟上限 5 秒，交互运行墙钟上限 60 秒。FRP 转发不会改变这些限制。

## 3. 方式一：内网／VPN 直连

如果运行 API、worker 的机器能访问雷达机内网地址，项目根目录 `.env` 设置：

```dotenv
GO_JUDGE_URL=http://10.176.29.102:5050
GO_JUDGE_AUTH_TOKEN=<保持与雷达机一致的现有令牌>
GO_JUDGE_TIMEOUT_MS=10000
```

修改后重启 API、worker。使用 `pnpm dev` 时，在该终端停止并重新运行即可。此方式不依赖 SSH 隧道或 FRP。

在业务后端所在机器探测：

```sh
curl --fail --show-error --max-time 10 http://10.176.29.102:5050/version
```

应返回包含 `buildVersion` 的 JSON；这只证明网络连通，完整验证见第 6 节。

## 4. 方式二：雷达机 FRPc → 你的 FRPS

下面采用 **TCP 转发**，同一个入口同时承载编译 HTTP 请求、交互 WebSocket 和编译产物管理，不需要为 WebSocket 单独开端口。

```text
业务 API / worker
        │ HTTP + WebSocket，使用 go-judge 令牌
        ▼
FRPS:15050
        │ FRP 通道（FRPc 主动连接 FRPS:7000）
        ▼
雷达机 FRPc
        │ localIP = 10.176.29.102，localPort = 5050
        ▼
原生 go-judge
```

### 4.1 FRPS 配置示例

以下为使用 TOML 配置的现代 FRP 示例。假设 **业务 API、worker 与 FRPS 位于同一台机器**，转发入口仅监听该机回环地址：

```toml
# frps.toml，位于你的 FRPS 服务器
bindAddr = "0.0.0.0"
bindPort = 7000
proxyBindAddr = "127.0.0.1"

auth.method = "token"
auth.token = "REPLACE_WITH_A_SEPARATE_RANDOM_FRP_TOKEN"

transport.tls.force = true

# 此实例如果还承载其他代理，把它们使用的端口也加入列表。
allowPorts = [
  { single = 15050 }
]
```

此拓扑下，FRPS 服务器需要允许雷达机连接 TCP 7000；TCP 15050 只在 FRPS 本机可用，无需公网开放。`7000`、`15050` 都是示例，替换时同步修改对应配置。

若使用已经存在的 FRPS，把代理配置合并进现有配置，确认 `15050` 未被占用，并符合服务端端口白名单；不要直接覆盖其他代理的配置。

### 4.2 雷达机 FRPc 配置示例

你安装好 FRPc 后，在雷达机创建配置，例如 `/etc/frp/frpc.toml`：

```toml
# frpc.toml，位于 AIM-RADAR
serverAddr = "YOUR_FRPS_HOST"
serverPort = 7000

auth.method = "token"
auth.token = "REPLACE_WITH_A_SEPARATE_RANDOM_FRP_TOKEN"

transport.tls.enable = true

[[proxies]]
name = "cpp-classroom-go-judge"
type = "tcp"
localIP = "10.176.29.102"
localPort = 5050
remotePort = 15050
transport.useEncryption = true
```

替换 `YOUR_FRPS_HOST` 为雷达机能够访问的 FRPS 域名或 IP；两端 FRP token 必须相同。**FRP token 与 `GO_JUDGE_AUTH_TOKEN` 是两个独立凭据，不要混用。**

使用你安装的实际可执行文件路径校验并启动；FRPS、FRPc 建议使用相同版本：

```sh
frpc verify -c /etc/frp/frpc.toml
frpc -c /etc/frp/frpc.toml
```

FRPS 端相应使用 `frps verify -c /path/to/frps.toml` 和 `frps -c /path/to/frps.toml`。FRPc 的安装和进程管理由你安排；本文未添加 FRP 服务或启动项，也无需修改或重启现有 go-judge。

### 4.3 业务 API、worker 如何连接

**API、worker 与 FRPS 同机**时，项目 `.env`：

```dotenv
GO_JUDGE_URL=http://127.0.0.1:15050
GO_JUDGE_AUTH_TOKEN=<保持与雷达机一致的现有令牌>
GO_JUDGE_TIMEOUT_MS=10000
```

这与当前 SSH 隧道使用的 URL 相同，但端口位于运行 API、worker 的那台机器。切换时，先在该机器停止占用 `15050` 的旧 SSH 隧道，再启用 FRPS 转发入口。FRPc 和 go-judge 可以继续在雷达机运行。

**API、worker 与 FRPS 分开部署**时：

1. 将 FRPS 的 `proxyBindAddr` 改为它的可达内网 IP；API、worker 使用 `GO_JUDGE_URL=http://<FRPS内网IP>:15050`。
2. 在 FRPS 主机允许业务后端访问 TCP 15050，同时保证 FRPc 可访问 TCP 7000。
3. 如果两者只能经公网连接，使用 VPN、SSH 隧道，或在 FRPS 上增加支持 HTTP 与 WebSocket 的 HTTPS 反向代理后连接 `https://<评测入口域名>`。本文的 FRP TLS 与 `useEncryption` 保护 FRPc↔FRPS 段；它们不会自动加密业务后端↔FRPS:15050 的 HTTP 段。

例如，FRPS 在远端服务器、API 和 worker 仍在你的 Mac 上，也可以保持 FRPS 的 `proxyBindAddr = "127.0.0.1"`，从 Mac 手动建立：

```sh
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:15050:127.0.0.1:15050 YOUR_FRPS_SSH_HOST
```

此时 Mac 上仍使用 `GO_JUDGE_URL=http://127.0.0.1:15050`。`YOUR_FRPS_SSH_HOST` 指你的 FRPS 服务器 SSH 地址／别名，不是雷达机别名。

`GO_JUDGE_URL` 填服务根地址，不要加 `/api`、`/run` 或 `/stream` 后缀。API、worker 都需要使用新的配置；修改后重启。`RUNNER_*` 变量仅由旧的 `pnpm runner:tunnel` 脚本使用，采用 FRP 后无需运行该脚本。

## 5. 当前 SSH 隧道方式（保留作为备用）

当前开发机通过 `aim-radar` SSH 别名转发到雷达机，配置如下：

```dotenv
GO_JUDGE_URL=http://127.0.0.1:15050
GO_JUDGE_AUTH_TOKEN=<保持现有令牌>
GO_JUDGE_TIMEOUT_MS=10000
RUNNER_SSH_HOST=aim-radar
RUNNER_LOCAL_PORT=15050
RUNNER_REMOTE_ADDRESS=10.176.29.102
```

在独立终端运行并保持进程存活：

```sh
pnpm runner:tunnel
```

另一个终端运行 `pnpm dev`。本机 API、worker 与隧道的登录自启项均保持停用。关闭隧道终端会使依赖它的编译运行不可用。

## 6. 如何确认连接和执行都正常

从 **API、worker 所在机器**测试实际选择的入口。以本机 `15050` 为例：

```sh
# 1. 网络与版本探测；/version 本身不验证执行权限。
curl --fail --show-error --max-time 10 http://127.0.0.1:15050/version

# 2. 未携带令牌的执行请求应返回 HTTP 401。
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  --max-time 10 \
  -H 'Content-Type: application/json' \
  -d '{"cmd":[]}' \
  http://127.0.0.1:15050/run

# 3. API 的依赖探测。
curl --fail --show-error --max-time 15 \
  http://127.0.0.1:3000/api/health/readiness
```

第 3 步应看到 `checks.runner.status` 为 `healthy`。顶层 `status: "ready"` 只反映课堂数据服务可用，不能单独证明评测机正常。

最后在学生端实际编译运行以下代码，勾选“运行时输入”，输入 `4`、`12` 后发送 EOF：

```cpp
#include <iostream>

int main() {
    int n, sum = 0;
    while (std::cin >> n) sum += n;
    std::cout << "sum=" << sum << std::endl;
}
```

预期输出 `sum=16`，状态为“运行完成”、退出码 0。这同时检查认证编译、编译产物传递、WebSocket、输入、EOF 和运行结果。

2026-10-25 已通过当前 SSH 链路验证 API 入队、worker GCC 编译、交互输入与 EOF，得到 `ready`、`sum=16`，退出原因 `0 · Accepted`。FRP 安装配置完成后，需要沿 FRP 入口重新进行上述验证。

## 7. 常用运维与排查

雷达机上执行：

```sh
sudo systemctl status go-judge --no-pager
sudo journalctl -u go-judge -n 100 --no-pager
ss -lnt 'sport = :5050'
curl --fail --show-error --max-time 5 http://10.176.29.102:5050/version
```

只有修改 go-judge 环境配置时才需要 `sudo systemctl restart go-judge`；重启会中断正在执行的任务。若修改 systemd unit，先运行 `sudo systemctl daemon-reload`。

| 现象                            | 优先检查                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `fetch failed`／连接被拒绝      | SSH 隧道或 FRP 是否运行；API、worker 的 URL 指向哪台机器；目标端口是否监听           |
| FRPc 提示本地连接拒绝           | `localIP` 是否误写为 `127.0.0.1`；当前应为 `10.176.29.102`                           |
| FRPc 无法注册代理               | 两端 FRP token、端口白名单、代理名冲突、remotePort 占用                              |
| `/version` 成功，但编译返回 401 | 两端 `GO_JUDGE_AUTH_TOKEN` 是否一致；API、worker 是否重启加载配置                    |
| 编译成功，但交互断开            | 若增加了 HTTP 反向代理，确认允许 WebSocket Upgrade，且连接超时覆盖至少 60 秒运行窗口 |
| FRPS 本机能访问，业务机器不能   | `proxyBindAddr` 是否仅回环；业务机器与 FRPS 间的路由、隧道和防火墙                   |
| 重启雷达机后地址变化            | 当前监听依赖 `10.176.29.102`；地址变化时需同步修改 go-judge 监听与 FRPc 的 `localIP` |

更多部署细节见 [原生部署记录](go-judge-deployment.md) 和 [重建说明](../infra/go-judge/README.md)。
