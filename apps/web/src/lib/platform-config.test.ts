import { describe, expect, it } from 'vitest'
import {
  defaultPlatformDraft,
  sanitizePlatformDraft,
  validatePlatformDraft,
} from './platform-config'
import { isLivePayload, parseReadiness } from './platform-health'
import { diagnosticsMatchVersion, editorRange, isLspRange } from './clangd-protocol'
describe('platform configuration and health payloads', () => {
  it('rejects embedded credentials, unsafe protocols and URL parameters', () => {
    for (const goJudgeUrl of [
      'http://user:secret@example.com',
      'http://example.com?token=secret',
      'file:///tmp/run',
      'javascript:alert(1)',
    ])
      expect(validatePlatformDraft({ ...defaultPlatformDraft, goJudgeUrl })).not.toBeNull()
    expect(
      validatePlatformDraft({ ...defaultPlatformDraft, goJudgeUrl: 'http://10.10.0.20:5050' }),
    ).toBeNull()
  })
  it('does not persist unknown settings or credentials', () => {
    expect(
      sanitizePlatformDraft({
        ...defaultPlatformDraft,
        GO_JUDGE_AUTH_TOKEN: 'secret',
        unknown: true,
      }),
    ).toEqual(defaultPlatformDraft)
    expect(sanitizePlatformDraft({ ...defaultPlatformDraft, executionConcurrency: 0 })).toEqual(
      defaultPlatformDraft,
    )
  })
  it('recognizes unconfigured execution nodes without claiming they are healthy', () => {
    const checks = parseReadiness({
      service: 'cpp-classroom-api',
      checks: {
        database: { status: 'healthy', message: 'db' },
        runner: { status: 'unconfigured', message: 'not configured' },
      },
    })
    expect(checks?.runner.status).toBe('unconfigured')
    expect(parseReadiness({ service: 'other', checks: {} })).toBeNull()
    expect(isLivePayload({ service: 'cpp-classroom-api', status: 'ok' })).toBe(true)
    expect(isLivePayload({ status: 'ok' })).toBe(false)
  })
})
describe('clangd source positions', () => {
  it('translates zero-based UTF-16 positions without byte-based offsets', () => {
    const range = { start: { line: 1, character: 4 }, end: { line: 1, character: 7 } }
    expect(isLspRange(range)).toBe(true)
    expect(editorRange(range)).toEqual({
      startLineNumber: 2,
      startColumn: 5,
      endLineNumber: 2,
      endColumn: 8,
    })
    expect(isLspRange({ start: { line: -1, character: 0 }, end: { line: 0, character: 0 } })).toBe(
      false,
    )
    expect(isLspRange({ start: { line: 2, character: 2 }, end: { line: 1, character: 8 } })).toBe(
      false,
    )
  })
  it('rejects stale or unversioned diagnostics', () => {
    expect(diagnosticsMatchVersion(7, 7)).toBe(true)
    expect(diagnosticsMatchVersion(6, 7)).toBe(false)
    expect(diagnosticsMatchVersion(undefined, 7)).toBe(false)
  })
})
