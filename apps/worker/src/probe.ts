import { setTimeout as delay } from 'node:timers/promises'
import { PgBoss } from 'pg-boss'
import { loadEnvironment } from '@classroom/config'
import { PROBE_QUEUE } from '@classroom/contracts'

const boss = new PgBoss({ connectionString: loadEnvironment().DATABASE_URL, schema: 'pgboss' })
boss.on('error', () => console.error('队列连接异常'))
await boss.start()
try {
  await boss.createQueue(PROBE_QUEUE, { retryLimit: 0 })
  const id = await boss.send(PROBE_QUEUE, { requestedAt: new Date().toISOString() })
  if (!id) throw new Error('自检任务未入队')
  const deadline = Date.now() + 15000
  let completed = false
  while (Date.now() < deadline) {
    const job = await boss.getJobById(PROBE_QUEUE, id)
    if (job?.state === 'completed') {
      completed = true
      break
    }
    if (job?.state === 'failed') throw new Error('自检任务失败，请查看 worker 日志')
    await delay(250)
  }
  if (!completed) throw new Error('自检超时，请先启动 worker')
  console.log(`队列与数据库写入验证通过：${id}`)
} finally {
  await boss.stop()
}
