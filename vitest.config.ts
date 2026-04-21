import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    exclude: ['**/.worktrees/**', '**/.claude/**', '**/node_modules/**', '**/.git/**'],
    clearMocks: true,
  },
  resolve: {
    alias: {
      // resolve() with a relative path resolves from process.cwd() (project root)
      // Avoids __dirname which is unavailable in ESM contexts
      '@renderer': resolve('src')
    }
  }
})
