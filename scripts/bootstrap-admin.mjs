import { randomBytes, scryptSync } from 'node:crypto'
import { config } from 'dotenv'
import pg from 'pg'
config({ quiet: true })
const username = process.env.ADMIN_USERNAME || 'admin'
const password = process.env.ADMIN_PASSWORD
if (!password || password.length < 12)
  throw new Error('请通过 ADMIN_PASSWORD 提供至少 12 位的初始密码；仅创建尚不存在的管理员')
const salt = randomBytes(16).toString('hex')
const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const result = await pool.query(
    `insert into users(username,name,role,password_hash) values($1,'平台管理员','admin',$2) on conflict(username) do nothing returning id`,
    [username, hash],
  )
  console.log(result.rowCount ? '管理员已创建；密码未写入日志。' : '账号已存在，未修改密码或权限。')
} finally {
  await pool.end()
}
