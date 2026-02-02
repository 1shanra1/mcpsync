import { BaseAdapter } from './base.js';
import { AmpAdapter } from './amp.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexAdapter } from './codex.js';
import { GeminiCliAdapter } from './gemini-cli.js';
import { OpenCodeAdapter } from './opencode.js';
import { RooCodeAdapter } from './roo-code.js';
import { StubAdapter } from './stub.js';
import { SupportedAgent } from '../core/schema.js';

// =============================================================================
// Adapter Registry
// =============================================================================

/**
 * Registry of all available adapters
 */
class AdapterRegistry {
  private adapters: Map<SupportedAgent, BaseAdapter> = new Map();

  constructor() {
    // Register implemented adapters
    this.register(new AmpAdapter());
    this.register(new ClaudeCodeAdapter());
    this.register(new CodexAdapter());
    this.register(new GeminiCliAdapter());
    this.register(new OpenCodeAdapter());
    this.register(new RooCodeAdapter());

    // Register stub adapters for planned agents
    this.register(new StubAdapter('kimi-code', 'Kimi Code'));
  }

  /**
   * Register an adapter
   */
  register(adapter: BaseAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get a specific adapter by name
   */
  get(name: SupportedAgent): BaseAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   */
  getAll(): BaseAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all adapter names
   */
  getNames(): SupportedAgent[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Detect all installed agents
   *
   * If MCP_SYNC_SKIP_DETECT=1 is set, non-stub adapters report as installed.
   * This is used for fixture-based E2E testing where real CLI detection
   * would make tests non-deterministic.
   *
   * IMPORTANT: Stub adapters always report installed: false even with skip detect,
   * because their write() method throws "not implemented" errors.
   *
   * MCP_SYNC_SKIP_DETECT: For CI/testing only. Makes all non-stub adapters
   * report installed: true, bypassing real CLI detection. This allows
   * fixture-based E2E tests to run without requiring actual CLI installations.
   * Do NOT use in production - it masks real detection issues.
   */
  async detectAll(): Promise<Map<SupportedAgent, Awaited<ReturnType<BaseAdapter['detect']>>>> {
    const results = new Map<SupportedAgent, Awaited<ReturnType<BaseAdapter['detect']>>>();
    const skipDetect = process.env.MCP_SYNC_SKIP_DETECT === '1';

    for (const [name, adapter] of this.adapters) {
      try {
        // Never skip detect for stub adapters - they can't write configs
        const isStub = adapter instanceof StubAdapter;

        if (skipDetect && !isStub) {
          // Bypass detection for testing - report as installed
          results.set(name, {
            installed: true,
            configExists: false,
            configPath: adapter.getConfigPaths().global ?? adapter.getConfigPaths().project,
          });
        } else {
          const detection = await adapter.detect();
          results.set(name, detection);
        }
      } catch {
        results.set(name, {
          installed: false, // On error, always report not installed
          configExists: false,
          configPath: undefined,
        });
      }
    }

    return results;
  }

  /**
   * Get only installed adapters
   */
  async getInstalled(): Promise<BaseAdapter[]> {
    const detections = await this.detectAll();
    const installed: BaseAdapter[] = [];

    for (const [name, detection] of detections) {
      if (detection.installed) {
        const adapter = this.adapters.get(name);
        if (adapter) {
          installed.push(adapter);
        }
      }
    }

    return installed;
  }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry();

// Re-export types
export { BaseAdapter } from './base.js';
export { StubAdapter } from './stub.js';
export type {
  ConfigPaths,
  DetectionResult,
  AgentMcpConfig,
  SyncResult,
  ValidationResult,
  ValidationIssue,
} from './base.js';
