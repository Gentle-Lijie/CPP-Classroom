import { describe, expect, it } from 'vitest'
import {
  closeMockInput,
  createStudentGuideSession,
  resolveMockFileConflict,
  runMockBatch,
  sendMockLine,
} from './student-guide-demo'

describe('isolated student guide simulations', () => {
  it('runs sample input locally and preserves the previous output for malformed input', () => {
    const session = createStudentGuideSession()
    session.batchInput = '12\n-3'
    runMockBatch(session)
    expect(session.batchOutput).toBe('9\n')
    session.batchInput = 'not an integer'
    runMockBatch(session)
    expect(session.batchError).toContain('两个整数')
    expect(session.batchOutput).toBe('9\n')
  })
  it('sends complete lines and closes input exactly once with EOF', () => {
    const session = createStudentGuideSession()
    expect(sendMockLine(session, '4')).toBe(true)
    expect(session.interactiveInput).toBe('2\n3\n4\n')
    expect(session.interactiveOutput).toContain('累计：9')
    closeMockInput(session)
    const completed = session.interactiveOutput
    expect(completed).toContain('输入结束，总和：9')
    expect(sendMockLine(session, '100')).toBe(false)
    closeMockInput(session)
    expect(session.interactiveOutput).toBe(completed)
  })
  it('rejects malformed interactive input without changing the transcript or sum', () => {
    const session = createStudentGuideSession()
    expect(sendMockLine(session, '2 3')).toBe(false)
    expect(session.interactiveSum).toBe(5)
    expect(session.interactiveInput).toBe('2\n3\n')
    expect(session.inputError).toBeTruthy()
  })
  it('keeps a backup when choosing a simulated disk version and isolates every new guide', () => {
    const first = createStudentGuideSession()
    const second = createStudentGuideSession()
    const editor = first.editorCode
    first.diskCode = '// edited elsewhere'
    resolveMockFileConflict(first, 'disk')
    expect(first.editorCode).toBe('// edited elsewhere')
    expect(first.backup).toBe(editor)
    expect(second.editorCode).toBe(editor)
    expect(second.backup).toBe('')
    first.editorCode = '// keep editor'
    resolveMockFileConflict(first, 'editor')
    expect(first.diskCode).toBe('// keep editor')
    expect(second.diskCode).toBe(editor)
  })
})
