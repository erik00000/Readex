import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^electron$/,
        replacement: resolve('tests/stubs/electron.ts')
      },
      {
        find: '@shared',
        replacement: resolve('src/shared')
      },
      {
        find: '@renderer',
        replacement: resolve('src/renderer/src')
      }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text']
    }
  }
})
