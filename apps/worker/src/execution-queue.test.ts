import { describe, expect, it, vi } from 'vitest'
import type { Environment } from '@classroom/config'
import { startExecutionQueue, type Run } from './execution.js'

function queue(currentActive: number, claimed?: Run) {
  const operations: string[] = []
  const client = {
    query: vi.fn(async (sql: string, _values?: unknown[]): Promise<{ rows: unknown[] }> => {
      operations.push(sql)
      if (sql.startsWith('select count(*)')) return { rows: [{ n: currentActive }] }
      if (sql.startsWith('update runs set runner_id=')) return { rows: claimed ? [claimed] : [] }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  const pool = {
    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      operations.push(sql)
      if (sql.includes('platform_settings'))
        return { rows: [{ value: { executionConcurrency: 1 } }] }
      return { rows: [] }
    }),
    connect: vi.fn(async () => client),
  }
  return { pool, client, operations }
}

describe('execution queue admission', () => {
  it('waits for an in-flight claim before stopping newly claimed work', async () => {
    const run = { id: '00000000-0000-4000-8000-000000000002', language: 'cpp' } as Run
    const db = queue(0, run)
    let claimed!: () => void
    let resume!: () => void
    let finish!: () => void
    const claiming = new Promise<void>((resolve) => {
      claimed = resolve
    })
    const paused = new Promise<void>((resolve) => {
      resume = resolve
    })
    const running = new Promise<void>((resolve) => {
      finish = resolve
    })
    const query = db.client.query.getMockImplementation()!
    db.client.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('update runs set runner_id=')) {
        claimed()
        await paused
      }
      return query(sql, values)
    })
    const runTask = vi.fn(async () => running)
    const stop = startExecutionQueue(
      db.pool as unknown as Parameters<typeof startExecutionQueue>[0],
      { GO_JUDGE_URL: 'http://legacy' } as Environment,
      runTask as typeof import('./execution.js').execute,
    )
    await claiming
    const stopping = stop()
    expect(db.pool.query.mock.calls.some(([sql]) => sql.includes('stop_requested=true'))).toBe(
      false,
    )
    resume()
    await vi.waitFor(() =>
      expect(db.pool.query.mock.calls.some(([sql]) => sql.includes('stop_requested=true'))).toBe(
        true,
      ),
    )
    const update = db.pool.query.mock.calls.find(([sql]) => sql.includes('stop_requested=true'))
    expect(update?.[1]?.[0]).toEqual([run.id])
    finish()
    await stopping
  })

  it('reaps stale runs, stops queued cancellations, claims under a lock and propagates shutdown', async () => {
    const run = { id: '00000000-0000-4000-8000-000000000001', language: 'python' } as Run
    const db = queue(0, run)
    let finish!: () => void
    const running = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runTask = vi.fn(async () => running)
    const stop = startExecutionQueue(
      db.pool as unknown as Parameters<typeof startExecutionQueue>[0],
      { GO_JUDGE_URL: 'http://legacy' } as Environment,
      runTask as typeof import('./execution.js').execute,
    )
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledOnce())
    expect(db.operations[0]).toContain("updated_at<now()-interval '120 seconds'")
    expect(db.operations[1]).toContain("status='排队' and stop_requested")
    const transaction = db.client.query.mock.calls.map(([sql]) => sql)
    expect(transaction.slice(0, 4)).toEqual([
      'begin',
      'select pg_advisory_xact_lock(782132)',
      expect.stringContaining('select count(*)'),
      expect.stringContaining('from runner_nodes'),
    ])
    expect(transaction[4]).toContain('for update skip locked')
    expect(transaction[4]).toContain("when language='python' then '运行中／可输入'")
    expect(transaction[5]).toBe('commit')
    const stopping = stop()
    await vi.waitFor(() =>
      expect(db.pool.query.mock.calls.some(([sql]) => sql.includes('stop_requested=true'))).toBe(
        true,
      ),
    )
    const update = db.pool.query.mock.calls.find(([sql]) => sql.includes('stop_requested=true'))
    expect(update?.[1]?.[0]).toEqual([run.id])
    finish()
    await stopping
    expect(db.client.release).toHaveBeenCalled()
  })

  it('respects configured concurrency before claiming a queued run', async () => {
    const db = queue(1)
    const runTask = vi.fn(async () => {})
    const stop = startExecutionQueue(
      db.pool as unknown as Parameters<typeof startExecutionQueue>[0],
      { GO_JUDGE_URL: 'http://legacy' } as Environment,
      runTask as typeof import('./execution.js').execute,
    )
    await vi.waitFor(() => expect(db.client.release).toHaveBeenCalledOnce())
    expect(db.client.query.mock.calls.some(([sql]) => sql.includes('skip locked'))).toBe(false)
    expect(runTask).not.toHaveBeenCalled()
    await stop()
  })

  it('limits a worker independently of the global concurrency', async () => {
    const run = { id: '00000000-0000-4000-8000-000000000003', language: 'cpp' } as Run
    const db = queue(0, run)
    db.pool.query.mockImplementation(async (sql) => {
      if (sql.includes('platform_settings'))
        return { rows: [{ value: { executionConcurrency: 4 } }] }
      return { rows: [] }
    })
    let finish!: () => void
    const running = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runTask = vi.fn(async () => running)
    const stop = startExecutionQueue(
      db.pool as unknown as Parameters<typeof startExecutionQueue>[0],
      { WORKER_CONCURRENCY: 1, GO_JUDGE_URL: 'http://legacy' } as Environment,
      runTask as typeof import('./execution.js').execute,
    )
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(runTask).toHaveBeenCalledOnce()
    const stopping = stop()
    finish()
    await stopping
  })

  it('selects an enabled node with capacity and keeps a full node out of admission', async () => {
    const run = { id: '00000000-0000-4000-8000-000000000004', language: 'cpp' } as Run
    const db = queue(0, run)
    const originalQuery = db.client.query.getMockImplementation()!
    db.client.query.mockImplementation(async (sql, values) => {
      if (sql.includes('from runner_nodes'))
        return {
          rows: [
            {
              id: 'full',
              url: 'https://full',
              auth_token: 'a',
              capacity: 1,
              enabled: true,
              active_count: 1,
            },
            {
              id: 'available',
              url: 'https://available',
              auth_token: 'b',
              capacity: 2,
              enabled: true,
              active_count: 0,
            },
          ],
        }
      return originalQuery(sql, values)
    })
    let finish!: () => void
    const running = new Promise<void>((resolve) => {
      finish = resolve
    })
    const runTask = vi.fn(async (_pool: unknown, _environment: Environment, _run: Run) => running)
    const stop = startExecutionQueue(
      db.pool as unknown as Parameters<typeof startExecutionQueue>[0],
      {} as Environment,
      runTask as typeof import('./execution.js').execute,
    )
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledOnce())
    expect(runTask.mock.calls[0]?.[1]).toMatchObject({
      GO_JUDGE_URL: 'https://available',
      GO_JUDGE_AUTH_TOKEN: 'b',
    })
    expect(
      db.client.query.mock.calls.find(([sql]) => sql.startsWith('update runs set runner_id='))?.[1],
    ).toEqual(['available'])
    const stopping = stop()
    finish()
    await stopping
  })
})
