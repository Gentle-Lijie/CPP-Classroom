# 原生 Linux 执行节点

本项目使用原生进程部署。go-judge 固定为 v1.13.3；本目录提供下载脚本、挂载基线和 systemd 模板，尚未在目标 Linux 主机运行验收。

1. 准备独立 Linux 执行节点，启用 cgroup v2，安装课程指定版本的 GCC。固定并记录 `g++ --version`、二进制 SHA-256、挂载配置和限制参数。仅连接健康接口不能证明隔离有效。
2. 执行 `bash scripts/install-go-judge.sh`，安装脚本会校验同一 release 的 SHA-256 清单。默认仅下载到 `.local/go-judge`，不会启动服务或修改系统目录。正式安装时将二进制放到 `/opt/cpp-classroom/bin/go-judge`。
3. 创建 `/var/lib/cpp-classroom/go-judge` 和 `/etc/cpp-classroom`。审查 `mount.yaml`：不同发行版可能没有 `/lib64` 或 `/etc/alternatives`；按实际文件系统调整。`/usr` 和编译器目录只读，执行主机这些目录不得存放业务密钥。
4. 将 `mount.yaml` 和填好随机令牌的 `go-judge.env` 放入 `/etc/cpp-classroom`，权限设为仅 root 可读。systemd 模板使用 root 管理隔离与 cgroup，因此只应安装在专用执行节点。服务日志也须限制读取权限：当前上游版本可能在启动日志记录认证配置。
5. 将 `go-judge.service` 安装到 systemd 后加载、启动。模板默认绑定 `127.0.0.1:5050`；跨主机接入可使用 SSH 隧道，或改成专用内网地址并配置网络访问控制。不得公开运行接口。
6. 在业务项目 `.env` 中设置 `GO_JUDGE_URL` 和 `GO_JUDGE_AUTH_TOKEN`，重启 API。令牌只放服务端；原生 WebSocket／REST 与拟采用的前端 Socket.IO 是不同协议，后续由执行网关适配。

当前 API 仅访问 `/version` 检查连通性。上游将此接口注册在执行接口的认证中间件之前，因此连通性不代表执行鉴权已经验收。完整上线验证仍包括：受控编译命令、网络隔离、编译与运行分阶段限额、stdin EOF 扩展、取消清理、无限输出、节点故障和 50 人并发。

systemd 的 `-no-fallback` 用于阻止 cgroup 失败时静默降级。不要在没有验证资源限制时开放学生代码执行。项目当前没有执行提交接口；任务工作者只处理基础设施自检。

参考：[官方 API](https://docs.goj.ac/api)、[固定版本源码](https://github.com/criyle/go-judge/tree/v1.13.3)。
