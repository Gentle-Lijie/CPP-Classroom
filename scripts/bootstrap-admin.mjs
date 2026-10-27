import { randomBytes, scryptSync } from 'node:crypto'
import { config } from 'dotenv'
import pg from 'pg'
config({ quiet: true })
const username = process.env.ADMIN_USERNAME || 'admin'
const password = process.env.ADMIN_PASSWORD
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
try {
  const existing = await pool.query('select role,disabled from users where username=$1', [username])
  if (existing.rowCount) {
    if (existing.rows[0].role !== 'admin' || existing.rows[0].disabled)
      throw new Error('初始化账号已存在但不是可用管理员；请核对账号，不会自动修改密码或权限。')
    console.log('管理员已存在，保留密码与权限；无需提供初始化密码。')
  } else {
    if (!password || password.length > 200)
      throw new Error('首次创建管理员时，请通过 ADMIN_PASSWORD 提供非空初始密码（最多 200 位）。')
    const salt = randomBytes(16).toString('hex')
    const hash = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
    const result = await pool.query(
      `insert into users(username,name,role,password_hash) values($1,'平台管理员','admin',$2) on conflict(username) do nothing returning id`,
      [username, hash],
    )
    console.log(
      result.rowCount ? '管理员已创建；密码未写入日志。' : '账号已存在，未修改密码或权限。',
    )
  }
} finally {
  await pool.end()
}
