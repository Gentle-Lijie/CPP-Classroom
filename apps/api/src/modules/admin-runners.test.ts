import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { Environment } from '@classroom/config'
import { AdminController } from './admin.js'
import type { ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

describe('runner administration', () => {
  const admin = { actor: { id: 'admin', role: 'admin' } } as AuthRequest
  const teacher = { actor: { id: 'teacher', role: 'teacher' } } as AuthRequest
  it('restricts access and never includes a token in audit details', async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 'node' }] }))
    const audit = vi.fn(async () => {})
    const controller = new AdminController(
      { pool: { query }, audit } as unknown as ClassroomService,
      {} as Environment,
    )
    const data = {
      name: 'node',
      url: 'https://runner.example',
      token: 'secret',
      capacity: 2,
      enabled: true,
    }
    await expect(controller.createRunner(teacher, data)).rejects.toThrow()
    await controller.createRunner(admin, data)
    expect(query.mock.calls[0]![1]).toContain('secret')
    expect(JSON.stringify(audit.mock.calls)).not.toContain('secret')
    await expect(
      controller.createRunner(admin, { ...data, url: 'https://user:password@runner.example' }),
    ).rejects.toThrow()
  })
  it('preserves the stored token when omitted on update', async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 'node' }] }))
    const controller = new AdminController(
      { pool: { query }, audit: vi.fn() } as unknown as ClassroomService,
      {} as Environment,
    )
    await controller.updateRunner(admin, '00000000-0000-4000-8000-000000000001', {
      name: 'node',
      url: 'https://runner.example',
      capacity: 2,
      enabled: true,
    })
    expect(query.mock.calls[0]![1]![3]).toBeNull()
  })
  it('tests the authenticated sandbox and does not send a stored token to a different URL', async () => {
    const query = vi.fn(async () => ({
      rows: [{ url: 'https://runner.example', auth_token: 'saved-secret' }],
    }))
    const controller = new AdminController(
      { pool: { query } } as unknown as ClassroomService,
      { GO_JUDGE_TIMEOUT_MS: 2000 } as Environment,
    )
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([{ status: 'Accepted', exitStatus: 0 }]), { status: 200 }),
      )
    try {
      const id = '00000000-0000-4000-8000-000000000001'
      await expect(
        controller.testRunner(teacher, { id, url: 'https://runner.example' }),
      ).rejects.toThrow()
      await expect(
        controller.testRunner(admin, { id, url: 'https://other.example' }),
      ).rejects.toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
      await expect(
        controller.testRunner(admin, { id, url: 'https://runner.example' }),
      ).resolves.toMatchObject({ ok: true })
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://runner.example/run',
        expect.objectContaining({
          method: 'POST',
          redirect: 'error',
          headers: expect.objectContaining({ Authorization: 'Bearer saved-secret' }),
        }),
      )
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }))
      await expect(
        controller.testRunner(admin, { id, url: 'https://runner.example' }),
      ).resolves.toMatchObject({ ok: false })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
