import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url))
let clangdWorkers = 0
async function verify(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await verify(path)
    else if ((await stat(path)).size > 25_000_000)
      throw new Error(`Makers single-file limit exceeded: ${path}`)
    else if (entry.name.startsWith('clangd.shared-worker-')) {
      clangdWorkers++
      const content = await readFile(path, 'utf8')
      for (const asset of ['clangd.wasm', 'headers.data', 'system.index'])
        if (
          !content.includes(
            `https://cdn.jsdelivr.net/npm/@algoproclub/clangd-wasm@0.1.1/assets/${asset}`,
          )
        )
          throw new Error(`Missing pinned clangd CDN URL: ${asset}`)
      const runtime = content.match(/\/assets\/(clangd-runtime-[\w-]+\.js)\b/)?.[1]
      if (!runtime || /clangd-runtime-[\w-]+\.mjs\b/.test(content))
        throw new Error('clangd runtime must use a .js URL for Makers JavaScript MIME support')
      await stat(join(root, 'assets', runtime))
    }
  }
}
await stat(join(root, 'index.html'))
await verify(root)
if (!clangdWorkers) throw new Error('Missing clangd SharedWorker in Makers output')
console.log(
  'Makers output verified: index.html, pinned clangd CDN assets, .js runtime, files below 25 MB',
)
