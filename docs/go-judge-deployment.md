# AIM-Radar 原生部署记录

验收日期：2026-10-25（Asia/Shanghai）。本次部署对象是独立评测服务；前端、API、PostgreSQL 和 worker 运行在开发机。

## 当前连接

| 项目       | 已部署值                                                            |
| ---------- | ------------------------------------------------------------------- |
| 主机       | AIM-RADAR / Ubuntu 24.04 系列 / Linux 7.0.0-38-generic / amd64      |
| 内网服务   | `10.176.29.102:5050`，仅绑定该内网接口                              |
| systemd    | `go-judge.service`，enabled / active                                |
| 引擎       | `v1.13.3-classroom-eof.1`，Go 1.26.0 构建                           |
| 编译器     | GCC 13.3.0，C++17 或 C++20 受控 profile                             |
| 二进制     | `/opt/cpp-classroom/bin/go-judge`                                   |
| SHA-256    | `17f95a19402ee625e59ca5d4f4defb63a0fe75ce900211591f1bc45eacba1d99`  |
| 配置       | `/etc/cpp-classroom/go-judge.env` 与 `mount.yaml`，root / 0600      |
| 工作目录   | `/var/lib/cpp-classroom/go-judge`                                   |
| 运行身份   | 任务进程 UID/GID 从 1536 起；服务管理隔离使用 root                  |
| 隔离       | Linux namespaces、cgroup v2、`-no-fallback`、只读工具链、受限 tmpfs |
| 并行与缓存 | 4 槽；编译产物任务完成即清理，孤立缓存 10 分钟过期                  |

未新增公网执行端口映射。SSH 使用用户现有 `aim-radar` 别名；本机隧道仅监听 `127.0.0.1:15050`，转发至节点内网地址。已从业务 API 经该隧道完成真实编译和交互运行。系统 VPN 曾尝试连接但握手未成功，因此不把本机 VPN 直连写为通过项。

## 本机原生隧道

`.env` 已配置当前节点，令牌只留在该忽略文件与远端 root 配置中：

```dotenv
GO_JUDGE_URL=http://127.0.0.1:15050
RUNNER_SSH_HOST=aim-radar
RUNNER_LOCAL_PORT=15050
RUNNER_REMOTE_ADDRESS=10.176.29.102
```

手动方式为 `pnpm runner:tunnel`，断线自动重连。当前已安装用户 LaunchAgent `tech.uonaim.cpp-classroom.runner-tunnel`，登录时启动；该服务运行时不需要再开第二个手动隧道。日志在 `.local/runner-tunnel.log`。

```sh
launchctl print gui/$(id -u)/tech.uonaim.cpp-classroom.runner-tunnel
curl http://127.0.0.1:15050/version
curl http://127.0.0.1:3000/api/health/readiness
```

卸载隧道服务时使用 `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/tech.uonaim.cpp-classroom.runner-tunnel.plist`，再移除对应 plist。不会停止远端 go-judge。

若 VPN 或同内网已经能直达该地址，可直接在服务端 `.env` 配置 `GO_JUDGE_URL=http://10.176.29.102:5050` 并重启 API／worker。内网地址若发生变化，需要同步节点监听与隧道远端地址。

## 已完成的真实验证

- `/run` 无认证返回 401；正确令牌可调用。`/version` 仅用于连通探活。
- 沙箱 `id` 返回 `uid=1536 gid=1536`；宿主用户 SSH 目录、业务凭据不可见；`/usr` 无法写入；外部网络连接失败。
- GCC 编译、语法错误原始诊断、正常输出、非零退出、交互输入、EOF、停止和历史快照均通过业务 API 验收。
- 死循环限时、超过 256 MiB 的内存压力、无限输出均受控终止；其他学生仍能继续运行。
- 实际停止 systemd 节点后，运行显示平台失败；启动后下一次运行成功；已保存草稿保持可读。
- 过期 worker 租约任务被标记为平台失败，不静默重跑；PostgreSQL 队列探针与真实备份恢复通过。
- 最新 50 人 HTTP 基准：50/50 输出正确，最大并行 4、峰值排队 50，保存与心跳 P95 35 ms，集中运行总耗时 P95 13,206 ms。数字包含本次开发机到节点的 SSH 链路，不代表长期或多班性能保证。

可重建安装、补丁与测试命令见 [节点说明](../infra/go-judge/README.md)，功能清单见 [后端说明](backend-implementation.md)。本地验收 JSON、账号和数据库备份均位于忽略的 `.local/`，不应上传公开报告。
