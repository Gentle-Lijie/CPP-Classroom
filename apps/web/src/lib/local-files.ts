import { validSourceFilename } from './source-file'

export interface SourceFileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: string): Promise<void>
    close(): Promise<void>
    abort(): Promise<void>
  }>
}
export class DiskConflictError extends Error {
  constructor(public disk: string) {
    super('磁盘文件已被其他程序修改')
  }
}
const maxBytes = 1024 * 1024
export async function readSourceFile(handle: SourceFileHandle) {
  const file = await handle.getFile()
  if (file.size > maxBytes) throw new Error('文件超过 1 MB，请选择单文件源码')
  return file.text()
}
export async function writeSourceFile(handle: SourceFileHandle, expected: string, text: string) {
  if (!validSourceFilename(handle.name)) throw new Error('无效的源文件名')
  if (new Blob([text]).size > maxBytes) throw new Error('代码超过 1 MB，已暂停磁盘写入')
  const current = await readSourceFile(handle)
  if (current !== expected && current !== text) throw new DiskConflictError(current)
  if (current === text) return
  const writer = await handle.createWritable()
  try {
    await writer.write(text)
    await writer.close()
  } catch (error) {
    await writer.abort().catch(() => {})
    throw error
  }
}
export type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
}
export type DirectoryPicker = (options: {
  mode: 'readwrite'
  id: string
}) => Promise<DirectoryHandle>

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cpp-classroom-local-directories', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export async function storedDirectory(classroomId: string): Promise<DirectoryHandle | undefined> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('handles', 'readonly').objectStore('handles').get(classroomId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}
export async function rememberDirectory(classroomId: string, handle?: DirectoryHandle) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('handles', 'readwrite')
      const store = transaction.objectStore('handles')
      if (handle) store.put(handle, classroomId)
      else store.delete(classroomId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
