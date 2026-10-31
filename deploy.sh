#!/usr/bin/env bash
set -Eeuo pipefail
umask 022
cd "$(dirname "$0")"
base="$PWD"
[[ "$(uname -s)" == Linux && "$(id -u)" == 0 && "$base" == /root/cpp-classroom ]] || {
  echo '请在 ssh b 的 ~/cpp-classroom 中，以 root 运行 bash deploy.sh。' >&2; exit 1;
}
[[ -f .env ]] || { echo '缺少服务器 .env，请先配置。' >&2; exit 1; }
for tool in flock pm2 curl runuser setfacl systemctl; do
  command -v "$tool" >/dev/null || { echo "缺少原生命令：$tool" >&2; exit 1; }
done
[[ -x /usr/lib/postgresql/17/bin/pg_ctl ]] || {
  echo '请先安装原生 PostgreSQL 17，参见 docs/deployment.md。' >&2; exit 1;
}
mkdir -p .local
if [[ "${1:-}" != --locked ]]; then
  if flock --nonblock --close --conflict-exit-code 75 .local/deploy.lock bash "$base/deploy.sh" --locked; then
    exit 0
  else
    status=$?
    if [[ "$status" == 75 ]]; then echo '已有部署正在运行；请查看 .local/deploy.log。' >&2; fi
    exit "$status"
  fi
fi
log="$base/.local/deploy.log"
exec > >(tee -a "$log") 2>&1
stage='preflight'
step() { stage="$1"; printf '\n[deploy] %s\n' "$stage"; }
trap 'printf "[deploy] 阶段失败：%s；日志：%s\n" "$stage" "$log" >&2' ERR
printf '\n[deploy] Start %s at %s\n' "$(date -Is)" "$base"
# Keep an optional first-install password out of dependency/build subprocesses.
bootstrap_password="${ADMIN_PASSWORD:-}"
unset ADMIN_PASSWORD
id cppclass >/dev/null 2>&1 || useradd --system --home-dir "$base" --shell /usr/sbin/nologin cppclass
if [[ "$(getent passwd cppclass | cut -d: -f6)" != "$base" ]]; then
  usermod --home "$base" cppclass
fi
# Permit traversal by this service account without listing root's home.
command -v setfacl >/dev/null || { echo 'Install the native acl package first' >&2; exit 1; }
setfacl -m u:cppclass:--x /root
chmod 755 "$base"
chown cppclass:cppclass .env
chmod 600 .env
step 'Prepare Node 24 runtime'
bash scripts/with-node24.sh true
export PATH="$base/.local/runtime/node-v24.18.0-linux-x64/bin:$base/.local/runtime/bin:$PATH"
step 'Install locked dependencies'
pnpm install --frozen-lockfile
step 'Build API and worker'
pnpm build:backend
chmod -R go+rX node_modules apps/*/node_modules packages/*/node_modules apps/*/dist packages/*/dist
chown -R cppclass:cppclass .local
chmod 700 .local
step 'Check persistent PostgreSQL'
runuser -u cppclass -- env PATH="$PATH" node scripts/postgres.mjs start
if ! systemctl is-active --quiet cpp-classroom-postgres; then
  runuser -u cppclass -- env PATH="$PATH" node scripts/postgres.mjs stop
fi
cat > /etc/systemd/system/cpp-classroom-postgres.service <<EOF
[Unit]
Description=C++ Classroom native PostgreSQL
After=network.target
Before=pm2-root.service
[Service]
Type=forking
User=cppclass
Group=cppclass
PIDFile=$base/.local/postgres/postmaster.pid
ExecStart=/usr/lib/postgresql/17/bin/pg_ctl -D $base/.local/postgres -l $base/.local/postgres.log -w start
ExecStop=/usr/lib/postgresql/17/bin/pg_ctl -D $base/.local/postgres -m fast -w stop
Restart=on-failure
TimeoutStartSec=60
TimeoutStopSec=60
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now cpp-classroom-postgres
step 'Stop API and worker before schema changes'
# Old APIs must not create classrooms without teaching memberships after the backfill.
# Leave services stopped if migration fails; restarting the old schema assumptions is unsafe.
for service in cpp-classroom-api cpp-classroom-worker; do
  if pm2 describe "$service" >/dev/null 2>&1; then
    pm2 stop "$service"
  fi
done
step 'Apply database migrations'
runuser -u cppclass -- env PATH="$PATH" pnpm db:migrate
step 'Check administrator bootstrap (existing account is preserved)'
export ADMIN_PASSWORD="$bootstrap_password"
runuser -u cppclass --preserve-environment -- node scripts/bootstrap-admin.mjs
unset ADMIN_PASSWORD bootstrap_password
step 'Restart PM2 API and worker'
pm2 startOrRestart "$base/ecosystem.config.cjs" --update-env
step 'Wait for API readiness'
for attempt in $(seq 1 30); do
  if curl --fail --silent --connect-timeout 2 --max-time 15 http://127.0.0.1:3020/api/health/readiness >/dev/null; then break; fi
  if [[ "$attempt" == 30 ]]; then echo 'API readiness failed; inspect PM2 logs' >&2; exit 1; fi
  printf '[deploy] API readiness retry %s/30\n' "$attempt"
  sleep 1
done
step 'Verify worker queue'
runuser -u cppclass -- env PATH="$PATH" pnpm queue:probe
pm2 save
step "Deployment complete: $(git rev-parse --short HEAD). Log: $log"
