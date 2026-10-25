#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != Linux ]]; then
  echo '此脚本仅在原生 Linux 执行节点构建，不把 macOS 当作生产验证。' >&2
  exit 1
fi
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
destination="${1:-$project_root/.local/go-judge}"
source_directory="$(mktemp -d)"
trap 'rm -rf -- "$source_directory"' EXIT
git clone --quiet --depth 1 --branch v1.13.3 https://github.com/criyle/go-judge.git "$source_directory/source"
cd "$source_directory/source"
test "$(git rev-parse HEAD)" = 4ebd2ffe9474639c665fa21cfb438f68820fe77c
git apply --check "$project_root/infra/go-judge/stdin-eof.patch"
git apply "$project_root/infra/go-judge/stdin-eof.patch"
printf '%s\n' 'v1.13.3-classroom-eof.1' > cmd/go-judge/version/version.txt
gofmt -w cmd/go-judge/stream/file.go cmd/go-judge/stream/stream.go cmd/go-judge/ws_executor/stream.go
go test ./cmd/go-judge/stream ./cmd/go-judge/ws_executor
mkdir -p -- "$destination"
go build -trimpath -o "$destination/go-judge" ./cmd/go-judge
sha256sum "$destination/go-judge"
