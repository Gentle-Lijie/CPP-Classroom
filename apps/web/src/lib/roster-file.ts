import { parseRoster } from './csv'

export const rosterExcelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function rosterExcelTemplate() {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('学生名单')
  sheet.columns = [
    { header: '姓名', key: 'name', width: 20, style: { numFmt: '@' } },
    { header: '学号', key: 'number', width: 28, style: { numFmt: '@' } },
    { header: '用户名', key: 'username', width: 28, style: { numFmt: '@' } },
    { header: '密码', key: 'password', width: 28, style: { numFmt: '@' } },
  ]
  sheet.addRow({ name: '张三', number: '0012026001', username: 'zhangsan', password: 'Class2026!' })
  sheet.getCell('C1').note = '可选；留空自动生成。最多 80 字，仅限字母、数字和 . _ @ -。'
  sheet.getCell('D1').note = '可选；留空自动生成。最多 200 字。已有账号保留原用户名和密码。'
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([new Uint8Array(buffer)], { type: rosterExcelMime })
}

export function rosterCsvTemplate() {
  // Fixed GB2312 bytes for the four-column template. No UTF-8 BOM.
  const encoded =
    '\xd0\xd5\xc3\xfb,\xd1\xa7\xba\xc5,\xd3\xc3\xbb\xa7\xc3\xfb,\xc3\xdc\xc2\xeb\r\n\xd5\xc5\xc8\xfd,0012026001,zhangsan,Class2026!\r\n'
  return new Blob([Uint8Array.from(encoded, (char) => char.charCodeAt(0))], {
    type: 'text/csv;charset=gb2312',
  })
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
      throw new Error('无法识别名单编码，请保存为 UTF-8 或 GB2312 CSV 后重试')
    }
  }
}

export async function readRosterFile(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>) {
  if (file.size > 1024 * 1024) throw new Error('文件超过 1 MiB，请分批导入')
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!extension || !['xlsx', 'csv', 'tsv', 'txt'].includes(extension))
    throw new Error('请选择 .xlsx、CSV 或文本名单；旧版 .xls 请另存为 .xlsx')
  const buffer = await file.arrayBuffer()
  let content: string
  if (extension === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.load(buffer)
    } catch {
      throw new Error('无法读取 Excel 文件，请使用模板或另存为 .xlsx 后重试')
    }
    const sheet = workbook.worksheets[0]
    if (!sheet) throw new Error('Excel 文件没有工作表')
    const rows: string[][] = []
    sheet.eachRow((row) => {
      const cells = ['', '']
      row.eachCell((cell, column) => {
        if (cell.value === null || cell.value === '') return
        if (column > 4) throw new Error('名单最多支持姓名、学号、用户名、密码四列，请使用模板')
        if (typeof cell.value !== 'string' && typeof cell.value !== 'number')
          throw new Error(`第 ${row.number} 行请使用文本或整数，不要使用公式或日期`)
        if (typeof cell.value === 'number' && !Number.isSafeInteger(cell.value))
          throw new Error(`第 ${row.number} 行必须为文本或安全范围内的整数`)
        let value = String(cell.value)
        // Excel can store 00123 as the number 123 with the custom format 00000.
        if (column >= 2 && typeof cell.value === 'number' && /^0{1,200}$/.test(cell.numFmt))
          value = value.padStart(cell.numFmt.length, '0')
        while (cells.length < column) cells.push('')
        cells[column - 1] = value
      })
      if (cells.some((cell) => cell.trim())) rows.push(cells)
      if (rows.length > 51) throw new Error('每批最多导入 50 人，请分批导入')
    })
    content = rows
      .map((row) => row.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(','))
      .join('\r\n')
  } else content = decodeRosterText(buffer)
  // Reject the entire file before displaying rows or creating any accounts.
  parseRoster(content)
  return content
}
