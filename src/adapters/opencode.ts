import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { parse as parseJsonc } from 'jsonc-parser';
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
// OpenCode Config Types
// =============================================================================

interface OpenCodeLocalServer {
  type: 'local';
  enabled?: boolean;
  command: string[];
  environment?: Record<string, string>;
  disabledTools?: string[];
  autoApprove?: string[];
}

interface OpenCodeRemoteServer {
  type: 'remote';
  enabled?: boolean;
  url: string;
  headers?: Record<string, string>;
  disabledTools?: string[];
  autoApprove?: string[];
}

type OpenCodeServer = OpenCodeLocalServer | OpenCodeRemoteServer;

interface OpenCodeConfig {
  mcp?: Record<string, OpenCodeServer>;
  [key: string]: unknown;
}

// =============================================================================
// OpenCode Adapter
// =============================================================================

export class OpenCodeAdapter extends BaseAdapter {
  readonly name = 'opencode' as const;
  readonly displayName = 'OpenCode';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: false,
    supportsToolFiltering: true, // disabledTools only
    supportsAutoApprove: true, // array only
    supportsTimeout: false,
    supportsProjectScope: true,
    supportsCwd: false,
  };

  getConfigPaths(): ConfigPaths {
    const home = homedir();
    return {
      global: join(home, '.config', 'opencode', 'opencode.json'),
      project: 'opencode.json',
    };
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();
    let installed = false;
    let version: string | undefined;

    // Check if opencode CLI is installed
    try {
      const output = execFileSync('opencode', ['--version'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      installed = true;
      // Parse version from output
      const match = output.match(/v?(\d+\.\d+\.\d+)/);
      version = match?.[1];
    } catch {
      // CLI not found
    }

    const configExists = existsSync(paths.global!) || existsSync(paths.project!);

    return {
      installed,
      version,
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
      // Use JSONC parser to support comments and trailing commas
      const config = parseJsonc(content) as OpenCodeConfig;

      return {
        servers: config.mcp ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read OpenCode config: ${error}`);
      return null;
    }
  }

  async write(config: CanonicalConfig, options: WriteOptions = {}): Promise<SyncResult> {
    const { scope = 'global', merge = false, force = false } = options;
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to OpenCode format
    const openCodeServers: Record<string, OpenCodeServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter((i) => i.type === 'warning').map((i) => i.message));

      if (validation.issues.some((i) => i.type === 'error')) {
        continue;
      }

      // Check for autoApprove: true (OpenCode only supports array)
      const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
      if (effectiveAutoApprove === true) {
        warnings.push(
          `OpenCode does not support full trust mode (autoApprove: true). Server "${serverName}" will require manual approval.`
        );
      }

      // Check for enabledTools (OpenCode only supports disabledTools)
      const agentOverride = server.agents?.['opencode'];
      if (agentOverride?.enabledTools && agentOverride.enabledTools.length > 0) {
        warnings.push(
          `OpenCode does not support enabledTools. Server "${serverName}" enabledTools will be ignored.`
        );
      }

      // Check for timeout (OpenCode doesn't support it)
      const effectiveTimeout = server.timeout ?? config.defaults?.timeout;
      if (effectiveTimeout !== undefined && effectiveTimeout !== 60) {
        warnings.push(
          `OpenCode does not support custom timeout. Server "${serverName}" timeout setting will be ignored.`
        );
      }

      openCodeServers[serverName] = this.transformServer(server, config, warnings, serverName);
    }

    // Determine config path
    const configPath = scope === 'project' ? paths.project! : paths.global!;

    // Ensure directory exists (only for global config)
    if (scope === 'global') {
      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
    }

    // Read existing config or create new
    let existingConfig: OpenCodeConfig = {};

    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      try {
        // Use JSONC parser to support comments and trailing commas
        existingConfig = parseJsonc(content) ?? {};
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

    // Write MCP servers using 'mcp' key (NOT 'mcpServers')
    if (merge) {
      existingConfig.mcp = {
        ...existingConfig.mcp,
        ...openCodeServers,
      };
    } else {
      existingConfig.mcp = openCodeServers;
    }

    // Write JSON
    atomicWrite(configPath, JSON.stringify(existingConfig, null, 2) + '\n', { backup: true });

    return {
      success: true,
      serversWritten: Object.keys(openCodeServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to OpenCode format
   */
  private transformServer(
    server: Server,
    config: CanonicalConfig,
    warnings: string[],
    serverName: string
  ): OpenCodeServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server, config, warnings, serverName);
    } else {
      return this.transformHttpServer(server, config, warnings, serverName);
    }
  }

  private transformStdioServer(
    server: StdioServer,
    config: CanonicalConfig,
    warnings: string[],
    serverName: string
  ): OpenCodeLocalServer {
    // OpenCode uses command array: [cmd, ...args]
    const command =
      server.args && server.args.length > 0
        ? [server.command, ...server.args]
        : [server.command];

    const result: OpenCodeLocalServer = {
      type: 'local',
      command,
    };

    // Transform env vars to OpenCode format (${VAR} -> {env:VAR})
    const environment = this.transformEnvForOpenCode(server.env, warnings, serverName, 'environment');
    if (Object.keys(environment).length > 0) {
      result.environment = environment;
    }

    // Handle disabledTools (OpenCode supports this)
    const agentOverride = server.agents?.['opencode'];
    if (agentOverride?.disabledTools && agentOverride.disabledTools.length > 0) {
      result.disabledTools = agentOverride.disabledTools;
    }

    // Handle autoApprove (array only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (Array.isArray(effectiveAutoApprove) && effectiveAutoApprove.length > 0) {
      result.autoApprove = effectiveAutoApprove;
    }

    return result;
  }

  private transformHttpServer(
    server: HttpServer,
    config: CanonicalConfig,
    warnings: string[],
    serverName: string
  ): OpenCodeRemoteServer {
    const result: OpenCodeRemoteServer = {
      type: 'remote',
      url: server.url,
    };

    // Transform headers (also need env var transformation)
    const headers = this.transformEnvForOpenCode(server.headers, warnings, serverName, 'headers');
    if (Object.keys(headers).length > 0) {
      result.headers = headers;
    }

    // Handle disabledTools (OpenCode supports this)
    const agentOverride = server.agents?.['opencode'];
    if (agentOverride?.disabledTools && agentOverride.disabledTools.length > 0) {
      result.disabledTools = agentOverride.disabledTools;
    }

    // Handle autoApprove (array only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (Array.isArray(effectiveAutoApprove) && effectiveAutoApprove.length > 0) {
      result.autoApprove = effectiveAutoApprove;
    }

    return result;
  }

  /**
   * Transform env vars to OpenCode format
   * Converts ${VAR} and $VAR to {env:VAR}
   * Note: OpenCode uses {env:VAR} WITHOUT the dollar sign
   */
  private transformEnvForOpenCode(
    env: Env | undefined,
    warnings: string[],
    serverName: string,
    context: 'environment' | 'headers' = 'environment'
  ): Record<string, string> {
    if (!env) return {};

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      let transformed = value;

      // 1. Handle ${VAR:-default} - warn and drop default (do this BEFORE ${VAR})
      const defaultMatches = transformed.match(/\$\{([^}:]+):-[^}]*\}/g);
      if (defaultMatches) {
        warnings.push(
          `OpenCode does not support env var defaults. Server "${serverName}" ${context} "${key}": defaults will be dropped.`
        );
        transformed = transformed.replace(/\$\{([^}:]+):-[^}]*\}/g, '{env:$1}');
      }

      // 2. Handle ${VAR} (without default) - won't match {env:VAR} (no dollar sign)
      transformed = transformed.replace(/\$\{([^}:]+)\}/g, '{env:$1}');

      // 3. Handle bare $VAR references - won't match {env:VAR}
      transformed = transformed.replace(/\$([A-Z_][A-Z0-9_]*)/g, '{env:$1}');

      // Note: {env:VAR} patterns pass through unchanged (regex doesn't match them)

      result[key] = transformed;
    }

    return result;
  }
}
