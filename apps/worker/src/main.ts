import { startExecutionQueue } from './execution.js'
import { PgBoss } from 'pg-boss'
import { loadEnvironment } from '@classroom/config'
import { PROBE_QUEUE, executionDefaults } from '@classroom/contracts'
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
const stopExecution = startExecutionQueue(pool, environment)
const executionSettings = (
  await pool.query("select value from platform_settings where id='execution'")
).rows[0]?.value
console.log(
  `Worker 已就绪：运行队列全局上限 ${executionSettings?.executionConcurrency ?? executionDefaults.executionConcurrency}，本进程上限 ${environment.WORKER_CONCURRENCY ?? '跟随全局设置'}；基础设施自检已启用。`,
)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await stopExecution()
  await boss.stop({ graceful: true, timeout: 10000 })
  await pool.end()
}
process.once('SIGINT', () => {
  void shutdown()
})
process.once('SIGTERM', () => {
  void shutdown()
})
