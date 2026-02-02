import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { atomicWrite } from '../core/fs-utils.js';
import {
  BaseAdapter,
  ConfigPaths,
  DetectionResult,
  AgentMcpConfig,
  SyncResult,
  WriteOptions,
} from './base.js';
import {
  CanonicalConfig,
  Server,
  AgentCapabilities,
  StdioServer,
  HttpServer,
  Env,
} from '../core/schema.js';

// =============================================================================
// Roo Code Config Types
// =============================================================================

interface RooStdioServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  alwaysAllow?: string[];
  disabled?: boolean;
}

interface RooHttpServer {
  type: 'streamable-http' | 'sse';
  url: string;
  alwaysAllow?: string[];
  disabled?: boolean;
}

type RooServer = RooStdioServer | RooHttpServer;

interface RooConfig {
  mcpServers?: Record<string, RooServer>;
  [key: string]: unknown;
}

// =============================================================================
// Roo Code Adapter
// =============================================================================

export class RooCodeAdapter extends BaseAdapter {
  readonly name = 'roo-code' as const;
  readonly displayName = 'Roo Code';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: false,
    supportsToolFiltering: false, // No includeTools/excludeTools
    supportsAutoApprove: true, // maps to alwaysAllow (array only)
    supportsTimeout: false,
    supportsProjectScope: true,
    supportsCwd: false,
  };

  getConfigPaths(): ConfigPaths {
    const globalPath = this.getGlobalConfigPath();
    return {
      global: globalPath,
      project: '.roo/mcp.json',
    };
  }

  private getGlobalConfigPath(): string {
    // Check MCP_SYNC_ROO_CONFIG_PATH env var first
    if (process.env.MCP_SYNC_ROO_CONFIG_PATH) {
      return process.env.MCP_SYNC_ROO_CONFIG_PATH;
    }

    // Platform-specific VS Code extension storage
    const home = homedir();
    switch (process.platform) {
      case 'darwin':
        return join(
          home,
          'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/mcp_settings.json'
        );
      case 'win32':
        return join(
          home,
          'AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline/mcp_settings.json'
        );
      default:
        return join(
          home,
          '.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/mcp_settings.json'
        );
    }
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();

    // Roo Code is a VS Code extension - we can't reliably detect installation.
    // Always report as "installed" to allow first-time config creation.
    // Users without Roo Code will simply have unused config files.
    const configExists = existsSync(paths.global!) || existsSync(paths.project!);

    return {
      installed: true, // Always allow writing - can't detect VS Code extensions
      configExists,
      configPath: existsSync(paths.global!) ? paths.global : paths.project,
    };
  }

  async read(): Promise<AgentMcpConfig | null> {
    const paths = this.getConfigPaths();

    // Try global first, then project
    const configPath = existsSync(paths.global!) ? paths.global! : paths.project!;

    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as RooConfig;

      return {
        servers: config.mcpServers ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read Roo Code config: ${error}`);
      return null;
    }
  }

  async write(config: CanonicalConfig, options: WriteOptions = {}): Promise<SyncResult> {
    const { scope = 'global', merge = false, force = false } = options;
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to Roo format
    const rooServers: Record<string, RooServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter((i) => i.type === 'warning').map((i) => i.message));

      if (validation.issues.some((i) => i.type === 'error')) {
        continue;
      }

      // Check for autoApprove: true (Roo only supports array)
      const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
      if (effectiveAutoApprove === true) {
        warnings.push(
          `Roo Code does not support full trust mode (autoApprove: true). Server "${serverName}" will require manual approval.`
        );
      }

      // Check for tool filtering (Roo doesn't support it)
      const agentOverride = server.agents?.['roo-code'];
      if (agentOverride?.enabledTools || agentOverride?.disabledTools) {
        warnings.push(
          `Roo Code does not support tool filtering (enabledTools/disabledTools). Server "${serverName}" will have all tools available.`
        );
      }

      // Check for timeout (Roo doesn't support it)
      const effectiveTimeout = server.timeout ?? config.defaults?.timeout;
      if (effectiveTimeout && effectiveTimeout !== 60) {
        // 60 is default, don't warn
        warnings.push(
          `Roo Code does not support custom timeout. Server "${serverName}" timeout setting will be ignored.`
        );
      }

      rooServers[serverName] = this.transformServer(server, config, warnings, serverName);
    }

    // Determine config path
    const configPath = scope === 'project' ? paths.project! : paths.global!;

    // Ensure directory exists
    const configDir = scope === 'project' ? '.roo' : dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let existingConfig: RooConfig = {};

    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      try {
        existingConfig = JSON.parse(content);
      } catch (error) {
        if (!force) {
          throw new Error(
            `Failed to parse ${configPath}: ${error instanceof Error ? error.message : error}\n` +
              `Fix the file manually or use --force to overwrite.`
          );
        }
        existingConfig = {};
      }
    }

    // Replace mcpServers entirely (authoritative sync) unless merge mode is enabled
    if (merge) {
      existingConfig.mcpServers = {
        ...existingConfig.mcpServers,
        ...rooServers,
      };
    } else {
      existingConfig.mcpServers = rooServers;
    }

    // Write JSON
    atomicWrite(configPath, JSON.stringify(existingConfig, null, 2) + '\n', { backup: true });

    return {
      success: true,
      serversWritten: Object.keys(rooServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to Roo Code format
   */
  private transformServer(
    server: Server,
    config: CanonicalConfig,
    warnings: string[],
    serverName: string
  ): RooServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server, config, warnings, serverName);
    } else {
      return this.transformHttpServer(server, config);
    }
  }

  private transformStdioServer(
    server: StdioServer,
    config: CanonicalConfig,
    warnings: string[],
    serverName: string
  ): RooStdioServer {
    const result: RooStdioServer = {
      command: server.command,
    };

    if (server.args && server.args.length > 0) {
      result.args = server.args;
    }

    // Transform env vars to Roo format
    const env = this.transformEnvForRoo(server.env, warnings, serverName);
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    // Roo doesn't support cwd - warn in base validate() method

    // Handle autoApprove -> alwaysAllow (array only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (Array.isArray(effectiveAutoApprove) && effectiveAutoApprove.length > 0) {
      result.alwaysAllow = effectiveAutoApprove;
    }
    // Note: autoApprove: true is warned about in write()
    // autoApprove: false maps to omitting alwaysAllow (default behavior)

    return result;
  }

  private transformHttpServer(server: HttpServer, config: CanonicalConfig): RooHttpServer {
    const result: RooHttpServer = {
      type: 'streamable-http', // Default to modern Streamable HTTP
      url: server.url,
    };

    // Handle autoApprove -> alwaysAllow (array only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (Array.isArray(effectiveAutoApprove) && effectiveAutoApprove.length > 0) {
      result.alwaysAllow = effectiveAutoApprove;
    }

    return result;
  }

  /**
   * Transform env vars to Roo Code format
   * Converts ${VAR} and $VAR to ${env:VAR}
   * Warns and drops defaults from ${VAR:-default}
   */
  private transformEnvForRoo(
    env: Env | undefined,
    warnings: string[],
    serverName: string
  ): Record<string, string> {
    if (!env) return {};

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      let transformed = value;

      // Note: We don't skip strings containing ${env:VAR} because they may have
      // mixed patterns like "prefix_${env:FOO}_$BAR" that need partial transformation.
      // The regexes below are designed to not match already-converted ${env:VAR} patterns.

      // 1. Handle ${VAR:-default} - warn and drop default (do this BEFORE ${VAR})
      const defaultMatches = transformed.match(/\$\{([^}:]+):-[^}]*\}/g);
      if (defaultMatches) {
        warnings.push(
          `Roo Code does not support env var defaults. Server "${serverName}" env "${key}": defaults will be dropped.`
        );
        transformed = transformed.replace(/\$\{([^}:]+):-[^}]*\}/g, '${env:$1}');
      }

      // 2. Handle ${VAR} (without default) - won't match ${env:VAR} due to colon
      transformed = transformed.replace(/\$\{([^}:]+)\}/g, '${env:$1}');

      // 3. Handle bare $VAR references - won't match ${env:VAR} patterns
      transformed = transformed.replace(/\$([A-Z_][A-Z0-9_]*)/g, '${env:$1}');

      result[key] = transformed;
    }

    return result;
  }
}
