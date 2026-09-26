import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue(), tailwindcss()],
  server: {
    watch: { ignored: ['**/src-tauri/target/**'] },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      '@lucide/vue',
      'hash-wasm',
      '@capacitor/core',
      '@capacitor/local-notifications',
      '@capgo/capacitor-native-biometric',
    ],
  },
})
