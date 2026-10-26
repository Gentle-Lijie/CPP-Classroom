import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { studentGuideActive } from '@/lib/spotlight'
import { validSourceFilename } from '@/lib/source-file'
import {
  DiskConflictError,
  readSourceFile,
  writeSourceFile,
  storedDirectory,
  rememberDirectory,
  type SourceFileHandle,
  type DirectoryHandle,
  type DirectoryPicker,
} from '@/lib/local-files'

interface Options {
  classroomId: Ref<string>
  documentId: Ref<string>
  filename: Ref<string>
  code: Ref<string>
  readonly: Ref<boolean>
}
interface Conflict {
  handle: SourceFileHandle
  disk: string
  filename: string
  key: string
  reason: 'existing' | 'external'
}
export function useLocalDirectory(options: Options) {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
  const supported = !!picker && window.isSecureContext
  const root = shallowRef<DirectoryHandle>()
  const file = shallowRef<SourceFileHandle>()
  const conflict = shallowRef<Conflict>()
  const status = ref('未连接本地目录')
  const needsPermission = ref(false)
  const busy = ref(false)
  const backup = ref<string>()
  let lastDiskText = ''
  let disposed = false
  let writeTimer: ReturnType<typeof setTimeout>
  let polling: ReturnType<typeof setInterval>
  let queue = Promise.resolve()
  let reading = false
  const key = () =>
    options.classroomId.value + ':' + options.documentId.value + ':' + options.filename.value
  function report(error: unknown) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      file.value = undefined
      status.value = '文件已被删除或替换，请重新关联；浏览器草稿保留'
      return
    }
    needsPermission.value = error instanceof DOMException && error.name === 'NotAllowedError'
    status.value = needsPermission.value
      ? '目录授权已失效，请重新授权'
      : error instanceof Error
        ? error.message
        : '本地文件操作失败，浏览器草稿仍保留'
  }
  function setConflict(
    handle: SourceFileHandle,
    disk: string,
    reason: Conflict['reason'],
    documentKey = key(),
  ) {
    if (documentKey !== key() || disposed) return
    clearTimeout(writeTimer)
    conflict.value = { handle, disk, filename: options.filename.value, key: documentKey, reason }
    status.value = '存在文件冲突 · 自动写入已暂停'
  }
  async function write() {
    const handle = file.value
    const documentKey = key()
    const text = options.code.value
    if (
      studentGuideActive.value ||
      !handle ||
      conflict.value ||
      options.readonly.value ||
      needsPermission.value ||
      disposed
    )
      return
    queue = queue
      .catch(() => {})
      .then(async () => {
        if (
          studentGuideActive.value ||
          documentKey !== key() ||
          handle !== file.value ||
          conflict.value ||
          disposed ||
          options.readonly.value
        )
          return
        if (text === lastDiskText) {
          status.value = '已同步到磁盘'
          return
        }
        status.value = '正在写入磁盘…'
        try {
          const operation = () => writeSourceFile(handle, lastDiskText, text)
          if (navigator.locks)
            await navigator.locks.request('cpp-local-file:' + documentKey, operation)
          else await operation()
          if (documentKey === key() && handle === file.value && !disposed) {
            lastDiskText = text
            status.value = options.code.value === text ? '已同步到磁盘' : '等待写入最新修改…'
          }
        } catch (error) {
          if (documentKey !== key() || disposed) return
          if (error instanceof DiskConflictError)
            setConflict(handle, error.disk, 'external', documentKey)
          else report(error)
        }
      })
    await queue
  }
  async function flush() {
    clearTimeout(writeTimer)
    await write()
    await queue
    return (
      !conflict.value &&
      (!file.value || options.readonly.value || options.code.value === lastDiskText)
    )
  }
  async function attach() {
    const directory = root.value
    const documentKey = key()
    const filename = options.filename.value
    if (!directory || options.readonly.value || disposed) return
    if (!validSourceFilename(filename)) {
      status.value = '题目文件名无效，请联系教师'
      return
    }
    busy.value = true
    status.value = '正在关联 ' + filename
    try {
      let handle: SourceFileHandle
      let created = false
      try {
        handle = await directory.getFileHandle(filename)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') {
          handle = await directory.getFileHandle(filename, { create: true })
          created = true
        } else throw error
      }
      const disk = await readSourceFile(handle)
      if (documentKey !== key() || directory !== root.value || disposed) return
      if (created && !disk) {
        file.value = handle
        lastDiskText = disk
        await write()
        return
      }
      if (disk && disk !== options.code.value) {
        setConflict(handle, disk, 'existing', documentKey)
        return
      }
      // An empty existing file is still user data: offer the same explicit choice.
      if (disk !== options.code.value) {
        const current = await handle.getFile()
        if (current.size === 0) {
          setConflict(handle, disk, 'existing', documentKey)
          return
        }
      }
      file.value = handle
      lastDiskText = disk
      status.value = '已同步到磁盘'
    } catch (error) {
      if (documentKey === key() && !disposed) report(error)
    } finally {
      if (!disposed) busy.value = false
    }
  }
  async function connect() {
    if (!supported || busy.value || options.readonly.value) return
    // The permission request and picker must originate in this user click.
    busy.value = true
    try {
      if (root.value) {
        const permission =
          (await root.value.requestPermission?.({ mode: 'readwrite' })) ?? 'granted'
        if (permission !== 'granted') {
          needsPermission.value = true
          status.value = '未获得目录读写权限，浏览器草稿仍保留'
          return
        }
      } else {
        const selected = await picker!.call(window, { mode: 'readwrite', id: 'cpp-classroom' })
        if (disposed) return
        root.value = selected
        try {
          await rememberDirectory(options.classroomId.value, selected)
        } catch {
          status.value = '目录已授权，但浏览器无法记住该目录'
        }
      }
      needsPermission.value = false
      await attach()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) report(error)
    } finally {
      busy.value = false
    }
  }
  async function useDisk() {
    const pending = conflict.value
    if (!pending || pending.key !== key() || options.readonly.value) return
    busy.value = true
    try {
      const disk = await readSourceFile(pending.handle)
      if (pending.key !== key() || disposed) return
      backup.value = options.code.value
      lastDiskText = disk
      file.value = pending.handle
      conflict.value = undefined
      options.code.value = disk
      status.value = '已读取磁盘版本 · 自动保存已连接'
    } catch (error) {
      report(error)
    } finally {
      busy.value = false
    }
  }
  async function useEditor() {
    const pending = conflict.value
    if (!pending || pending.key !== key() || options.readonly.value) return
    busy.value = true
    try {
      const text = options.code.value
      const operation = () => writeSourceFile(pending.handle, pending.disk, text)
      if (navigator.locks) await navigator.locks.request('cpp-local-file:' + pending.key, operation)
      else await operation()
      if (pending.key !== key() || disposed) return
      file.value = pending.handle
      lastDiskText = text
      conflict.value = undefined
      status.value = '已同步到磁盘'
      if (options.code.value !== text) await write()
    } catch (error) {
      if (error instanceof DiskConflictError)
        setConflict(pending.handle, error.disk, 'external', pending.key)
      else report(error)
    } finally {
      busy.value = false
    }
  }
  function cancelConflict() {
    conflict.value = undefined
    file.value = undefined
    status.value = '尚未关联当前文件 · 浏览器草稿保留'
  }
  async function disconnect() {
    if (busy.value) return
    busy.value = true
    try {
      clearTimeout(writeTimer)
      const saved = await flush()
      if (!saved || conflict.value) return
      file.value = undefined
      let forgetFailed = false
      await rememberDirectory(options.classroomId.value).catch(() => {
        forgetFailed = true
      })
      root.value = undefined
      needsPermission.value = false
      status.value = forgetFailed
        ? '已断开目录，但浏览器未能清除目录记录'
        : '已断开目录 · 浏览器草稿保留'
    } finally {
      busy.value = false
    }
  }
  watch(options.code, (value) => {
    if (
      !file.value ||
      conflict.value ||
      options.readonly.value ||
      value === lastDiskText ||
      disposed
    )
      return
    clearTimeout(writeTimer)
    status.value = '等待写入磁盘…'
    writeTimer = setTimeout(() => {
      void write()
    }, 750)
  })
  watch(studentGuideActive, (active) => {
    if (
      !active &&
      file.value &&
      !options.readonly.value &&
      !conflict.value &&
      options.code.value !== lastDiskText
    )
      void write()
  })
  watch(options.readonly, (readonly) => {
    if (!readonly && file.value && !conflict.value && options.code.value !== lastDiskText)
      void write()
  })
  watch(
    () => [options.documentId.value, options.filename.value, options.classroomId.value],
    () => {
      clearTimeout(writeTimer)
      file.value = undefined
      conflict.value = undefined
      lastDiskText = ''
      backup.value = undefined
      status.value = root.value ? '练习或文件名已变更，请关联当前文件' : '未连接本地目录'
    },
  )
  onMounted(async () => {
    if (!supported) return
    try {
      const saved = await storedDirectory(options.classroomId.value)
      if (disposed) return
      if (saved && !root.value) {
        root.value = saved
        const permission = (await saved.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt'
        if (disposed) return
        needsPermission.value = permission !== 'granted'
        status.value = needsPermission.value
          ? '已记住目录，请点击重新授权'
          : '已记住目录，请关联当前文件'
      }
    } catch {
      /* The picker remains available when IndexedDB is disabled. */
    }
    polling = setInterval(async () => {
      const handle = file.value
      const documentKey = key()
      if (
        studentGuideActive.value ||
        !handle ||
        reading ||
        conflict.value ||
        needsPermission.value ||
        options.readonly.value ||
        disposed
      )
        return
      reading = true
      try {
        await queue
        if (studentGuideActive.value) return
        const disk = await readSourceFile(handle)
        if (
          studentGuideActive.value ||
          documentKey !== key() ||
          handle !== file.value ||
          disposed ||
          disk === lastDiskText
        )
          return
        if (options.code.value !== lastDiskText) {
          setConflict(handle, disk, 'external', documentKey)
          return
        }
        lastDiskText = disk
        options.code.value = disk
        status.value =
          '已读取外部修改 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false })
      } catch (error) {
        if (documentKey === key() && !disposed) report(error)
      } finally {
        reading = false
      }
    }, 2000)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearTimeout(writeTimer)
    clearInterval(polling)
  })
  return {
    supported,
    root,
    file,
    conflict,
    status,
    needsPermission,
    busy,
    backup,
    connect,
    flush,
    useDisk,
    useEditor,
    cancelConflict,
    disconnect,
  }
}
