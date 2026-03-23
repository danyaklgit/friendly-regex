import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/types/tagSpec.ts', 'src/components/shared/**'],
      reporter: ['text', 'json-summary'],
    },
  },
})
