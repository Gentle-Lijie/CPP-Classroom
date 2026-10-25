# 原生 Linux 执行节点

本项目不使用 Docker。go-judge 固定上游 v1.13.3（commit `4ebd2ffe9474639c665fa21cfb438f68820fe77c`），加本仓库 `stdin-eof.patch`，构建版本为 `v1.13.3-classroom-eof.2`。

补丁为 `/stream` 增加二进制 `[5, cmdIndex << 4 | fd]` 关闭输入帧。它只关闭指定 stdin，继续读取 stdout／stderr；输入关闭及最终清理保持幂等。上游取消帧 `[4]` 仍表示终止运行。补丁包含 EOF 不取消执行、关闭后拒绝写入及重复清理测试。

输出流现在在 Linux 节点读取 stdout／stderr 时按 `streamOut.max` 字节限制截断并终止任务，返回 `Output Limit Exceeded`；先发送有界缓冲输出，再发送终态，防止无限输出挤占 SSH 链路。网关另外限制合计输出字节数。

## 构建和安装

1. 准备原生 Linux、cgroup v2、GCC 13、git、Go（可自动下载 go.mod 指定工具链）、curl。
2. 运行 `bash scripts/build-go-judge.sh /tmp/classroom-runner`。脚本检查上游 commit，应用补丁，执行 Go 流协议测试，构建并输出 SHA-256。仅下载官方未打补丁版本可使用 `scripts/install-go-judge.sh`，但该二进制不能验收交互 EOF。
3. 将二进制安装为 `/opt/cpp-classroom/bin/go-judge`，创建 `/var/lib/cpp-classroom/go-judge` 和 `/etc/cpp-classroom`。
4. 审查 `mount.yaml` 的宿主路径，然后以 0600 安装 `mount.yaml` 和填好随机令牌的 `go-judge.env`。禁止挂载项目、数据库、用户目录、密钥或控制套接字。
5. 安装 `go-judge.service` 到 systemd 并 `systemctl enable --now go-judge`。服务使用 root 管理 namespace／cgroup，任务进程从非特权 UID/GID 1536 起；`-no-fallback` 禁止隔离失效时静默降级。运行日志限制读取权限，上游启动日志可能包含认证配置。
6. 默认监听回环地址；跨主机只绑定专用内网地址，并通过认证的 SSH 隧道或可信内网接入。不要将执行端口映射到公网。
7. 业务服务配置 `GO_JUDGE_URL` 和 `GO_JUDGE_AUTH_TOKEN`，重启 API／worker。前端永远不接触令牌，也不能指定编译命令。

AIM-Radar 的实际配置、验证与本机接入方法见 [部署记录](../../docs/go-judge-deployment.md)。完整业务与验收见 [后端说明](../../docs/backend-implementation.md)。

`/version` 仅证明连通，受保护的 `/run` 才能验证令牌。正式功能验收必须包含 Linux 编译、真实 EOF、取消、资源限制、目录与网络隔离、故障恢复及并发。macOS 开发进程不作为 Linux 沙箱验证。
