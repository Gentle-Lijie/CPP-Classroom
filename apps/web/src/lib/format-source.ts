import type { SourceLanguage } from '@classroom/contracts'

let cppFormatter: Promise<typeof import('@wasm-fmt/clang-format/vite')> | undefined
let pythonFormatter: Promise<typeof import('@wasm-fmt/ruff_fmt/vite')> | undefined

export async function formatSource(source: string, language: SourceLanguage, filename: string) {
  if (language === 'python') {
    pythonFormatter ??= import('@wasm-fmt/ruff_fmt/vite')
      .then(async (formatter) => {
        await formatter.default()
        return formatter
      })
      .catch((error: unknown) => {
        pythonFormatter = undefined
        throw error
      })
    return (await pythonFormatter).format(source, filename.endsWith('.py') ? filename : 'source.py')
  }
  cppFormatter ??= import('@wasm-fmt/clang-format/vite')
    .then(async (formatter) => {
      await formatter.default()
      return formatter
    })
    .catch((error: unknown) => {
      cppFormatter = undefined
      throw error
    })
  return (await cppFormatter).format(
    source,
    /\.(cpp|cc|cxx)$/i.test(filename) ? filename : 'source.cpp',
    '{BasedOnStyle: LLVM, IndentWidth: 4}',
  )
}
