/**
 * Unit Tests: Gemini CLI Adapter
 *
 * Tests for the Gemini CLI adapter's config transformation logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiCliAdapter } from '../../src/adapters/gemini-cli.js';
import { CanonicalConfig } from '../../src/core/schema.js';
import { homedir } from 'os';
import { join } from 'path';

describe('GeminiCliAdapter', () => {
  let adapter: GeminiCliAdapter;

  beforeEach(() => {
    adapter = new GeminiCliAdapter();
  });

  // ===========================================================================
  // Basic Properties
  // ===========================================================================

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('gemini-cli');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Gemini CLI');
    });

    it('should have correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        supportsHttp: true,
        supportsOAuth: false,
        supportsToolFiltering: true,
        supportsAutoApprove: true,
        supportsTimeout: true,
        supportsProjectScope: true,
        supportsCwd: true,
      });
    });
  });

  // ===========================================================================
  // Config Paths
  // ===========================================================================

  describe('getConfigPaths', () => {
    it('should return correct global path', () => {
      const paths = adapter.getConfigPaths();
      expect(paths.global).toBe(join(homedir(), '.gemini', 'settings.json'));
    });

    it('should return correct project path', () => {
      const paths = adapter.getConfigPaths();
      expect(paths.project).toBe('.gemini/settings.json');
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe('validate', () => {
    it('should validate stdio server without issues', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: ['server.js'],
            env: {},
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate http server without issues', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'http',
            url: 'https://example.com/mcp',
            headers: {},
            auth: 'none',
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should warn about OAuth (not supported)', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'http',
            url: 'https://example.com/mcp',
            headers: {},
            auth: 'oauth',
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true); // Warning, not error
      expect(result.issues.some((i) => i.message.includes('OAuth'))).toBe(true);
    });

    it('should not warn about cwd (supported)', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            cwd: '/some/path',
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.message.includes('cwd'))).toBe(false);
    });
  });

  // ===========================================================================
  // Server Transformation (via write simulation)
  // ===========================================================================

  describe('server transformation', () => {
    // We can't easily test transformServer directly as it's private
    // But we can test via the validate method and check capabilities

    it('should support cwd capability', () => {
      expect(adapter.capabilities.supportsCwd).toBe(true);
    });

    it('should support tool filtering capability', () => {
      expect(adapter.capabilities.supportsToolFiltering).toBe(true);
    });

    it('should support autoApprove capability', () => {
      expect(adapter.capabilities.supportsAutoApprove).toBe(true);
    });

    it('should support timeout capability', () => {
      expect(adapter.capabilities.supportsTimeout).toBe(true);
    });
  });

  // ===========================================================================
  // AutoApprove Handling
  // ===========================================================================

  describe('autoApprove handling', () => {
    it('should validate autoApprove: true without warnings', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            autoApprove: true,
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      // autoApprove: true is valid for Gemini (maps to trust: true)
    });

    it('should validate autoApprove: false without warnings', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            autoApprove: false,
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should validate autoApprove array (warning in write, not validate)', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            autoApprove: ['tool1', 'tool2'],
          },
        },
        agents: {},
        exclusions: [],
      };

      // validate() doesn't check shape, only capability
      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      // The warning about array autoApprove is generated in write(), not validate()
    });
  });

  // ===========================================================================
  // Tool Filtering
  // ===========================================================================

  describe('tool filtering', () => {
    it('should not warn about tool filtering in validation (supported)', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            agents: {
              'gemini-cli': {
                enabledTools: ['read_file'],
                disabledTools: ['delete_file'],
              },
            },
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.message.includes('tool filtering'))).toBe(false);
    });
  });
});
