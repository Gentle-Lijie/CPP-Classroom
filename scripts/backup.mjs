import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, chmod } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import pg from 'pg'
const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
config({ path: root + '.env', quiet: true })
const url = new URL(process.env.DATABASE_URL)
const pgEnv = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
}
// Command arguments and output never include a database password.
let bin = process.env.POSTGRES_BIN_DIR || process.env.PG_BIN
if (!bin && process.platform === 'darwin') bin = '/opt/homebrew/opt/postgresql@17/bin'
const command = (name) => (bin ? `${bin}/${name}` : name)
const directory = root + '.local/backups'
await mkdir(directory, { recursive: true, mode: 0o700 })
const filename =
  new Date().toISOString().replaceAll(':', '-') + '-' + randomBytes(3).toString('hex') + '.dump'
const path = directory + '/' + filename
const temporary = 'classroom_verify_' + randomBytes(8).toString('hex')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
let created = false
try {
  await exec(command('pg_dump'), ['-Fc', '--file', path], { env: pgEnv, timeout: 60000 })
  await chmod(path, 0o600)
  await pool.query(`create database "${temporary}"`)
  created = true
  await exec(
    command('pg_restore'),
    ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', temporary, path],
    { env: pgEnv, timeout: 60000 },
  )
  const verifyUrl = new URL(process.env.DATABASE_URL)
  verifyUrl.pathname = '/' + temporary
  const verify = new pg.Pool({ connectionString: verifyUrl.toString() })
  let counts
  try {
    counts = (
      await verify.query(
        'select (select count(*)::int from users) as users,(select count(*)::int from classrooms) as classrooms,(select count(*)::int from drafts) as drafts,(select count(*)::int from runs) as runs',
      )
    ).rows[0]
  } finally {
    await verify.end()
  }
  console.log(
    JSON.stringify({
      filename,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
      restored: true,
      counts,
      createdAt: new Date().toISOString(),
    }),
  )
} finally {
  if (created) await pool.query(`drop database "${temporary}"`)
  await pool.end()
}
