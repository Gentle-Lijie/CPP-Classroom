import { i18n, t } from '../i18n'
import { parseRoster } from './csv'

export const rosterExcelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function rosterExcelTemplate() {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(t('roster.importDialog.template.sheetName'))
  sheet.columns = [
    {
      header: t('roster.importDialog.template.name'),
      key: 'name',
      width: 20,
      style: { numFmt: '@' },
    },
    {
      header: t('roster.importDialog.template.number'),
      key: 'number',
      width: 28,
      style: { numFmt: '@' },
    },
    {
      header: t('roster.importDialog.template.username'),
      key: 'username',
      width: 28,
      style: { numFmt: '@' },
    },
    {
      header: t('roster.importDialog.template.password'),
      key: 'password',
      width: 28,
      style: { numFmt: '@' },
    },
  ]
  sheet.addRow({
    name: t('roster.importDialog.template.sampleName'),
    number: '0012026001',
    username: 'zhangsan',
    password: 'Class2026!',
  })
  sheet.getCell('C1').note = t('roster.importDialog.template.usernameNote')
  sheet.getCell('D1').note = t('roster.importDialog.template.passwordNote')
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([new Uint8Array(buffer)], { type: rosterExcelMime })
}

export function rosterCsvTemplate() {
  // Fixed GB2312 bytes for the four-column template. No UTF-8 BOM.
  const chinese =
    '\xd0\xd5\xc3\xfb,\xd1\xa7\xba\xc5,\xd3\xc3\xbb\xa7\xc3\xfb,\xc3\xdc\xc2\xeb\r\n\xd5\xc5\xc8\xfd,0012026001,zhangsan,Class2026!\r\n'
  const english =
    'name,student ID,username,password\r\nZhang San,0012026001,zhangsan,Class2026!\r\n'
  const content =
    i18n.global.locale.value === 'en'
      ? new TextEncoder().encode(english)
      : Uint8Array.from(chinese, (char) => char.charCodeAt(0))
  return new Blob([content], { type: 'text/csv;charset=gb2312' })
}

function decodeRosterText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le', { fatal: true }).decode(buffer)
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be', { fatal: true }).decode(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      return new TextDecoder('gb2312', { fatal: true }).decode(buffer)
    } catch {
      throw new Error(t('roster.importDialog.errors.encoding'))
    }
  }
}

export async function readRosterFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>) {
  if (file.size > 1024 * 1024) throw new Error(t('roster.importDialog.errors.tooLarge'))
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !['xlsx', 'csv', 'tsv', 'txt'].includes(extension))
    throw new Error(t('roster.importDialog.errors.unsupported'))
  const buffer = await file.arrayBuffer()
  let content: string
  if (extension === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(buffer)
    } catch {
      throw new Error(t('roster.importDialog.errors.excelReadFailed'))
    }
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error(t('roster.importDialog.errors.noWorksheet'))
    const rows: string[][] = []
    sheet.eachRow((row) => {
      const cells = ['', '']
      row.eachCell((cell, column) => {
        if (cell.value === null || cell.value === '') return
        if (column > 4) throw new Error(t('roster.importDialog.errors.tooManyColumns'))
        if (typeof cell.value !== 'string' && typeof cell.value !== 'number')
          throw new Error(t('roster.importDialog.errors.nonTextCell', { row: row.number }))
        if (typeof cell.value === 'number' && !Number.isSafeInteger(cell.value))
          throw new Error(t('roster.importDialog.errors.unsafeInteger', { row: row.number }))
        let value = String(cell.value)
        // Excel can store 00123 as the number 123 with the custom format 00000.
        if (column >= 2 && typeof cell.value === 'number' && /^0{1,200}$/.test(cell.numFmt))
          value = value.padStart(cell.numFmt.length, '0')
        while (cells.length < column) cells.push('')
        cells[column - 1] = value
      })
      if (cells.some((cell) => cell.trim())) rows.push(cells)
      if (rows.length > 51) throw new Error(t('roster.importDialog.errors.tooManyRows'))
    })
    content = rows
      .map((row) => row.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(','))
      .join('\r\n')
  } else content = decodeRosterText(buffer)
  // Reject the entire file before displaying rows or creating any accounts.
  parseRoster(content)
  return content
}
