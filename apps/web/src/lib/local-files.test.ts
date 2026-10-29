import { describe, expect, it, vi } from 'vitest'
import {
  DiskConflictError,
  readSourceFile,
  writeSourceFile,
  type SourceFileHandle,
} from './local-files'
import { validSourceFilename } from './source-file'
import { renderMarkdown } from './markdown'

function memoryFile(initial: string, failWrite = false) {
  let text = initial
  let pending = initial
  const abort = vi.fn(async () => {})
  const createWritable = vi.fn(async () => ({
    write: async (data: string) => {
      if (failWrite) throw new Error('disk full')
      pending = data
    },
    close: async () => {
      text = pending
    },
    abort,
  }))
  const handle: SourceFileHandle = {
    name: 'sum.cpp',
    getFile: async () => new File([text], 'sum.cpp'),
    createWritable,
  }
  return { handle, createWritable, abort, text: () => text }
}
describe('local source files', () => {
  it('writes Python source without reinterpreting its extension or contents', async () => {
    const disk = memoryFile('print("原文")')
    disk.handle.name = '练习.py'
    await writeSourceFile(disk.handle, 'print("原文")', 'print("新草稿")')
    expect(disk.text()).toBe('print("新草稿")')
  })
  it('writes the selected file only when its previous contents match', async () => {
    const disk = memoryFile('old')
    await writeSourceFile(disk.handle, 'old', 'new')
    expect(disk.text()).toBe('new')
  })
  it('does not overwrite externally modified files', async () => {
    const disk = memoryFile('changed outside')
    await expect(writeSourceFile(disk.handle, 'old', 'my draft')).rejects.toBeInstanceOf(
      DiskConflictError,
    )
    expect(disk.text()).toBe('changed outside')
    expect(disk.createWritable).not.toHaveBeenCalled()
  })
  it('does not rewrite identical content', async () => {
    const disk = memoryFile('same')
    await writeSourceFile(disk.handle, 'old', 'same')
    expect(disk.createWritable).not.toHaveBeenCalled()
  })
  it('aborts a failed write and preserves original content', async () => {
    const disk = memoryFile('original', true)
    await expect(writeSourceFile(disk.handle, 'original', 'new')).rejects.toThrow('disk full')
    expect(disk.abort).toHaveBeenCalledOnce()
    expect(disk.text()).toBe('original')
  })
  it('rejects oversized source files before reading their contents', async () => {
    const disk = memoryFile('x'.repeat(1024 * 1024 + 1))
    await expect(readSourceFile(disk.handle)).rejects.toThrow('1 MB')
  })
  it('allows portable C++ basenames and rejects paths, device names and other file types', () => {
    for (const name of ['sum.cpp', '题目一.cc', 'HelloWorld.CPP', 'my-solution.cxx'])
      expect(validSourceFilename(name)).toBe(true)
    for (const name of [
      '../sum.cpp',
      'a/b.cpp',
      'a\\b.cpp',
      '.cpp',
      'CON.cpp',
      'sum.cpp.txt',
      '-output.cpp',
      'bad:name.cpp',
    ])
      expect(validSourceFilename(name)).toBe(false)
  })
})
describe('live Markdown preview', () => {
  it('renders teaching content while disabling raw HTML and unsafe links', () => {
    const html = renderMarkdown(
      '## 题目\n\n**求和**\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))',
    )
    expect(html).toContain('<h2>题目</h2>')
    expect(html).toContain('<strong>求和</strong>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })
})
