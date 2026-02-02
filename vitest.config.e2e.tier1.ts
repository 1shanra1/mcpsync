import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tier 1: Fixture-based E2E tests - exclude CLI detection
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/e2e/cli-compat.e2e.test.ts'],

    environment: 'node',
    testTimeout: 60000,

    // CRITICAL: Run test files sequentially - they share HOME/filesystem state
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },

    reporters: ['verbose'],
    outputFile: {
      json: './test-results/e2e-tier1-results.json',
    },
  },
});
