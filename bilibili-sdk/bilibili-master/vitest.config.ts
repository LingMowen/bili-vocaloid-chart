import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: [],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { functions: 90, lines: 90, branches: 85, statements: 90 },
    },
    reporters: ['default', 'junit'],
    outputFile: { junit: './test-results/junit.xml' },
  },
})
