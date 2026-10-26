// This module is deliberately independent of the API, browser storage and file handles.
export type StudentGuideScene =
  | 'overview'
  | 'exercises'
  | 'editor'
  | 'directory'
  | 'conflict'
  | 'batch'
  | 'interactive'
  | 'diagnostics'
  | 'submission'
  | 'history'

export const guideExercises = [
  {
    id: 'sum',
    title: '两数之和',
    filename: 'sum.cpp',
    description: '读取两个整数，输出它们的和。',
    input: '2 3',
    output: '5',
  },
  {
    id: 'greeting',
    title: '问候程序',
    filename: 'hello.cpp',
    description: '读取一个名字，输出一句问候。',
    input: 'Ada',
    output: 'Hello, Ada!',
  },
] as const
export const sumCode =
  '#include <iostream>\n\nint main() {\n    int a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << std::endl;\n    return 0;\n}'
export const interactiveCode =
  '#include <iostream>\n\nint main() {\n    int value, sum = 0;\n    std::cout << "请输入整数：" << std::endl;\n    while (std::cin >> value) {\n        sum += value;\n        std::cout << "累计：" << sum << std::endl;\n    }\n    std::cout << "输入结束，总和：" << sum << std::endl;\n}'
export const brokenCode =
  '#include <iostream>\n\nint main() {\n    int a = 2, b = 3;\n    std::cout << a + b << std::endl\n    return 0;\n}'
export const compilerDiagnostic =
  "sum.cpp:5:36: error: expected ';' before 'return'\n    5 |     std::cout << a + b << std::endl\n      |                                    ^\n      |                                    ;"
export function createStudentGuideSession() {
  return {
    exerciseId: 'sum',
    directoryConnected: false,
    diskCode: sumCode,
    editorCode: sumCode,
    conflictResolved: '',
    backup: '',
    batchInput: '2 3',
    batchOutput: '5\n',
    batchError: '',
    interactiveSum: 5,
    interactiveInput: '2\n3\n',
    interactiveOutput: '请输入整数：\n累计：2\n累计：5\n',
    interactiveClosed: false,
    inputError: '',
    errorFixed: false,
    helped: false,
    submitted: false,
  }
}
export type StudentGuideSession = ReturnType<typeof createStudentGuideSession>
export function runMockBatch(session: StudentGuideSession) {
  if (session.exerciseId === 'greeting') {
    session.batchOutput = `Hello, ${session.batchInput.trim() || 'Ada'}!\n`
    session.batchError = ''
    return
  }
  const values = session.batchInput.trim().split(/\s+/)
  if (values.length !== 2 || values.some((value) => !/^-?\d+$/.test(value))) {
    session.batchError = '这个模拟程序需要两个整数，例如 2 3。'
    return
  }
  session.batchError = ''
  session.batchOutput = `${Number(values[0]) + Number(values[1])}\n`
}
export function sendMockLine(session: StudentGuideSession, text: string) {
  if (session.interactiveClosed) return false
  const value = text.trim()
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    session.inputError = '请输入一个整数，例如 4。'
    return false
  }
  session.inputError = ''
  session.interactiveInput += value + '\n'
  session.interactiveSum += Number(value)
  session.interactiveOutput += `累计：${session.interactiveSum}\n`
  return true
}
export function closeMockInput(session: StudentGuideSession) {
  if (session.interactiveClosed) return
  session.interactiveClosed = true
  session.interactiveOutput += `输入结束，总和：${session.interactiveSum}\n`
}
export function resolveMockFileConflict(session: StudentGuideSession, version: 'disk' | 'editor') {
  session.backup = session.editorCode
  if (version === 'disk') session.editorCode = session.diskCode
  else session.diskCode = session.editorCode
  session.conflictResolved =
    version === 'disk' ? '已读取模拟磁盘文件，读取前的草稿已保留。' : '已用模拟草稿覆盖磁盘文件。'
}
