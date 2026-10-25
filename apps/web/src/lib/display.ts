export function formatTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
export function shortId(value?: string) {
  return value ? value.slice(0, 8) : '—'
}
export function compilerLabel(profile?: string) {
  return profile === 'gcc13-cpp20'
    ? 'GCC 13.3 / C++20'
    : profile === 'gcc13-cpp17'
      ? 'GCC 13.3 / C++17'
      : '未记录编译配置'
}
