import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // E2E tests only
    include: ['tests/e2e/**/*.test.ts'],

    // Test environment
    environment: 'node',

    // Longer timeout for E2E tests (file I/O, CLI execution)
    testTimeout: 60000,

    // Run tests sequentially (they share filesystem state)
    sequence: {
      concurrent: false,
    },

    // Reporter with timing info
    reporters: ['verbose'],

    // Output directory for test results (mounted from Docker)
    outputFile: {
      json: './test-results/e2e-results.json',
    },
  },
});
