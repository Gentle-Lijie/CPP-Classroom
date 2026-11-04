// This module is deliberately independent of the API, browser storage and file handles.
import { t } from '../i18n'
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
    title: t('demo.guide.exercises.sumTitle'),
    filename: 'sum.cpp',
    description: t('demo.guide.exercises.sumDescription'),
    input: '2 3',
    output: '5',
  },
  {
    id: 'greeting',
    title: t('demo.guide.exercises.greetingTitle'),
    filename: 'hello.cpp',
    description: t('demo.guide.exercises.greetingDescription'),
    input: 'Ada',
    output: 'Hello, Ada!',
  },
] as const
export const sumCode =
  '#include <iostream>\n\nint main() {\n    int a, b;\n    std::cin >> a >> b;\n    std::cout << a + b << std::endl;\n    return 0;\n}'
export const interactiveCode = `#include <iostream>\n\nint main() {\n    int value, sum = 0;\n    std::cout << "${t('demo.guide.interactive.prompt')}" << std::endl;\n    while (std::cin >> value) {\n        sum += value;\n        std::cout << "${t('demo.guide.interactive.running')}" << sum << std::endl;\n    }\n    std::cout << "${t('demo.guide.interactive.closed')}" << sum << std::endl;\n}`
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
    interactiveOutput: `${t('demo.guide.interactive.prompt')}\n${t('demo.guide.interactive.running')}2\n${t('demo.guide.interactive.running')}5\n`,
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
    session.batchError = t('demo.guide.batchError')
    return
  }
  session.batchError = ''
  session.batchOutput = `${Number(values[0]) + Number(values[1])}\n`
}
export function sendMockLine(session: StudentGuideSession, text: string) {
  if (session.interactiveClosed) return false
  const value = text.trim()
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    session.inputError = t('demo.guide.inputError')
    return false
  }
  session.inputError = ''
  session.interactiveInput += value + '\n'
  session.interactiveSum += Number(value)
  session.interactiveOutput += `${t('demo.guide.interactive.running')}${session.interactiveSum}\n`
  return true
}
export function closeMockInput(session: StudentGuideSession) {
  if (session.interactiveClosed) return
  session.interactiveClosed = true
  session.interactiveOutput += `${t('demo.guide.interactive.closed')}${session.interactiveSum}\n`
}
export function resolveMockFileConflict(session: StudentGuideSession, version: 'disk' | 'editor') {
  session.backup = session.editorCode
  if (version === 'disk') session.editorCode = session.diskCode
  else session.diskCode = session.editorCode
  session.conflictResolved =
    version === 'disk' ? t('demo.guide.conflictDisk') : t('demo.guide.conflictEditor')
}
