#!/usr/bin/env bash
set -euo pipefail

# Download a pinned native Linux binary. This does not start a privileged service.
if [[ "$(uname -s)" != Linux ]]; then
  echo 'go-judge 的正式执行节点需要 Linux；本脚本不会在 macOS 安装实验性执行环境。' >&2
  exit 1
fi
version=1.13.3
case "$(uname -m)" in
  x86_64) architecture=amd64 ;;
  aarch64|arm64) architecture=arm64 ;;
  *) echo '仅支持 Linux amd64 / arm64。' >&2; exit 1 ;;
esac
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
destination="${1:-$project_root/.local/go-judge}"
mkdir -p -- "$destination"
temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
asset="go-judge_${version}_linux_${architecture}"
base_url="https://github.com/criyle/go-judge/releases/download/v${version}"
curl --fail --location --proto '=https' --tlsv1.2 "$base_url/$asset" -o "$temporary_directory/$asset"
curl --fail --location --proto '=https' --tlsv1.2 "$base_url/checksums.txt" -o "$temporary_directory/checksums.txt"
(
  cd -- "$temporary_directory"
  awk -v asset="$asset" '$2 == asset { print }' checksums.txt > selected-checksum.txt
  test -s selected-checksum.txt
  sha256sum --check selected-checksum.txt
)
install -m 0755 "$temporary_directory/$asset" "$destination/go-judge"
echo "已下载并校验 go-judge v$version：$destination/go-judge"
echo '启动前请按 infra/go-judge/README.md 检查 cgroup、挂载、认证和固定编译器环境。'
