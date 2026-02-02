/**
 * Unit Tests: Schema Validation
 *
 * Tests for Zod schema validation of canonical config.
 * These test the pure validation logic without file I/O.
 */

import { describe, it, expect } from 'vitest';
import { validateConfigSafe, StdioServerSchema, HttpServerSchema } from '../../src/core/schema.js';

describe('Schema Validation', () => {
  // ===========================================================================
  // CanonicalConfig Schema
  // ===========================================================================

  describe('CanonicalConfigSchema', () => {
    it('should validate minimal valid config', () => {
      const config = {
        version: '1',
        servers: {},
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should validate full config with all fields', () => {
      const config = {
        version: '1',
        defaults: {
          timeout: 120,
          autoApprove: false,
        },
        servers: {
          github: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
          },
        },
        agents: {
          'claude-code': { enabled: true, scope: 'global' },
        },
        exclusions: [{ server: 'github', agent: 'codex', reason: 'Not needed for Codex' }],
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid version', () => {
      const config = {
        version: '2', // Invalid - only '1' is supported
        servers: {},
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });

    it('should reject missing version', () => {
      const config = {
        servers: {},
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });

    it('should reject missing servers', () => {
      const config = {
        version: '1',
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // StdioServer Schema
  // ===========================================================================

  describe('StdioServerSchema', () => {
    it('should validate minimal stdio server', () => {
      const server = {
        type: 'stdio',
        command: 'npx',
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });

    it('should validate stdio server with all fields', () => {
      const server = {
        type: 'stdio',
        command: 'node',
        args: ['server.js', '--port', '3000'],
        env: {
          API_KEY: '${API_KEY}',
          DEBUG: 'true',
        },
        description: 'My MCP server',
        timeout: 60,
        autoApprove: ['read_file', 'list_files'],
        agents: {
          codex: {
            enabled: true,
            enabledTools: ['read_file'],
          },
        },
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });

    it('should reject stdio server without command', () => {
      const server = {
        type: 'stdio',
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(false);
    });

    it('should reject stdio server with wrong type', () => {
      const server = {
        type: 'http', // Wrong type for StdioServerSchema
        command: 'npx',
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(false);
    });

    it('should accept autoApprove as boolean', () => {
      const server = {
        type: 'stdio',
        command: 'npx',
        autoApprove: true,
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });

    it('should accept autoApprove as array of strings', () => {
      const server = {
        type: 'stdio',
        command: 'npx',
        autoApprove: ['tool1', 'tool2'],
      };

      const result = StdioServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // HttpServer Schema
  // ===========================================================================

  describe('HttpServerSchema', () => {
    it('should validate minimal http server', () => {
      const server = {
        type: 'http',
        url: 'https://api.example.com/mcp',
      };

      const result = HttpServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });

    it('should validate http server with all fields', () => {
      const server = {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Bearer ${TOKEN}',
          'Content-Type': 'application/json',
        },
        auth: 'bearer',
        description: 'Remote MCP API',
        timeout: 30,
      };

      const result = HttpServerSchema.safeParse(server);
      expect(result.success).toBe(true);
    });

    it('should reject http server without url', () => {
      const server = {
        type: 'http',
      };

      const result = HttpServerSchema.safeParse(server);
      expect(result.success).toBe(false);
    });

    it('should reject http server with invalid url', () => {
      const server = {
        type: 'http',
        url: 'not-a-valid-url',
      };

      const result = HttpServerSchema.safeParse(server);
      expect(result.success).toBe(false);
    });

    it('should validate auth enum values', () => {
      const validAuthTypes = ['none', 'oauth', 'bearer'];

      for (const auth of validAuthTypes) {
        const server = {
          type: 'http',
          url: 'https://example.com/mcp',
          auth,
        };
        const result = HttpServerSchema.safeParse(server);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid auth type', () => {
      const server = {
        type: 'http',
        url: 'https://example.com/mcp',
        auth: 'invalid',
      };

      const result = HttpServerSchema.safeParse(server);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Environment Variable Patterns
  // ===========================================================================

  describe('Environment Variable Patterns', () => {
    it('should accept ${VAR} pattern', () => {
      const config = {
        version: '1',
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            env: { TOKEN: '${MY_TOKEN}' },
          },
        },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should accept ${VAR:-default} pattern', () => {
      const config = {
        version: '1',
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            env: { PORT: '${PORT:-3000}' },
          },
        },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should accept literal values in env', () => {
      const config = {
        version: '1',
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            env: { DEBUG: 'true', PORT: '3000' },
          },
        },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Agent Override Schema
  // ===========================================================================

  describe('Agent Override Schema', () => {
    it('should accept valid agent overrides', () => {
      const config = {
        version: '1',
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            agents: {
              'claude-code': {
                enabled: true,
              },
              codex: {
                enabled: false,
                enabledTools: ['read', 'write'],
                disabledTools: ['delete'],
                timeout: 120,
              },
            },
          },
        },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should reject unknown fields in agent override (strict mode)', () => {
      const config = {
        version: '1',
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            agents: {
              codex: {
                enabled: true,
                unknownField: 'value', // Should be rejected
              },
            },
          },
        },
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Exclusion Schema
  // ===========================================================================

  describe('Exclusion Schema', () => {
    it('should accept valid exclusions', () => {
      const config = {
        version: '1',
        servers: {},
        exclusions: [
          { server: 'github', agent: 'codex' },
          { server: 'filesystem', agent: 'claude-code', reason: 'Security concern' },
        ],
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(true);
    });

    it('should reject exclusion without server', () => {
      const config = {
        version: '1',
        servers: {},
        exclusions: [
          { agent: 'codex' }, // Missing server
        ],
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });

    it('should reject exclusion without agent', () => {
      const config = {
        version: '1',
        servers: {},
        exclusions: [
          { server: 'github' }, // Missing agent
        ],
      };

      const result = validateConfigSafe(config);
      expect(result.success).toBe(false);
    });
  });
});
