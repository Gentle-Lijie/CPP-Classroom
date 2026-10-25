// A single portable basename, never a filesystem path or a compiler argument.
export function validSourceFilename(filename: string): boolean {
  return (
    filename.length <= 80 &&
    /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*\.(cpp|cc|cxx)$/iu.test(filename) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename)
  )
}
