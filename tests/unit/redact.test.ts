/**
 * Unit Tests: redactSecrets
 *
 * Tests for the secret redaction utility function.
 * This is pure logic with no external dependencies.
 */

import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../../src/cli/utils/redact.js';

describe('redactSecrets', () => {
  describe('string handling', () => {
    it('should redact ${VAR} patterns', () => {
      expect(redactSecrets('${SECRET}')).toBe('[REDACTED]');
    });

    it('should redact ${VAR:-default} patterns', () => {
      expect(redactSecrets('${TOKEN:-default-value}')).toBe('[REDACTED]');
    });

    it('should redact multiple patterns in one string', () => {
      const input = 'key=${KEY} token=${TOKEN}';
      expect(redactSecrets(input)).toBe('key=[REDACTED] token=[REDACTED]');
    });

    it('should preserve strings without patterns', () => {
      expect(redactSecrets('plain text')).toBe('plain text');
      expect(redactSecrets('')).toBe('');
    });

    it('should handle nested braces correctly', () => {
      expect(redactSecrets('${OUTER}')).toBe('[REDACTED]');
    });
  });

  describe('object handling', () => {
    it('should redact values in objects', () => {
      const input = { key: '${SECRET}', name: 'test' };
      const result = redactSecrets(input);

      expect(result).toEqual({ key: '[REDACTED]', name: 'test' });
    });

    it('should handle nested objects', () => {
      const input = {
        level1: {
          level2: {
            secret: '${TOKEN}',
            plain: 'value',
          },
        },
      };
      const result = redactSecrets(input) as Record<string, unknown>;

      expect((result.level1 as Record<string, unknown>).level2).toEqual({
        secret: '[REDACTED]',
        plain: 'value',
      });
    });

    it('should handle empty objects', () => {
      expect(redactSecrets({})).toEqual({});
    });
  });

  describe('array handling', () => {
    it('should redact values in arrays', () => {
      const input = ['${SECRET}', 'plain', '${TOKEN}'];
      expect(redactSecrets(input)).toEqual(['[REDACTED]', 'plain', '[REDACTED]']);
    });

    it('should handle arrays of objects', () => {
      const input = [{ key: '${A}' }, { key: '${B}' }];
      expect(redactSecrets(input)).toEqual([{ key: '[REDACTED]' }, { key: '[REDACTED]' }]);
    });

    it('should handle empty arrays', () => {
      expect(redactSecrets([])).toEqual([]);
    });
  });

  describe('primitive handling', () => {
    it('should pass through numbers', () => {
      expect(redactSecrets(42)).toBe(42);
      expect(redactSecrets(0)).toBe(0);
      expect(redactSecrets(-1)).toBe(-1);
    });

    it('should pass through booleans', () => {
      expect(redactSecrets(true)).toBe(true);
      expect(redactSecrets(false)).toBe(false);
    });

    it('should pass through null', () => {
      expect(redactSecrets(null)).toBe(null);
    });

    it('should pass through undefined', () => {
      expect(redactSecrets(undefined)).toBe(undefined);
    });
  });

  describe('bare $VAR patterns', () => {
    it('should redact uppercase $VAR', () => {
      expect(redactSecrets('token is $GITHUB_TOKEN')).toBe('token is [REDACTED]');
    });

    it('should redact $VAR with underscores', () => {
      expect(redactSecrets('using $MY_API_KEY here')).toBe('using [REDACTED] here');
    });

    it('should NOT redact lowercase $var (likely not env var)', () => {
      // Lowercase vars are unlikely to be env vars, avoid false positives
      expect(redactSecrets('$variable')).toBe('$variable');
    });

    it('should NOT redact money strings like $5.00', () => {
      // Numbers after $ are not env vars
      expect(redactSecrets('price is $5.00')).toBe('price is $5.00');
      expect(redactSecrets('costs $100')).toBe('costs $100');
    });
  });

  describe('{env:VAR} patterns', () => {
    it('should redact {env:VAR} format', () => {
      expect(redactSecrets('key: {env:API_KEY}')).toBe('key: [REDACTED]');
    });

    it('should redact multiple {env:*} patterns', () => {
      expect(redactSecrets('{env:A} and {env:B}')).toBe('[REDACTED] and [REDACTED]');
    });
  });

  describe('sensitive key names', () => {
    it('should redact values for keys containing TOKEN', () => {
      const obj = { GITHUB_TOKEN: 'actual-secret-value' };
      expect(redactSecrets(obj)).toEqual({ GITHUB_TOKEN: '[REDACTED]' });
    });

    it('should redact values for keys containing SECRET', () => {
      const obj = { MY_SECRET: 'shhh' };
      expect(redactSecrets(obj)).toEqual({ MY_SECRET: '[REDACTED]' });
    });

    it('should redact values for keys containing PASSWORD', () => {
      const obj = { DB_PASSWORD: 'hunter2' };
      expect(redactSecrets(obj)).toEqual({ DB_PASSWORD: '[REDACTED]' });
    });

    it('should redact values for keys containing KEY', () => {
      const obj = { API_KEY: 'sk-1234567890' };
      expect(redactSecrets(obj)).toEqual({ API_KEY: '[REDACTED]' });
    });

    it('should redact values for keys containing CREDENTIAL', () => {
      const obj = { AWS_CREDENTIAL: 'secret-cred' };
      expect(redactSecrets(obj)).toEqual({ AWS_CREDENTIAL: '[REDACTED]' });
    });

    it('should redact values for keys containing AUTH', () => {
      const obj = { AUTH_HEADER: 'Bearer xyz' };
      expect(redactSecrets(obj)).toEqual({ AUTH_HEADER: '[REDACTED]' });
    });

    it('should NOT redact non-sensitive keys', () => {
      const obj = { name: 'github', command: 'npx' };
      expect(redactSecrets(obj)).toEqual({ name: 'github', command: 'npx' });
    });

    it('should be case-insensitive for key matching', () => {
      const obj = { api_key: 'secret123' };
      expect(redactSecrets(obj)).toEqual({ api_key: '[REDACTED]' });
    });

    it('should only redact string values for sensitive keys', () => {
      const obj = { TOKEN_COUNT: 42, SECRET_ENABLED: true };
      expect(redactSecrets(obj)).toEqual({ TOKEN_COUNT: 42, SECRET_ENABLED: true });
    });
  });

  describe('real-world configs', () => {
    it('should redact a typical MCP server config', () => {
      const input = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_TOKEN: '${GITHUB_TOKEN}',
          DEBUG: 'false',
        },
      };

      const result = redactSecrets(input) as Record<string, unknown>;
      const env = result.env as Record<string, string>;

      expect(env.GITHUB_TOKEN).toBe('[REDACTED]');
      expect(env.DEBUG).toBe('false');
      expect(result.command).toBe('npx');
    });

    it('should redact HTTP server with auth headers', () => {
      const input = {
        type: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          Authorization: 'Bearer ${API_TOKEN}',
          'X-Custom-Header': 'static-value',
        },
      };

      const result = redactSecrets(input) as Record<string, unknown>;
      const headers = result.headers as Record<string, string>;

      // Authorization key contains "AUTH", so entire value is redacted
      expect(headers.Authorization).toBe('[REDACTED]');
      expect(headers['X-Custom-Header']).toBe('static-value');
    });
  });
});
