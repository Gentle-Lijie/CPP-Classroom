import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('../..', import.meta.url))
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
    worker: { format: 'es' },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      proxy: { '/api': { target: env.VITE_API_TARGET || 'http://127.0.0.1:3000' } },
    },
  }
})
