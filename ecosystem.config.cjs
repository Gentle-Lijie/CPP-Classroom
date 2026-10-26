const root = __dirname
const runtime = `${root}/.local/runtime/node-v24.18.0-linux-x64/bin/node`
module.exports = {
  apps: ['api', 'worker'].map((service) => ({
    name: `cpp-classroom-${service}`,
    cwd: root,
    script: `apps/${service}/dist/main.js`,
    interpreter: runtime,
    uid: 'cppclass',
    gid: 'cppclass',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    exp_backoff_restart_delay: 1000,
    kill_timeout: 20000,
    max_memory_restart: '512M',
    time: true,
    env: { NODE_ENV: 'production', API_HOST: '127.0.0.1', API_PORT: '3020' },
  })),
}
