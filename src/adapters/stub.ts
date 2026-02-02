import {
  BaseAdapter,
  ConfigPaths,
  DetectionResult,
  AgentMcpConfig,
  SyncResult,
  WriteOptions,
} from './base.js';
import { CanonicalConfig, AgentCapabilities, SupportedAgent } from '../core/schema.js';

/**
 * Stub adapter for agents that are not yet implemented.
 * Returns a clear "not implemented" error when targeted explicitly.
 */
export class StubAdapter extends BaseAdapter {
  readonly name: SupportedAgent;
  readonly displayName: string;
  readonly isStub = true;

  readonly capabilities: AgentCapabilities = {
    supportsHttp: false,
    supportsOAuth: false,
    supportsToolFiltering: false,
    supportsAutoApprove: false,
    supportsTimeout: false,
    supportsProjectScope: false,
  };

  constructor(name: SupportedAgent, displayName: string) {
    super();
    this.name = name;
    this.displayName = displayName;
  }

  getConfigPaths(): ConfigPaths {
    return {};
  }

  async detect(): Promise<DetectionResult> {
    // Return not installed so CLI shows "not installed" message
    return {
      installed: false,
      configExists: false,
    };
  }

  async read(): Promise<AgentMcpConfig | null> {
    throw new Error(`${this.displayName} adapter is not yet implemented`);
  }

  async write(_config: CanonicalConfig, _options?: WriteOptions): Promise<SyncResult> {
    throw new Error(`${this.displayName} adapter is not yet implemented`);
  }
}
