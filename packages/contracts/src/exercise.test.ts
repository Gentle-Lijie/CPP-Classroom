import { describe, expect, it } from 'vitest'
import {
  exerciseSourceFilename,
  exerciseStarterCode,
  executionSnapshot,
  validSourceFilename,
} from './index.js'

describe('optional exercise source filename', () => {
  it('uses distinct stable portable names without changing blank exercise fields', () => {
    const first = { id: '11111111-1111-4111-8111-111111111111', filename: '' }
    const second = { id: '22222222-2222-4222-8222-222222222222', filename: '' }
    expect(exerciseSourceFilename(first)).toBe(exerciseSourceFilename({ ...first }))
    expect(exerciseSourceFilename(first)).not.toBe(exerciseSourceFilename(second))
    expect(validSourceFilename(exerciseSourceFilename(first))).toBe(true)
    expect(first.filename).toBe('')
    expect(exerciseSourceFilename({ ...first, filename: '自定义.cpp' })).toBe('自定义.cpp')
  })
})

describe('multi-language exercise sources', () => {
  it('keeps independent starters and treats historical source as C++', () => {
    expect(exerciseStarterCode({ code: 'int main() {}' }, 'python')).toBe('')
    expect(exerciseStarterCode({ content: { code: 'int main() {}' } }, 'cpp')).toBe('int main() {}')
    expect(
      exerciseStarterCode(
        { language: 'python', starters: { cpp: 'cpp', python: '' }, code: 'old' },
        'python',
      ),
    ).toBe('')
    expect(exerciseStarterCode({ language: 'python', code: 'print(1)' }, 'python')).toBe('print(1)')
  })

  it('does not overwrite another exercise when switching extensions', () => {
    const first = { id: '11111111-1111-4111-8111-111111111111', filename: 'sum.cpp' }
    const second = { id: '22222222-2222-4222-8222-222222222222', filename: 'sum.py' }
    expect(exerciseSourceFilename(first, 'python')).not.toBe(
      exerciseSourceFilename(second, 'python'),
    )
    expect(exerciseSourceFilename(first, 'cpp')).toBe('sum.cpp')
    expect(validSourceFilename(exerciseSourceFilename(first, 'python'), 'python')).toBe(true)
    expect(validSourceFilename('sum.py', 'cpp')).toBe(false)
    expect(validSourceFilename('sum.cpp', 'python')).toBe(false)
    expect(validSourceFilename('../sum.py')).toBe(false)
  })

  it('snapshots allowed profiles and rejects unsafe limit values', () => {
    const cpp = executionSnapshot('cpp', {
      compilerProfile: 'gcc13-cpp20',
      runTimeMs: 4000,
      outputLimitKb: -1,
    })
    expect(cpp.runtimeProfile).toBe('gcc13-cpp20')
    expect(cpp.executionConfig).toMatchObject({ runTimeMs: 4000, outputLimitKb: 1024 })
    expect(
      executionSnapshot('python', { compilerProfile: '/bin/sh', runMemoryMb: Infinity }),
    ).toMatchObject({ runtimeProfile: 'cpython3-stdlib', executionConfig: { runMemoryMb: 256 } })
  })
})
