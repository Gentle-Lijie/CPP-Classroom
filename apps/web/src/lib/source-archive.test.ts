import { describe, expect, it } from 'vitest'
import { sourceArchive, safeArchivePart } from './source-archive'

describe('source archives', () => {
  it('writes a UTF-8 ZIP with standard CRC32, directory offsets and source contents', async () => {
    const blob = sourceArchive([
      { name: '学生/main.cpp', content: '123456789' },
      { name: '清单.csv', content: '姓名,学号\r\n张三,001' },
    ])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(14, true)).toBe(0xcbf43926)
    expect(view.getUint16(6, true)).toBe(0x0800)
    const directory = view.getUint32(bytes.length - 6, true)
    expect(view.getUint32(directory, true)).toBe(0x02014b50)
    expect(view.getUint32(directory + 42, true)).toBe(0)
    expect(view.getUint16(bytes.length - 12, true)).toBe(2)
    expect(new TextDecoder().decode(bytes)).toContain('张三,001')
  })
  it('prevents path traversal and sanitizes platform-specific filename characters', () => {
    expect(() => sourceArchive([{ name: '../bad.cpp', content: '' }])).toThrow('文件名无效')
    expect(safeArchivePart('../name:one')).toBe('.._name_one')
    expect(safeArchivePart('..')).toBe('_')
  })
})
