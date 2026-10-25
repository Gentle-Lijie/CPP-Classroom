import { PgBoss } from 'pg-boss'
import { loadEnvironment } from '@classroom/config'
import { PROBE_QUEUE } from '@classroom/contracts'
import type { ProbeJob } from '@classroom/contracts'
import { auditEvents, createDatabase } from '@classroom/database'

const environment = loadEnvironment()
const { pool, db } = createDatabase(environment.DATABASE_URL)
pool.on('error', () => console.error('Worker 数据库连接异常'))
const boss = new PgBoss({ connectionString: environment.DATABASE_URL, schema: 'pgboss' })
boss.on('error', () => console.error('队列连接异常，请检查 PostgreSQL'))
await boss.start()
await boss.createQueue(PROBE_QUEUE, { retryLimit: 0 })
await boss.work<ProbeJob>(PROBE_QUEUE, { pollingIntervalSeconds: 1 }, async ([job]) => {
  if (!job) return
  await db.insert(auditEvents).values({
    event: 'infrastructure.probe',
    source: 'worker',
    details: { jobId: job.id, requestedAt: job.data.requestedAt },
  })
  console.log(`基础设施自检已处理：${job.id}`)
  return { ok: true }
})
console.log('Worker 已就绪，仅处理基础设施自检任务；学生代码执行尚未接入。')

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await boss.stop({ graceful: true, timeout: 10000 })
  await pool.end()
}
process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
