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
      const input = [
        { key: '${A}' },
        { key: '${B}' },
      ];
      expect(redactSecrets(input)).toEqual([
        { key: '[REDACTED]' },
        { key: '[REDACTED]' },
      ]);
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

      expect(headers.Authorization).toBe('Bearer [REDACTED]');
      expect(headers['X-Custom-Header']).toBe('static-value');
    });
  });
});
