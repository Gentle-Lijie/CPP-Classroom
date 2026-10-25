# go-judge 原生 Linux 部署指南

适用项目：C++ Classroom。文档日期：2026 年 10 月 25 日。

本指南以仓库固定的 **go-judge v1.13.3** 和现有 systemd、挂载模板为基线，使用原生 Linux 进程部署。推荐将执行服务放在独立 Linux 服务器或独立虚拟机中，业务 API、PostgreSQL 与执行节点分别管理。

**当前边界：**项目 API 仅通过 `/version` 检查执行节点连通性；Worker 仅处理基础设施自检。本文提供的引擎检查直接访问 go-judge，不代表项目已经接入学生编译运行、课堂权限、交互输入、EOF 或完整任务生命周期。部署命令和检查脚本需要由部署人员在目标 Linux 上执行，本次编写文档未进行目标主机部署或压测。

## 1. 推荐拓扑与端口

```text
浏览器
  │ HTTPS / WebSocket
  ▼
业务服务器：前端、API、PostgreSQL、pg-boss、Worker / 执行网关
  │ 内网、VPN 或 SSH 隧道；执行接口需要 Bearer Token
  ▼
独立 Linux：go-judge + GCC + 受限临时执行环境
```

Worker / 执行网关属于后续业务接入内容。执行节点不需要安装本项目的 Node.js 服务或 PostgreSQL，也不应持有业务数据库密码和账号密钥。学生浏览器不直接访问 go-judge。

本文示例地址均需替换为实际地址：

| 项目               | 示例         | 说明                           |
| ------------------ | ------------ | ------------------------------ |
| 业务服务器内网 IP  | `10.10.0.10` | 唯一允许连接执行端口的业务来源 |
| 执行服务器内网 IP  | `10.10.0.20` | 不应是直接开放给公网的执行地址 |
| go-judge HTTP 端口 | `5050`       | REST、`/ws`、`/stream` 共用    |
| SSH 隧道本地端口   | `15050`      | 仅使用隧道方案时需要           |

当前模板未启用 gRPC、调试与指标服务，不需要开放 `5051` 或 `5052`。v1.13.3 的 `/version` 和 `/config` 位于执行鉴权中间件之前，因此网络访问控制要覆盖整个服务，不能仅依赖执行令牌。

## 2. 目标主机要求

- 常规 Linux 服务器或虚拟机，建议使用维护中的 Ubuntu LTS / Debian 等发行版，运行 systemd。
- 启用 cgroup v2，具备 namespace、挂载与相关 cgroup 权限；受限托管环境需要先向服务商确认这些能力。
- 本仓库下载脚本支持 Linux `amd64` 与 `arm64`。
- 安装课程确定的 GCC / G++ 版本。学生机器不需要安装编译器。
- 有 sudo 管理权限。当前服务模板使用 root 管理执行隔离，学生程序按挂载模板中的非 root UID / GID 运行。

Ubuntu / Debian 安装工具的示例：

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl python3 build-essential

uname -sr
uname -m
ps -p 1 -o comm=
stat -fc %T /sys/fs/cgroup
g++ --version
```

`stat` 应显示 `cgroup2fs`，PID 1 应为 systemd。编译器以实际输出为准，不能把前端展示的示例版本当成已安装版本；需要固定特定 GCC 版本时，应先安装和记录该版本，再核对编译器路径。

不要在 macOS 上验证后就认定生产隔离通过。系统不满足要求时先解决主机环境，不通过关闭 `-no-fallback` 绕过检查。

## 3. 准备部署文件与二进制

在执行服务器准备本仓库中以下文件，保留相对目录。无需复制 `.env`、数据库数据或业务服务密钥：

```text
scripts/install-go-judge.sh
infra/go-judge/go-judge.service
infra/go-judge/go-judge.env.example
infra/go-judge/mount.yaml
```

下文假设这些文件位于 `/srv/cpp-classroom-deploy`。该目录是部署文件目录，不是学生沙箱的可见目录。

```sh
cd /srv/cpp-classroom-deploy
bash scripts/install-go-judge.sh

sudo install -d -m 0755 /opt/cpp-classroom/bin
sudo install -d -m 0700 /etc/cpp-classroom
sudo install -d -m 0700 /var/lib/cpp-classroom/go-judge
sudo install -m 0755 .local/go-judge/go-judge /opt/cpp-classroom/bin/go-judge

/opt/cpp-classroom/bin/go-judge -version
sha256sum /opt/cpp-classroom/bin/go-judge
```

安装脚本固定下载 v1.13.3，并用同一 release 的 SHA-256 清单校验下载文件。此校验用于检查与发布清单的一致性，不代替对上游来源的信任。记录最终安装文件的 SHA-256；正在升级已有节点时，先按第 10 节停机备份，不直接覆盖运行中的安装。

## 4. 审查挂载配置

先安装配置副本，再根据目标发行版检查路径：

```sh
cd /srv/cpp-classroom-deploy
sudo install -m 0600 infra/go-judge/mount.yaml /etc/cpp-classroom/mount.yaml

ls -ld /bin /lib /usr /dev/null /dev/urandom /dev/zero
ls -ld /lib64 /etc/ld.so.cache /etc/alternatives
sudoedit /etc/cpp-classroom/mount.yaml
```

部分发行版没有 `/lib64` 或 `/etc/alternatives` 等路径。遇到缺失项应审查并移除对应挂载项，或按该系统的编译器与动态库布局调整；不要为了套用模板创建无意义的空目录。

现有模板包含：

- `/bin`、`/lib`、`/lib64`、`/usr` 等只读运行库与工具链目录。
- `/w`、`/tmp` 两个受限 tmpfs，各为 `128m`、最多 `4k` inode。
- 工作目录 `/w`，学生进程 UID / GID 为 `1536`。
- 必要的设备文件、`/proc` 与标准输入输出链接。

`128m` 是文件系统容量配置，不等于单次程序的完整内存限制。CPU、内存、进程数、墙钟时间等仍要在执行请求和节点配额中分别限制。

**不得挂载**业务源代码、用户主目录、PostgreSQL 数据、凭据文件或宿主机控制套接字。当前基线会暴露只读 `/usr`，因此该路径下不能存放业务密钥；正式部署应尽量收窄为课程所需工具链。只读挂载仍然允许读取文件。

## 5. 生成执行令牌

以下操作只在配置文件不存在时创建令牌，不会自动轮换已有令牌，也不在终端打印令牌：

```sh
sudo sh -c '
  set -eu
  umask 077
  if [ -e /etc/cpp-classroom/go-judge.env ]; then
    printf "保留已有 go-judge.env；需要修改时请使用 sudoedit。\n"
    exit 0
  fi
  set -C
  {
    printf "GO_JUDGE_LISTEN=127.0.0.1:5050\n"
    printf "GO_JUDGE_AUTH_TOKEN="
    openssl rand -hex 32
  } > /etc/cpp-classroom/go-judge.env
'

sudo chmod 0600 /etc/cpp-classroom/go-judge.env
```

使用受控的秘密管理渠道把同一令牌提供给业务服务器。不要提交到 Git、放入前端变量、粘贴到工单或输出到公开日志。

v1.13.3 上游会在启动日志中记录配置的认证令牌。应把服务日志、进程参数的读取权限限定给受信任的运维人员，不能原样上传启动日志排障；限制日志接收方并在导出时脱敏。正式开放前评估并移除上游的明文令牌日志行为，不能仅靠文件权限保护所有暴露路径。

## 6. 选择网络连接方式

### 方式 A：同内网或 VPN 直连

在执行服务器编辑：

```sh
sudoedit /etc/cpp-classroom/go-judge.env
```

保留生成的令牌，只修改监听地址：

```dotenv
GO_JUDGE_LISTEN=10.10.0.20:5050
GO_JUDGE_AUTH_TOKEN=保留原先生成的真实令牌
```

防火墙与云安全组需要共同满足以下策略：

| 来源               | 目标                  | 策略                   |
| ------------------ | --------------------- | ---------------------- |
| `10.10.0.10`       | `10.10.0.20:5050/TCP` | 允许                   |
| 其他来源，包括公网 | 执行端口              | 拒绝                   |
| 运维入口           | SSH                   | 保留必要的受控管理访问 |

应核查现有规则后再修改，不要直接启用或清空防火墙导致 SSH 断连。不要监听 `0.0.0.0:5050` 后仅凭“地址没有公开”判断安全。

本文 HTTP 直连示例仅适用于受信任的专用内网。经过不受信任或共享网络时，使用 VPN、SSH 隧道或配置证书校验的 HTTPS / mTLS；Bearer Token 本身不加密通信。

业务端配置：

```dotenv
GO_JUDGE_URL=http://10.10.0.20:5050
GO_JUDGE_AUTH_TOKEN=执行服务器配置中的同一真实令牌
GO_JUDGE_TIMEOUT_MS=2000
```

### 方式 B：SSH 隧道

执行服务器保留默认监听 `127.0.0.1:5050`，不开放公网执行端口。在业务服务器上使用已有 SSH 账号和密钥连接：

```sh
ssh -N -T \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:15050:127.0.0.1:5050 \
  runner-admin@runner.example.com
```

将示例账号和域名替换为真实值，按正常流程核验 SSH 主机指纹。此命令在前台维持连接，关闭终端即断开；长期部署应使用业务服务器上的独立 systemd 服务监管隧道，并限制隧道账号只能转发需要的目标。

业务端改为：

```dotenv
GO_JUDGE_URL=http://127.0.0.1:15050
GO_JUDGE_AUTH_TOKEN=执行服务器配置中的同一真实令牌
GO_JUDGE_TIMEOUT_MS=2000
```

这里的 `127.0.0.1` 指业务服务器自身的隧道入口。若 API 在其他主机或虚拟机内运行，它无法直接访问这台业务服务器的回环端口。

## 7. 安装并启动 systemd 服务

在执行服务器执行：

```sh
cd /srv/cpp-classroom-deploy
sudo install -m 0644 infra/go-judge/go-judge.service /etc/systemd/system/go-judge.service
sudo systemd-analyze verify /etc/systemd/system/go-judge.service
sudo systemctl daemon-reload
sudo systemctl enable --now go-judge
sudo systemctl is-active go-judge
sudo ss -lntp 'sport = :5050'
```

应显示服务为 `active`，监听地址与所选网络方案一致。需要启动日志排障时，仅在受信任的运维终端查看，注意第 5 节的明文令牌问题。

当前服务模板的关键设置：

| 设置                     | 含义                                                     |
| ------------------------ | -------------------------------------------------------- |
| `User=root`              | 管理当前 cgroup / namespace 隔离配置；仅用于专用执行实例 |
| `-no-fallback`           | cgroup 初始化失败时不静默降级                            |
| `-parallelism=4`         | 初始全局执行并发配置，不是 50 人课堂容量结论             |
| `-mount-conf=...`        | 使用已审查的文件系统挂载                                 |
| `KillMode=control-group` | systemd 停止服务时清理属于该服务控制组的进程             |

go-judge 在 cgroup v2 下会通过 systemd / D-Bus 创建 transient scope。不能假定给 go-judge 主服务加 `MemoryMax` 或 `KillMode` 就自动覆盖了全部沙箱 scope；应检查实际 cgroup 层级，验证节点总配额和取消清理确实覆盖执行任务。

## 8. 分层验证

### 8.1 网络与版本

在执行服务器按实际监听地址检查，例如回环方案：

```sh
curl --fail --silent --show-error http://127.0.0.1:5050/version
```

内网直连方案使用 `http://10.10.0.20:5050/version`。再从业务服务器使用实际 `GO_JUDGE_URL` 检查一次。

预期返回 JSON，包含 `buildVersion`、`goVersion`、`platform`、`os` 等字段，确认版本与安装记录一致。**此接口不验证执行令牌，也不证明沙箱能正常运行。**

### 8.2 执行接口鉴权

在执行服务器对实际监听地址请求受保护的 `/file`，例如：

```sh
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:5050/file
```

没有认证头时应返回 `401`。如果返回 `200`，先检查令牌是否为空、请求是否到达正确服务，以及反向代理是否改变了路由；不要继续开放业务接入。

### 8.3 可信样例的编译与运行

下面的 Python 检查脚本**在执行服务器本机运行**，读取受保护的环境文件，不把令牌放到命令行参数或打印出来。脚本依次验证错误令牌被拒绝、正确令牌可访问执行接口、固定 C++ 样例在沙箱内编译运行，并删除本次产生的可执行文件缓存。

此脚本只使用本文写死的可信样例，不接受任意学生源码，不在业务 API 进程里调用宿主机编译器。需要实际使用的编译器不是 `/usr/bin/g++` 时，先调整固定路径。

```sh
sudo python3 - <<'PY'
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

config = {}
for line in Path('/etc/cpp-classroom/go-judge.env').read_text().splitlines():
    if line.strip() and not line.lstrip().startswith('#'):
        name, value = line.split('=', 1)
        config[name] = value

base = 'http://' + config['GO_JUDGE_LISTEN']
token = config['GO_JUDGE_AUTH_TOKEN']
assert token and token != 'replace-with-a-long-random-token', '请先配置真实令牌'

def request(path, payload=None, method=None, credential=token):
    data = None if payload is None else json.dumps(payload).encode()
    req = Request(base + path, data=data, method=method,
                  headers={'Authorization': 'Bearer ' + credential,
                           'Content-Type': 'application/json'})
    with urlopen(req, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None

try:
    request('/file', credential='deliberately-invalid-token')
except HTTPError as error:
    assert error.code == 401, f'错误令牌返回了非预期 HTTP {error.code}'
else:
    raise RuntimeError('错误令牌未被拒绝，停止检查')
request('/file')
print('执行接口鉴权通过')

def stdio(stdin=''):
    return [{'content': stdin},
            {'name': 'stdout', 'max': 65536},
            {'name': 'stderr', 'max': 65536}]

source = ('#include <iostream>\n'
          'int main() { int a, b; std::cin >> a >> b; '
          'std::cout << a + b << "\\n"; return 0; }\n')
cached_id = None
try:
    compile_result = request('/run', {'cmd': [{
        'args': ['/usr/bin/g++', 'solution.cpp', '-std=c++17', '-O2', '-o', 'app'],
        'env': ['PATH=/usr/bin:/bin'], 'files': stdio(),
        'cpuLimit': 5_000_000_000, 'clockLimit': 20_000_000_000,
        'memoryLimit': 536_870_912, 'stackLimit': 67_108_864, 'procLimit': 64,
        'copyIn': {'solution.cpp': {'content': source}},
        'copyOutCached': ['app'], 'copyOutMax': 33_554_432,
    }]})[0]
    cached_id = compile_result.get('fileIds', {}).get('app')
    assert compile_result['status'] == 'Accepted', compile_result
    assert compile_result['exitStatus'] == 0 and cached_id, compile_result
    print('沙箱 C++17 编译通过')

    run_result = request('/run', {'cmd': [{
        'args': ['/w/app'], 'env': ['PATH=/usr/bin:/bin'], 'files': stdio('2 3\n'),
        'cpuLimit': 1_000_000_000, 'clockLimit': 3_000_000_000,
        'memoryLimit': 134_217_728, 'stackLimit': 16_777_216, 'procLimit': 16,
        'copyIn': {'app': {'fileId': cached_id}},
    }]})[0]
    assert run_result['status'] == 'Accepted', run_result
    assert run_result['exitStatus'] == 0, run_result
    assert run_result.get('files', {}).get('stdout', '').strip() == '5', run_result
    print('沙箱预填输入与输出通过：2 + 3 = 5')
finally:
    if cached_id:
        request('/file/' + quote(cached_id, safe=''), method='DELETE')
        print('本次可执行文件缓存已删除')
PY
```

`cpuLimit`、`clockLimit` 的单位是纳秒，`memoryLimit`、`stackLimit`、输出收集限额的单位是字节。这里的编译与运行限额只是部署检查样例，不是正式课堂配额。`/run` 返回 HTTP `200` 也可能包含编译或运行失败，因此必须检查每个结果的 `status`、`exitStatus` 和输出。

以上通过只说明固定样例的基本路径可用；仍不证明网络隔离、恶意输入防护、输出限制、取消清理或并发容量已验收。特别是 REST 的输出收集限制不能直接作为流式 `/stream` 总输出限制已经有效的证据。

## 9. 配置业务服务器

在业务服务器的项目根目录 `.env` 中配置第 6 节选定的地址和真实令牌，保留现有数据库配置。变量仅用于服务端，不能使用 `VITE_` 前缀暴露给浏览器。

修改后重启 API，按实际 API 端口检查：

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
curl --silent --show-error http://127.0.0.1:3000/api/health/readiness
```

检查响应中的 `checks.runner.status`，预期为 `healthy`，提示“go-judge 可连接；尚未验证编译与隔离能力”。不要只检查顶层 `status`：当前 readiness 的顶层就绪状态由数据库决定，执行节点不可用时仍可能返回 `ready`，这是为了不阻断课堂编辑和数据读取。

`GO_JUDGE_TIMEOUT_MS=2000` 当前用于版本连通性检查，不是学生程序的运行时间限制。编译、运行、排队、交互会话需要后续执行网关分别管理。

当前业务项目还需接入的能力包括：固定代码快照、受控编译参数、单学生单活动任务、状态与输入输出转发、停止清理，以及真实 EOF。v1.13.3 上游流协议没有独立关闭 stdin 的消息，不能通过发送空字符串或 `Ctrl+D` 字节宣称已经支持 EOF。

## 10. 运维、升级与回滚

- 日常检查服务状态、节点 CPU / 内存、`/dev/shm`、临时空间、任务排队和失败率。上游默认文件缓存位于内存文件系统；缓存不能作为学生作品的持久存储。
- `-parallelism=4` 只是起点。等待文本输入的程序也会占用运行资源；分别设计编译并发、运行并发、交互会话时限以及节点总资源预算，再按课堂规模压测。
- 升级前由业务网关停止接收新任务并等待活动任务结束；当前项目尚无排空接口，应由受控运维流程处理。直接重启会中断任务，不能把自动重跑冒充同一次运行。
- 停止服务后，备份二进制、挂载配置、systemd 单元及受保护的令牌配置，记录版本与 SHA-256。备份凭据文件时保留 `0600` 权限并控制备份读取者。
- 安装新版本后重新执行第 8 节和上线前验证。失败时恢复上一版本二进制与对应配置、执行 `daemon-reload` 并启动，再验证。不要顺带重新生成令牌或删除业务数据。
- 轮换令牌时同时更新执行节点与业务服务，重启或重连相关进程；处理已有长连接，确认旧令牌失效，并限制可能包含旧令牌的历史日志访问。

常用命令：

```sh
sudo systemctl is-active go-judge
sudo systemctl stop go-judge
sudo systemctl start go-judge
sudo systemctl restart go-judge
```

上面是互相独立的运维操作，按需要选择执行，不应把停止、启动、重启整段连续当作日常检查命令运行。

## 11. 常见问题

| 现象                                          | 优先检查                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 业务端连接拒绝                                | 实际监听地址、目标端口、服务状态；远端 `127.0.0.1` 不等于业务端 `127.0.0.1`                    |
| 业务端请求超时                                | VPN / SSH 隧道、安全组、主机防火墙、路由和目标地址                                             |
| `/version` 正常，`/file` 或 `/run` 返回 `401` | 两端令牌、Bearer 认证头；版本接口正常不能证明执行鉴权通过                                      |
| systemd 启动失败                              | 环境文件权限、挂载源路径、cgroup v2、systemd D-Bus 权限；不要移除 `-no-fallback` 掩盖失败      |
| 编译器或头文件不存在                          | `/usr/bin/g++` 的真实路径、GCC 版本、只读工具链挂载以及动态库路径                              |
| HTTP `200`，程序却没有成功                    | 响应数组中的 `status`、`exitStatus`、`error`、`stderr`、`fileError`                            |
| 集中运行时排队很长                            | 编译与运行并发、长时间等待输入的任务、实际 CPU / 内存；不要直接把并发调到学生人数              |
| 节点 OOM 或临时空间耗尽                       | 全部执行 scope 的总配额、单任务限制、输出缓存、`/dev/shm` 和 tmpfs；进程数限制不等于内存总限制 |

## 12. 开放给学生前的验证清单

- [ ] 编译和运行分别设置并实际触发 CPU、内存、墙钟时间、进程数和输出限制。
- [ ] 学生代码不能访问业务文件、凭据、控制套接字或未授权网络目标。
- [ ] 编译失败不会执行旧二进制；当前草稿与历史运行快照不混用。
- [ ] 排队、编译中、运行中和等待输入时均可停止，并确认进程、缓存、临时文件与槽位回收。
- [ ] 流式输出有总量上限，超限时执行侧停止接收 / 终止程序，浏览器不会无限累积内容。
- [ ] 按行输入与真实 EOF 的约定实现通过验证；不把停止程序当作发送 EOF。
- [ ] 节点断连被记录为平台执行失败，不归责为学生编译错误，也不自动重放已交互的旧运行。
- [ ] 按约定课堂人数进行集中编译、运行和交互测试，记录排队、编译、运行耗时与业务页面响应。

## 参考文件与上游资料

- [仓库执行节点简要说明](../infra/go-judge/README.md)
- [下载及校验脚本](../scripts/install-go-judge.sh)
- [systemd 模板](../infra/go-judge/go-judge.service)
- [挂载基线](../infra/go-judge/mount.yaml)
- [业务端执行节点连通性检查](../apps/api/src/runner.service.ts)
- [go-judge v1.13.3 固定版本](https://github.com/criyle/go-judge/tree/v1.13.3)
- [上游 REST / 流式 API 文档](https://docs.goj.ac/api)
- [上游挂载配置说明](https://docs.goj.ac/mount)
