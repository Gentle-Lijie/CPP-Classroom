import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
// Only forwards the authenticated runner's loopback port. No student command reaches SSH.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
const remote = process.env.RUNNER_REMOTE_ADDRESS || '127.0.0.1'
if (!/^[a-zA-Z0-9.-]+$/.test(remote)) throw Error('执行节点地址无效')
const host = process.env.RUNNER_SSH_HOST || 'aim-radar'
const port = Number(process.env.RUNNER_LOCAL_PORT || 15050)
if (!/^[a-zA-Z0-9._-]+$/.test(host) || !Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error('隧道配置无效')
let closing = false,
  child
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    closing = true
    child?.kill(signal)
  })
while (!closing) {
  child = spawn(
    'ssh',
    [
      '-N',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=8',
      '-o',
      'ExitOnForwardFailure=no',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=3',
      '-L',
      `127.0.0.1:${port}:${remote}:5050`,
      host,
    ],
    { stdio: 'inherit' },
  )
  await new Promise((resolve) => {
    child.once('exit', resolve)
    child.once('error', resolve)
  })
  if (!closing) {
    console.error('执行节点隧道断开，3 秒后重连')
    await delay(3000)
  }
}
