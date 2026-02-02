import {
  CanonicalConfig,
  Server,
  SupportedAgent,
  AgentCapabilities,
  Env,
} from '../core/schema.js';

// =============================================================================
// Types
// =============================================================================

export interface ConfigPaths {
  global?: string;
  project?: string;
  local?: string;
}

export interface DetectionResult {
  installed: boolean;
  version?: string;
  configExists: boolean;
  configPath?: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  server?: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface SyncResult {
  success: boolean;
  serversWritten: number;
  warnings: string[];
  error?: string;
}

/**
 * Generic agent config shape (what we read from agent files)
 */
export interface AgentMcpConfig {
  servers: Record<string, unknown>;
  raw: unknown; // Original parsed file
}

export interface WriteOptions {
  scope?: 'global' | 'project' | 'local';
  merge?: boolean;
  force?: boolean;
}

// =============================================================================
// Base Adapter
// =============================================================================

export abstract class BaseAdapter {
  abstract readonly name: SupportedAgent;
  abstract readonly displayName: string;
  abstract readonly capabilities: AgentCapabilities;

  /**
   * Detect if the agent is installed and get config info
   */
  abstract detect(): Promise<DetectionResult>;

  /**
   * Get all possible config file paths for this agent
   */
  abstract getConfigPaths(): ConfigPaths;

  /**
   * Read the current MCP config from the agent's config file
   */
  abstract read(): Promise<AgentMcpConfig | null>;

  /**
   * Write the canonical config to the agent's config file
   */
  abstract write(config: CanonicalConfig, options?: WriteOptions): Promise<SyncResult>;

  /**
   * Validate if the canonical config can be written to this agent
   * (checks for unsupported features, etc.)
   */
  validate(config: CanonicalConfig): ValidationResult {
    const issues: ValidationIssue[] = [];

    for (const [serverName, server] of Object.entries(config.servers)) {
      // Check HTTP support
      if (server.type === 'http' && !this.capabilities.supportsHttp) {
        issues.push({
          type: 'error',
          message: `${this.displayName} does not support HTTP/remote servers`,
          server: serverName,
        });
      }

      // Check OAuth support
      if (server.type === 'http' && server.auth === 'oauth' && !this.capabilities.supportsOAuth) {
        issues.push({
          type: 'warning',
          message: `${this.displayName} does not support OAuth authentication`,
          server: serverName,
        });
      }

      // Check tool filtering
      const agentOverride = server.agents?.[this.name];
      if (agentOverride?.enabledTools || agentOverride?.disabledTools) {
        if (!this.capabilities.supportsToolFiltering) {
          issues.push({
            type: 'warning',
            message: `${this.displayName} does not support tool filtering (enabledTools/disabledTools will be ignored)`,
            server: serverName,
          });
        }
      }

      // Check autoApprove usage (server-level or inherited from defaults)
      const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
      if (effectiveAutoApprove && !this.capabilities.supportsAutoApprove) {
        issues.push({
          type: 'warning',
          message: `${this.displayName} does not support autoApprove (will be ignored)`,
          server: serverName,
        });
      }

      // Check bearer auth
      if (server.type === 'http' && server.auth === 'bearer') {
        issues.push({
          type: 'warning',
          message: `${this.displayName}: bearer auth requires manual header configuration`,
          server: serverName,
        });
      }
    }

    return {
      valid: !issues.some(i => i.type === 'error'),
      issues,
    };
  }

  /**
   * Check if a server should be included for this agent
   */
  protected shouldIncludeServer(
    serverName: string,
    server: Server,
    config: CanonicalConfig
  ): boolean {
    // Check exclusions
    const excluded = config.exclusions?.some(
      e => e.server === serverName && e.agent === this.name
    );
    if (excluded) return false;

    // Check agent-specific enabled flag
    const agentOverride = server.agents?.[this.name];
    if (agentOverride?.enabled === false) return false;

    return true;
  }

  /**
   * Resolve environment variable references
   * ${VAR} -> process.env.VAR or keep as reference depending on agent
   */
  protected resolveEnvValue(value: string, keepReference: boolean = true): string {
    if (!keepReference) {
      // Replace ${VAR} with actual value
      return value.replace(/\$\{([^}:-]+)(?::-([^}]*))?\}/g, (_, varName, defaultVal) => {
        return process.env[varName] ?? defaultVal ?? '';
      });
    }
    // Keep reference format (most agents support this)
    return value;
  }

  /**
   * Transform env object, resolving references if needed
   */
  protected transformEnv(env: Env | undefined, keepReference: boolean = true): Record<string, string> {
    if (!env) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      result[key] = this.resolveEnvValue(value, keepReference);
    }
    return result;
  }
}
