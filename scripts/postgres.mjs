import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'

const root = fileURLToPath(new URL('../', import.meta.url))
config({ path: join(root, '.env'), quiet: true })
const action = process.argv[2]
if (!['start', 'stop', 'status'].includes(action)) throw new Error('使用 start、stop 或 status')
if (!process.env.DATABASE_URL) throw new Error('先执行 pnpm env:init')
const databaseUrl = new URL(process.env.DATABASE_URL)
if (!['127.0.0.1', 'localhost'].includes(databaseUrl.hostname)) {
  throw new Error('pg:* 只管理本项目的本地数据库。远程数据库请由部署方管理，直接运行 db:migrate。')
}
const candidates = [
  process.env.POSTGRES_BIN_DIR,
  '/opt/homebrew/opt/postgresql@17/bin',
  '/opt/homebrew/opt/postgresql@18/bin',
  '/usr/local/opt/postgresql@17/bin',
  '/usr/local/opt/postgresql@18/bin',
  '/Applications/Postgres.app/Contents/Versions/latest/bin',
  '/usr/lib/postgresql/17/bin',
  '/usr/lib/postgresql/18/bin',
].filter(Boolean)
let binaryDirectory = candidates.find((directory) => existsSync(join(directory, 'pg_ctl')))
if (!binaryDirectory) {
  const candidate = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
  if (candidate.status === 0 && existsSync(join(candidate.stdout.trim(), 'pg_ctl')))
    binaryDirectory = candidate.stdout.trim()
}
if (!binaryDirectory)
  throw new Error(
    '未找到 PostgreSQL 服务端。macOS: brew install postgresql@17；Linux: 安装 postgresql-17，或设置 POSTGRES_BIN_DIR。',
  )

const local = join(root, '.local')
const data = join(local, 'postgres')
const manifestFile = join(local, 'postgres-config.json')
const socketDirectory = join(local, 'pgsocket')
const binary = (name) => join(binaryDirectory, name)
const run = (name, args) => execFileSync(binary(name), args, { stdio: 'inherit' })
const running = () =>
  spawnSync(binary('pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore' }).status === 0

if (action === 'status') {
  console.log(running() ? '项目 PostgreSQL 正在运行。' : '项目 PostgreSQL 未运行。')
  process.exit(0)
}
if (action === 'stop') {
  if (running()) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  else console.log('项目 PostgreSQL 已停止。')
  process.exit(0)
}

const role = decodeURIComponent(databaseUrl.username)
const password = decodeURIComponent(databaseUrl.password)
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
const port = Number(databaseUrl.port || 5432)
if (!role || !password || !databaseName || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('DATABASE_URL 必须包含本地用户名、密码、数据库名和有效端口。')
}
const manifest = {
  role,
  databaseName,
  port,
  passwordHash: createHash('sha256').update(password).digest('hex'),
}
mkdirSync(local, { recursive: true, mode: 0o700 })
mkdirSync(socketDirectory, { recursive: true, mode: 0o700 })
if (existsSync(join(data, 'PG_VERSION'))) {
  if (
    !existsSync(manifestFile) ||
    readFileSync(manifestFile, 'utf8') !== JSON.stringify(manifest)
  ) {
    throw new Error(
      '现有项目数据库与 .env 配置不一致。保留数据，请手动核对用户名、密码、数据库和端口。',
    )
  }
} else {
  const passwordFile = join(local, 'postgres-init-password')
  writeFileSync(passwordFile, password, { mode: 0o600 })
  try {
    run('initdb', [
      '-D',
      data,
      '-U',
      role,
      '--encoding=UTF8',
      '--locale=C',
      '--auth-local=trust',
      '--auth-host=scram-sha-256',
      `--pwfile=${passwordFile}`,
    ])
  } finally {
    unlinkSync(passwordFile)
  }
  const quote = (value) => `'${value.replaceAll("'", "''")}'`
  writeFileSync(
    join(data, 'postgresql.auto.conf'),
    `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = ${quote(socketDirectory)}\n`,
  )
  writeFileSync(manifestFile, JSON.stringify(manifest), { mode: 0o600 })
}
if (!running()) {
  const occupied = spawnSync(binary('pg_isready'), ['-h', '127.0.0.1', '-p', String(port)], {
    stdio: 'ignore',
  })
  if (occupied.status === 0 || occupied.status === 1)
    throw new Error(`端口 ${port} 已被其他 PostgreSQL 占用；不会接管该服务。`)
  run('pg_ctl', ['-D', data, '-l', join(local, 'postgres.log'), '-w', 'start'])
}
const adminUrl = new URL(databaseUrl)
adminUrl.hostname = '127.0.0.1'
adminUrl.pathname = '/postgres'
const client = new pg.Client({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 2000,
})
try {
  await client.connect()
  const found = await client.query('select 1 from pg_database where datname = $1', [databaseName])
  if (!found.rowCount) await client.query(`create database "${databaseName.replaceAll('"', '""')}"`)
  console.log(`项目 PostgreSQL 已就绪：127.0.0.1:${port}/${databaseName}`)
} finally {
  await client.end()
}
