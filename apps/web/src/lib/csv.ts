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

export interface RosterRow {
  name: string
  number: string
  username?: string
  password?: string
}

/** Lossless import/retry content; credentials must not receive CSV export formula escaping. */
export function rosterContent(rows: readonly RosterRow[]) {
  return rows
    .map((row) =>
      [row.name, row.number, row.username ?? '', row.password ?? '']
        .map((cell) => '"' + cell.replaceAll('"', '""') + '"')
        .join(','),
    )
    .join('\r\n')
}

export function parseRoster(content: string): RosterRow[] {
  const text = content.replace(/^\uFEFF/, '')
  if (!text.trim()) throw new Error('请填写或选择学生名单')
  let delimiter = ',',
    inQuotes = false
  for (const char of text.replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/, '')) {
    if (char === '"') inQuotes = !inQuotes
    if (!inQuotes && char === ',') break
    if (!inQuotes && char === '\t') {
      delimiter = '\t'
      break
    }
    if (!inQuotes && (char === '\r' || char === '\n')) break
  }
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
      row.push(field)
      field = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号')
  row.push(field)
  if (row.some((cell) => cell.trim())) rows.push(row)
  let accountColumns: ('username' | 'password')[] = ['username', 'password']
  if (
    /^(姓名|学生姓名|name)$/i.test(rows[0]?.[0]?.trim() ?? '') &&
    /^(学号|number|student.?id)$/i.test(rows[0]?.[1]?.trim() ?? '')
  ) {
    const headers = rows.shift()!
    accountColumns = headers.slice(2).map((header) => {
      if (/^(用户名|登录账号|账号|username)$/i.test(header.trim())) return 'username'
      if (/^(密码|初始密码|password)$/i.test(header.trim())) return 'password'
      throw new Error('名单表头仅支持姓名、学号及可选的用户名、密码列')
    })
    if (new Set(accountColumns).size !== accountColumns.length)
      throw new Error('名单表头的用户名、密码列不能重复')
  }
  if (!rows.length) throw new Error('名单中没有学生')
  if (rows.length > 50) throw new Error('每批最多导入 50 人，请分批导入')
  const numbers = new Set<string>()
  const usernames = new Set<string>()
  return rows.map((cells, i) => {
    if (cells.length < 2 || !cells[0]?.trim() || !cells[1]?.trim())
      throw new Error(`第 ${i + 1} 行需要完整的姓名、学号`)
    if (cells.length > 2 + accountColumns.length)
      throw new Error(`第 ${i + 1} 行列数不匹配，仅支持姓名、学号及可选的用户名、密码列`)
    const name = cells[0].trim(),
      number = cells[1].trim()
    if (name.length > 50 || number.length > 50)
      throw new Error(`第 ${i + 1} 行姓名或学号超过 50 字`)
    if (numbers.has(number)) throw new Error(`名单中学号 ${number} 重复，请先核对`)
    numbers.add(number)
    const result: RosterRow = { name, number }
    for (const [index, key] of accountColumns.entries()) {
      const value = cells[index + 2] ?? ''
      // Match the account API: trim usernames, preserve every password character.
      const normalized = key === 'username' ? value.trim() : value
      if (!normalized) continue
      if (key === 'username') {
        if (normalized.length > 80 || !/^[a-zA-Z0-9._@-]+$/.test(normalized))
          throw new Error(`第 ${i + 1} 行用户名仅限 80 字以内的字母、数字和 . _ @ -`)
        if (usernames.has(normalized)) throw new Error(`名单中用户名 ${normalized} 重复，请先核对`)
        usernames.add(normalized)
      } else if (normalized.length > 200) throw new Error(`第 ${i + 1} 行密码超过 200 字`)
      result[key] = normalized
    }
    return result
  })
}
