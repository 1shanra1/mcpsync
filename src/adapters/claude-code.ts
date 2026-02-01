import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import {
  BaseAdapter,
  ConfigPaths,
  DetectionResult,
  AgentMcpConfig,
  SyncResult,
} from './base.js';
import {
  CanonicalConfig,
  Server,
  AgentCapabilities,
  StdioServer,
  HttpServer,
} from '../core/schema.js';

// =============================================================================
// Claude Code Agent Config Types
// =============================================================================

interface ClaudeStdioServer {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeHttpServer {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

type ClaudeServer = ClaudeStdioServer | ClaudeHttpServer;

interface ClaudeConfig {
  mcpServers?: Record<string, ClaudeServer>;
  projects?: Record<string, {
    mcpServers?: Record<string, ClaudeServer>;
  }>;
  [key: string]: unknown;
}

// =============================================================================
// Claude Code Adapter
// =============================================================================

export class ClaudeCodeAdapter extends BaseAdapter {
  readonly name = 'claude-code' as const;
  readonly displayName = 'Claude Code';

  readonly capabilities: AgentCapabilities = {
    supportsHttp: true,
    supportsOAuth: true,
    supportsToolFiltering: false,
    supportsAutoApprove: false,
    supportsTimeout: true,
    supportsProjectScope: true,
  };

  getConfigPaths(): ConfigPaths {
    const home = homedir();
    return {
      global: join(home, '.claude.json'),
      project: '.mcp.json',
      // Local scope is stored within global file under projects.<path>
    };
  }

  async detect(): Promise<DetectionResult> {
    const paths = this.getConfigPaths();
    let installed = false;
    let version: string | undefined;

    // Check if claude CLI is installed
    try {
      const output = execFileSync('claude', ['--version'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      installed = true;
      // Parse version from output like "claude v1.0.67"
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
      const config = JSON.parse(content) as ClaudeConfig;

      return {
        servers: config.mcpServers ?? {},
        raw: config,
      };
    } catch (error) {
      console.error(`Failed to read Claude Code config: ${error}`);
      return null;
    }
  }

  async write(
    config: CanonicalConfig,
    scope: 'global' | 'project' | 'local' = 'global'
  ): Promise<SyncResult> {
    const paths = this.getConfigPaths();
    const warnings: string[] = [];

    // Transform canonical config to Claude format
    const claudeServers: Record<string, ClaudeServer> = {};

    for (const [serverName, server] of Object.entries(config.servers)) {
      if (!this.shouldIncludeServer(serverName, server, config)) {
        continue;
      }

      const validation = this.validate({ ...config, servers: { [serverName]: server } });
      warnings.push(...validation.issues.filter(i => i.type === 'warning').map(i => i.message));

      if (validation.issues.some(i => i.type === 'error')) {
        continue;
      }

      claudeServers[serverName] = this.transformServer(server);
    }

    // Read existing config or create new
    let existingConfig: ClaudeConfig = {};
    const configPath = scope === 'project' ? paths.project! : paths.global!;

    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        // Start fresh if parse fails
      }
    }

    // Merge MCP servers
    if (scope === 'project') {
      // Write to .mcp.json
      const projectConfig = {
        mcpServers: claudeServers,
      };
      writeFileSync(configPath, JSON.stringify(projectConfig, null, 2) + '\n');
    } else {
      // Write to ~/.claude.json
      existingConfig.mcpServers = {
        ...existingConfig.mcpServers,
        ...claudeServers,
      };
      writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + '\n');
    }

    return {
      success: true,
      serversWritten: Object.keys(claudeServers).length,
      warnings,
    };
  }

  /**
   * Transform a canonical server to Claude Code format
   */
  private transformServer(server: Server): ClaudeServer {
    if (server.type === 'stdio') {
      return this.transformStdioServer(server);
    } else {
      return this.transformHttpServer(server);
    }
  }

  private transformStdioServer(server: StdioServer): ClaudeStdioServer {
    const result: ClaudeStdioServer = {
      type: 'stdio',
      command: server.command,
    };

    if (server.args && server.args.length > 0) {
      result.args = server.args;
    }

    const env = this.transformEnv(server.env);
    if (Object.keys(env).length > 0) {
      result.env = env;
    }

    return result;
  }

  private transformHttpServer(server: HttpServer): ClaudeHttpServer {
    const result: ClaudeHttpServer = {
      type: 'http',
      url: server.url,
    };

    const headers = this.transformEnv(server.headers);
    if (Object.keys(headers).length > 0) {
      result.headers = headers;
    }

    return result;
  }
}
