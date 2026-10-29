import { fileURLToPath, URL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { transform } from 'esbuild'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('../..', import.meta.url))
function pyrightWorkerAsset(): Plugin {
  return {
    name: 'pyright-production-worker-asset',
    enforce: 'pre',
    apply: 'build',
    async load(id) {
      if (!id.endsWith('/monaco-pyright-lsp/dist/worker.js?url')) return
      const path = id.slice(0, -'?url'.length)
      this.addWatchFile(path)
      // The upstream worker is a development bundle. Minify before emitting
      // so the self-hosted, content-hashed asset fits Makers' 25 MB limit.
      const result = await transform(await readFile(path, 'utf8'), {
        loader: 'js',
        minify: true,
        keepNames: true,
        legalComments: 'eof',
        target: 'es2022',
      })
      const reference = this.emitFile({
        type: 'asset',
        name: 'pyright.worker.js',
        source: result.code,
      })
      return `export default import.meta.ROLLUP_FILE_URL_${reference}`
    },
  }
}
function clangdCdnAssets(): Plugin {
  return {
    name: 'clangd-production-cdn-assets',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!id.includes('/@algoproclub/clangd-wasm/lib/clangd.shared-worker.js')) return
      let count = 0
      const transformed = code.replace(
        /new URL\("\.\.\/assets\/(clangd\.wasm|headers\.data|system\.index)",\s*import\.meta\.url\)\.href/g,
        (_match, asset) => {
          count++
          return JSON.stringify(
            `https://cdn.jsdelivr.net/npm/@algoproclub/clangd-wasm@0.1.1/assets/${asset}`,
          )
        },
      )
      if (count !== 3) throw new Error('clangd CDN asset mapping changed; review pinned dependency')
      return { code: transformed, map: null }
    },
  }
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '')
  return {
    plugins: [
      pyrightWorkerAsset(),
      {
        name: 'clangd-shared-worker-vite-compat',
        enforce: 'pre',
        apply: 'serve',
        transform(code, id) {
          if (id.includes('/@algoproclub/clangd-wasm/lib/clangd.shared-worker.js')) {
            // Vite's dev dynamic-import helper requires document. Resolve this
            // known module statically so SharedWorker never imports that helper.
            // Production keeps the package's emitted asset URL unchanged.
            return {
              code: code.replace(
                /import\(\s*\/\* webpackIgnore: true \*\/\s*assets\.runtimeUrl\)/,
                'import("../assets/clangd-runtime.mjs")',
              ),
              map: null,
            }
          }
        },
      },
      vue(),
      tailwindcss(),
    ],
    envDir: root,
    optimizeDeps: {
      exclude: ['@algoproclub/clangd-wasm'],
      include: ['vscode-jsonrpc/browser', 'vscode-jsonrpc/lib/common/messages.js'],
    },
    worker: {
      format: 'es',
      plugins: () => [clangdCdnAssets()],
      rolldownOptions: {
        output: {
          // Makers serves .mjs as application/octet-stream, which browsers
          // reject for dynamic imports. Keep the runtime local with a JS suffix.
          assetFileNames: (asset) =>
            asset.names.includes('clangd-runtime.mjs')
              ? 'assets/[name]-[hash].js'
              : 'assets/[name]-[hash][extname]',
        },
      },
    },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: { '/api': { target: env.VITE_API_TARGET || 'http://127.0.0.1:3000' } },
    },
  }
})
