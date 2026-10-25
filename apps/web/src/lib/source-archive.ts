const crcTable = new Uint32Array(256)
for (let index = 0; index < 256; index++) {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
  crcTable[index] = value >>> 0
}

/** A dependency-free ZIP (stored entries, UTF-8 filenames) for classroom source exports. */
export function sourceArchive(files: { name: string; content: string }[]) {
  if (files.length > 65535) throw new Error('文件过多，请分批导出')
  const encoder = new TextEncoder()
  const entries: { name: Uint8Array; content: Uint8Array; crc: number; offset: number }[] = []
  let size = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const content = encoder.encode(file.content)
    if (name.length > 65535 || /(^|\/)\.\.(\/|$)|^\//.test(file.name))
      throw new Error('导出文件名无效')
    let crc = 0xffffffff
    for (const byte of content) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!
    }
    entries.push({ name, content, crc: (crc ^ 0xffffffff) >>> 0, offset: size })
    size += 30 + name.length + content.length
  }
  const directoryOffset = size
  for (const entry of entries) size += 46 + entry.name.length
  if (size > 128 * 1024 * 1024) throw new Error('导出文件超过 128 MiB，请按练习或学生分批导出')
  const bytes = new Uint8Array(size + 22)
  const view = new DataView(bytes.buffer)
  let cursor = 0
  function word(value: number) {
    view.setUint16(cursor, value, true)
    cursor += 2
  }
  function dword(value: number) {
    view.setUint32(cursor, value, true)
    cursor += 4
  }
  function put(value: Uint8Array) {
    bytes.set(value, cursor)
    cursor += value.length
  }
  for (const entry of entries) {
    dword(0x04034b50)
    word(20)
    word(0x0800)
    word(0)
    word(0)
    word(33)
    dword(entry.crc)
    dword(entry.content.length)
    dword(entry.content.length)
    word(entry.name.length)
    word(0)
    put(entry.name)
    put(entry.content)
  }
  for (const entry of entries) {
    dword(0x02014b50)
    word(20)
    word(20)
    word(0x0800)
    word(0)
    word(0)
    word(33)
    dword(entry.crc)
    dword(entry.content.length)
    dword(entry.content.length)
    word(entry.name.length)
    word(0)
    word(0)
    word(0)
    word(0)
    dword(0)
    dword(entry.offset)
    put(entry.name)
  }
  dword(0x06054b50)
  word(0)
  word(0)
  word(entries.length)
  word(entries.length)
  dword(size - directoryOffset)
  dword(directoryOffset)
  word(0)
  return new Blob([bytes], { type: 'application/zip' })
}

export function safeArchivePart(value: string) {
  return (
    value
      .split('')
      .map((char) => (char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '_' : char))
      .join('')
      .replace(/^\.+$/, '_')
      .trim()
      .slice(0, 100) || '未命名'
  )
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
