import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default: run unit tests (fast, no external dependencies)
    include: ['tests/unit/**/*.test.ts'],

    // Test environment
    environment: 'node',

    // Global timeout for tests
    testTimeout: 30000,

    // Reporter
    reporters: ['verbose'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/index.ts'], // CLI entry point
    },
  },
});
