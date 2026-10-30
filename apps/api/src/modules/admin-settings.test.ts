import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { executionDefaults, languageSettings } from '@classroom/contracts'
import type { Environment } from '@classroom/config'
import { AdminController } from './admin.js'
import type { ClassroomService } from './classroom.js'
import type { AuthRequest } from './common.js'

describe('language settings', () => {
  it('persists distinct language options and rejects unsafe macros', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const audit = vi.fn(async () => {})
    const controller = new AdminController(
      { pool: { query }, audit } as unknown as ClassroomService,
      {} as Environment,
    )
    const req = { actor: { id: 'admin', role: 'admin' } } as AuthRequest
    const languages = languageSettings()
    languages.cpp.macros = 'DEBUG LEVEL=2'
    languages.python.runTimeMs = 3000
    const settings = { ...executionDefaults, languages }
    await controller.saveSettings(req, settings)
    expect(JSON.parse(query.mock.calls[0]![1]![0] as string).languages).toEqual(languages)
    languages.cpp.macros = 'DEBUG;touch /tmp/file'
    await expect(controller.saveSettings(req, settings)).rejects.toThrow()
    expect(query).toHaveBeenCalledOnce()
  })
})
