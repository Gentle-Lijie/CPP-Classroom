# 原生 Linux 执行节点

本项目不使用 Docker。go-judge 固定上游 v1.13.3（commit `4ebd2ffe9474639c665fa21cfb438f68820fe77c`），加本仓库 `stdin-eof.patch`，构建版本为 `v1.13.3-classroom-eof.2`。

补丁为 `/stream` 增加二进制 `[5, cmdIndex << 4 | fd]` 关闭输入帧。它只关闭指定 stdin，继续读取 stdout／stderr；输入关闭及最终清理保持幂等。上游取消帧 `[4]` 仍表示终止运行。补丁包含 EOF 不取消执行、关闭后拒绝写入及重复清理测试。

输出流现在在 Linux 节点读取 stdout／stderr 时按 `streamOut.max` 字节限制截断并终止任务，返回 `Output Limit Exceeded`；先发送有界缓冲输出，再发送终态，防止无限输出挤占传输链路。网关另外限制合计输出字节数。

## 构建和安装

### 一键部署

在独立的原生 Linux 节点准备 systemd、cgroup v2、git、Go、curl、OpenSSL、GCC/G++、Python 3 和完整标准库，然后在仓库根目录运行：

```sh
sudo bash scripts/deploy-go-judge.sh
```

脚本构建并测试固定版本的课堂补丁，首次安装时生成随机令牌和默认挂载配置，安装并重启 systemd 服务，检查 `/version` 及 `/run` 的认证。重复运行会保留已有的 `/etc/cpp-classroom/go-judge.env` 和 `mount.yaml`，但会更新二进制及 systemd 服务并重启节点。部署前请检查默认挂载路径和节点工具链；脚本不会安装系统依赖或配置 HTTPS 反向代理。

首次默认只监听 `127.0.0.1:5050`。需要通过网络访问时，按实际网络配置反向代理，或修改 `/etc/cpp-classroom/go-judge.env` 中的监听地址后重新运行脚本。配置文件使用不带引号的 `KEY=value`，令牌至少 32 位且只含字母、数字及 `._~-`。令牌保存在该 root 专用文件中；将同一令牌安全地配置到业务服务或执行节点管理中。启动检查不等于沙箱和交互功能验收，仍需按下文在 Linux 节点运行完整探针。

构建时 Go 模块下载会自动重试两次。如果连接 `proxy.golang.org` 时出现 `unexpected EOF`，可直接重新运行；已下载的模块会复用。若网络持续不稳定，可选用可信的 Go 模块代理，并明确将其传给 sudo 进程，例如：

```sh
sudo env GOPROXY=https://goproxy.cn,direct ./scripts/deploy-go-judge.sh
```

该代理是第三方服务，请按所在网络的要求选择；脚本不会修改系统的 Go 代理设置。

### 手动部署

1. 准备原生 Linux、cgroup v2、GCC 13、CPython 3、git、Go（可自动下载 go.mod 指定工具链）、curl。Python（Beta）要求节点安装发行版的 `python3` 标准库运行时，入口为 `/usr/bin/python3`；不要求 pip 或第三方包。
2. 运行 `bash scripts/build-go-judge.sh /tmp/classroom-runner`。脚本检查上游 commit，应用补丁，执行 Go 流协议测试，构建并输出 SHA-256。仅下载官方未打补丁版本可使用 `scripts/install-go-judge.sh`，但该二进制不能验收交互 EOF。
3. 将二进制安装为 `/opt/cpp-classroom/bin/go-judge`，创建 `/var/lib/cpp-classroom/go-judge` 和 `/etc/cpp-classroom`。
4. 审查 `mount.yaml` 的宿主路径，然后以 0600 安装 `mount.yaml` 和填好随机令牌的 `go-judge.env`。禁止挂载项目、数据库、用户目录、密钥或控制套接字。
5. 安装 `go-judge.service` 到 systemd 并 `systemctl enable --now go-judge`。服务使用 root 管理 namespace／cgroup，任务进程从非特权 UID/GID 1536 起；`-no-fallback` 禁止隔离失效时静默降级。运行日志限制读取权限，上游启动日志可能包含认证配置。
6. 节点绑定专用内网地址，业务服务通过带令牌的 HTTPS／WSS 入口访问。当前入口为 `https://go-judge.unnc.space`，转发到原生服务的 5050 端口；反向代理需支持 `/stream` WebSocket 升级。
7. 业务服务配置 `GO_JUDGE_URL` 和 `GO_JUDGE_AUTH_TOKEN`，重启 API／worker。前端永远不接触令牌，也不能指定编译命令。

AIM-Radar 的实际配置、验证与本机接入方法见 [部署记录](../../docs/go-judge-deployment.md)。完整业务与验收见 [后端说明](../../docs/backend-implementation.md)。

`/version` 仅证明连通，受保护的 `/run` 才能验证令牌。正式功能验收必须包含 Linux 编译、真实 EOF、取消、资源限制、目录与网络隔离、故障恢复及并发。macOS 开发进程不作为 Linux 沙箱验证。

## Python 支持（Beta）

Python 使用受控 profile `cpython3-stdlib`，直接将当前语言的单文件快照复制到沙箱并执行：

```text
/usr/bin/python3 -I -S -B -u -X utf8 /w/<filename>.py
```

`-I` 忽略 Python 环境变量及用户 site 目录，`-S` 不加载 site 初始化和发行版第三方包，`-B` 不写字节码，`-u` 保持交互输出及时，`-X utf8` 固定 UTF-8。提供 Python 标准库，不提供安装依赖或多文件工程。具体参数含义见 [CPython 命令行文档](https://docs.python.org/3/using/cmdline.html)。这些参数不代替安全沙箱；文件、进程、网络及资源限制仍由原生 Linux go-judge 负责。

`mount.yaml` 中只读的 `/usr` 同时提供解释器和标准库。发行版若把它们安装在其他路径，必须先审查挂载并验证；不允许把业务目录或宿主用户目录挂入沙箱。Ubuntu 24.04 可使用原生软件包 `python3`。升级运行时后应重新运行探针。

任务创建时固定语言、profile 和 CPU／内存／输出限额。worker 不在开始执行时重新读取这些限额；稍后更改平台配置不会改变已排队任务。每次 Python 运行先在同一 go-judge 节点执行受控版本探针，记录 `metrics.runtimeVersion`，缺失或无法启动解释器时归类为平台执行失败。Python 语法错误与运行时异常保留原始 stderr traceback，归类为运行失败。

在本地 `.env` 配好现有节点地址与令牌后运行：

```sh
pnpm --filter @classroom/worker runtime:probe
```

此命令只向配置的独立执行节点提交固定的验证程序，不连接业务数据库、不创建学生记录、不更改节点部署。它检查 Python 标准库与隔离参数、UTF-8、预填与交互输入、EOF、语法错误、异常、停止、CPU／内存／输出限制，以及 C++17 回归。每项输出 JSON 结果；任一失败以非零状态退出。不要仅凭 `/version` 成功就启用 Python 功能。

2026-10-30 通过现有 AIM-Radar 原生 Linux 节点验证，节点返回 Python 3.12.3。该验证覆盖上述固定程序，不代表完成浏览器界面验收或新一轮容量测试。
