import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('../..', import.meta.url))
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
