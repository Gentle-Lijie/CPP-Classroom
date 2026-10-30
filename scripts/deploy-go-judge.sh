#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
config=/etc/cpp-classroom
binary=/opt/cpp-classroom/bin/go-judge
service=/etc/systemd/system/go-judge.service
work=/var/lib/cpp-classroom/go-judge

if [[ "${1:-}" == --help ]]; then
  echo '用法：sudo bash scripts/deploy-go-judge.sh'
  echo '在独立的原生 Linux systemd 节点构建并部署课堂版 go-judge，保留已有配置。'
  exit 0
fi
[[ $# == 0 ]] || { echo '未知参数；使用 --help 查看用法。' >&2; exit 1; }
[[ "$(uname -s)" == Linux && "$(id -u)" == 0 ]] || {
  echo '请在独立的原生 Linux 节点以 root 运行。' >&2; exit 1;
}
for tool in git go curl openssl systemctl install sha256sum g++ python3; do
  command -v "$tool" >/dev/null || { echo "缺少命令：$tool" >&2; exit 1; }
done
[[ -d /run/systemd/system && -f /sys/fs/cgroup/cgroup.controllers ]] || {
  echo '需要运行中的 systemd 和 cgroup v2。' >&2; exit 1;
}
if [[ ! -e "$config/mount.yaml" ]]; then
  for path in /bin /lib /lib64 /usr /etc/ld.so.cache /etc/alternatives /dev/null /dev/urandom /dev/zero; do
    [[ -e "$path" ]] || { echo "默认挂载路径不存在：$path；请先配置节点。" >&2; exit 1; }
  done
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
echo '[go-judge] 构建并测试固定版本和课堂补丁'
bash "$root/scripts/build-go-judge.sh" "$temporary_directory"

install -d -m 0755 /opt/cpp-classroom/bin
install -d -m 0700 "$config" "$work"
if [[ ! -e "$config/go-judge.env" ]]; then
  token="$(openssl rand -hex 32)"
  printf 'GO_JUDGE_LISTEN=127.0.0.1:5050\nGO_JUDGE_AUTH_TOKEN=%s\n' "$token" > "$config/go-judge.env"
  unset token
fi
if [[ ! -e "$config/mount.yaml" ]]; then
  install -m 0600 "$root/infra/go-judge/mount.yaml" "$config/mount.yaml"
fi
chmod 0600 "$config/go-judge.env" "$config/mount.yaml"

# Accept the simple KEY=value format used by the supplied template without sourcing a root-owned file.
python3 - "$config/go-judge.env" "$temporary_directory" <<'PY'
import pathlib, re, sys
config = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
values = {}
for line in config.read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    key, sep, value = line.partition('=')
    if not sep or key not in ('GO_JUDGE_LISTEN', 'GO_JUDGE_AUTH_TOKEN') or key in values:
        sys.exit('配置文件必须使用唯一的 GO_JUDGE_LISTEN 和 GO_JUDGE_AUTH_TOKEN KEY=value 行。')
    values[key] = value
listen = values.get('GO_JUDGE_LISTEN', '')
token = values.get('GO_JUDGE_AUTH_TOKEN', '')
match = re.fullmatch(r'(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):(\d+)', listen)
if not match or not 1 <= int(match.group(2)) <= 65535:
    sys.exit('GO_JUDGE_LISTEN 必须是明确的主机地址和端口，例如 127.0.0.1:5050。')
if not re.fullmatch(r'[A-Za-z0-9._~-]{32,}', token) or token == 'replace-with-a-long-random-token':
    sys.exit('GO_JUDGE_AUTH_TOKEN 需至少 32 位，只能包含字母、数字及 ._~-。')
(out / 'url').write_text('http://' + listen)
(out / 'curl.conf').write_text('header = "Authorization: Bearer ' + token + '"\n')
PY

install -m 0755 "$temporary_directory/go-judge" "$binary"
install -m 0644 "$root/infra/go-judge/go-judge.service" "$service"
systemctl daemon-reload
systemctl enable go-judge.service
systemctl restart go-judge.service
url="$(cat "$temporary_directory/url")"
echo '[go-judge] 等待服务并验证认证'
for attempt in {1..30}; do
  if curl --noproxy '*' --fail --silent --max-time 2 "$url/version" > "$temporary_directory/version"; then break; fi
  if [[ "$attempt" == 30 ]]; then
    echo '服务未就绪；请检查 journalctl -u go-judge。' >&2; exit 1
  fi
  sleep 1
done
if ! grep -q 'v1.13.3-classroom-eof.2' "$temporary_directory/version"; then
  echo '运行的 go-judge 版本与课堂补丁版本不符，请检查监听端口。' >&2; exit 1
fi
status="$(curl --noproxy '*' --silent --show-error --max-time 5 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"cmd":[]}' "$url/run")"
[[ "$status" == 401 ]] || { echo "未认证请求应返回 401，实际为 $status。" >&2; exit 1; }
status="$(curl --noproxy '*' --silent --show-error --max-time 5 -o /dev/null -w '%{http_code}' --config "$temporary_directory/curl.conf" -H 'Content-Type: application/json' -d '{"cmd":[]}' "$url/run")"
[[ "$status" == 400 ]] || { echo "已认证空请求应返回 400，实际为 $status。" >&2; exit 1; }
echo "[go-judge] 部署完成：$(cat "$temporary_directory/version")"
echo "监听：$url；令牌保存在 $config/go-judge.env（不会输出）。"
echo '请配置受保护的 HTTPS/WSS 入口并运行 pnpm runtime:probe；上述检查不代表沙箱验收。'
