#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
host="${DEPLOY_HOST:-b}"
revision=$(git rev-parse HEAD)
ssh_options=(-o BatchMode=yes -o ClearAllForwardings=yes -o ConnectTimeout=15 -o ServerAliveInterval=15)
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ClearAllForwardings=yes -o ServerAliveInterval=15'
[[ -f .env ]] || { echo 'Missing local .env' >&2; exit 1; }
[[ -n "${ADMIN_PASSWORD:-}" ]] || { echo 'Set ADMIN_PASSWORD for bootstrap (existing accounts are preserved)' >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo 'Commit and push changes before deploying' >&2; exit 1; }
ssh "${ssh_options[@]}" "$host" 'set -eu; if ! test -d ~/cpp-classroom/.git; then git clone --branch main https://github.com/Gentle-Lijie/CPP-Classroom.git ~/cpp-classroom; fi; cd ~/cpp-classroom; git pull --ff-only origin main; mkdir -p .local; chmod 700 .local; git init --bare --quiet .local/env-transport.git; chmod 700 .local/env-transport.git'
remote_revision=$(ssh "${ssh_options[@]}" "$host" 'git -C ~/cpp-classroom rev-parse HEAD')
[[ "$remote_revision" == "$revision" ]] || { echo 'Push local commit to origin/main before deploying' >&2; exit 1; }

# All file transport uses Git. This disposable, SSH-only repository is separate
# from origin; secret history is deleted on both ends immediately after delivery.
transport=$(mktemp -d "$PWD/.local/env-transport.XXXXXX")
cleanup() {
  python3 -c 'import shutil,sys; shutil.rmtree(sys.argv[1])' "$transport"
  ssh "${ssh_options[@]}" "$host" 'python3 -c "import shutil; from pathlib import Path; p=Path.home()/\"cpp-classroom/.local/env-transport.git\"; shutil.rmtree(p) if p.exists() else None"' || true
}
trap cleanup EXIT
chmod 700 "$transport"
cp .env "$transport/runtime.env"
printf '%s' "$ADMIN_PASSWORD" > "$transport/admin-password"
chmod 600 "$transport/runtime.env" "$transport/admin-password"
git -C "$transport" init --quiet
git -C "$transport" add --force runtime.env admin-password
git -C "$transport" -c user.name=Deployment -c user.email=deployment@localhost -c commit.gpgsign=false commit --quiet -m 'Temporary private deployment configuration'
git -C "$transport" push --quiet "$host:cpp-classroom/.local/env-transport.git" HEAD:refs/heads/deploy
ssh "${ssh_options[@]}" "$host" 'set -eu; cd ~/cpp-classroom; umask 077; if test -f .env; then cp -p .env .local/env.previous; fi; git --git-dir=.local/env-transport.git show deploy:runtime.env > .env.incoming; git --git-dir=.local/env-transport.git show deploy:admin-password > .local/admin-password; mv .env.incoming .env; python3 -c "import shutil; shutil.rmtree(\".local/env-transport.git\")"; bash scripts/activate-backend.sh'
