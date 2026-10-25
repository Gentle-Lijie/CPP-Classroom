export interface PlatformDraft {
  goJudgeUrl: string
  goJudgeTimeoutMs: number
  compilerProfile: 'gcc13-cpp17' | 'gcc13-cpp20'
  compileTimeMs: number
  compileMemoryMb: number
  runTimeMs: number
  runMemoryMb: number
  outputLimitKb: number
  classroomCapacity: number
  executionConcurrency: number
  recordRetentionDays: number
  allowResubmit: boolean
  archiveReadonly: boolean
}
export const platformDraftKey = 'cpp-ui-platform-draft-v1'
export const defaultPlatformDraft: PlatformDraft = {
  goJudgeUrl: '',
  goJudgeTimeoutMs: 2000,
  compilerProfile: 'gcc13-cpp17',
  compileTimeMs: 10000,
  compileMemoryMb: 512,
  runTimeMs: 2000,
  runMemoryMb: 256,
  outputLimitKb: 1024,
  classroomCapacity: 50,
  executionConcurrency: 8,
  recordRetentionDays: 30,
  allowResubmit: true,
  archiveReadonly: true,
}
const limits: Record<
  Exclude<
    keyof PlatformDraft,
    'goJudgeUrl' | 'compilerProfile' | 'allowResubmit' | 'archiveReadonly'
  >,
  [number, number]
> = {
  goJudgeTimeoutMs: [100, 30000],
  compileTimeMs: [100, 120000],
  compileMemoryMb: [16, 8192],
  runTimeMs: [100, 60000],
  runMemoryMb: [16, 4096],
  outputLimitKb: [16, 16384],
  classroomCapacity: [1, 50],
  executionConcurrency: [1, 64],
  recordRetentionDays: [1, 3650],
}
export function validatePlatformDraft(value: PlatformDraft): string | null {
  if (value.goJudgeUrl) {
    try {
      const url = new URL(value.goJudgeUrl)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return '节点地址仅支持 HTTP(S)，认证信息请在服务端配置，地址中不能包含凭据、查询参数或片段。'
    } catch {
      return '请输入有效的 go-judge 地址，例如 http://10.10.0.20:5050。'
    }
  }
  if (!['gcc13-cpp17', 'gcc13-cpp20'].includes(value.compilerProfile))
    return '请选择受控的编译环境。'
  for (const [key, [min, max]] of Object.entries(limits)) {
    const number = value[key as keyof typeof limits]
    if (!Number.isInteger(number) || number < min || number > max)
      return `请检查数值范围：${key} 应为 ${min}–${max} 之间的整数。`
  }
  return null
}
export function sanitizePlatformDraft(raw: unknown): PlatformDraft {
  const result = { ...defaultPlatformDraft }
  if (!raw || typeof raw !== 'object') return result
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(result) as (keyof PlatformDraft)[]) {
    if (typeof record[key] === typeof result[key]) Object.assign(result, { [key]: record[key] })
  }
  return validatePlatformDraft(result) ? { ...defaultPlatformDraft } : result
}
export function loadPlatformDraft(): PlatformDraft {
  try {
    return sanitizePlatformDraft(JSON.parse(localStorage.getItem(platformDraftKey) ?? 'null'))
  } catch {
    return { ...defaultPlatformDraft }
  }
}
