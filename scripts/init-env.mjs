import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const destination = fileURLToPath(new URL('.env', root))
if (existsSync(destination)) {
  console.log('.env 已存在，保留现有配置。')
} else {
  const template = readFileSync(new URL('.env.example', root), 'utf8')
  writeFileSync(
    destination,
    template.replace('replace-this-local-password', randomBytes(24).toString('hex')),
    { mode: 0o600, flag: 'wx' },
  )
  console.log('已生成本地 .env 和随机数据库密码；文件不会提交到 Git。')
}
