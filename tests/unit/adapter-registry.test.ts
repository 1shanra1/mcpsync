import { describe, it, expect, afterEach } from 'vitest';
import { adapterRegistry, StubAdapter } from '../../src/adapters/index.js';

describe('AdapterRegistry', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('detectAll with MCP_SYNC_SKIP_DETECT', () => {
    it('should report non-stub adapters as installed when MCP_SYNC_SKIP_DETECT=1', async () => {
      process.env = { ...originalEnv, MCP_SYNC_SKIP_DETECT: '1' };

      const detections = await adapterRegistry.detectAll();

      for (const [name, detection] of detections) {
        const adapter = adapterRegistry.get(name);

        if (adapter instanceof StubAdapter) {
          // Stub adapters should NEVER be marked installed
          expect(detection.installed).toBe(false);
        } else {
          // Non-stub adapters should be marked installed with skip detect
          expect(detection.installed).toBe(true);
        }
      }
    });

    it('should still report stub adapters as not installed even with skip detect', async () => {
      process.env = { ...originalEnv, MCP_SYNC_SKIP_DETECT: '1' };

      const detections = await adapterRegistry.detectAll();

      // kimi-code is the only stub adapter currently
      const kimiDetection = detections.get('kimi-code');
      expect(kimiDetection?.installed).toBe(false);
    });

    it('should return all registered adapters', async () => {
      process.env = { ...originalEnv, MCP_SYNC_SKIP_DETECT: '1' };

      const detections = await adapterRegistry.detectAll();
      const expectedAdapters = [
        'claude-code',
        'codex',
        'gemini-cli',
        'roo-code',
        'amp',
        'opencode',
        'kimi-code',
      ];

      for (const name of expectedAdapters) {
        expect(detections.has(name as 'claude-code')).toBe(true);
      }
    });
  });
});
