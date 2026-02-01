import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import * as TOML from 'smol-toml';
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
// Codex Config Types (TOML structure)
// =============================================================================

interface CodexStdioServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  startup_timeout_sec?: number;
  tool_timeout_sec?: number;
  enabled_tools?: string[];
  disabled_tools?: string[];
}

interface CodexHttpServer {
  url: string;
  bearer_token_env_var?: string;
  http_headers?: Record<string, string>;
  env_http_headers?: Record<string, string>;
  enabled?: boolean;
  startup_timeout_sec?: number;
  tool_timeout_sec?: number;
  enabled_tools?: string[];
  disabled_tools?: string[];
}

type CodexServer = CodexStdioServer | CodexHttpServer;

interface CodexConfig {
  mcp_servers?: Record<string, CodexServer>;
  [key: string]: unknown;
}

// =============================================================================
// Codex Adapter
// =============================================================================

export class CodexAdapter extends BaseAdapter {
  readonly name = 'codex' as const;
  readonly displayName = 'OpenAI Codex';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: true,
    supportsToolFiltering: true,  // Codex has enabled_tools/disabled_tools
    supportsAutoApprove: false,
    supportsTimeout: true,
    supportsProjectScope: false,
  };

  getConfigPaths(): ConfigPaths {
    const home = homedir();
    return {
      global: join(home, '.codex', 'config.toml'),
    };
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();
    let installed = false;
    let version: string | undefined;

    // Check if codex CLI is installed
    try {
      const output = execFileSync('codex', ['--version'], {
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
      const config = TOML.parse(content) as CodexConfig;

      return {
        servers: config.mcp_servers ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read Codex config: ${error}`);
      return null;
    }
  }

  async write(
    config: CanonicalConfig,
    options: WriteOptions = {}
  ): Promise<SyncResult> {
    const { merge = false } = options;
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to Codex format
    const codexServers: Record<string, CodexServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter(i => i.type === 'warning').map(i => i.message));

      if (validation.issues.some(i => i.type === 'error')) {
        continue;
      }

      codexServers[serverName] = this.transformServer(server, config);
    }

    // Ensure .codex directory exists
    const codexDir = join(homedir(), '.codex');
    if (!existsSync(codexDir)) {
      mkdirSync(codexDir, { recursive: true });
    }

    // Read existing config or create new
    let existingConfig: CodexConfig = {};
    const configPath = paths.global!;

    if (existsSync(configPath)) {
      try {
        existingConfig = TOML.parse(readFileSync(configPath, 'utf-8')) as CodexConfig;
      } catch {
        // Start fresh if parse fails
      }
    }

    // Replace mcp_servers entirely (authoritative sync) unless merge mode is enabled
    if (merge) {
      existingConfig.mcp_servers = {
        ...existingConfig.mcp_servers,
        ...codexServers,
      };
    } else {
      existingConfig.mcp_servers = codexServers;
    }

    // Write TOML
    const tomlContent = TOML.stringify(existingConfig);
    writeFileSync(configPath, tomlContent);

    return {
      success: true,
      serversWritten: Object.keys(codexServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to Codex format
   */
  private transformServer(server: Server, config: CanonicalConfig): CodexServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server, config);
    } else {
      return this.transformHttpServer(server, config);
    }
  }

  private transformStdioServer(server: StdioServer, config: CanonicalConfig): CodexStdioServer {
    const result: CodexStdioServer = {
      command: server.command,
    };

    if (server.args && server.args.length > 0) {
      result.args = server.args;
    }

    const env = this.transformEnv(server.env);
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    // Handle timeout
    const timeout = server.timeout ?? config.defaults?.timeout;
    if (timeout) {
      result.tool_timeout_sec = timeout;
    }

    // Handle tool filtering (Codex-specific feature)
    const agentOverride = server.agents?.['codex'];
    if (agentOverride?.enabledTools) {
      result.enabled_tools = agentOverride.enabledTools;
    }
    if (agentOverride?.disabledTools) {
      result.disabled_tools = agentOverride.disabledTools;
    }

    return result;
  }

  private transformHttpServer(server: HttpServer, config: CanonicalConfig): CodexHttpServer {
    const result: CodexHttpServer = {
      url: server.url,
    };

    // Handle bearer auth - extract from Authorization header
    // Supports both "${TOKEN}" and "Bearer ${TOKEN}" patterns
    if (server.auth === 'bearer') {
      const authHeader = server.headers?.['Authorization'];
      if (authHeader) {
        // Match ${VAR} or ${VAR:-default} anywhere in the header value
        const envVarMatch = authHeader.match(/\$\{([^}:-]+)(?::-[^}]*)?\}/);
        if (envVarMatch) {
          result.bearer_token_env_var = envVarMatch[1];
        }
      }
    }

    // Handle headers - Codex uses http_headers for static values
    // and env_http_headers for values from env vars
    const staticHeaders: Record<string, string> = {};
    const envHeaders: Record<string, string> = {};

    if (server.headers) {
      for (const [key, value] of Object.entries(server.headers)) {
        // Skip Authorization header if we already handled it as bearer token
        if (key === 'Authorization' && result.bearer_token_env_var) {
          continue;
        }
        if (value.startsWith('${') && value.endsWith('}')) {
          // Extract env var name from ${VAR_NAME}
          const envVar = value.slice(2, -1).split(':-')[0];
          envHeaders[key] = envVar;
        } else {
          staticHeaders[key] = value;
        }
      }
    }

    if (Object.keys(staticHeaders).length > 0) {
      result.http_headers = staticHeaders;
    }
    if (Object.keys(envHeaders).length > 0) {
      result.env_http_headers = envHeaders;
    }

    // Handle timeout
    const timeout = server.timeout ?? config.defaults?.timeout;
    if (timeout) {
      result.tool_timeout_sec = timeout;
    }

    // Handle tool filtering
    const agentOverride = server.agents?.['codex'];
    if (agentOverride?.enabledTools) {
      result.enabled_tools = agentOverride.enabledTools;
    }
    if (agentOverride?.disabledTools) {
      result.disabled_tools = agentOverride.disabledTools;
    }

    return result;
  }
}
