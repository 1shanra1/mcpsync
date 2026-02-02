import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
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
} from '../core/schema.js';

// =============================================================================
// Amp Code Config Types
// =============================================================================

interface AmpStdioServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  includeTools?: string[];
}

interface AmpHttpServer {
  httpUrl: string;
  headers?: Record<string, string>;
  includeTools?: string[];
}

type AmpServer = AmpStdioServer | AmpHttpServer;

interface AmpConfig {
  'amp.mcpServers'?: Record<string, AmpServer>;
  [key: string]: unknown;
}

// =============================================================================
// Amp Code Adapter
// =============================================================================

export class AmpAdapter extends BaseAdapter {
  readonly name = 'amp' as const;
  readonly displayName = 'Amp';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: false,
    supportsToolFiltering: true, // includeTools only
    supportsAutoApprove: false, // No autoApprove support
    supportsTimeout: false,
    supportsProjectScope: true,
    supportsCwd: false,
  };

  getConfigPaths(): ConfigPaths {
    const home = homedir();
    return {
      global: join(home, '.config', 'amp', 'settings.json'),
      project: '.amp/settings.json',
    };
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();
    let installed = false;
    let version: string | undefined;

    // Check if amp CLI is installed
    try {
      const output = execFileSync('amp', ['--version'], {
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
      const config = JSON.parse(content) as AmpConfig;

      return {
        servers: config['amp.mcpServers'] ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read Amp config: ${error}`);
      return null;
    }
  }

  async write(config: CanonicalConfig, options: WriteOptions = {}): Promise<SyncResult> {
    const { scope = 'global', merge = false, force = false } = options;
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to Amp format
    const ampServers: Record<string, AmpServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter((i) => i.type === 'warning').map((i) => i.message));

      if (validation.issues.some((i) => i.type === 'error')) {
        continue;
      }

      // Check for autoApprove (Amp doesn't support it)
      const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
      if (effectiveAutoApprove === true) {
        warnings.push(
          `Amp does not support full trust mode (autoApprove: true). Server "${serverName}" will require manual approval.`
        );
      } else if (Array.isArray(effectiveAutoApprove) && effectiveAutoApprove.length > 0) {
        warnings.push(
          `Amp does not support autoApprove tool lists. Server "${serverName}" autoApprove will be ignored.`
        );
      }

      // Check for disabledTools (Amp only supports includeTools)
      const agentOverride = server.agents?.['amp'];
      if (agentOverride?.disabledTools && agentOverride.disabledTools.length > 0) {
        warnings.push(
          `Amp does not support disabledTools. Server "${serverName}" disabledTools will be ignored.`
        );
      }

      // Check for timeout (Amp doesn't support it)
      const effectiveTimeout = server.timeout ?? config.defaults?.timeout;
      if (effectiveTimeout !== undefined && effectiveTimeout !== 60) {
        warnings.push(
          `Amp does not support custom timeout. Server "${serverName}" timeout setting will be ignored.`
        );
      }

      ampServers[serverName] = this.transformServer(server, config, serverName);
    }

    // Determine config path
    const configPath = scope === 'project' ? paths.project! : paths.global!;

    // Ensure directory exists
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let existingConfig: AmpConfig = {};

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

    // Write MCP servers using literal key 'amp.mcpServers'
    if (merge) {
      existingConfig['amp.mcpServers'] = {
        ...existingConfig['amp.mcpServers'],
        ...ampServers,
      };
    } else {
      existingConfig['amp.mcpServers'] = ampServers;
    }

    // Write JSON
    atomicWrite(configPath, JSON.stringify(existingConfig, null, 2) + '\n', { backup: true });

    return {
      success: true,
      serversWritten: Object.keys(ampServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to Amp format
   */
  private transformServer(
    server: Server,
    config: CanonicalConfig,
    serverName: string
  ): AmpServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server, config, serverName);
    } else {
      return this.transformHttpServer(server, config, serverName);
    }
  }

  private transformStdioServer(
    server: StdioServer,
    _config: CanonicalConfig,
    _serverName: string
  ): AmpStdioServer {
    const result: AmpStdioServer = {
      command: server.command,
    };

    if (server.args && server.args.length > 0) {
      result.args = server.args;
    }

    // Amp uses ${VAR} format (compatible with canonical)
    const env = this.transformEnv(server.env);
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    // Handle enabledTools -> includeTools
    const agentOverride = server.agents?.['amp'];
    if (agentOverride?.enabledTools && agentOverride.enabledTools.length > 0) {
      result.includeTools = agentOverride.enabledTools;
    }

    return result;
  }

  private transformHttpServer(
    server: HttpServer,
    _config: CanonicalConfig,
    _serverName: string
  ): AmpHttpServer {
    // Use httpUrl for Streamable HTTP (modern default)
    const result: AmpHttpServer = {
      httpUrl: server.url,
    };

    // Transform headers (Amp uses ${VAR} format - compatible)
    const headers = this.transformEnv(server.headers);
    if (Object.keys(headers).length > 0) {
      result.headers = headers;
    }

    // Handle enabledTools -> includeTools
    const agentOverride = server.agents?.['amp'];
    if (agentOverride?.enabledTools && agentOverride.enabledTools.length > 0) {
      result.includeTools = agentOverride.enabledTools;
    }

    return result;
  }
}
