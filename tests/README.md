# mcp-sync Test Suite

This directory contains the test infrastructure for mcp-sync.

## Test Philosophy

We use a **Docker-first E2E testing approach** to ensure our tool works correctly with real AI coding agent CLIs. This catches breaking changes when tools like Claude Code or Codex update their config formats.

## Test Structure

```
tests/
├── e2e/                    # End-to-end tests (run in Docker)
│   ├── helpers.ts          # Test utilities and CLI execution helpers
│   ├── cli.e2e.test.ts     # CLI command tests
│   └── adapters.e2e.test.ts # Adapter format verification tests
│
├── unit/                   # Unit tests (run locally, fast)
│   ├── redact.test.ts      # Secret redaction tests
│   └── schema.test.ts      # Zod schema validation tests
│
└── README.md               # This file
```

## Running Tests

### Unit Tests (Fast, Local)

```bash
# Run unit tests
npm run test:unit

# Watch mode for development
npm run test:watch
```

### E2E Tests (Docker, Comprehensive)

```bash
# Build and run E2E tests in Docker (recommended)
npm run test:e2e:docker

# Or run directly (requires CLIs installed locally)
npm run test:e2e
```

### All Tests

```bash
npm run test:all
```

## Docker Test Environment

The Docker environment (`Dockerfile.test`) provides:

- **Isolated home directory**: Tests never touch your real `~/.claude.json` or `~/.codex/config.toml`
- **Real CLI installations**: Claude Code and Codex CLIs are installed to verify format compatibility
- **Reproducible environment**: Same results on any machine

### Manual Docker Testing

```bash
# Interactive shell in test container
docker compose -f docker-compose.test.yml run --rm e2e bash

# Inside container, run tests manually
npm run test:e2e

# Or test CLI manually
mcp-sync init
mcp-sync add github --command npx --args -y @modelcontextprotocol/server-github
mcp-sync push
cat ~/.claude.json
```

## Writing Tests

### E2E Tests

E2E tests should:
- Use the `helpers.ts` utilities for CLI execution
- Clean up after themselves (use `beforeEach`/`afterEach`)
- Test real file I/O and CLI behavior
- Verify output formats match what real tools expect

```typescript
import { runCliSuccess, setupTestEnvironment, cleanupTestConfigs } from './helpers.js';

describe('My Feature', () => {
  beforeEach(() => setupTestEnvironment());
  afterEach(() => cleanupTestConfigs());

  it('should do something', () => {
    runCliSuccess('init');
    runCliSuccess('add server --command echo');
    // Verify results...
  });
});
```

### Unit Tests

Unit tests should:
- Test pure functions only (no file I/O)
- Be fast and deterministic
- Not require external dependencies

```typescript
import { redactSecrets } from '../../src/cli/utils/redact.js';

it('should redact secrets', () => {
  expect(redactSecrets('${TOKEN}')).toBe('[REDACTED]');
});
```

## CI Integration

For CI pipelines, use the Docker-based tests:

```yaml
# GitHub Actions example
- name: Run E2E Tests
  run: npm run test:e2e:docker
```

This ensures tests run in the same environment regardless of the CI runner.
