#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
base="$PWD"
[[ "$(id -u)" == 0 && "$base" == /root/cpp-classroom ]] || {
  echo 'Run as root from ~/cpp-classroom' >&2; exit 1;
}
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
ADMIN_PASSWORD=$(cat .local/admin-password)
python3 -c 'from pathlib import Path; Path(".local/admin-password").unlink()'
bash scripts/with-node24.sh true
export PATH="$base/.local/runtime/node-v24.18.0-linux-x64/bin:$base/.local/runtime/bin:$PATH"
pnpm install --frozen-lockfile
pnpm build:backend
chown -R cppclass:cppclass .local
chmod 700 .local
[[ -x /usr/lib/postgresql/17/bin/pg_ctl ]] || {
  echo 'Install native PostgreSQL 17 before deployment; see docs/deployment.md' >&2; exit 1;
}
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
runuser -u cppclass -- env PATH="$PATH" pnpm db:migrate
export ADMIN_PASSWORD
runuser -u cppclass --preserve-environment -- node scripts/bootstrap-admin.mjs
unset ADMIN_PASSWORD
pm2 startOrRestart "$base/ecosystem.config.cjs" --update-env
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:3020/api/health/readiness >/dev/null; then break; fi
  if [[ "$attempt" == 30 ]]; then echo 'API readiness failed; inspect PM2 logs' >&2; exit 1; fi
  sleep 1
done
runuser -u cppclass -- env PATH="$PATH" pnpm queue:probe
pm2 save
echo "Backend deployed: $(git rev-parse --short HEAD) at $base"
