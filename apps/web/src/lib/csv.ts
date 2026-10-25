/** Excel-compatible UTF-8 CSV, including protection against spreadsheet formulas. */
export function csvDocument(rows: (string | number)[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value)
            if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text
            return '"' + text.replaceAll('"', '""') + '"'
          })
          .join(','),
      )
      .join('\r\n')
  )
}

export function parseRoster(content: string): { name: string; number: string }[] {
  const text = content.replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('请填写或选择学生名单')
  const delimiter = text.split(/\r?\n/, 1)[0]!.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (quoted || !field.trim()) quoted = !quoted
      else throw new Error('CSV 引号格式不正确，请使用名单模板')
    } else if (!quoted && char === delimiter) {
      row.push(field.trim())
      field = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  if (
    /^(姓名|学生姓名|name)$/i.test(rows[0]?.[0] ?? '') &&
    /^(学号|number|student.?id)$/i.test(rows[0]?.[1] ?? '')
  )
    rows.shift()
  if (!rows.length) throw new Error('名单中没有学生')
  if (rows.length > 50) throw new Error('每批最多导入 50 人，请分批导入')
  const numbers = new Set<string>()
  return rows.map((cells, i) => {
    if (cells.length !== 2 || !cells[0] || !cells[1])
      throw new Error(`第 ${i + 1} 行需要完整的姓名、学号两列`)
    const [name, number] = cells as [string, string]
    if (name.length > 50 || number.length > 50)
      throw new Error(`第 ${i + 1} 行姓名或学号超过 50 字`)
    if (numbers.has(number)) throw new Error(`名单中学号 ${number} 重复，请先核对`)
    numbers.add(number)
    return { name, number }
  })
}
