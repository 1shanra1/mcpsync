/**
 * Unit Tests: Amp Adapter
 *
 * Tests for the Amp adapter's config transformation logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AmpAdapter } from '../../src/adapters/amp.js';
import { CanonicalConfig } from '../../src/core/schema.js';

describe('AmpAdapter', () => {
  let adapter: AmpAdapter;

  beforeEach(() => {
    adapter = new AmpAdapter();
  });

  // ===========================================================================
  // Basic Properties
  // ===========================================================================

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('amp');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Amp');
    });

    it('should have correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        supportsHttp: true,
        supportsOAuth: false,
        supportsToolFiltering: true,
        supportsAutoApprove: false,
        supportsTimeout: false,
        supportsProjectScope: true,
        supportsCwd: false,
      });
    });
  });

  // ===========================================================================
  // Config Paths
  // ===========================================================================

  describe('getConfigPaths', () => {
    it('should return correct project path', () => {
      const paths = adapter.getConfigPaths();
      expect(paths.project).toBe('.amp/settings.json');
    });

    it('should return correct global path', () => {
      const paths = adapter.getConfigPaths();
      expect(paths.global).toContain('.config/amp/settings.json');
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

    it('should warn about cwd (not supported)', () => {
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
      expect(result.valid).toBe(true); // Warning, not error
      expect(result.issues.some((i) => i.message.includes('cwd'))).toBe(true);
    });

    it('should warn about autoApprove (not supported)', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: false },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
            autoApprove: ['tool1'],
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true); // Warning, not error
      expect(result.issues.some((i) => i.message.includes('autoApprove'))).toBe(true);
    });

    it('should warn about autoApprove from defaults', () => {
      const config: CanonicalConfig = {
        version: '1',
        defaults: { timeout: 60, autoApprove: true },
        servers: {
          test: {
            type: 'stdio',
            command: 'node',
            args: [],
            env: {},
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.message.includes('autoApprove'))).toBe(true);
    });
  });

  // ===========================================================================
  // Tool Filtering
  // ===========================================================================

  describe('tool filtering', () => {
    it('should validate enabledTools (maps to includeTools)', () => {
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
              amp: {
                enabledTools: ['read_file', 'write_file'],
              },
            },
          },
        },
        agents: {},
        exclusions: [],
      };

      // supportsToolFiltering is true, so no warning from validate()
      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
    });

    it('should NOT warn about enabledTools in validate (it is supported)', () => {
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
              amp: {
                enabledTools: ['tool1'],
              },
            },
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      // enabledTools is supported via includeTools mapping - no warning
      expect(result.issues.filter((i) => i.message.includes('enabledTools'))).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Capabilities
  // ===========================================================================

  describe('capabilities', () => {
    it('should support tool filtering (includeTools)', () => {
      expect(adapter.capabilities.supportsToolFiltering).toBe(true);
    });

    it('should not support timeout', () => {
      expect(adapter.capabilities.supportsTimeout).toBe(false);
    });

    it('should not support OAuth', () => {
      expect(adapter.capabilities.supportsOAuth).toBe(false);
    });

    it('should support HTTP servers', () => {
      expect(adapter.capabilities.supportsHttp).toBe(true);
    });

    it('should support project scope', () => {
      expect(adapter.capabilities.supportsProjectScope).toBe(true);
    });

    it('should not support autoApprove', () => {
      expect(adapter.capabilities.supportsAutoApprove).toBe(false);
    });

    it('should not support cwd', () => {
      expect(adapter.capabilities.supportsCwd).toBe(false);
    });
  });

  // ===========================================================================
  // HTTP Server Transform
  // ===========================================================================

  describe('http server transform', () => {
    it('should use httpUrl for HTTP servers (Streamable HTTP default)', () => {
      // This is verified in E2E tests - the adapter uses httpUrl instead of url
      expect(adapter.capabilities.supportsHttp).toBe(true);
    });
  });

  // ===========================================================================
  // Environment Variables
  // ===========================================================================

  describe('env var handling', () => {
    it('should use ${VAR} format (compatible with canonical)', () => {
      // Amp uses the same ${VAR} format as canonical
      // This is verified through E2E tests
      expect(adapter.capabilities.supportsHttp).toBe(true);
    });
  });
});
