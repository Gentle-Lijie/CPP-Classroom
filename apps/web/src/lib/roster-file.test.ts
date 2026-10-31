import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseRoster } from './csv'
import {
  readRosterFile,
  rosterCsvTemplate,
  rosterExcelMime,
  rosterExcelTemplate,
} from './roster-file'

function file(name: string, blob: Blob) {
  return { name, size: blob.size, arrayBuffer: () => blob.arrayBuffer() }
}

async function excelFile(rows: ExcelJS.CellValue[][]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('名单')
  sheet.addRows(rows)
  sheet.getCell('B2').numFmt = '00000'
  const buffer = await workbook.xlsx.writeBuffer()
  return file('名单.XLSX', new Blob([new Uint8Array(buffer)]))
}

describe('roster file templates and import', () => {
  it('round-trips the Excel template with Chinese and text student numbers', async () => {
    const blob = await rosterExcelTemplate()
    expect(blob.type).toBe(rosterExcelMime)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blob.arrayBuffer())
    const sheet = workbook.worksheets[0]!
    expect(sheet.getCell('B2').value).toBe('0012026001')
    expect(sheet.getColumn(2).numFmt).toBe('@')
    expect(sheet.getColumn(3).numFmt).toBe('@')
    expect(sheet.getColumn(4).numFmt).toBe('@')
    expect([1, 2, 3, 4].map((column) => sheet.getCell(1, column).value)).toEqual([
      '姓名',
      '学号',
      '用户名',
      '密码',
    ])
    expect(parseRoster(await readRosterFile(file('名单.xlsx', blob)))).toEqual([
      { name: '张三', number: '0012026001', username: 'zhangsan', password: 'Class2026!' },
    ])
  })

  it('downloads actual GB2312 bytes and imports them without corrupting Chinese', async () => {
    const blob = rosterCsvTemplate()
    expect(blob.type).toBe('text/csv;charset=gb2312')
    const buffer = await blob.arrayBuffer()
    expect([...new Uint8Array(buffer).slice(0, 4)]).toEqual([0xd0, 0xd5, 0xc3, 0xfb])
    expect(new TextDecoder('gb2312', { fatal: true }).decode(buffer)).toBe(
      '姓名,学号,用户名,密码\r\n张三,0012026001,zhangsan,Class2026!\r\n',
    )
    expect(parseRoster(await readRosterFile(file('名单.csv', blob)))).toEqual([
      { name: '张三', number: '0012026001', username: 'zhangsan', password: 'Class2026!' },
    ])
  })

  it('keeps UTF-8 BOM CSV and Excel tab-separated paste compatible', async () => {
    for (const [name, content] of [
      ['名单.csv', '\uFEFF姓名,学号\r\n李四,0002'],
      ['名单.tsv', '姓名\t学号\r\n李四\t0002'],
    ])
      expect(parseRoster(await readRosterFile(file(name!, new Blob([content!]))))).toEqual([
        { name: '李四', number: '0002' },
      ])
  })

  it('preserves Excel zero formats, quoted names and large text identifiers', async () => {
    const input = await excelFile([
      ['姓名', '学号'],
      ['王,明', 123],
      ['李四', '001234567890123456789'],
    ])
    expect(parseRoster(await readRosterFile(input))).toEqual([
      { name: '王,明', number: '00123' },
      { name: '李四', number: '001234567890123456789' },
    ])
  })

  it('reads optional credentials in spreadsheets and encoded text without losing characters', async () => {
    const rows = [
      { name: '王明', number: '00123', username: 'wang.ming', password: '  pass,"word"  ' },
      { name: '李四', number: '002', password: '001234' },
      { name: '张三', number: '003', username: 'zhang.san' },
      { name: '赵六', number: '004' },
    ]
    const input = await excelFile([
      ['姓名', '学号', '用户名', '密码'],
      ...rows.map((row) => [row.name, row.number, row.username ?? '', row.password ?? '']),
    ])
    expect(parseRoster(await readRosterFile(input))).toEqual(rows)
    for (const name of ['名单.csv', '名单.tsv', '名单.txt']) {
      const delimiter = name.endsWith('.csv') ? ',' : '\t'
      const content = [
        ['姓名', '学号', '用户名', '密码'],
        ['王明', '00123', 'wang.ming', '001234'],
      ]
        .map((row) => row.join(delimiter))
        .join('\r\n')
      expect(parseRoster(await readRosterFile(file(name, new Blob([content]))))).toEqual([
        { name: '王明', number: '00123', username: 'wang.ming', password: '001234' },
      ])
    }
  })

  it('preserves number formatting for spreadsheet usernames and passwords', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('名单')
    sheet.addRows([
      ['姓名', '学号', '用户名', '密码'],
      ['王明', '00123', 12, 1234],
    ])
    sheet.getCell('C2').numFmt = '00000'
    sheet.getCell('D2').numFmt = '000000'
    const buffer = await workbook.xlsx.writeBuffer()
    expect(
      parseRoster(await readRosterFile(file('名单.xlsx', new Blob([new Uint8Array(buffer)])))),
    ).toEqual([{ name: '王明', number: '00123', username: '00012', password: '001234' }])
  })

  it('validates every spreadsheet row before accounts can be created', async () => {
    const cases: [ExcelJS.CellValue[][], string][] = [
      [
        [
          ['姓名', '学号'],
          ['张三', '1'],
          ['李四', '1'],
        ],
        '重复',
      ],
      [
        [
          ['姓名', '学号'],
          ['张三', ''],
        ],
        '完整',
      ],
      [
        [
          ['姓名', '学号'],
          ['张三', '1', 'account', 'password', '多余列'],
        ],
        '四列',
      ],
      [
        [
          ['姓名', '学号'],
          ['张三', { formula: '1+1', result: 2 }],
        ],
        '公式',
      ],
      [
        [
          ['姓名', '学号'],
          ['张三', Number.MAX_SAFE_INTEGER + 1],
        ],
        '文本',
      ],
      [[['姓名', '学号'], ...Array.from({ length: 51 }, (_, i) => ['学生', String(i)])], '50'],
    ]
    for (const [rows, message] of cases)
      await expect(readRosterFile(await excelFile(rows))).rejects.toThrow(message)
  })

  it('rejects empty, corrupt, unsupported and oversized files', async () => {
    await expect(readRosterFile(await excelFile([]))).rejects.toThrow('请填写或选择学生名单')
    await expect(readRosterFile(file('损坏.xlsx', new Blob(['not excel'])))).rejects.toThrow(
      '无法读取 Excel',
    )
    await expect(readRosterFile(file('名单.xls', new Blob(['legacy'])))).rejects.toThrow(
      '另存为 .xlsx',
    )
    await expect(
      readRosterFile(file('名单.csv', new Blob([new Uint8Array(1024 * 1024 + 1)]))),
    ).rejects.toThrow('1 MiB')
  })
})
