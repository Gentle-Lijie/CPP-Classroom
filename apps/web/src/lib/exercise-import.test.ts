import { describe, expect, it } from 'vitest'
import { exerciseImportLimits } from '@classroom/contracts'
import {
  readExerciseImport,
  exerciseImportConflicts,
  exerciseImportBodySize,
} from './exercise-import'

const file = (name: string, text: string | Uint8Array) => new File([text as BlobPart], name)

describe('batch exercise imports', () => {
  it('reads Markdown and backups as new drafts without restoring IDs, versions or publication', async () => {
    const markdown = await readExerciseImport(
      file('sum.md', '# 求和\n源文件名：sum.cpp\n## 输入\nn'),
    )
    expect(markdown.errors).toEqual([])
    expect(markdown.exercise).toMatchObject({
      title: '求和',
      filename: 'sum.cpp',
      input: 'n',
      status: '草稿',
    })
    const backup = await readExerciseImport(
      file(
        'backup.json',
        JSON.stringify({
          ...markdown.exercise,
          id: 'old-id',
          status: '已发布',
          version: 30,
          position: 1,
          code: 'int main() {\n  return 0;\n}',
        }),
      ),
    )
    expect(backup.errors).toEqual([])
    expect(backup.exercise).not.toHaveProperty('id')
    expect(backup.exercise).not.toHaveProperty('version')
    expect(backup.exercise).not.toHaveProperty('position')
    expect(backup.exercise?.status).toBe('草稿')
    expect(backup.exercise?.code).toBe('int main() {\n  return 0;\n}')
  })
  it('reports bad files individually while preserving valid items and warnings', async () => {
    const entries = await Promise.all([
      readExerciseImport(file('blank.md', ' \n')),
      readExerciseImport(file('broken.json', '{')),
      readExerciseImport(file('array.json', '[]')),
      readExerciseImport(file('binary.md', new Uint8Array([0xff]))),
      readExerciseImport(file('null.md', '\0')),
      readExerciseImport(file('wrong.txt', '题面')),
      readExerciseImport(file('large.md', 'a'.repeat(exerciseImportLimits.fileBytes + 1))),
      readExerciseImport(file('valid.markdown', '## 样例输入 1\n1\n## 样例输入 2\n2')),
    ])
    expect(entries.slice(0, -1).every((entry) => entry.errors.length > 0)).toBe(true)
    expect(entries.at(-1)?.errors).toEqual([])
    expect(entries.at(-1)?.warnings).toHaveLength(1)
  })
  it('validates backup fields as strictly as Markdown and keeps missing titles blank', async () => {
    const blank = await readExerciseImport(file('untitled.md', '正文'))
    expect(blank.exercise?.title).toBe('')
    const oversized = await readExerciseImport(
      file(
        'backup.json',
        JSON.stringify({
          ...blank.exercise,
          title: 'a'.repeat(101),
          filename: '../bad.cpp',
        }),
      ),
    )
    expect(oversized.errors.length).toBeGreaterThan(0)
    const unsafe = await readExerciseImport(
      file('backup.json', JSON.stringify({ ...blank.exercise, filename: '../bad.cpp' })),
    )
    expect(unsafe.errors[0]).toContain('源文件名格式无效')
    const nullCharacter = await readExerciseImport(
      file('backup.json', JSON.stringify({ ...blank.exercise, description: 'bad\0text' })),
    )
    expect(nullCharacter.errors[0]).toContain('空字符')
  })
  it('checks conflicts only among selected rows and existing classroom filenames', async () => {
    const entries = await Promise.all([
      readExerciseImport(file('a.md', '源文件名：sum.cpp')),
      readExerciseImport(file('b.md', '源文件名：SUM.CPP')),
      readExerciseImport(file('c.md', '正文')),
      readExerciseImport(file('d.md', '正文')),
    ])
    expect(exerciseImportConflicts(entries, [0, 1, 2, 3], []).size).toBe(2)
    expect(exerciseImportConflicts(entries, [0, 2, 3], []).size).toBe(0)
    expect(exerciseImportConflicts(entries, [0], [{ filename: 'SUM.CPP' }]).size).toBe(1)
    expect(exerciseImportConflicts(entries, [2, 3], [{ filename: '' }]).size).toBe(0)
  })
  it('counts UTF-8 bytes and JSON escaping for the complete request', async () => {
    const entry = await readExerciseImport(file('a.md', '# 中文题目\n正文\n"quoted"'))
    const payload = { exercises: [entry.exercise!] }
    expect(exerciseImportBodySize(payload.exercises)).toBe(
      Buffer.byteLength(JSON.stringify(payload)),
    )
    expect(exerciseImportBodySize(payload.exercises)).toBeGreaterThan(
      JSON.stringify(payload).length,
    )
  })
})
