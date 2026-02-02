import { homedir } from 'os';
import { join } from 'path';
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
// Gemini CLI Config Types
// =============================================================================

interface GeminiStdioServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  trust?: boolean;
  includeTools?: string[];
  excludeTools?: string[];
  description?: string;
}

interface GeminiHttpServer {
  httpUrl: string;
  timeout?: number;
  trust?: boolean;
  includeTools?: string[];
  excludeTools?: string[];
  description?: string;
}

type GeminiServer = GeminiStdioServer | GeminiHttpServer;

interface GeminiConfig {
  mcpServers?: Record<string, GeminiServer>;
  [key: string]: unknown;
}

// =============================================================================
// Gemini CLI Adapter
// =============================================================================

export class GeminiCliAdapter extends BaseAdapter {
  readonly name = 'gemini-cli' as const;
  readonly displayName = 'Gemini CLI';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: false,
    supportsToolFiltering: true, // includeTools/excludeTools
    supportsAutoApprove: true, // maps to trust (boolean only)
    supportsTimeout: true,
    supportsProjectScope: true,
    supportsCwd: true,
  };

  getConfigPaths(): ConfigPaths {
    const home = homedir();
    return {
      global: join(home, '.gemini', 'settings.json'),
      project: '.gemini/settings.json',
    };
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();
    let installed = false;
    let version: string | undefined;

    // Check if gemini CLI is installed
    try {
      const output = execFileSync('gemini', ['--version'], {
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

    const configExists = existsSync(paths.global!);

    return {
      installed,
      version,
      configExists,
      configPath: paths.global,
    };
  }

  async read(): Promise<AgentMcpConfig | null> {
    const paths = this.getConfigPaths();

    if (!paths.global || !existsSync(paths.global)) {
      return null;
    }

    try {
      const content = readFileSync(paths.global, 'utf-8');
      const config = JSON.parse(content) as GeminiConfig;

      return {
        servers: config.mcpServers ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read Gemini CLI config: ${error}`);
      return null;
    }
  }

  async write(config: CanonicalConfig, options: WriteOptions = {}): Promise<SyncResult> {
    const { scope = 'global', merge = false, force = false } = options;
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to Gemini format
    const geminiServers: Record<string, GeminiServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter((i) => i.type === 'warning').map((i) => i.message));

      if (validation.issues.some((i) => i.type === 'error')) {
        continue;
      }

      // Check for autoApprove array (Gemini only supports boolean trust)
      const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
      if (Array.isArray(effectiveAutoApprove)) {
        warnings.push(
          `Gemini CLI does not support per-tool autoApprove. Server "${serverName}" will require manual approval for all tools.`
        );
      }

      geminiServers[serverName] = this.transformServer(server, config);
    }

    // Determine config path
    const configPath = scope === 'project' ? paths.project! : paths.global!;

    // Ensure directory exists
    const configDir =
      scope === 'project' ? '.gemini' : join(homedir(), '.gemini');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Read existing config or create new
    let existingConfig: GeminiConfig = {};

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
        ...geminiServers,
      };
    } else {
      existingConfig.mcpServers = geminiServers;
    }

    // Write JSON
    atomicWrite(configPath, JSON.stringify(existingConfig, null, 2) + '\n', { backup: true });

    return {
      success: true,
      serversWritten: Object.keys(geminiServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to Gemini CLI format
   */
  private transformServer(server: Server, config: CanonicalConfig): GeminiServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server, config);
    } else {
      return this.transformHttpServer(server, config);
    }
  }

  private transformStdioServer(server: StdioServer, config: CanonicalConfig): GeminiStdioServer {
    const result: GeminiStdioServer = {
      command: server.command,
    };

    if (server.args && server.args.length > 0) {
      result.args = server.args;
    }

    const env = this.transformEnv(server.env);
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    // Gemini supports cwd
    if (server.cwd) {
      result.cwd = server.cwd;
    }

    // Handle timeout
    const timeout = server.timeout ?? config.defaults?.timeout;
    if (timeout) {
      result.timeout = timeout;
    }

    // Handle description
    if (server.description) {
      result.description = server.description;
    }

    // Handle autoApprove -> trust (boolean only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (effectiveAutoApprove === true) {
      result.trust = true;
    }
    // Note: autoApprove: false maps to omitting trust (default behavior)
    // autoApprove: string[] is warned about and ignored (handled in write())

    // Handle tool filtering
    const agentOverride = server.agents?.['gemini-cli'];
    if (agentOverride?.enabledTools) {
      result.includeTools = agentOverride.enabledTools;
    }
    if (agentOverride?.disabledTools) {
      result.excludeTools = agentOverride.disabledTools;
    }

    return result;
  }

  private transformHttpServer(server: HttpServer, config: CanonicalConfig): GeminiHttpServer {
    const result: GeminiHttpServer = {
      httpUrl: server.url, // Gemini uses httpUrl for Streamable HTTP
    };

    // Handle timeout
    const timeout = server.timeout ?? config.defaults?.timeout;
    if (timeout) {
      result.timeout = timeout;
    }

    // Handle description
    if (server.description) {
      result.description = server.description;
    }

    // Handle autoApprove -> trust (boolean only)
    const effectiveAutoApprove = server.autoApprove ?? config.defaults?.autoApprove;
    if (effectiveAutoApprove === true) {
      result.trust = true;
    }

    // Handle tool filtering
    const agentOverride = server.agents?.['gemini-cli'];
    if (agentOverride?.enabledTools) {
      result.includeTools = agentOverride.enabledTools;
    }
    if (agentOverride?.disabledTools) {
      result.excludeTools = agentOverride.disabledTools;
    }

    return result;
  }
}
