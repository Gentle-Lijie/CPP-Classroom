import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { loadEnvironment } from '@classroom/config'
import { createDatabase } from './index.js'

const { pool, db } = createDatabase(loadEnvironment().DATABASE_URL)
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
  console.log('数据库迁移完成。')
} finally {
  await pool.end()
}
