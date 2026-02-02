/**
 * E2E Tests: Adapter Config Format Verification
 *
 * These tests verify that mcp-sync produces config files that match
 * the actual format expected by each AI coding agent CLI.
 *
 * When these tests fail, it likely means the agent's config format
 * has changed and the adapter needs to be updated.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import * as TOML from 'smol-toml';
import {
  runCliSuccess,
  getTestContext,
  setupTestEnvironment,
  cleanupTestConfigs,
  readClaudeConfig,
  TestContext,
} from './helpers.js';

describe('Adapter E2E Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTestEnvironment();
    runCliSuccess('init');
  });

  afterEach(() => {
    cleanupTestConfigs();
  });

  // ===========================================================================
  // Claude Code Adapter
  // ===========================================================================

  describe('Claude Code Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push claude-code');

      expect(existsSync(ctx.claudeConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.claudeConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use correct mcpServers key', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      expect(config).toHaveProperty('mcpServers');
      expect(config?.mcpServers).toHaveProperty('github');
    });

    it('should format stdio server correctly', () => {
      runCliSuccess('add myserver --command node --args server.js --args --port --args 3000');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js', '--port', '3000']);
    });

    it('should include env vars in correct format', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY} --env DEBUG=true');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      expect(env.API_KEY).toBe('${API_KEY}');
      expect(env.DEBUG).toBe('true');
    });

    it('should format HTTP server correctly', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      expect(server.type).toBe('http');
      expect(server.url).toBe('https://mcp.example.com/v1');
    });

    it('should preserve existing non-MCP config fields', () => {
      // Write a Claude config with other fields
      const existingConfig = {
        someOtherSetting: true,
        preferences: { theme: 'dark' },
        mcpServers: {
          oldServer: { command: 'old' },
        },
      };
      const content = JSON.stringify(existingConfig, null, 2);
      require('fs').writeFileSync(ctx.claudeConfigPath, content);

      // Push new servers
      runCliSuccess('add newserver --command new');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);

      // Other fields should be preserved
      expect(config?.someOtherSetting).toBe(true);
      expect(config?.preferences).toEqual({ theme: 'dark' });

      // MCP servers should be replaced (authoritative sync)
      const servers = config?.mcpServers as Record<string, unknown>;
      expect(servers).toHaveProperty('newserver');
      expect(servers).not.toHaveProperty('oldServer');
    });

    it('should merge servers with --merge flag', () => {
      // Write existing Claude config
      const existingConfig = {
        mcpServers: {
          existing: { command: 'existing-cmd' },
        },
      };
      require('fs').writeFileSync(
        ctx.claudeConfigPath,
        JSON.stringify(existingConfig, null, 2)
      );

      // Push with merge
      runCliSuccess('add newserver --command new-cmd');
      runCliSuccess('push claude-code --merge');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;

      // Both should exist
      expect(servers).toHaveProperty('existing');
      expect(servers).toHaveProperty('newserver');
    });
  });

  // ===========================================================================
  // Codex Adapter
  // ===========================================================================

  describe('Codex Adapter', () => {
    it('should produce valid TOML config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push codex');

      expect(existsSync(ctx.codexConfigPath)).toBe(true);

      // Verify it's valid TOML
      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      expect(() => TOML.parse(content)).not.toThrow();
    });

    it('should use correct mcp_servers key (snake_case)', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content);

      expect(config).toHaveProperty('mcp_servers');
      expect(config.mcp_servers).toHaveProperty('github');
    });

    it('should format stdio server correctly for Codex', () => {
      runCliSuccess('add myserver --command node --args server.js');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js']);
    });

    it('should include env vars for Codex', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      expect(env.API_KEY).toBe('${API_KEY}');
    });

    it('should format HTTP server correctly for Codex', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers.remote as Record<string, unknown>;

      expect(server.url).toBe('https://mcp.example.com/v1');
    });
  });

  // ===========================================================================
  // Cross-Agent Sync Tests
  // ===========================================================================

  describe('Cross-Agent Sync', () => {
    it('should push same config to multiple agents', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_TOKEN=${GITHUB_TOKEN}');
      runCliSuccess('add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem /docs');

      // Push to all agents
      runCliSuccess('push');

      // Verify Claude config
      expect(existsSync(ctx.claudeConfigPath)).toBe(true);
      const claudeConfig = readClaudeConfig(ctx);
      const claudeServers = claudeConfig?.mcpServers as Record<string, unknown>;
      expect(claudeServers).toHaveProperty('github');
      expect(claudeServers).toHaveProperty('filesystem');

      // Verify Codex config
      expect(existsSync(ctx.codexConfigPath)).toBe(true);
      const codexContent = readFileSync(ctx.codexConfigPath, 'utf-8');
      const codexConfig = TOML.parse(codexContent) as { mcp_servers: Record<string, unknown> };
      expect(codexConfig.mcp_servers).toHaveProperty('github');
      expect(codexConfig.mcp_servers).toHaveProperty('filesystem');
    });

    it('should produce equivalent server configs across agents', () => {
      runCliSuccess('add test-mcp --command node --args /path/to/server.js --env SECRET=${SECRET}');
      runCliSuccess('push');

      // Get Claude server config
      const claudeConfig = readClaudeConfig(ctx);
      const claudeServers = claudeConfig?.mcpServers as Record<string, unknown>;
      const claudeServer = claudeServers['test-mcp'] as Record<string, unknown>;

      // Get Codex server config
      const codexContent = readFileSync(ctx.codexConfigPath, 'utf-8');
      const codexConfig = TOML.parse(codexContent) as { mcp_servers: Record<string, unknown> };
      const codexServer = codexConfig.mcp_servers['test-mcp'] as Record<string, unknown>;

      // Core fields should match
      expect(claudeServer.command).toBe(codexServer.command);
      expect(claudeServer.args).toEqual(codexServer.args);

      // Env should have same values
      const claudeEnv = claudeServer.env as Record<string, string>;
      const codexEnv = codexServer.env as Record<string, string>;
      expect(claudeEnv.SECRET).toBe(codexEnv.SECRET);
    });
  });

  // ===========================================================================
  // CLI Version Compatibility Tests
  // ===========================================================================

  describe('CLI Compatibility Checks', () => {
    it('should detect Claude Code CLI if installed', () => {
      const result = runCliSuccess('agents');

      // Should show Claude Code in the list
      expect(result).toContain('claude-code');
    });

    it('should detect Codex CLI if installed', () => {
      const result = runCliSuccess('agents');

      // Should show Codex in the list
      expect(result).toContain('codex');
    });

    it('should report agent installation status', () => {
      const result = runCliSuccess('agents --json');
      const agents = JSON.parse(result);

      // Check that we get status info
      expect(agents).toBeDefined();
    });
  });
});
