#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Makers' preinstalled Node is only a launcher; use the project's pinned toolchain.
runtime="$PWD/.local/runtime"
version=24.18.0
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux-x64 ;;
  Linux-aarch64) platform=linux-arm64 ;;
  Darwin-arm64) platform=darwin-arm64 ;;
  Darwin-x86_64) platform=darwin-x64 ;;
  *) echo 'Unsupported Node runtime platform' >&2; exit 1 ;;
esac
node_dir="$runtime/node-v$version-$platform"
if [[ ! -x "$node_dir/bin/node" || ! -f "$node_dir/bin/npm" ]] ||
   [[ "$("$node_dir/bin/node" -v 2>/dev/null || true)" != "v$version" ]]; then
  mkdir -p "$runtime"
  download=$(mktemp -d "$runtime/download.XXXXXX")
  trap 'rm -rf "$download"' EXIT
  archive="node-v$version-$platform.tar.gz"
  curl --fail --location --retry 3 "https://nodejs.org/dist/v$version/$archive" -o "$download/$archive"
  curl --fail --location --retry 3 "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$download/SHASUMS256.txt"
  (cd "$download"; if command -v sha256sum >/dev/null; then
    awk -v name="$archive" '$2 == name' SHASUMS256.txt | sha256sum -c -
  else
    awk -v name="$archive" '$2 == name' SHASUMS256.txt | shasum -a 256 -c -
  fi)
  tar -xzf "$download/$archive" -C "$download"
  [[ "$("$download/node-v$version-$platform/bin/node" -v)" == "v$version" ]]
  if [[ -e "$node_dir" ]]; then mv "$node_dir" "$download/incomplete"; fi
  mv "$download/node-v$version-$platform" "$node_dir"
  rm -rf "$download"
  trap - EXIT
fi
export PATH="$node_dir/bin:$runtime/bin:$PATH"
if [[ ! -x "$runtime/bin/pnpm" ]]; then
  npm install --global --prefix "$runtime" pnpm@11.20.0 --no-audit --no-fund
fi
exec "$@"
