import { describe, expect, it } from 'vitest'
import { csvDocument, parseRoster } from './csv'

describe('student roster CSV', () => {
  it('keeps leading zeroes and supports BOM, headers, tabs and quoted commas', () => {
    expect(parseRoster('\uFEFF姓名,学号\r\n"王,明",00123')).toEqual([
      { name: '王,明', number: '00123' },
    ])
    expect(parseRoster('姓名\t学号\n王明\t0001')).toEqual([{ name: '王明', number: '0001' }])
  })
  it('rejects partial, duplicate and oversized imports before adding anyone', () => {
    expect(() => parseRoster('王明,1\n王明,1')).toThrow('重复')
    expect(() => parseRoster('王明,')).toThrow('完整')
    expect(() => parseRoster('"王明,1')).toThrow('引号')
    expect(() => parseRoster(Array.from({ length: 51 }, (_, i) => `学生,${i}`).join('\n'))).toThrow(
      '50',
    )
  })
  it('escapes quotes and prevents formula execution in exported cells', () => {
    expect(csvDocument([['=HYPERLINK("evil")', 'a,b']])).toBe(
      '\uFEFF"\'=HYPERLINK(""evil"")","a,b"',
    )
  })
})
