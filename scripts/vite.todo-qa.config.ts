import { mergeConfig } from 'vite'
import base from '../vite.config.ts'

export default mergeConfig(base, {
  cacheDir: '.visual-qa/vite-todo-cache',
  server: { watch: { ignored: ['**/.visual-qa/**', '**/src-tauri/target/**', '**/android/**', '**/.android-sdk/**', '**/assets/**'] } },
  optimizeDeps: { entries: ['index.html', 'scripts/fixtures/desktop-todo.html'] },
  build: { outDir: '.visual-qa/todo-bundle', rollupOptions: { input: ['index.html', 'scripts/fixtures/desktop-todo.html'] } },
})
