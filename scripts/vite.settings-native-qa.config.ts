import { mergeConfig } from 'vite'
import base from '../vite.config.ts'

export default mergeConfig(base, {
  cacheDir: '.visual-qa/vite-settings-native-cache',
  build: { outDir: '.visual-qa/settings-native-bundle', rollupOptions: { input: ['index.html', 'scripts/fixtures/desktop-todo.html'] } },
})
