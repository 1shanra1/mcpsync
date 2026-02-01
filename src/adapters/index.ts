import { BaseAdapter } from './base.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { CodexAdapter } from './codex.js';
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
    // Register all adapters
    this.register(new ClaudeCodeAdapter());
    this.register(new CodexAdapter());
    // TODO: Register other adapters as they're implemented
    // this.register(new GeminiCliAdapter());
    // this.register(new AmpAdapter());
    // this.register(new RooCodeAdapter());
    // this.register(new OpenCodeAdapter());
    // this.register(new KimiCodeAdapter());
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
   */
  async detectAll(): Promise<Map<SupportedAgent, Awaited<ReturnType<BaseAdapter['detect']>>>> {
    const results = new Map<SupportedAgent, Awaited<ReturnType<BaseAdapter['detect']>>>();

    for (const [name, adapter] of this.adapters) {
      try {
        const detection = await adapter.detect();
        results.set(name, detection);
      } catch (error) {
        results.set(name, {
          installed: false,
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
export type {
  ConfigPaths,
  DetectionResult,
  AgentMcpConfig,
  SyncResult,
  ValidationResult,
  ValidationIssue,
} from './base.js';
