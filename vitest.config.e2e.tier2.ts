import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tier 2: All E2E tests including CLI detection
    include: ['tests/e2e/**/*.test.ts'],

    environment: 'node',
    testTimeout: 120000,

    // CRITICAL: Run test files sequentially - they share HOME/filesystem state
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },

    reporters: ['verbose'],
    outputFile: {
      json: './test-results/e2e-tier2-results.json',
    },
  },
});
