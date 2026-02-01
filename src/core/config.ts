import { homedir } from 'os';
import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as yaml from 'js-yaml';
import {
  CanonicalConfig,
  Server,
  StdioServer,
  HttpServer,
  validateConfigSafe,
} from './schema.js';

// =============================================================================
// Config Manager
// =============================================================================

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'mcp-sync');
const DEFAULT_CONFIG_FILE = 'config.yaml';

export interface ConfigManagerOptions {
  configPath?: string;
}

export class ConfigManager {
  private configPath: string;
  private config: CanonicalConfig | null = null;

  constructor(options: ConfigManagerOptions = {}) {
    this.configPath = options.configPath ?? join(DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_FILE);
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get the config directory
   */
  getConfigDir(): string {
    return dirname(this.configPath);
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Load config from file
   */
  load(): CanonicalConfig {
    if (!this.exists()) {
      throw new Error(`Config file not found: ${this.configPath}\nRun 'mcp-sync init' to create one.`);
    }

    const content = readFileSync(this.configPath, 'utf-8');
    const parsed = yaml.load(content);

    const result = validateConfigSafe(parsed);
    if (!result.success) {
      const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Invalid config file:\n${errors}`);
    }

    this.config = result.data;
    return this.config;
  }

  /**
   * Get loaded config (load if needed)
   */
  get(): CanonicalConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Save config to file
   */
  save(config: CanonicalConfig): void {
    // Validate before saving
    const result = validateConfigSafe(config);
    if (!result.success) {
      const errors = result.error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Invalid config:\n${errors}`);
    }

    // Ensure directory exists
    const dir = this.getConfigDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write YAML
    const content = yaml.dump(config, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    writeFileSync(this.configPath, content);
    this.config = config;
  }

  /**
   * Initialize a new config file with defaults
   */
  init(overwrite: boolean = false): CanonicalConfig {
    if (this.exists() && !overwrite) {
      throw new Error(`Config file already exists: ${this.configPath}\nUse --force to overwrite.`);
    }

    const defaultConfig: CanonicalConfig = {
      version: '1',
      defaults: {
        timeout: 60,
        autoApprove: false,
      },
      servers: {},
      agents: {},
      exclusions: [],
    };

    this.save(defaultConfig);
    return defaultConfig;
  }

  /**
   * Add a server to the config
   */
  addServer(name: string, server: Server): void {
    const config = this.get();

    if (config.servers[name]) {
      throw new Error(`Server '${name}' already exists. Use 'mcp-sync remove ${name}' first.`);
    }

    config.servers[name] = server;
    this.save(config);
  }

  /**
   * Remove a server from the config
   */
  removeServer(name: string): boolean {
    const config = this.get();

    if (!config.servers[name]) {
      return false;
    }

    delete config.servers[name];

    // Also remove any exclusions for this server
    config.exclusions = config.exclusions?.filter(e => e.server !== name) ?? [];

    this.save(config);
    return true;
  }

  /**
   * Get a specific server
   */
  getServer(name: string): Server | undefined {
    const config = this.get();
    return config.servers[name];
  }

  /**
   * List all servers
   */
  listServers(): Array<{ name: string; server: Server }> {
    const config = this.get();
    return Object.entries(config.servers).map(([name, server]) => ({
      name,
      server,
    }));
  }

  /**
   * Update a server
   */
  updateServer(name: string, updates: Partial<Server>): void {
    const config = this.get();
    const existing = config.servers[name];

    if (!existing) {
      throw new Error(`Server '${name}' not found.`);
    }

    // Merge updates
    config.servers[name] = { ...existing, ...updates } as Server;
    this.save(config);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a stdio server config
 */
export function createStdioServer(
  command: string,
  args: string[] = [],
  env: Record<string, string> = {},
  options: Partial<Omit<StdioServer, 'type' | 'command' | 'args' | 'env'>> = {}
): StdioServer {
  return {
    type: 'stdio',
    command,
    args,
    env,
    ...options,
  };
}

/**
 * Create an HTTP server config
 */
export function createHttpServer(
  url: string,
  headers: Record<string, string> = {},
  options: Partial<Omit<HttpServer, 'type' | 'url' | 'headers'>> = {}
): HttpServer {
  return {
    type: 'http',
    url,
    headers,
    auth: 'none',
    ...options,
  };
}

// Export default instance
export const configManager = new ConfigManager();
