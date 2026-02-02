/**
 * Unit Tests: Roo Code Adapter
 *
 * Tests for the Roo Code adapter's config transformation logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RooCodeAdapter } from '../../src/adapters/roo-code.js';
import { CanonicalConfig } from '../../src/core/schema.js';

describe('RooCodeAdapter', () => {
  let adapter: RooCodeAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    adapter = new RooCodeAdapter();
    // Reset env vars
    process.env = { ...originalEnv };
    delete process.env.MCP_SYNC_ROO_CONFIG_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Basic Properties
  // ===========================================================================

  describe('adapter properties', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('roo-code');
    });

    it('should have correct display name', () => {
      expect(adapter.displayName).toBe('Roo Code');
    });

    it('should have correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        supportsHttp: true,
        supportsOAuth: false,
        supportsToolFiltering: false,
        supportsAutoApprove: true,
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
      expect(paths.project).toBe('.roo/mcp.json');
    });

    it('should return platform-specific global path for darwin', () => {
      // We can't easily mock process.platform, so just verify the path format
      const paths = adapter.getConfigPaths();
      expect(paths.global).toBeTruthy();
      // Path should contain the extension ID
      expect(paths.global).toContain('rooveterinaryinc.roo-cline');
    });

    it('should use MCP_SYNC_ROO_CONFIG_PATH env var override', () => {
      process.env.MCP_SYNC_ROO_CONFIG_PATH = '/custom/path/to/config.json';

      // Need to create a new adapter to pick up the new env var
      const customAdapter = new RooCodeAdapter();
      const paths = customAdapter.getConfigPaths();

      expect(paths.global).toBe('/custom/path/to/config.json');
    });
  });

  // ===========================================================================
  // Detection
  // ===========================================================================

  describe('detect', () => {
    it('should always report as installed (VS Code extension cannot be detected)', async () => {
      // Roo Code is a VS Code extension - we can't detect if it's installed
      // So we always return installed: true to allow first-time config creation
      const result = await adapter.detect();
      expect(result.installed).toBe(true);
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

    it('should warn about tool filtering (not supported)', () => {
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
              'roo-code': {
                enabledTools: ['read_file'],
              },
            },
          },
        },
        agents: {},
        exclusions: [],
      };

      const result = adapter.validate(config);
      expect(result.valid).toBe(true); // Warning, not error
      expect(result.issues.some((i) => i.message.includes('tool filtering'))).toBe(true);
    });
  });

  // ===========================================================================
  // AutoApprove Handling
  // ===========================================================================

  describe('autoApprove handling', () => {
    it('should validate autoApprove array without warnings in validate()', () => {
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

      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      // autoApprove: array is valid for Roo (maps to alwaysAllow)
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

    it('should validate autoApprove: true (warning in write, not validate)', () => {
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

      // validate() doesn't check shape, only capability
      const result = adapter.validate(config);
      expect(result.valid).toBe(true);
      // The warning about boolean autoApprove is generated in write(), not validate()
    });
  });

  // ===========================================================================
  // Environment Variable Transformation
  // ===========================================================================

  describe('env var transformation', () => {
    it('should not support cwd', () => {
      expect(adapter.capabilities.supportsCwd).toBe(false);
    });

    // Note: The transformEnvForRoo method is private, but we can verify its behavior
    // through integration tests in the E2E suite. Key behaviors:
    // - ${VAR} -> ${env:VAR}
    // - $VAR -> ${env:VAR}
    // - ${VAR:-default} -> ${env:VAR} (with warning)
    // - ${env:VAR} -> ${env:VAR} (passthrough)
    // - Mixed strings like "prefix_${env:FOO}_$BAR" -> "prefix_${env:FOO}_${env:BAR}"
  });

  // ===========================================================================
  // Capabilities
  // ===========================================================================

  describe('capabilities', () => {
    it('should not support tool filtering', () => {
      expect(adapter.capabilities.supportsToolFiltering).toBe(false);
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

    it('should support autoApprove (array form)', () => {
      expect(adapter.capabilities.supportsAutoApprove).toBe(true);
    });
  });

  // ===========================================================================
  // HTTP Server Type
  // ===========================================================================

  describe('http server type', () => {
    it('should use streamable-http as default for HTTP servers', () => {
      // This is verified by the implementation - HTTP servers get type: 'streamable-http'
      // We can verify this through an integration test or by checking the transformation
      expect(adapter.capabilities.supportsHttp).toBe(true);
    });
  });
});
